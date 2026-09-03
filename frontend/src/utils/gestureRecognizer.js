/**
 * 手势识别工具类（基于 MediaPipe Hands）
 * 纯浏览器端运行，免费，无需后端
 *
 * 重要：MediaPipe WASM 模块是全局单例，Module.arguments 只能初始化一次
 * 销毁后重新创建 Hands 实例会触发 "Module.arguments has been replaced" 错误
 * 所以：Hands 实例用模块级单例，stop() 只停摄像头不销毁，destroy() 才真正销毁
 *
 * 识别管线（几何/投票/提交状态机见 gestureGeometry.js）：
 *   原始关键点 -> 镜像坐标 -> EMA平滑 -> 掌长归一几何分类
 *   -> 11帧滑窗投票(>=65%) -> 稳定手势冷却触发 / 握拳走两阶段提交
 *
 * 手势映射（全静态）：
 * - 伸 1/2/3/4 指                  -> select A/B/C/D
 * - 点赞（四指握拳+拇指竖起）偏左/右 -> prev / next，拇指竖直不偏不触发
 * - 五指张开                       -> clear（仅多选题，页面层判断）
 * - 握拳（拇指必须收回贴掌）保持1.5s -> submit-arm，松手后3s内再握0.6s -> submit
 *   拇指半伸灰区既不点赞也不握拳，从根上防止点赞被误判成提交
 */

import { markRaw } from 'vue'
import {
  LM,
  GESTURE_CONFIG,
  mirrorLandmarks,
  createSmoother,
  createGeoState,
  analyzeFrame,
  createVoter,
  createSubmitArmer,
  candidateToGesture
} from './gestureGeometry.js'

// 模块级单例：Hands 实例全局只创建一次
let _handsSingleton = null
let _handsScriptLoaded = false

export class GestureRecognizer {
  constructor() {
    this.hands = null
    this.videoElement = null
    this.canvasElement = null
    this.ctx = null
    this.running = false
    this._destroyed = false

    // 回调
    this.onGesture = null        // 确认触发的手势事件
    this.onHandDetected = null   // 是否检测到手
    this.onLandmarks = null      // 原始关键点（保留接口）
    this.onConfirmProgress = null// 确认进度 0~100
    this.onCandidate = null      // 每帧稳定候选 { key, ratio, armPhase }
    this.onArmChange = null      // 两阶段提交待确认状态变化 (armed:boolean)

    // 管线组件
    this._smoother = createSmoother()
    this._geoState = createGeoState()
    this._voter = createVoter()
    this._armer = createSubmitArmer()

    // 触发控制
    this._lastStable = null
    this._lastEmitAt = {}
    this._wasArmed = false

    // 帧率控制
    this._lastProcessTime = 0
    this._minInterval = GESTURE_CONFIG.FPS_INTERVAL
    this._rafId = null
  }

  /**
   * 初始化 MediaPipe Hands（单例，重复调用复用已有实例）
   */
  async init(videoEl, canvasEl) {
    this.videoElement = videoEl
    this.canvasElement = canvasEl
    if (canvasEl) {
      this.ctx = canvasEl.getContext('2d')
    }

    await this._loadHandsScript()

    if (!_handsSingleton) {
      _handsSingleton = markRaw(new window.Hands({
        locateFile: (file) => `/mediapipe/hands/${file}`
      }))
      _handsSingleton.setOptions({
        maxNumHands: 1,
        modelComplexity: 1,
        minDetectionConfidence: 0.7,
        minTrackingConfidence: 0.5
      })
      _handsSingleton.onResults((results) => this._onResults(results))
    }

    this.hands = _handsSingleton
    this._destroyed = false
    return true
  }

