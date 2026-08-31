import request from '../utils/request'

// 查询单条记录的答题进度
export function getProgress(historyId) {
  return request({
    url: '/progress',
    method: 'GET',
    params: { historyId }
  })
}

// 批量查询多条记录的进度（并行调用）
export async function getProgressBatch(historyIds) {
  if (!Array.isArray(historyIds) || historyIds.length === 0) {
    return {}
  }
  const results = await Promise.all(
    historyIds.map(id =>
      getProgress(id)
        .then(res => ({ id, data: res }))
        .catch(() => ({ id, data: null }))
    )
  )
  const map = {}
  results.forEach(({ id, data }) => {
    if (data) {
      map[id] = {
        totalCount: data.totalCount || 0,
        completedCount: data.completedCount || 0,
        correctCount: data.correctCount || 0,
        wrongCount: data.wrongCount || 0,
        progressPercent: data.progressPercent || 0
      }
    }
  })
  return map
}
