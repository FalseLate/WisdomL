import request from '../utils/request'

// ===== 星图整张图：主题 / 知识点 / 语义线 / AI 候选 / 错题关联 / 外观 / 否决 =====
export function getGraph() {
  return request({ url: '/starmap/graph', method: 'GET' })
}

// ===== 星系（手建雾团）=====
// data: { title, color, pin }；pin 可空，空星系自动排位
export function addGalaxy(data) {
  return request({ url: '/starmap/galaxy', method: 'POST', data })
}

// patch 可带 title / color / pin（pin:null 回到自动排位）
export function updateGalaxy(id, data) {
  return request({ url: `/starmap/galaxy/${id}`, method: 'PUT', data })
}

// 删星系不删星球：成员退回标题派生/独立星球
export function deleteGalaxy(id) {
  return request({ url: `/starmap/galaxy/${id}`, method: 'DELETE' })
}

// ===== 大球（主题）=====
export function addTopic(data) {
  return request({ url: '/starmap/topic', method: 'POST', data })
}

// patch 可带 title / note / color / pin（pin:null 表示取消钉子，回到自动排布）
export function updateTopic(id, data) {
  return request({ url: `/starmap/topic/${id}`, method: 'PUT', data })
}

export function deleteTopic(id) {
  return request({ url: `/starmap/topic/${id}`, method: 'DELETE' })
}

export function unpinAllTopics() {
  return request({ url: '/starmap/topic/unpin-all', method: 'POST' })
}

// ===== 小球（知识点）=====
export function matchPoint(title) {
  return request({ url: '/starmap/point/match', method: 'GET', params: { title } })
}

// topicId 可空：新建不自动归属，也不自动连层级线
export function addPoint(data) {
  return request({ url: '/starmap/point', method: 'POST', data })
}

// patch 可带 title / note / color / topicId（null=游离）/ merged / hierLine（0=不画归属线）
export function updatePoint(id, data) {
  return request({ url: `/starmap/point/${id}`, method: 'PUT', data })
}

export function deletePoint(id) {
  return request({ url: `/starmap/point/${id}`, method: 'DELETE' })
}

export function mergePoint(fromId, intoId) {
  return request({ url: `/starmap/point/${fromId}/merge-into`, method: 'POST', data: { intoId } })
}

// ===== 错题 ↔ 知识点（共现线与掌握度的事实源）=====
export function listWrongQuestions() {
  return request({ url: '/wrong-questions', method: 'GET' })
}

// 今日复习队列（未掌握且到期/新题）；挂知识点时可选这个来源
export function reviewTodayWrong() {
  return request({ url: '/wrong-questions/review-today', method: 'GET' })
}

export function addPointRef(id, data) {
  return request({ url: `/starmap/point/${id}/ref`, method: 'POST', data })
}

export function deletePointRef(id, wrongQuestionId) {
  return request({ url: `/starmap/point/${id}/ref/${wrongQuestionId}`, method: 'DELETE' })
}

// ===== 连线 =====
export function addEdge(data) {
  return request({ url: '/starmap/edge', method: 'POST', data })
}

export function acceptEdge(id) {
  return request({ url: `/starmap/edge/${id}/accept`, method: 'POST' })
}

// 派生线（共现/层级）没有行可删，必须走否决；veto=1 让 AI/自建线也留下否决记录
export function deleteEdge(id, veto) {
  return request({ url: `/starmap/edge/${id}`, method: 'DELETE', params: veto ? { veto: 1 } : {} })
}

export function vetoEdge(data) {
  return request({ url: '/starmap/edge/veto', method: 'POST', data })
}

export function undoVeto(params) {
  return request({ url: '/starmap/edge/veto', method: 'DELETE', params })
}

// ===== 外观（线型/颜色/粗细/透明度/箭头/隐藏）=====
// 拖拽过程中不调这里，松手才调一次
export function putStyle(data) {
  return request({ url: '/starmap/style', method: 'PUT', data })
}

export function deleteStyle(targetKey) {
  return request({ url: '/starmap/style', method: 'DELETE', params: { targetKey } })
}

// ===== AI 反推知识点 =====
export function analyzePoints(data = {}) {
  return request({ url: '/starmap/ai/points', method: 'POST', data })
}

export function unanalyzedCount() {
  return request({ url: '/starmap/ai/unanalyzed-count', method: 'GET' })
}

// 未反推的错题列表：给“自己挑错题”弹窗
export function unanalyzedQuestions() {
  return request({ url: '/starmap/ai/unanalyzed', method: 'GET' })
}

export function acceptPointCandidate(id, data) {
  return request({ url: `/starmap/ai/candidate/${id}/accept`, method: 'POST', data })
}

export function rejectPointCandidate(id) {
  return request({ url: `/starmap/ai/candidate/${id}`, method: 'DELETE' })
}
