import request from '../utils/request'

// 获取用户信息+统计
export function getUserProfile() {
  return request({
    url: '/user/profile',
    method: 'GET'
  })
}

// 获取错题列表
export function getWrongQuestions() {
  return request({
    url: '/user/wrong-questions',
    method: 'GET'
  })
}

// 获取收藏列表
export function getFavorites() {
  return request({
    url: '/user/favorites',
    method: 'GET'
  })
}

// 添加收藏
export function addFavorite(questionJson) {
  return request({
    url: '/user/favorites',
    method: 'POST',
    data: { questionJson }
  })
}

// 删除收藏
export function deleteFavorite(id) {
  return request({
    url: `/user/favorites/${id}`,
    method: 'DELETE'
  })
}

// 上传头像
export function uploadAvatar(file) {
  const formData = new FormData()
  formData.append('file', file)
  return request({
    url: '/user/avatar',
    method: 'POST',
    data: formData,
    headers: { 'Content-Type': 'multipart/form-data' }
  })
}
