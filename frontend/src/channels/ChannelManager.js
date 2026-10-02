/**
 * 通道管理器：开哪条实例化哪个 detector，关即 close 释放（省内存核心约束）。
 * 三路共享一个摄像头流（引用计数）与一个 rAF 帧循环；
 * 帧调度 hand 每帧 / head 每 2 帧 / arm 每 4 帧；输入统一 320x240。
 *
 * 识别事件流向：detector 结果 -> 各通道几何层 -> (投票/峰值) -> 候选
 *   -> settings.mappings 重映射 -> actionBus（per-action 冷却）-> 视图 handler 表
 */
import { HandLandmarker, FaceLandmarker, PoseLandmarker } from '@mediapipe/tasks-vision'
import { getVision } from './visionLoader.js'
import {
  GESTURE_CONFIG, mirrorLandmarks, createSmoother, createGeoState,
  analyzeFrame, createVoter, createSubmitArmer
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
    this._stream = null
    this._streamRefs = 0
    /** @type {Map<string,Object>} */
    this.channels = new Map()
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
        voter: createVoter(), armer: createSubmitArmer(GESTURE_CONFIG, () => performance.now())
      }
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
    this.channels.set(name, entry)
    this.state[name].on = true
    await this._ensureStream()
    this._startLoop()
  }

  async close(name) {
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
    for (const name of [...this.channels.keys()]) await this.close(name)
  }

  // ================= 内部 =================

  async _ensureStream() {
    if (this._stream) { this._streamRefs++; return }
    this._stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 320, height: 240, facingMode: 'user' }, audio: false
    })
    this._streamRefs = 1
    this.videoEl.srcObject = this._stream
    await this.videoEl.play()
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
        this._frame++
        for (const entry of this.channels.values()) {
          if ((this._frame % FRAME_MOD[entry.name]) !== 0) continue
          try { await this._process(entry, nowMs) }
          catch (e) { console.warn(`[channel:${entry.name}]`, e.message) }
        }
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
    if (entry.name === 'hand') return this._processHand(entry, ts)
    if (entry.name === 'head') return this._processHead(entry, ts)
    if (entry.name === 'arm') return this._processArm(entry, ts)
  }

  _emitCandidate(channel, candidate) {
    if (!candidate) return
    const st = this.state[channel]
    if (st) st.firedGesture = candidate   // HUD 回显"识别成功的手势"用
    if (this.bus) this.bus.routeChannelCandidate(channel, candidate)
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
    // 两阶段提交进行中（握->松->再握）：中途必然出现张开手/伸指候选，
    // 既不能取消待确认，也不能把它们当成选答动作发出去
    if (stable && stable !== 'fist' && arm.phase === 'idle') {
      this._emitCandidate('hand', stable)
    }
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
