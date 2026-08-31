import request from '../utils/request'

// 单题判分（客观题）
export function checkAnswer(questionId, userAnswer, question, questionType, recordId) {
  return request({
    url: '/check',
    method: 'POST',
    data: {
      questionId,
      userAnswer,
      question,
      questionType,
      recordId: recordId || null
    }
  })
}

// 主观题AI评分
export function checkSubjective(questionId, userAnswer, question, recordId) {
  return request({
    url: '/check-subjective',
    method: 'POST',
    data: {
      questionId,
      userAnswer,
      question,
      recordId: recordId || null
    }
  })
}

// 整卷批量判分
export function checkBatch(answers) {
  return request({
    url: '/check-batch',
    method: 'POST',
    data: { answers }
  })
}

// 单题生成解析
export function generateAnswer(question, type, category, options, answer) {
  return request({
    url: '/generate-answer',
    method: 'POST',
    data: {
      question,
      type: type || 'subjective',
      category: category || '',
      options: options || null,
      answer: answer || ''
    }
  })
}
