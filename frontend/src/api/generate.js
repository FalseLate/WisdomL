import request from '../utils/request'

// 文本异步出题
export function generateFromText(text, questionType, title) {
  return request({
    url: '/generate-async',
    method: 'POST',
    data: { text, questionType: questionType || 'all', title: title || '文本出题' }
  })
}

// 拍照异步出题
export function generateFromPhoto(file, questionType) {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('questionType', questionType || 'all')
  return request({
    url: '/photo-and-generate-async',
    method: 'POST',
    data: formData,
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 180000
  })
}

// 文件上传（拆分章节）
export function uploadFile(file) {
  const formData = new FormData()
  formData.append('file', file)
  return request({
    url: '/upload',
    method: 'POST',
    data: formData,
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000
  })
}

// 按章节异步出题
export function generateFromSections(sectionIds, sectionTexts, questionType, title) {
  return request({
    url: '/generate-from-sections-async',
    method: 'POST',
    data: {
      sectionIds,
      sectionTexts,
      questionType: questionType || 'all',
      title: title || '文件出题'
    }
  })
}

// 从纯题目文档提取出题
export function generateFromExtracted(questions, title) {
  return request({
    url: '/generate-from-extracted',
    method: 'POST',
    data: { questions, title: title || '纯题目提取' }
  })
}

// 轮询任务结果
export function getTaskResult(taskId) {
  return request({
    url: `/task/${taskId}`,
    method: 'GET'
  })
}
