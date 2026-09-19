import request from '../utils/request'

// 分级阅读文章列表（level: 4/6/ky，不传或 all 为全部）
export function getReadingArticles(level) {
  return request({
    url: '/reading/articles',
    method: 'GET',
    params: { level }
  })
}

// 文章详情（content 为结构化 JSON 字符串）
export function getReadingArticle(id) {
  return request({
    url: `/reading/article/${id}`,
    method: 'GET'
  })
}

// 句子结构解析（GLM，后端带缓存）
export function analyzeSentence(text) {
  return request({
    url: '/reading/analyze',
    method: 'POST',
    data: { text }
  })
}

// 查询当前用户是否已做完该文章的理解题（做完后阅读页不再显示题目）
export function getReadingDone(articleId) {
  return request({
    url: '/reading/done',
    method: 'GET',
    params: { articleId }
  })
}

// 交卷：标记文章已完成 + 答错的题写入错题本
export function finishReadingQuiz(data) {
  return request({
    url: '/reading/finish-quiz',
    method: 'POST',
    data
  })
}
