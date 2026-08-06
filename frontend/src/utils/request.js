import axios from 'axios'

const request = axios.create({
  baseURL: '/api',
  timeout: 100000
})

// 请求拦截器 - 自动带 token + 打印日志
request.interceptors.request.use(
  config => {
    const token = localStorage.getItem('token')
    if (token) {
      config.headers['Authorization'] = 'Bearer ' + token
    }
    console.log(`[API请求] ${config.method.toUpperCase()} ${config.url}`)
    return config
  },
  error => {
    console.error('[API请求错误]', error)
    return Promise.reject(error)
  }
)

// 响应拦截器 - 统一处理错误
request.interceptors.response.use(
  response => {
    console.log('[API响应]', response.data)
    return response.data
  },
  error => {
    console.error('[API错误]', error)
    if (error.response) {
      const status = error.response.status
      const msg = error.response.data?.error || `服务器错误(${status})`
      if (status === 401) {
        localStorage.removeItem('token')
        localStorage.removeItem('user')
      }
      return Promise.reject(new Error(msg))
    } else if (error.code === 'ECONNABORTED') {
      return Promise.reject(new Error('请求超时，请稍后重试'))
    } else {
      return Promise.reject(new Error('网络错误，请检查网络连接'))
    }
  }
)

export default request