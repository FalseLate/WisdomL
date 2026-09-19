import request from '../utils/request'

// 获取随机单词（拼写模式）
export function getRandomWord(level) {
  return request({
    url: '/word/random',
    method: 'GET',
    params: { level }
  })
}

// 获取选择题单词
export function getOptionWord(level) {
  return request({
    url: '/word/option',
    method: 'GET',
    params: { level }
  })
}

// 拼写校验
export function checkSpellApi(data) {
  return request({
    url: '/word/check',
    method: 'POST',
    data
  })
}

// 选择题校验
export function checkOptionApi(data) {
  return request({
    url: '/word/checkOption',
    method: 'POST',
    data
  })
}

// 加入生词本
export function addWordCollect(userId, wordId) {
  return request({
    url: '/word/collect',
    method: 'POST',
    data: { userId, wordId }
  })
}

// 取消收藏生词
export function removeWordCollect(userId, wordId) {
  return request({
    url: '/word/unCollect',
    method: 'POST',
    data: { userId, wordId }
  })
}

// 获取我的生词本列表
export function getMyCollectList(userId) {
  return request({
    url: '/word/myCollect',
    method: 'GET',
    params: { userId }
  })
}

// 阅读划词：按单词文本精确查询
export function queryWord(text) {
  return request({
    url: '/word/query',
    method: 'GET',
    params: { text }
  })
}
