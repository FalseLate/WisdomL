import request from './request.js'

/**
 * 轮询任务状态
 * @param {string} taskId - 后端返回的任务ID
 * @param {number} intervalMs - 轮询间隔（毫秒），默认2秒
 * @param {number} maxAttempts - 最大轮询次数，默认150次（约5分钟）
 * @returns {Promise<object>} - 最终任务结果
 */
export function pollTask(taskId, intervalMs = 2000, maxAttempts = 150) {
  return new Promise((resolve, reject) => {
    let attempts = 0

    const timer = setInterval(async () => {
      attempts++
      if (attempts > maxAttempts) {
        clearInterval(timer)
        reject(new Error('任务超时，请稍后重试'))
        return
      }

      try {
        const data = await request.get('/task/' + taskId)

        if (data.status === 'completed') {
          clearInterval(timer)
          resolve(data)
        } else if (data.status === 'failed') {
          clearInterval(timer)
          reject(new Error(data.error || '任务失败'))
        }
        // pending 或 running → 继续轮询
      } catch (e) {
        console.warn('轮询出错，继续重试:', e.message)
      }
    }, intervalMs)
  })
}
