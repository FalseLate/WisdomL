import request from './request.js'

// 模块级单例：整个做题页只拉一次收藏列表，构建「题目业务ID -> favorite主键ID」映射，多张卡片复用，避免每卡一请求
let promise = null

export function loadFavoriteMap() {
  if (!promise) {
    promise = request.get('/collection').then(list => {
      const map = new Map()
      ;(list || []).forEach(item => {
        let q = null
        try { q = JSON.parse(item.questionJson) } catch (e) { q = null }
        const bizId = q && (q.id || q._id)
        if (bizId != null) map.set(String(bizId), item.id)
      })
      return map
    }).catch(() => { promise = null; return new Map() })
  }
  return promise
}
