/**
 * 通道管理器：开哪条实例化哪个 detector，关即 close 释放（省内存核心约束）。
 * 三路共享一个摄像头流（引用计数）与一个 rAF 帧循环；
 * 帧调度 hand 每帧 / head 每帧 / arm 每 4 帧；输入统一 320x240。
 * head 必须逐帧：点头的「小幅快挥」速度门控按 ~30Hz 采样标定，降到半频就漏检。
 *
 * 识别事件流向：detector 结果 -> 各通道几何层 -> (投票/峰值) -> 候选
 *   -> emitGate 上升沿（选答/清空一次手势只发一次）-> settings.mappings 重映射
 *   -> actionBus（per-action 冷却）-> 视图 handler 表
 */
import { HandLandmarker, FaceLandmarker, PoseLandmarker } from '@mediapipe/tasks-vision'
import { getVision } from './visionLoader.js'
import {
  GESTURE_CONFIG, mirrorLandmarks, createSmoother, createGeoState,
  analyzeFrame, createVoter, createSubmitArmer, createEmitGate
} from '../utils/gestureGeometry.js'
import {
  HEAD_CONFIG, createHeadAnalyzer, createMouthGate, createSmileGate, geometricPitchRatio,
  eulerAnglesFromMatrix, anglesFromLandmarks
} from '../utils/headGeometry.js'
import { ARM_CONFIG, createArmAnalyzer } from '../utils/armGeometry.js'
import { loadSettings } from '../a11y/settings.js'

const FRAME_MOD = { hand: 1, head: 1, arm: 4 }
const RAD = 180 / Math.PI

const MODEL_ASSETS = {
  hand: '/mediapipe/tasks/hand_landmarker.task',
  head: '/mediapipe/tasks/face_landmarker.task',
  arm: '/mediapipe/tasks/pose_landmarker_lite.task'
}

export class ChannelManager {
  /**
   * @param {HTMLVideoElement} videoEl
   * @param {(st:Object)=>void} onState HUD 状态回调（每帧节流后调用）
   */
  constructor(videoEl, onState = () => {}) {
    this.videoEl = videoEl
    this.onState = onState
    this.bus = null
    this.running = false
    this._rafId = null
    this._frame = 0
    this._lastProcessAt = 0
    this._lastTickAt = 0
    this._stream = null
    this._streamRefs = 0
    this._streamPromise = null
    /** @type {Set<Promise>} 在飞的 open，closeAll 要等它们落地 */
    this._pending = new Set()
    /** @type {Map<string,number>} 每通道 open 代次，用于作废在飞 open */
    this._openGen = {}
    /** @type {Map<string,Object>} */
    this.channels = new Map()
    /** 手通道发射门控（上升沿）：整条链路只此一份，见 feedHandCandidate */
    this.handGate = createEmitGate()
    /**
     * 加载/每帧耗时探针。"到底慢在哪一段"必须有数字，不靠猜：
     * open=下载+wasm编译+建模，cost=稳态每帧主线程占用（推理+几何）。
     * console 打 [a11y:perf]，也可 perfSummary() 直接取。
     */
    this.perf = { open: {}, firstFrame: {}, cost: {}, ticks: 0, overBudget: 0, starved: 0, glLost: 0, cycleMs: 0 }
    // 供 HUD 绘制骨架的最新关键点（镜像前原始归一化坐标）
    this.latestDraw = { hand: null, face: null, pose: null }
    this.state = {
      hand: { on: false, detected: false, candidate: null, firedGesture: null, ratio: 0, armPhase: 'idle', progress: 0, remainMs: null },
      head: { on: false, detected: false, candidate: null, firedGesture: null, angles: null, calibrating: false, calibProgress: 0, offscreen: false, debug: null },
      arm: { on: false, detected: false, candidate: null, firedGesture: null },
      error: null
    }
  }

  attachBus(bus) { this.bus = bus }

