import { defineStore, acceptHMRUpdate } from 'pinia'
import { ref, computed } from 'vue'

export const usePracticeStore = defineStore('practice', () => {
  // 章节进度: { [sectionId]: { total, done, correct, source, type, timestamp, answers } }
  const sections = ref({})

  // 从后端拉取的进度缓存: { [sectionId]: { totalCount, completedCount, correctCount, wrongCount, progressPercent } }
  const serverProgress = ref({})

  // 当前刷题的章节ID
  const currentSectionId = ref(null)

  // 总完成章节数
  const completedCount = computed(() =>
    Object.values(sections.value).filter(s => s.done >= s.total && s.total > 0).length
  )

  // 总正确率
  const accuracy = computed(() => {
    const all = Object.values(sections.value)
    const total = all.reduce((s, c) => s + c.done, 0)
    const correct = all.reduce((s, c) => s + (c.correct || 0), 0)
    return total > 0 ? Math.round(correct / total * 100) : 0
  })

  function initSection(sectionId, total, source, type) {
    if (!sections.value[sectionId]) {
      sections.value[sectionId] = { sectionId, total, done: 0, correct: 0, source, type, timestamp: Date.now(), answers: {} }
    }
  }

  function recordAnswer(sectionId, isCorrect) {
    const s = sections.value[sectionId]
    if (s) {
      if (s.done >= s.total && s.total > 0) return
      s.done = (s.done || 0) + 1
      if (isCorrect) s.correct = (s.correct || 0) + 1
      s.timestamp = Date.now()
    }
  }

  function recordAnswerResult(sectionId, questionId, result) {
    const s = sections.value[sectionId]
    if (s) {
      if (!s.answers) s.answers = {}
      s.answers[questionId] = result
      s.timestamp = Date.now()
    }
  }

  function getSectionAnswers(sectionId) {
    const s = sections.value[sectionId]
    return s?.answers || {}
  }

  function isSectionComplete(sectionId) {
    const s = sections.value[sectionId]
    return s && s.done >= s.total && s.total > 0
  }

  /**
   * 获取进度（优先后端，后端没有则用本地，都没有返回0）
   * 空值保护：杜绝 undefined%
   */
  function getProgress(sectionId) {
    // 优先用后端进度
    if (serverProgress.value[sectionId]) {
      const p = serverProgress.value[sectionId].progressPercent
      if (typeof p === 'number' && !isNaN(p)) {
        return Math.min(p, 100)
      }
    }
    // 回退到本地进度
    const s = sections.value[sectionId]
    if (!s || !s.total || s.total === 0) return 0
    const answeredKeys = s.answers ? Object.keys(s.answers).length : 0
    const pct = Math.round((answeredKeys / s.total) * 100)
    return Math.min(pct, 100)
  }

  /**
   * 设置从后端拉取的进度
   */
  function setServerProgress(sectionId, data) {
    if (sectionId && data) {
      serverProgress.value[sectionId] = {
        totalCount: data.totalCount || 0,
        completedCount: data.completedCount || 0,
        correctCount: data.correctCount || 0,
        wrongCount: data.wrongCount || 0,
        progressPercent: data.progressPercent || 0
      }
    }
  }

  /**
   * 批量设置后端进度
   */
  function setServerProgressBatch(map) {
    if (map && typeof map === 'object') {
      Object.keys(map).forEach(key => {
        setServerProgress(key, map[key])
      })
    }
  }

  /**
   * 清除后端进度缓存（重新进入时刷新）
   */
  function clearServerProgress() {
    serverProgress.value = {}
  }

  return {
    sections,
    serverProgress,
    currentSectionId,
    completedCount,
    accuracy,
    initSection,
    recordAnswer,
    recordAnswerResult,
    getSectionAnswers,
    isSectionComplete,
    getProgress,
    setServerProgress,
    setServerProgressBatch,
    clearServerProgress
  }
}, {
  persist: {
    key: 'zhifuxi-practice',
    pick: ['sections', 'currentSectionId']
  }
})

// HMR 支持
if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(usePracticeStore, import.meta.hot))
}
