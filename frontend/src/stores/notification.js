import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useNotificationStore = defineStore('notification', () => {
  const isGenerating = ref(false)
  const message = ref('正在生成题目...')
  const result = ref(null)
  const showCompleteDialog = ref(false)

  function startGenerating(msg) {
    isGenerating.value = true
    result.value = null
    showCompleteDialog.value = false
    message.value = msg || '正在生成题目...'
  }

  function finishGenerating(data) {
    isGenerating.value = false
    result.value = data
    if (data) {
      showCompleteDialog.value = true
    }
  }

  function dismissResult() {
    showCompleteDialog.value = false
    result.value = null
  }

  return {
    isGenerating, message, result, showCompleteDialog,
    startGenerating, finishGenerating, dismissResult
  }
})
