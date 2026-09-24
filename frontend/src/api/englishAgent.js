import request from '../utils/request'

// 英语 Agent 能力（PDCA 阶段2）：任务播报 / 挖空抽查 / 个性化阅读 / 错因识别

// 今日任务播报数据：待复习生词数 + 未攻克英语错题数
export function getPlanToday() {
  return request({
    url: '/english/plan/today',
    method: 'GET'
  })
}

// AI 挖空抽查：随机到期生词 + Wiki/Agent 例句挖空（data 为 null 表示今日无到期词）
export function getBlankQuiz() {
  return request({
    url: '/english/quiz/blank',
    method: 'GET'
  })
}

// AI 个性化阅读：用薄弱生词生成一篇短文+3道理解题，返回 { id, title, words }
export function generateReading() {
  return request({
    url: '/english/reading/generate',
    method: 'POST'
  })
}

// AI 自动错因识别：返回 { errorTypeIds: '1,3', reason: '...' }
export function autoTagError(questionId) {
  return request({
    url: '/english/wrong/auto-tag',
    method: 'POST',
    data: { questionId }
  })
}

// Act 沉淀：把错题知识缺口提炼成我的私人 Wiki 条目（同题去重）
export function absorbWiki(questionId) {
  return request({
    url: '/wiki/absorb',
    method: 'POST',
    data: { questionId }
  })
}

// 我的私人 Wiki 条目列表
export function getMyWiki() {
  return request({
    url: '/wiki/mine',
    method: 'GET'
  })
}

// 删除我的私人 Wiki 条目
export function removeMyWiki(id) {
  return request({
    url: `/wiki/mine/${id}`,
    method: 'DELETE'
  })
}

// 学习周报：本周统计 + AI 点评
export function getWeeklyReport() {
  return request({
    url: '/english/report/weekly',
    method: 'GET'
  })
}

// AI 变式挑战：同考点不同考法题（同题只生成一次，之后返回已有题目）
export function generateVariants(questionId) {
  return request({
    url: '/english/wrong/variant/generate',
    method: 'POST',
    data: { questionId }
  })
}

// 变式题作答回写：答对且原题最近重做也对 → 直接攻克
export function answerVariant(variantId, correct) {
  return request({
    url: '/english/wrong/variant/answer',
    method: 'POST',
    data: { variantId, correct }
  })
}
