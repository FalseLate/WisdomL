import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

/**
 * 全局生成状态：
 * - isGenerating / message 负责跨页面可见的“生成中”浮动条；
 * - completed 只在成功时写入，App.vue 用统一的主题弹窗展示，首页/星图/设置页都适用。
 */
export const useNotificationStore = defineStore('notification', () => {
  const activeCount = ref(0)
  const isGenerating = computed(() => activeCount.value > 0)
  const message = ref('正在生成题目...')
  const completed = ref(null)

  function startGenerating(msg) {
    activeCount.value++
    message.value = msg || '正在生成题目...'
  }

  function finishGenerating() {
    activeCount.value = Math.max(0, activeCount.value - 1)
  }

  /** 生成成功后的全局事件；首页会用自己的结果弹窗，其它页面由 App 弹窗 */
  function completeGeneration(payload) {
    completed.value = { ...payload, at: Date.now() }
  }

  function clearCompletion() {
    completed.value = null
  }

  return {
    activeCount,
    isGenerating,
    message,
    completed,
    startGenerating,
    finishGenerating,
    completeGeneration,
    clearCompletion
  }
})
