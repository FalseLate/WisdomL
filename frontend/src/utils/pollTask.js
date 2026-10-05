import request from './request.js'

/**
 * 轮询后端异步任务直到完成。
 *
 * @param {string} taskId 后端任务 ID
 * @param {Object} [opts]
 * @param {number} [opts.intervalMs=2000] 轮询间隔
 * @param {number} [opts.maxMs=180000]     总时长上限（3 分钟，超过就是真出问题了，别静默挂着）
 * @param {number} [opts.maxErrors=5]      连续网络失败次数上限（旧版只 console.warn 会一路吞到 5 分钟）
 * @param {AbortSignal} [opts.signal]      调用方组件卸载时 abort，避免离开页面后还在轮询、以及"回来发现什么都没弹"
 * @returns {Promise<object>} 完成时的任务结果
 */
export function pollTask(taskId, { intervalMs = 2000, maxMs = 180000, maxErrors = 5, signal = null } = {}) {
  return new Promise((resolve, reject) => {
    if (!taskId) { reject(new Error('任务创建失败：后端没有返回任务 ID')); return }

    const startedAt = Date.now()
    let errors = 0
    let timer = null

    const stop = () => { if (timer) clearInterval(timer); timer = null }
    const fail = (msg) => { stop(); reject(new Error(msg)) }

    if (signal) {
      if (signal.aborted) { fail('已取消生成'); return }
      signal.addEventListener('abort', () => fail('已取消生成'), { once: true })
    }

    timer = setInterval(async () => {
      if (Date.now() - startedAt > maxMs) { fail(`生成超时（超过 ${Math.round(maxMs / 60000)} 分钟），请稍后重试`); return }
      try {
        const data = await request.get('/task/' + taskId)
        errors = 0
        if (data.status === 'completed') { stop(); resolve(data); return }
        if (data.status === 'failed') { stop(); reject(new Error(data.error || '任务失败')); return }
        // pending / running → 继续等
      } catch (e) {
        if (++errors >= maxErrors) { fail(`查询任务状态连续失败：${e.message || e}`); return }
      }
    }, intervalMs)
  })
}
