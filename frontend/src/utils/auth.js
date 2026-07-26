import { reactive } from 'vue'
import request from './request.js'

// 用户认证状态
export const authState = reactive({
  token: localStorage.getItem('token') || '',
  user: JSON.parse(localStorage.getItem('user') || 'null')
})

// 是否已登录
export function isLoggedIn() {
  return !!authState.token
}

// 登录
export async function login(username, password) {
  const res = await request.post('/auth/login', { username, password })
  if (res.error) throw new Error(res.error)
  saveAuth(res.token, res.user)
  return res
}

// 注册
export async function register(username, password, nickname) {
  const res = await request.post('/auth/register', { username, password, nickname })
  if (res.error) throw new Error(res.error)
  saveAuth(res.token, res.user)
  return res
}

// 保存认证信息
function saveAuth(token, user) {
  authState.token = token
  authState.user = user
  localStorage.setItem('token', token)
  localStorage.setItem('user', JSON.stringify(user))
  // 设置 axios 默认请求头
  request.defaults.headers.common['Authorization'] = 'Bearer ' + token
}

// 退出登录
export function logout() {
  authState.token = ''
  authState.user = null
  localStorage.removeItem('token')
  localStorage.removeItem('user')
  delete request.defaults.headers.common['Authorization']
}

// 初始化时如果有 token 则设置请求头
if (authState.token) {
  request.defaults.headers.common['Authorization'] = 'Bearer ' + authState.token
}
