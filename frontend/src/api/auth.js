import request from '../utils/request'

// 登录
export function login(username, password) {
  return request({
    url: '/auth/login',
    method: 'POST',
    data: { username, password }
  })
}

// 注册
export function register(username, password, nickname) {
  return request({
    url: '/auth/register',
    method: 'POST',
    data: { username, password, nickname: nickname || username }
  })
}

// 获取当前用户信息
export function getCurrentUser() {
  return request({
    url: '/auth/me',
    method: 'GET'
  })
}