  /**
   * 启动摄像头和识别循环
   */
  async start() {
    if (!this.hands || !this.videoElement) {
      throw new Error('请先调用 init()')
    }

    this.running = true
    this._destroyed = false
    this._resetPipeline()

    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 320, height: 240, facingMode: 'user' },
      audio: false
    })
    this.videoElement.srcObject = stream
    await this.videoElement.play()

    this._processLoop()
  }

  /**
   * 停止摄像头和识别循环（不销毁 Hands 实例，保留单例供下次复用）
   */
  async stop() {
    this.running = false

    if (this._rafId) {
      cancelAnimationFrame(this._rafId)
      this._rafId = null
    }

    // 等待正在执行的 send() Promise 完成
    await this._wait(150)

    if (this.videoElement && this.videoElement.srcObject) {
      this.videoElement.srcObject.getTracks().forEach(t => t.stop())
      this.videoElement.srcObject = null
    }

    this._resetPipeline()
  }

  /**
   * 真正销毁 Hands 实例（仅在组件卸载时调用一次）
   */
  async destroy() {
    if (this._destroyed) return
    this._destroyed = true

    await this.stop()
    await this._wait(100)

    if (_handsSingleton) {
      try {
        _handsSingleton.close()
      } catch (e) {
        // 忽略销毁时错误
      }
      _handsSingleton = null
    }
    this.hands = null
  }

  // ============ 回调设置 ============

  setGestureCallback(callback) { this.onGesture = callback }
  setHandDetectedCallback(callback) { this.onHandDetected = callback }
  setLandmarksCallback(callback) { this.onLandmarks = callback }
  setConfirmCallback(callback) { this.onConfirmProgress = callback }
  setCandidateCallback(callback) { this.onCandidate = callback }
  setArmChangeCallback(callback) { this.onArmChange = callback }

  // ============ 内部方法 ============

  _resetPipeline() {
    this._smoother.reset()
    this._geoState = createGeoState()
    this._voter.reset()
    this._armer.reset()
    this._lastStable = null
    this._lastEmitAt = {}
    this._wasArmed = false
    if (this.onConfirmProgress) this.onConfirmProgress(0)
    if (this.onCandidate) this.onCandidate({ key: null, ratio: 0, armPhase: 'idle' })
  }

  async _loadHandsScript() {
    if (_handsScriptLoaded || window.Hands) {
      _handsScriptLoaded = true
      return
    }

    const src = '/mediapipe/hands/hands.js'
    const existing = document.querySelector(`script[src="${src}"]`)
    if (existing) {
      await new Promise((resolve, reject) => {
        if (window.Hands) { resolve(); return }
        existing.onload = resolve
        existing.onerror = () => reject(new Error('hands.js 加载失败'))
      })
      _handsScriptLoaded = true
      return
    }

    await new Promise((resolve, reject) => {
      const s = document.createElement('script')
      s.src = src
      s.onload = resolve
      s.onerror = () => reject(new Error('hands.js 加载失败，请确认 public/mediapipe/hands/ 目录存在'))
      document.head.appendChild(s)
    })
    _handsScriptLoaded = true
  }

  /**
   * 异步处理循环：await hands.send() 完成后才调度下一帧，避免 WASM 重叠调用
   */
  async _processLoop() {
    if (!this.running || this._destroyed) return

    const now = Date.now()
    if (now - this._lastProcessTime >= this._minInterval) {
      this._lastProcessTime = now
      if (this.videoElement.readyState >= 2 && this.hands) {
        try {
          await this.hands.send({ image: this.videoElement })
        } catch (e) {
          if (!this._destroyed) console.warn('hands.send error:', e.message)
        }
      }
    }

    if (this.running && !this._destroyed) {
      this._rafId = requestAnimationFrame(() => this._processLoop())
    }
  }

  _onResults(results) {
    if (this._destroyed) return

    const hasHand = results.multiHandLandmarks && results.multiHandLandmarks.length > 0

    if (this.onHandDetected) this.onHandDetected(hasHand)

    // 绘制使用平滑后的镜像点（绘制时 x 还原，配合 canvas 的 CSS 镜像）
    let drawLandmarks = null

    if (!hasHand) {
      this._resetPipeline()
      this._drawCanvas(null)
      return
    }

    const raw = results.multiHandLandmarks[0]
    if (this.onLandmarks) this.onLandmarks(raw)

    // ===== 识别管线 =====
    const mirrored = mirrorLandmarks(raw)
    const smoothed = this._smoother.push(mirrored)
    drawLandmarks = smoothed

    const { candidate, features: frameFeatures } = analyzeFrame(smoothed, this._geoState, GESTURE_CONFIG)
    const vote = this._voter.push(candidate)
    const stable = vote.stable

    // 两阶段握拳提交状态机（fist 不参与普通触发）
    const arm = this._armer.frame(stable, performance.now())

    if (arm.event === 'submit-arm') {
      this._wasArmed = true
      this._emit({ type: 'submit-arm' })
      if (this.onArmChange) this.onArmChange(true)
    } else if (arm.event === 'submit') {
      this._wasArmed = false
      if (this.onArmChange) this.onArmChange(false)
      const nowMs = performance.now()
      this._lastEmitAt.submit = nowMs
      this._emit({ type: 'submit' })
    } else if (arm.phase === 'idle' && this._wasArmed) {
      // 超时或改比其他手势导致待确认取消，同步熄灭 HUD 提示
      this._wasArmed = false
      if (this.onArmChange) this.onArmChange(false)
    }

    // 普通稳定手势：首次形成即触发，冷却期内同手势不重复
    if (stable && stable !== 'fist') {
      if (this._lastStable !== stable) {
        this._lastStable = stable
        this._tryEmitStable(stable)
      }
    } else if (!stable) {
      this._lastStable = null
    }

    // ===== 进度与候选上报 =====
    let progress = 0
    if (arm.phase !== 'idle') {
      progress = arm.progress
    } else if (stable && stable !== 'fist') {
      progress = Math.min(100, Math.round((vote.ratio / GESTURE_CONFIG.VOTE_RATIO) * 100))
    } else if (stable === 'fist') {
      progress = arm.progress
    }
    if (this.onConfirmProgress) this.onConfirmProgress(progress)
    if (this.onCandidate) {
      this.onCandidate({
        key: stable,
        ratio: vote.ratio,
        armPhase: arm.phase,
        likeOffset: frameFeatures ? frameFeatures.likeOffset : null
      })
    }

    this._drawCanvas(drawLandmarks)
  }

  _tryEmitStable(key) {
    const gesture = candidateToGesture(key)
    if (!gesture) return
    let cooldown = GESTURE_CONFIG.COOLDOWN_SELECT
    if (key === 'prev' || key === 'next') cooldown = GESTURE_CONFIG.COOLDOWN_NAV
    else if (key === 'clear') cooldown = GESTURE_CONFIG.COOLDOWN_CLEAR

    const nowMs = performance.now()
    if (nowMs - (this._lastEmitAt[key] || -Infinity) < cooldown) return
    this._lastEmitAt[key] = nowMs
    this._emit(gesture)
  }

  _emit(gesture) {
    if (this.onGesture) this.onGesture(gesture)
  }

  _drawCanvas(smoothedMirrored) {
    const canvas = this.canvasElement
    const ctx = this.ctx
    if (!canvas || !ctx) return

    ctx.save()
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    if (smoothedMirrored) {
      // canvas 元素被 CSS scaleX(-1) 镜像，这里把镜像坐标 x 还原后绘制
      const landmarks = smoothedMirrored.map(p => ({ x: 1 - p.x, y: p.y, z: p.z }))
      const w = canvas.width
      const h = canvas.height

      const connections = [
        [0, 1], [1, 2], [2, 3], [3, 4],
        [0, 5], [5, 6], [6, 7], [7, 8],
        [5, 9], [9, 10], [10, 11], [11, 12],
        [9, 13], [13, 14], [14, 15], [15, 16],
        [13, 17], [17, 18], [18, 19], [19, 20],
        [0, 17]
      ]

      ctx.strokeStyle = '#00f5ff'
      ctx.lineWidth = 2
      ctx.shadowColor = '#00f5ff'
      ctx.shadowBlur = 4

      for (const [a, b] of connections) {
        ctx.beginPath()
        ctx.moveTo(landmarks[a].x * w, landmarks[a].y * h)
        ctx.lineTo(landmarks[b].x * w, landmarks[b].y * h)
        ctx.stroke()
      }

      ctx.fillStyle = '#ff00ff'
      ctx.shadowColor = '#ff00ff'
      for (let i = 0; i < landmarks.length; i++) {
        ctx.beginPath()
        ctx.arc(landmarks[i].x * w, landmarks[i].y * h, 3, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    ctx.restore()
  }

  _wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

export default GestureRecognizer
