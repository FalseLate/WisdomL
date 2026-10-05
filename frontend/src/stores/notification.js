import { defineStore } from 'pinia'
import { ref } from 'vue'

/**
 * 只承载「全局生成中浮动条」的状态。
 * 出题结果反馈统一由 HomeView 自己的完成/失败弹窗负责，这里不再挂一份全局结果弹窗。
 */
export const useNotificationStore = defineStore('notification', () => {
  const isGenerating = ref(false)
  const message = ref('正在生成题目...')

  function startGenerating(msg) {
    isGenerating.value = true
    message.value = msg || '正在生成题目...'
  }

  function finishGenerating() {
    isGenerating.value = false
  }

  return { isGenerating, message, startGenerating, finishGenerating }
})
