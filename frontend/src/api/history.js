import request from '../utils/request'

// 获取历史记录/题库列表
export function getHistoryList() {
  return request({
    url: '/user/history',
    method: 'GET'
  })
}

// 修改标题
export function updateHistoryTitle(id, title) {
  return request({
    url: `/user/history/${id}/title`,
    method: 'PUT',
    data: { title }
  })
}

// 删除单条记录
export function deleteHistory(id) {
  return request({
    url: `/user/history/${id}`,
    method: 'DELETE'
  })
}

// 批量删除
export function batchDeleteHistory(ids) {
  return request({
    url: '/user/history/batch-delete',
    method: 'POST',
    data: { ids }
  })
}
