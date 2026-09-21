import request from '../utils/request'

// 英语错题复习（PDCA）：正文只读错题本，扩展数据落英语自己的表

// 英语错题列表（含错因/重做次数/回流标记）
export function getEnglishWrongList() {
  return request({
    url: '/english/wrong/list',
    method: 'GET'
  })
}

// 保存错因标签：errorTypeIds = '1,3'（空串清空）
export function saveErrorTypes(questionId, errorTypeIds) {
  return request({
    url: '/english/wrong/error-types',
    method: 'POST',
    data: { questionId, errorTypeIds }
  })
}

// 重做结果回写：correct=true 标记已攻克
export function submitRedo(questionId, correct) {
  return request({
    url: '/english/wrong/redo',
    method: 'POST',
    data: { questionId, correct }
  })
}
