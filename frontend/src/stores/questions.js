import { defineStore, acceptHMRUpdate } from 'pinia'
import { ref, reactive, computed } from 'vue'

export const useQuestionsStore = defineStore('questions', () => {
  // 题目列表（持久化）
  const questions = ref([])
  // 答题结果（不持久化，刷新后重置）
  const results = reactive({})
  // 当前的 recordId
  const recordId = ref(null)

  // 题目数量
  const count = computed(() => questions.value.length)

  function setQuestions(list, rid) {
    questions.value = list
    recordId.value = rid || null
    // 清空旧答题结果
    Object.keys(results).forEach(k => delete results[k])
  }

  function setResult(questionId, result) {
    results[questionId] = result
  }

  function clearAll() {
    questions.value = []
    recordId.value = null
    Object.keys(results).forEach(k => delete results[k])
  }

  return { questions, results, recordId, count, setQuestions, setResult, clearAll }
}, {
  persist: {
    key: 'zhifuxi-questions',
    pick: ['questions'] // 只持久化 questions，results 和 recordId 不存
  }
})

// HMR 支持
if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useQuestionsStore, import.meta.hot))
}
