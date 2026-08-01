import { defineStore, acceptHMRUpdate } from 'pinia'
import { ref, computed } from 'vue'

export const usePracticeStore = defineStore('practice', () => {
  // 章节进度: { [sectionId]: { total, done, correct, source, type, timestamp } }
  const sections = ref({})

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

  function getProgress(sectionId) {
    const s = sections.value[sectionId]
    if (!s || s.total === 0) return 0
    const answeredKeys = s.answers ? Object.keys(s.answers).length : 0
    return Math.round((answeredKeys / s.total) * 100)
  }

  return { sections, currentSectionId, completedCount, accuracy, initSection, recordAnswer, recordAnswerResult, getSectionAnswers, isSectionComplete, getProgress }
}, {
  persist: { key: 'zhifuxi-practice', pick: ['sections', 'currentSectionId'] }
})

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(usePracticeStore, import.meta.hot))
}
