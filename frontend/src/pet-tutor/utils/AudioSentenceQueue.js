/**
 * 句子级音频播放队列（配合后端 SSE 的 audio 事件）。
 * 特性：
 *  - 后端各句 TTS 并发合成、乱序到达 → 这里按 sentenceIndex 缓存，严格按序播放
 *  - WebAudio 预解码 + 时间轴调度：相邻句子无缝拼接（nextStartAt 接力）
 *  - onBeforePlay(payload, startAt, ctx)：每句开播前回调，口型用同一个 AudioContext 时钟对齐
 *  - beginTurn/stopAll：新一轮对话或打断时立即掐掉在播内容
 */
export class AudioSentenceQueue {
  constructor({ onBeforePlay, onSentenceEnd } = {}) {
    this.onBeforePlay = onBeforePlay || null
    this.onSentenceEnd = onSentenceEnd || null
    this.ctx = null
    this.turnCtx = null
    this.clips = new Map()      // sentenceIndex -> { buffer, payload }
    this.nextIndex = 0
    this.nextStartAt = 0        // 下一句在 AudioContext 时间轴上的最早开播点
    this.liveSources = new Set()
    // 可选：WLipSyncAudioNode（只读分析器，不出声）。设置后每个播放源额外分接一路进去，
    // 供虚拟人每帧读取 weights/volume 做实时口型（AIRI 同款接法）
    this.analyserNode = null
  }

  /** 必须在用户点击事件链里调用（浏览器自动播放策略要求用户手势） */
  ensureContext() {
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)()
    if (this.ctx.state === 'suspended') this.ctx.resume()
    return this.ctx
  }

  /** 开始新一轮：停掉上一轮残留，重置播放指针 */
  beginTurn(ctx) {
    this.stopAll()
    this.turnCtx = ctx
    this.nextIndex = 0
    this.nextStartAt = 0
  }

  /**
   * 接收后端 audio 事件 payload：{ sentenceIndex, text, audioUrl, viseme[] }
   * 下载解码是异步并发的；解码回来若已开启新一轮则丢弃。
   */
  async push(payload) {
    const ctx = this.turnCtx
    if (!ctx) return
    try {
      const resp = await fetch(payload.audioUrl)
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const buffer = await ctx.decodeAudioData(await resp.arrayBuffer())
      if (ctx !== this.turnCtx) return        // 已经开新轮了，旧轮数据作废
      this.clips.set(payload.sentenceIndex, { buffer, payload })
      this._flush(ctx)
    } catch (e) {
      console.warn('[Audio] 句子加载失败', payload.sentenceIndex, payload.text, e)
    }
  }

  /** 把「连续就绪」的句子按时间轴接力开播（缺第 N 句时停在 N-1，等它到齐再续上） */
  _flush(ctx) {
    while (this.clips.has(this.nextIndex)) {
      const { buffer, payload } = this.clips.get(this.nextIndex)
      this.clips.delete(this.nextIndex)
      const startAt = Math.max(ctx.currentTime + 0.05, this.nextStartAt || 0)
      const src = ctx.createBufferSource()
      src.buffer = buffer
      src.connect(ctx.destination)
      if (this.analyserNode) {
        try { src.connect(this.analyserNode) } catch { /* 分析器异常不影响播放 */ }
      }
      src.start(startAt)
      this.liveSources.add(src)
      src.onended = () => {
        this.liveSources.delete(src)
        if (this.onSentenceEnd) this.onSentenceEnd(payload)
      }
      if (this.onBeforePlay) this.onBeforePlay(payload, startAt, ctx)
      this.nextStartAt = startAt + buffer.duration
      this.nextIndex += 1
    }
  }

  /** 立刻停掉所有在播/待播（新一轮对话、或将来做打断时调用） */
  stopAll() {
    for (const s of this.liveSources) {
      try { s.onended = null; s.stop() } catch { /* 可能已经播完 */ }
    }
    this.liveSources.clear()
    this.clips.clear()
  }
}
