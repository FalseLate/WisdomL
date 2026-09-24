import request from '../utils/request'

// 记单词模块：词书 / 学习计划 / 学习会话

// 词书列表（含每本词数）
export function getBooks() {
  return request({ url: '/study/books', method: 'GET' })
}

// 我的当前计划（含词书信息与学习进度，无计划时 data 为 null）
export function getMyPlan() {
  return request({ url: '/study/plan', method: 'GET' })
}

// 保存学习计划
export function savePlan(level, dailyCount) {
  return request({ url: '/study/plan/save', method: 'POST', data: { level, dailyCount } })
}

// 开始学习（服务端分配单词/断点续刷），mode: choice | spell
export function startStudy(level, mode) {
  return request({ url: '/study/start', method: 'POST', data: { level, mode } })
}

// 每答一题上报进度（中途退出进度不丢）
export function reportAnswer(sessionId, correct) {
  return request({ url: '/study/answer', method: 'POST', data: { sessionId, correct } })
}

// 完成本组学习
export function finishStudy(sessionId) {
  return request({ url: '/study/finish', method: 'POST', data: { sessionId } })
}

// 某词书学习进度（已背/总数）
export function getStudyProgress(level) {
  return request({ url: '/study/progress', method: 'GET', params: { level } })
}