  /**
   * 汇总加载与稳态帧耗时；mediapipe 资源的下载量/耗时直接从 Resource Timing 取，
   * 这样"是网络慢还是主线程慢"一眼能分开（手机弱网时这两件事的解法完全不同）。
   */
  perfSummary() {
    const resources = performance.getEntriesByType('resource')
      .filter(e => e.name.includes('/mediapipe/'))
      .map(e => ({
        file: e.name.split('/mediapipe/')[1].split('?')[0],
        ms: Math.round(e.duration),
        // transferSize=0 且有条目大小 => 命中浏览器缓存，没走网络；这决定了 gzip/缓存头值不值得做
        netKB: Math.round((e.transferSize || 0) / 1024),
        sizeKB: Math.round((e.encodedBodySize || 0) / 1024)
      }))
    return {
      open: this.perf.open,
      firstFrame: this.perf.firstFrame,
      perFrame: Object.fromEntries(Object.entries(this.perf.cost).map(([k, v]) =>
        [k, { n: v.n, avg: +(v.sum / v.n).toFixed(1), max: +v.max.toFixed(1) }])),
      ticks: this.perf.ticks,
      overBudget: this.perf.overBudget,
      starved: this.perf.starved,
      cycleMs: +this.perf.cycleMs.toFixed(1),
      glLost: this.perf.glLost,
      device: {
        memoryGB: navigator.deviceMemory ?? null,
        cpu: navigator.hardwareConcurrency ?? null,
        mobile: /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent)
      },
      resources
    }
  }

  reportPerf(tag = '') {
    const s = this.perfSummary()
    console.info(`[a11y:perf]${tag ? ' ' + tag : ''}`, JSON.stringify(s))
    return s
  }

  /** 取消两阶段握拳的待确认态（摇头/Esc 等显式取消走这里） */
  resetHandArmer() {
    const entry = this.channels.get('hand')
    if (!entry) return
    entry.armer.reset()
    this.state.hand.armPhase = 'idle'
    this.state.hand.progress = 0
  }

  async open(name) {
    if (this.channels.has(name)) return
    const task = this._openChannel(name).finally(() => this._pending.delete(task))
    this._pending.add(task)
    return task
  }

  async _openChannel(name) {
    // 代次标记：createFromOptions 要几秒（手机更久），期间若 close/卸载抢占，
    // 回来后必须自行释放刚建好的实例，不能登记通道、更不能启动帧循环
    const gen = this._openGen[name] = (this._openGen[name] || 0) + 1
    const t0 = performance.now()
    const settings = loadSettings()
    const sensitivity = settings.sensitivity[name] || 'normal'
    let entry
    if (name === 'hand') {
      const vision = await getVision()
      const detector = await HandLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: MODEL_ASSETS.hand, delegate: 'GPU' },
        numHands: 1, runningMode: 'VIDEO'
      })
      entry = {
        name, detector,
        smoother: createSmoother(), geoState: createGeoState(),
        voter: createVoter(),
        armer: createSubmitArmer(GESTURE_CONFIG, () => performance.now())
      }
      this.handGate.reset()
    } else if (name === 'head') {
      const vision = await getVision()
      const detector = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: MODEL_ASSETS.head, delegate: 'GPU' },
        numFaces: 1, runningMode: 'VIDEO',
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true
      })
      entry = {
        name, detector, sensitivity,
        zero: { yaw: 0, pitch: 0, roll: 0 },
        analyzer: createHeadAnalyzer({ yaw: 0, pitch: 0, roll: 0 }, sensitivity, HEAD_CONFIG, () => performance.now()),
        mouthGate: createMouthGate(HEAD_CONFIG, () => performance.now()),
        smileGate: createSmileGate(HEAD_CONFIG, () => performance.now())
      }
    } else if (name === 'arm') {
      const vision = await getVision()
      const detector = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: MODEL_ASSETS.arm, delegate: 'GPU' },
        runningMode: 'VIDEO', numPoses: 1
      })
      entry = { name, detector, analyzer: createArmAnalyzer(ARM_CONFIG, () => performance.now()) }
    } else {
      throw new Error(`未知通道 ${name}`)
    }
    // 首路含 wasm 下载+编译，后续路只是模型下载+建模，分开记才看得出省在哪
    this.perf.open[name] = Math.round(performance.now() - t0)
    this.reportPerf(`open:${name}`)
    if (this._openGen[name] !== gen) {
      try { entry.detector.close() } catch { /* 已被抢占，释放即弃 */ }
      return
    }
    this.channels.set(name, entry)
    this.state[name].on = true
    await this._ensureStream()
    // 等摄像头（权限弹窗可能挂很久）期间被关掉了：收摊工作已由 close() 做完，不再启动循环
    if (this._openGen[name] !== gen) return
    this._startLoop()
  }

  async close(name) {
    this._openGen[name] = (this._openGen[name] || 0) + 1
    const entry = this.channels.get(name)
    if (!entry) return
    this.channels.delete(name)
    this.state[name].on = false
    this.state[name].detected = false
    this.state[name].candidate = null
    this.state[name].firedGesture = null
    const drawKey = { hand: 'hand', head: 'face', arm: 'pose' }[name]
    this.latestDraw[drawKey] = null
    try { entry.detector.close() } catch (e) { console.warn(`[channel:${name}] close 失败`, e) }
    this._releaseStream()
    if (!this.channels.size) this._stopLoop()
  }

  async closeAll() {
    for (const name of ['hand', 'head', 'arm']) this._openGen[name] = (this._openGen[name] || 0) + 1
    for (const name of [...this.channels.keys()]) await this.close(name)
    if (!this._pending.size) return
    // 等在飞 open 落地（它们自检代次后会自行释放 detector）。摄像头权限弹窗可能挂几分钟，
    // 这里必须有上限：清理不能因为用户没点"允许"而一直卡住。
    await Promise.race([
      Promise.allSettled([...this._pending]),
      new Promise(r => setTimeout(r, 3000))
    ])
  }

  // ================= 内部 =================

  async _ensureStream() {
    if (this._stream && !this._streamPromise) { this._streamRefs++; return }
    // 三路并行 open 时只能有一次 getUserMedia：原来的写法把 _streamRefs=1 写在 await 之后，
    // 并发进来两次就会开出两路摄像头
    const creator = !this._streamPromise
    if (creator) {
      this._streamPromise = navigator.mediaDevices
        .getUserMedia({ video: { width: 320, height: 240, facingMode: 'user' }, audio: false })
        .then(stream => {
          this._stream = stream
          this.videoEl.srcObject = stream
          return this.videoEl.play()
        })
        .finally(() => { this._streamPromise = null })
    }
    await this._streamPromise
    // creator 负责把引用计数起成 1；同期搭车的每个通道各加 1
    this._streamRefs = creator ? 1 : this._streamRefs + 1
  }

  _releaseStream() {
    this._streamRefs--
    if (this._streamRefs <= 0 && this._stream) {
      this._stream.getTracks().forEach(t => t.stop())
      this._stream = null
      this.videoEl.srcObject = null
    }
  }

  _startLoop() {
    if (this.running) return
    this.running = true
    const loop = async () => {
      if (!this.running) return
      const nowMs = performance.now()
      if (nowMs - this._lastProcessAt >= GESTURE_CONFIG.FPS_INTERVAL && this.videoEl.readyState >= 2 && this.channels.size) {
        this._lastProcessAt = nowMs
        // 相邻两个处理帧的间隔翻倍 => 主线程被拖住（本链路自己或别人）
        if (this._lastTickAt && nowMs - this._lastTickAt > GESTURE_CONFIG.FPS_INTERVAL * 2) this.perf.starved++
        this._lastTickAt = nowMs
        this._frame++
        const cycle0 = performance.now()
        for (const entry of this.channels.values()) {
          if ((this._frame % FRAME_MOD[entry.name]) !== 0) continue
          try { await this._process(entry, nowMs) }
          catch (e) { console.warn(`[channel:${entry.name}]`, e.message) }
        }
        this.perf.cycleMs = performance.now() - cycle0
        this.perf.ticks++
        if (this.perf.cycleMs > GESTURE_CONFIG.FPS_INTERVAL) this.perf.overBudget++
        if (this.perf.ticks % 240 === 0) this.reportPerf('稳态')
        this.onState(this.state)
      }
      if (this.running) this._rafId = requestAnimationFrame(loop)
    }
    this._rafId = requestAnimationFrame(loop)
  }

  _stopLoop() {
    this.running = false
    if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null }
  }

  async _process(entry, ts) {
    const t0 = performance.now()
    try {
      if (entry.name === 'hand') return await this._processHand(entry, ts)
      if (entry.name === 'head') return await this._processHead(entry, ts)
      if (entry.name === 'arm') return await this._processArm(entry, ts)
    } finally {
      // 这段就是"每帧占住主线程多久"（推理同步回读 + 几何），直接决定要不要上 Worker
      const ms = performance.now() - t0
      const c = this.perf.cost[entry.name] || (this.perf.cost[entry.name] = { n: 0, sum: 0, max: 0 })
      c.n++; c.sum += ms; if (ms > c.max) c.max = ms
      if (this.perf.firstFrame[entry.name] === undefined) this.perf.firstFrame[entry.name] = +ms.toFixed(1)
    }
  }

  _emitCandidate(channel, candidate) {
    if (!candidate) return
    const st = this.state[channel]
    if (st) st.firedGesture = candidate   // HUD 回显"识别成功的手势"用
    if (this.bus) this.bus.routeChannelCandidate(channel, candidate)
  }

  /**
   * 手通道候选 -> 门控 -> 总线，整条链路只有这一个发射口。
   * 帧循环与离线注入（window.__a11yManager.feedHandCandidate，Playwright/调试面板无需摄像头）
   * 走的是同一段代码，所以自测断言的就是真行为。
   * @returns {string|null} 本帧实际被允许发射的候选
   */
  feedHandCandidate(stable, armPhase = 'idle') {
    const allowed = this.handGate.push(stable)
    if (allowed && armPhase === 'idle') this._emitCandidate('hand', allowed)
    return allowed
  }

  async _processHand(entry, ts) {
    const res = entry.detector.detectForVideo(this.videoEl, ts)
    const st = this.state.hand
    const lms = res.landmarks || res.list
    const has = lms && lms.length > 0
    st.detected = !!has
    if (!has) {
      st.progress = 0; st.ratio = 0; st.candidate = null; st.armPhase = 'idle'
      this.latestDraw.hand = null
      entry.smoother.reset(); entry.geoState = createGeoState(); entry.voter.reset(); entry.armer.reset()
      this.handGate.reset()
      return
    }
    const mirrored = mirrorLandmarks(lms[0])
    const smoothed = entry.smoother.push(mirrored)
    // 绘制存原始坐标（识别用镜像坐标），HUD 统一在镜像 ctx 里按 x 直绘
    this.latestDraw.hand = smoothed.map(q => ({ x: 1 - q.x, y: q.y, z: q.z }))
    const { candidate } = analyzeFrame(smoothed, entry.geoState, GESTURE_CONFIG)
    const vote = entry.voter.push(candidate)
    const stable = vote.stable
    st.ratio = vote.ratio
    st.candidate = stable

    const arm = entry.armer.frame(stable, ts)
    st.armPhase = arm.phase
    st.progress = arm.progress
    st.remainMs = arm.remainMs
    if (arm.event === 'submit-arm' || arm.event === 'submit') {
      this._emitCandidate('hand', arm.event === 'submit' ? 'submit' : null)
      if (arm.event === 'submit-arm') st.candidate = 'submit-arm'
    }
    // 上升沿发射（见 feedHandCandidate）：持续比同一个选答手势只发一次，必须松手才允许再发，
    // 否则多选题的 toggle 会被冷却期一遍遍翻来翻去 = 用户看到的"一直闪、确认不了"。
    // 两阶段提交进行中（握->松->再握）时 armPhase 非 idle，中途冒出的张开手/伸指候选不发出去。
    this.feedHandCandidate(stable, arm.phase)
  }

  async _processHead(entry, ts) {
    const res = entry.detector.detectForVideo(this.videoEl, ts)
    const st = this.state.head
    const faces = res.faceLandmarks || res.landmarks
    const has = faces && faces.length > 0
    st.detected = !!has
    if (!has) { st.candidate = null; this.latestDraw.face = null; return }
    this.latestDraw.face = faces[0]

    let deg = null
    const mats = res.facialTransformationMatrixes
    if (mats && mats.length) {
      const r = eulerAnglesFromMatrix(mats[0])
      if (r) deg = { yaw: r.yaw * RAD, pitch: r.pitch * RAD, roll: r.roll * RAD, hasMatrix: true }
    }
    if (!deg) {
      const r = anglesFromLandmarks(faces[0])
      deg = { yaw: r.yaw * RAD, pitch: r.pitch * RAD, roll: 0, hasMatrix: false }
    }
    // 几何俯仰 + 嘴部信号（点头/抬头的冗余源、张嘴/微笑开关）
    deg.geo = geometricPitchRatio(faces[0])
    let jaw = null
    let smile = null
    const bs = res.faceBlendshapes && res.faceBlendshapes[0]
    if (bs && bs.categories) {
      const c = bs.categories.find(x => x.categoryName === 'jawOpen')
      if (c) jaw = c.score
      const sl = bs.categories.find(x => x.categoryName === 'mouthSmileLeft')
      const sr = bs.categories.find(x => x.categoryName === 'mouthSmileRight')
      if (sl && sr) smile = (sl.score + sr.score) / 2
    }
    st.debug = loadSettings().feedback.debug
      ? {
        pitchMat: +deg.pitch.toFixed(1),
        src: deg.hasMatrix ? '矩阵' : '几何',
        geo: deg.geo != null ? +deg.geo.toFixed(3) : null,
        jaw: jaw != null ? +jaw.toFixed(2) : null,
        smile: smile != null ? +smile.toFixed(2) : null
      }
      : null

    if (!entry.analyzer) {
      entry.analyzer = createHeadAnalyzer(entry.zero, entry.sensitivity, HEAD_CONFIG, () => performance.now())
    }
    const out = entry.analyzer.push(deg, ts)
    st.angles = out.angles
    st.candidate = out.candidate
    st.offscreen = out.offscreen
    // 判定链诊断：HUD 直接显示"实际参与判定的相对俯仰/峰值/速度"，哪道门拦住的肉眼可见
    if (st.debug && out.debug) {
      st.debug.pitchRel = out.debug.val
      st.debug.peak = out.debug.peak != null ? +out.debug.peak.toFixed(1) : null
      st.debug.vel = +out.debug.vel.toFixed(1)
      st.debug.meanVel = +out.debug.meanVel.toFixed(1)
      st.debug.excOpen = out.debug.excOpen
    }
    if (st.debug && out.thresh != null) st.debug.thresh = +out.thresh.toFixed(1)
    if (out.candidate) this._emitCandidate('head', out.candidate)
    const mouthEvent = entry.mouthGate ? entry.mouthGate.push(jaw, ts) : null
    if (mouthEvent) this._emitCandidate('head', mouthEvent)
    const smileEvent = entry.smileGate ? entry.smileGate.push(smile, ts) : null
    if (smileEvent) this._emitCandidate('head', smileEvent)
    if (this.onHeadFrame) this.onHeadFrame(out)
  }

  async _processArm(entry, ts) {
    const res = entry.detector.detectForVideo(this.videoEl, ts)
    const st = this.state.arm
    const poses = res.landmarks || res.list
    const has = poses && poses.length > 0
    st.detected = !!has
    if (!has) { st.candidate = null; this.latestDraw.pose = null; return }
    this.latestDraw.pose = poses[0]
    const candidate = entry.analyzer.push(poses[0], ts)
    st.candidate = candidate
    if (candidate) this._emitCandidate('arm', candidate)
  }
}
