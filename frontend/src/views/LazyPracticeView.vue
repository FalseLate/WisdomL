<template>
  <div class="lazy-practice">
    <!-- 粒子背景 -->
    <ParticleBackground />

    <!-- ===== 答题模式 ===== -->
    <div v-if="!showResult" class="lp-container">
      <!-- 顶部：题型 + 进度 -->
      <div class="lp-header">
        <div class="lp-type-tag" :class="currentQType">
          {{ currentTypeLabel }}
        </div>
        <div class="lp-progress">
          第 {{ currentIndex + 1 }} / {{ questions.length }} 题
        </div>
        <div class="lp-back" @click="goBack">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
        </div>
      </div>

      <!-- 题目卡片 -->
      <div class="lp-card-wrap">
        <!-- 左右切换箭头 -->
        <div class="lp-arrow left" @click="prevQuestion" :class="{ disabled: currentIndex === 0 }">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M15 18l-6-6 6-6"/>
          </svg>
        </div>

        <div class="lp-card" :class="{ 'card-enter': cardAnim }">
          <!-- 题目内容 -->
          <div class="lp-question">{{ currentQuestion?.question }}</div>

          <!-- 客观题选项 -->
          <div v-if="!isSubjective" class="lp-options">
            <div
              v-for="(val, key) in currentQuestion?.options"
              :key="key"
              class="lp-option"
              :class="{ selected: isOptionSelected(key), correct: showResult && isCorrectOption(key), wrong: showResult && isWrongSelected(key) }"
              @click="toggleOption(key)"
            >
              <span class="opt-key">{{ key }}</span>
              <span class="opt-text">{{ val }}</span>
              <span v-if="isOptionSelected(key)" class="opt-check">✓</span>
            </div>
          </div>

          <!-- 主观题输入 -->
          <div v-else class="lp-subjective">
            <textarea
              v-model="subjectiveAnswer"
              class="lp-textarea"
              placeholder="请输入你的答案..."
              rows="6"
              @input="saveSubjectiveDraft"
            ></textarea>
            <div class="lp-word-count">{{ subjectiveAnswer.length }} / 2000</div>
          </div>
        </div>

        <!-- 左右切换箭头 -->
        <div class="lp-arrow right" @click="nextQuestion" :class="{ disabled: currentIndex === questions.length - 1 }">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 18l6-6-6-6"/>
          </svg>
        </div>
      </div>

      <!-- 底部操作区 -->
      <div class="lp-footer">
        <!-- 手势控制开关 -->
        <div class="lp-gesture-toggle" @click="toggleGesture">
          <span class="gesture-icon">📷</span>
          <span>{{ gestureEnabled ? '手势：开' : '手势：关' }}</span>
        </div>

        <!-- 整卷提交按钮 -->
        <button class="lp-submit-btn" :class="{ loading: submitting }" @click="handleSubmit" :disabled="submitting">
          <span v-if="submitting" class="btn-spinner"></span>
          {{ submitting ? '提交中...' : '整卷提交' }}
        </button>
      </div>

      <!-- 题号导航 -->
      <div class="lp-nav">
        <div class="lp-nav-toggle" @click="navExpanded = !navExpanded">
          <span>题号导航</span>
          <span class="nav-arrow" :class="{ open: navExpanded }">›</span>
        </div>
        <div v-show="navExpanded" class="lp-nav-grid">
          <div
            v-for="(q, i) in questions"
            :key="getQid(q, i)"
            class="nav-dot"
            :class="[getQTypeClass(q), { current: i === currentIndex, done: isAnswered(q, i), wrong: showResult && isWrong(q, i) }]"
            @click="jumpTo(i)"
          >
            {{ i + 1 }}
          </div>
        </div>
        <div class="lp-nav-legend">
          <span class="legend-item"><span class="dot done"></span>已做</span>
          <span class="legend-item"><span class="dot undone"></span>未做</span>
          <span class="legend-item"><span class="dot current"></span>当前</span>
        </div>
      </div>
    </div>

    <!-- ===== 结果模式 ===== -->
    <div v-else class="lp-result">
      <!-- 顶部统计 -->
      <div class="lp-result-header">
        <div class="result-title">答题结果</div>
        <div class="result-stats">
          <div class="stat-item">
            <span class="stat-num correct">{{ correctCount }}</span>
            <span class="stat-label">正确</span>
          </div>
          <div class="stat-item">
            <span class="stat-num wrong">{{ wrongCount }}</span>
            <span class="stat-label">错误</span>
          </div>
          <div class="stat-item">
            <span class="stat-num">{{ accuracy }}%</span>
            <span class="stat-label">正确率</span>
          </div>
        </div>
      </div>

      <!-- 题目结果卡片 -->
      <div class="lp-card-wrap">
        <div class="lp-arrow left" @click="prevQuestion" :class="{ disabled: currentIndex === 0 }">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M15 18l-6-6 6-6"/>
          </svg>
        </div>

        <div class="lp-card result-card">
          <div class="result-badge" :class="isCurrentCorrect ? 'correct' : 'wrong'">
            {{ isCurrentCorrect ? '✅ 回答正确' : '❌ 回答错误' }}
          </div>
          <div class="lp-question">{{ currentQuestion?.question }}</div>

          <!-- 客观题选项结果 -->
          <div v-if="!isSubjective" class="lp-options">
            <div
              v-for="(val, key) in currentQuestion?.options"
              :key="key"
              class="lp-option"
              :class="{ selected: isOptionSelected(key), correct: isCorrectOption(key), wrong: isWrongSelected(key) }"
            >
              <span class="opt-key">{{ key }}</span>
              <span class="opt-text">{{ val }}</span>
              <span v-if="isCorrectOption(key)" class="opt-check correct">✓</span>
              <span v-if="isWrongSelected(key)" class="opt-check wrong">✗</span>
            </div>
          </div>

          <!-- 主观题结果 -->
          <div v-else class="lp-subjective-result">
            <div class="result-section">
              <div class="result-section-title">你的答案</div>
              <div class="result-answer">{{ currentResult?.userAnswer || '未作答' }}</div>
            </div>
            <div class="result-section">
              <div class="result-section-title">参考答案</div>
              <div class="result-answer reference">{{ currentQuestion?.answer || '未提供' }}</div>
            </div>
            <div v-if="currentResult?.evaluation" class="result-section">
              <div class="result-section-title">AI 评价 ({{ currentResult.score }}/5分)</div>
              <div class="result-evaluation">{{ currentResult.evaluation }}</div>
            </div>
          </div>

          <!-- 解析 -->
          <div class="lp-explanation" :class="{ expanded: expExpanded }">
            <div class="exp-header" @click="expExpanded = !expExpanded">
              <span>📖 查看解析</span>
              <span class="exp-arrow" :class="{ open: expExpanded }">›</span>
            </div>
            <div v-if="expExpanded" class="exp-body">
              {{ currentExplanation }}
            </div>
          </div>
        </div>

        <div class="lp-arrow right" @click="nextQuestion" :class="{ disabled: currentIndex === questions.length - 1 }">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 18l6-6-6-6"/>
          </svg>
        </div>
      </div>

      <!-- 结果页底部 -->
      <div class="lp-footer">
        <button class="lp-result-btn ghost" @click="toggleAllExp">
          {{ allExpanded ? '收起解析' : '展开解析' }}
        </button>
        <button class="lp-result-btn ghost" @click="resetPractice">
          再做一次
        </button>
        <button class="lp-result-btn primary" @click="goBack">
          返回题库
        </button>
      </div>

      <!-- 题号导航（结果模式） -->
      <div class="lp-nav">
        <div class="lp-nav-toggle" @click="navExpanded = !navExpanded">
          <span>题号导航</span>
          <span class="nav-arrow" :class="{ open: navExpanded }">›</span>
        </div>
        <div v-show="navExpanded" class="lp-nav-grid">
          <div
            v-for="(q, i) in questions"
            :key="getQid(q, i)"
            class="nav-dot"
            :class="[getQTypeClass(q), { current: i === currentIndex, correct: isCorrect(q, i), wrong: isWrong(q, i) }]"
            @click="jumpTo(i)"
          >
            {{ i + 1 }}
          </div>
        </div>
      </div>
    </div>

    <!-- 手势 HUD 小窗 -->
    <GestureHUD
      v-if="gestureEnabled"
      :visible="gestureEnabled"
      @close="gestureEnabled = false"
      @gesture="handleGesture"
    />

    <!-- 手势教程弹窗（首次） -->
    <div v-if="showTutorial" class="tutorial-overlay" @click.self="showTutorial = false">
      <div class="tutorial-card">
        <div class="tutorial-title">🤚 手势控制教程</div>
        <div class="tutorial-list">
          <div class="tutorial-item"><span class="t-gesture">伸1/2/3/4指</span><span>选择 A/B/C/D；多选题再比一次可取消该项</span></div>
          <div class="tutorial-item"><span class="t-gesture">点赞偏左/右</span><span>四指握拳、拇指竖起并偏向一侧 = 上一题/下一题</span></div>
          <div class="tutorial-item"><span class="t-gesture">五指张开</span><span>多选题清空重选</span></div>
          <div class="tutorial-item"><span class="t-gesture">握拳1.5秒</span><span>四指与拇指都收回贴掌才进入待确认，不会直接提交</span></div>
          <div class="tutorial-item"><span class="t-gesture">再握0.6秒</span><span>松手后3秒内再次握拳 = 确认整卷提交</span></div>
        </div>
        <button class="tutorial-close" @click="showTutorial = false">我知道了</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useQuestionsStore } from '../stores/questions'
import { usePracticeStore } from '../stores/practice'
import { showFailToast, showSuccessToast, showConfirmDialog, showToast } from 'vant'
import request from '../utils/request.js'
import { classify } from '../utils/questionType.js'
import { ParticleBackground } from '../components/cyber'
import GestureHUD from '../components/cyber/GestureHUD.vue'

const router = useRouter()
const qStore = useQuestionsStore()
const pStore = usePracticeStore()

// ===== 状态 =====
const questions = computed(() => qStore.questions || [])
const currentIndex = ref(0)
const showResult = ref(false)
const submitting = ref(false)
const navExpanded = ref(false)
const expExpanded = ref(true)
const allExpanded = ref(false)
const cardAnim = ref(false)

// 手势
const gestureEnabled = ref(false)
const showTutorial = ref(false)

// 答题结果
const results = ref({})

// 草稿/结果只保留在内存（ref）：懒人模式刻意不写 localStorage，
// 这样同一套题可无限重复进入、重复提交，不会被历史结果锁进结果页。
// 注意：试卷模式 PracticeView、章节进度 store（含进度条）的持久化不受影响。
const drafts = ref({})

// ===== 计算属性 =====
const currentQuestion = computed(() => questions.value[currentIndex.value])
const currentQType = computed(() => {
  if (!currentQuestion.value) return 'single'
  return classify(currentQuestion.value).type
})
const currentTypeLabel = computed(() => {
  if (!currentQuestion.value) return '单选题'
  return classify(currentQuestion.value).label
})
const isSubjective = computed(() => currentQType.value === 'subjective')
const isMultiple = computed(() => currentQType.value === 'multiple')

const currentQid = computed(() => getQid(currentQuestion.value, currentIndex.value))

const currentResult = computed(() => results.value[currentQid.value] || null)
const isCurrentCorrect = computed(() => currentResult.value?.correct === true)

const currentExplanation = computed(() => {
  return currentResult.value?.explanation || currentQuestion.value?.explanation || '解析未提供'
})

const answeredCount = computed(() => {
  return questions.value.filter((q, i) => isAnswered(q, i)).length
})

const correctCount = computed(() => {
  return Object.values(results.value).filter(r => r?.correct === true).length
})
const wrongCount = computed(() => answeredCount.value - correctCount.value)
const accuracy = computed(() => answeredCount.value > 0 ? Math.round(correctCount.value / answeredCount.value * 100) : 0)

// ===== 工具函数 =====
function getQid(q, idx) {
  return q?.id || q?._id || idx
}

function getQTypeClass(q) {
  const type = classify(q).type
  return `type-${type}`
}

function isAnswered(q, idx) {
  const qid = getQid(q, idx)
  const draft = drafts.value[qid]
  if (!draft) return false
  if (classify(q).type === 'subjective') {
    return draft.answer && draft.answer.trim().length > 0
  }
  return draft.answer && draft.answer.length > 0
}

function isCorrect(q, idx) {
  const qid = getQid(q, idx)
  return results.value[qid]?.correct === true
}

function isWrong(q, idx) {
  const qid = getQid(q, idx)
  return results.value[qid] && results.value[qid].correct === false
}

// ===== 选项操作 =====
function isOptionSelected(key) {
  const draft = drafts.value[currentQid.value]
  if (!draft) return false
  if (isMultiple.value) {
    return draft.answer?.includes(key)
  }
  return draft.answer === key
}

function isCorrectOption(key) {
  if (!currentQuestion.value?.answer) return false
  return currentQuestion.value.answer.includes(key)
}

function isWrongSelected(key) {
  return isOptionSelected(key) && !isCorrectOption(key)
}

function toggleOption(key) {
  if (showResult.value) return
  const qid = currentQid.value

  if (isMultiple.value) {
    // 多选题：切换选中状态
    let selected = (drafts.value[qid]?.answer || '').split('').filter(Boolean)
    const idx = selected.indexOf(key)
    if (idx >= 0) {
      selected.splice(idx, 1)
    } else {
      selected.push(key)
      selected.sort()
    }
    drafts.value[qid] = { answer: selected.join(''), type: currentQType.value, timestamp: Date.now() }
  } else {
    // 单选题：直接替换
    drafts.value[qid] = { answer: key, type: currentQType.value, timestamp: Date.now() }
  }
}

// 主观题
const subjectiveAnswer = ref('')
function saveSubjectiveDraft() {
  const qid = currentQid.value
  drafts.value[qid] = { answer: subjectiveAnswer.value, type: 'subjective', timestamp: Date.now() }
}

// 切换题目时恢复主观题答案
watch(currentIndex, () => {
  if (isSubjective.value) {
    subjectiveAnswer.value = drafts.value[currentQid.value]?.answer || ''
  }
  expExpanded.value = true
  triggerCardAnim()
})

// ===== 草稿（纯内存，不持久化，方便重复刷题与重复提交）=====
function clearDrafts() {
  drafts.value = {}
}

// ===== 导航 =====
function prevQuestion() {
  if (currentIndex.value > 0) {
    currentIndex.value--
  }
}

function nextQuestion() {
  if (currentIndex.value < questions.value.length - 1) {
    currentIndex.value++
  }
}

function jumpTo(i) {
  currentIndex.value = i
  navExpanded.value = false
}

function triggerCardAnim() {
  cardAnim.value = false
  requestAnimationFrame(() => { cardAnim.value = true })
}

// ===== 整卷提交 =====
async function handleSubmit() {
  if (submitting.value) return

  // 收集已作答的题目
  const answers = []
  questions.value.forEach((q, idx) => {
    const qid = getQid(q, idx)
    const draft = drafts.value[qid]
    if (!draft) return
    if (classify(q).type === 'subjective') {
      if (!draft.answer || draft.answer.trim().length === 0) return
    } else {
      if (!draft.answer || draft.answer.length === 0) return
    }
    answers.push({
      question: q,
      userAnswer: draft.answer,
      questionType: classify(q).type,
      questionIndex: idx,
      recordId: qStore.recordId
    })
  })

  if (answers.length === 0) {
    showFailToast('请先作答至少一道题')
    return
  }

  submitting.value = true

  try {
    // 调用批量判分
    const res = await request.post('/check-batch', { answers })

    // 保存结果
    res.results.forEach((r, idx) => {
      const qid = getQid(answers[idx].question, answers[idx].questionIndex)
      results.value[qid] = r
      // 同步到 practice store
      const secId = pStore.currentSectionId
      if (secId) {
        pStore.recordAnswer(secId, r?.correct === true)
        pStore.recordAnswerResult(secId, qid, r)
      }
    })

    // 批量生成缺失解析（只处理已提交的题目）
    const missingExps = answers.filter(a => {
      const qid = getQid(a.question, a.questionIndex)
      const r = results.value[qid]
      const exp = r?.explanation || a.question.explanation
      return !exp || typeof exp !== 'string' || exp === '未提供' || exp === '解析未提供' || exp === '解析生成失败' || exp.trim() === ''
    })

    if (missingExps.length > 0) {
      let genOk = 0
      const genTasks = missingExps.map(a => {
        return request.post('/generate-answer', {
          question: a.question.question,
          type: a.questionType,
          category: a.question.category || ''
        }).then(res => {
          genOk++
          const qid = getQid(a.question, a.questionIndex)
          if (res.answer) a.question.answer = res.answer
          if (res.explanation) {
            a.question.explanation = res.explanation
            if (results.value[qid]) results.value[qid].explanation = res.explanation
          }
        }).catch(() => {})
      })
      await Promise.all(genTasks)
    }

    // 清除内存草稿（结果保留在内存 results 中，点「再做一次」或返回题库重进均可重新答题）
    clearDrafts()

    // 切换到结果模式
    showResult.value = true
    currentIndex.value = 0
    showSuccessToast(`提交完成，正确 ${correctCount.value}/${answers.length} 题`)

  } catch (err) {
    showFailToast(err.message || '提交失败，请重试')
  } finally {
    submitting.value = false
  }
}

// ===== 手势处理 =====
function handleGesture(gesture) {
  if (!gesture) return

  switch (gesture.type) {
    case 'select':
      if (!showResult.value && !isSubjective.value) {
        const option = gesture.data?.option
        if (option) toggleOption(option)
      }
      break
    case 'clear':
      if (!showResult.value && isMultiple.value) {
        delete drafts.value[currentQid.value]
        triggerCardAnim()
        showSuccessToast('已清空选择')
      }
      break
    case 'prev':
      prevQuestion()
      break
    case 'next':
      nextQuestion()
      break
    case 'submit-arm':
      // 第一握达标：仅提示，绝不提交
      if (!showResult.value) {
        showToast({ message: '再次握拳确认提交，改其他手势可取消', position: 'middle', duration: 2500 })
      }
      break
    case 'submit':
      // 第二握确认后才真正提交
      if (!showResult.value) {
        handleSubmit()
      }
      break
  }
}

// ===== 再做一次：清空内存结果与草稿，回到第一题（无需退出重进，可立即重复提交）=====
function resetPractice() {
  results.value = {}
  drafts.value = {}
  subjectiveAnswer.value = ''
  submitting.value = false
  showResult.value = false
  currentIndex.value = 0
  navExpanded.value = false
  triggerCardAnim()
}

function toggleGesture() {
  gestureEnabled.value = !gestureEnabled.value
  if (gestureEnabled.value) {
    // 首次开启显示教程
    const tutorialShown = localStorage.getItem('lazy_gesture_tutorial_shown')
    if (!tutorialShown) {
      showTutorial.value = true
      localStorage.setItem('lazy_gesture_tutorial_shown', '1')
    }
  }
}

// ===== 结果页操作 =====
function toggleAllExp() {
  allExpanded.value = !allExpanded.value
  expExpanded.value = allExpanded.value
}

function goBack() {
  router.back()
}

// ===== 触摸滑动 =====
let touchStartX = 0
let touchStartY = 0

function onTouchStart(e) {
  touchStartX = e.touches[0].clientX
  touchStartY = e.touches[0].clientY
}

function onTouchEnd(e) {
  const dx = e.changedTouches[0].clientX - touchStartX
  const dy = e.changedTouches[0].clientY - touchStartY
  if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
    if (dx > 0) prevQuestion()
    else nextQuestion()
  }
}

// ===== 生命周期 =====
onMounted(() => {
  // 懒人模式：草稿/结果纯内存，每次进入都是全新答题，可重复提交
  // 添加触摸滑动监听
  document.addEventListener('touchstart', onTouchStart, { passive: true })
  document.addEventListener('touchend', onTouchEnd, { passive: true })
})

onUnmounted(() => {
  document.removeEventListener('touchstart', onTouchStart)
  document.removeEventListener('touchend', onTouchEnd)
})
</script>

<style scoped>
.lazy-practice {
  min-height: 100dvh;
  background: var(--bg-base);
  position: relative;
  overflow-x: hidden;
  /* 防连点误选：整页禁止文本拖选/双击选词/长按复制菜单（textarea 与解析正文单独豁免） */
  -webkit-user-select: none;
  -moz-user-select: none;
  user-select: none;
  -webkit-touch-callout: none;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
}
.lazy-practice svg {
  /* 连点箭头时禁止 SVG 被拖拽 */
  -webkit-user-drag: none;
  user-select: none;
}

.lp-container {
  position: relative;
  z-index: 10;
  max-width: 480px;
  margin: 0 auto;
  padding: 16px;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
}

/* 顶部 */
.lp-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  padding: 12px 16px;
  background: var(--bg-card);
  border: 1px solid var(--accent-border);
  border-radius: var(--radius-card);
  backdrop-filter: blur(12px);
}

.lp-type-tag {
  font-family: var(--font-display);
  font-size: 12px;
  font-weight: 700;
  padding: 4px 12px;
  border-radius: var(--radius-pill);
  letter-spacing: 1px;
}
.lp-type-tag.type-single { background: rgba(102, 126, 234, 0.15); color: #667eea; border: 1px solid rgba(102, 126, 234, 0.3); }
.lp-type-tag.type-multiple { background: rgba(153, 68, 255, 0.15); color: #9944ff; border: 1px solid rgba(153, 68, 255, 0.3); }
.lp-type-tag.type-subjective { background: rgba(255, 140, 0, 0.15); color: #ff8c00; border: 1px solid rgba(255, 140, 0, 0.3); }

.lp-progress {
  font-family: var(--font-display);
  font-size: 14px;
  color: var(--accent);
  text-shadow: 0 0 8px rgba(0, 245, 255, 0.4);
}

.lp-back {
  color: var(--text-secondary);
  cursor: pointer;
  transition: color 0.2s;
}
.lp-back:hover { color: var(--accent); }

/* 卡片区域 */
.lp-card-wrap {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
  min-height: 400px;
}

.lp-arrow {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-card);
  border: 1px solid var(--accent-border);
  border-radius: 50%;
  color: var(--accent);
  cursor: pointer;
  transition: all 0.2s;
  flex-shrink: 0;
}
.lp-arrow:hover:not(.disabled) {
  background: var(--accent-soft);
  box-shadow: 0 0 12px var(--accent-soft);
}
.lp-arrow.disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.lp-card {
  flex: 1;
  background: var(--bg-card);
  border: 1px solid var(--accent-border);
  border-radius: var(--radius-card);
  backdrop-filter: blur(12px);
  padding: 24px 20px;
  min-height: 380px;
  display: flex;
  flex-direction: column;
  transition: all 0.3s var(--ease-out);
}

.lp-card.card-enter {
  animation: cardSlide 0.3s var(--ease-out);
}

@keyframes cardSlide {
  from { opacity: 0; transform: translateX(20px); }
  to { opacity: 1; transform: translateX(0); }
}

.lp-question {
  font-size: 17px;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.6;
  margin-bottom: 20px;
}

/* 选项 */
.lp-options {
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex: 1;
}

.lp-option {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  background: var(--bg-elevated);
  border: 1px solid var(--accent-border);
  border-radius: var(--radius-button);
  cursor: pointer;
  transition: all 0.2s var(--ease-out);
}

.lp-option:hover {
  border-color: var(--accent);
  background: var(--bg-hover);
}

.lp-option.selected {
  border-color: var(--accent);
  background: var(--accent-soft);
  box-shadow: 0 0 12px var(--accent-soft);
}

.lp-option.correct {
  border-color: var(--success);
  background: rgba(0, 255, 136, 0.1);
}

.lp-option.wrong {
  border-color: var(--danger);
  background: rgba(255, 68, 68, 0.1);
}

.opt-key {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--accent-soft);
  border-radius: 50%;
  font-weight: 700;
  font-size: 13px;
  color: var(--accent);
  flex-shrink: 0;
}

.lp-option.correct .opt-key {
  background: rgba(0, 255, 136, 0.15);
  color: var(--success);
}

.lp-option.wrong .opt-key {
  background: rgba(255, 68, 68, 0.15);
  color: var(--danger);
}

.opt-text {
  flex: 1;
  font-size: 14px;
  color: var(--text-primary);
  line-height: 1.5;
}

.opt-check {
  font-size: 16px;
  font-weight: 700;
}
.opt-check.correct { color: var(--success); }
.opt-check.wrong { color: var(--danger); }

/* 主观题 */
.lp-subjective {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.lp-textarea {
  flex: 1;
  width: 100%;
  padding: 14px;
  background: var(--bg-elevated);
  border: 1px solid var(--accent-border);
  border-radius: var(--radius-button);
  color: var(--text-primary);
  font-size: 14px;
  line-height: 1.6;
  resize: none;
  font-family: inherit;
  transition: border-color 0.2s;
  /* 豁免：主观题输入框必须能正常选择/编辑/长按粘贴 */
  -webkit-user-select: text;
  -moz-user-select: text;
  user-select: text;
  -webkit-touch-callout: default;
}
.lp-textarea:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 12px var(--accent-soft);
}

.lp-word-count {
  text-align: right;
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 6px;
}

/* 底部 */
.lp-footer {
  display: flex;
  gap: 10px;
  margin-bottom: 12px;
}

.lp-gesture-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 16px;
  height: 48px;
  background: var(--bg-card);
  border: 1px solid var(--accent-border);
  border-radius: var(--radius-pill);
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}
.lp-gesture-toggle:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.gesture-icon { font-size: 16px; }

.lp-submit-btn {
  flex: 1;
  height: 48px;
  background: linear-gradient(135deg, #f9f002, #e0d000);
  border: none;
  border-radius: var(--radius-pill);
  color: #000;
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 2px;
  cursor: pointer;
  transition: all 0.25s var(--ease-out);
  box-shadow: 0 4px 16px rgba(249, 240, 2, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}
.lp-submit-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 8px 28px rgba(249, 240, 2, 0.5);
}
.lp-submit-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(0, 0, 0, 0.2);
  border-top-color: #000;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* 题号导航 */
.lp-nav {
  background: var(--bg-card);
  border: 1px solid var(--accent-border);
  border-radius: var(--radius-card);
  backdrop-filter: blur(12px);
  overflow: hidden;
}

.lp-nav-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-secondary);
  transition: color 0.2s;
}
.lp-nav-toggle:hover { color: var(--accent); }

.nav-arrow {
  transition: transform 0.3s;
  display: inline-block;
}
.nav-arrow.open { transform: rotate(90deg); }

.lp-nav-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 0 16px 16px;
}

.nav-dot {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  border: 1px solid;
}

.nav-dot.type-single { border-color: rgba(102, 126, 234, 0.3); color: #667eea; }
.nav-dot.type-multiple { border-color: rgba(153, 68, 255, 0.3); color: #9944ff; }
.nav-dot.type-subjective { border-color: rgba(255, 140, 0, 0.3); color: #ff8c00; }

.nav-dot.done {
  background: var(--accent-soft);
  border-color: var(--accent);
  color: var(--accent);
}

.nav-dot.current {
  transform: scale(1.15);
  box-shadow: 0 0 12px var(--accent-soft);
}

.nav-dot.correct {
  background: rgba(0, 255, 136, 0.15);
  border-color: var(--success);
  color: var(--success);
}

.nav-dot.wrong {
  background: rgba(255, 68, 68, 0.15);
  border-color: var(--danger);
  color: var(--danger);
}

.lp-nav-legend {
  display: flex;
  gap: 16px;
  padding: 0 16px 12px;
  font-size: 11px;
  color: var(--text-muted);
}
.legend-item {
  display: flex;
  align-items: center;
  gap: 4px;
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
.dot.done { background: var(--accent); }
.dot.undone { background: var(--text-muted); }
.dot.current { background: var(--secondary); }

/* ===== 结果模式 ===== */
.lp-result {
  position: relative;
  z-index: 10;
  max-width: 480px;
  margin: 0 auto;
  padding: 16px;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
}

.lp-result-header {
  text-align: center;
  margin-bottom: 16px;
  padding: 20px;
  background: var(--bg-card);
  border: 1px solid var(--accent-border);
  border-radius: var(--radius-card);
  backdrop-filter: blur(12px);
}

.result-title {
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 16px;
  letter-spacing: 2px;
}

.result-stats {
  display: flex;
  justify-content: space-around;
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.stat-num {
  font-family: var(--font-display);
  font-size: 28px;
  font-weight: 800;
}
.stat-num.correct { color: var(--success); text-shadow: 0 0 12px rgba(0, 255, 136, 0.4); }
.stat-num.wrong { color: var(--danger); text-shadow: 0 0 12px rgba(255, 68, 68, 0.4); }

.stat-label {
  font-size: 12px;
  color: var(--text-secondary);
}

.result-card {
  border-color: var(--accent-border);
}

.result-badge {
  display: inline-block;
  padding: 6px 16px;
  border-radius: var(--radius-pill);
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 16px;
  align-self: flex-start;
}
.result-badge.correct {
  background: rgba(0, 255, 136, 0.15);
  color: var(--success);
  border: 1px solid rgba(0, 255, 136, 0.3);
}
.result-badge.wrong {
  background: rgba(255, 68, 68, 0.15);
  color: var(--danger);
  border: 1px solid rgba(255, 68, 68, 0.3);
}

.lp-subjective-result {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.result-section {
  background: var(--bg-elevated);
  border-radius: var(--radius-sm);
  padding: 12px;
}

.result-section-title {
  font-size: 11px;
  color: var(--text-muted);
  margin-bottom: 6px;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.result-answer {
  font-size: 14px;
  color: var(--text-primary);
  line-height: 1.6;
}
.result-answer.reference {
  color: var(--accent);
}

.result-evaluation {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.6;
}

/* 解析 */
.lp-explanation {
  margin-top: 16px;
  border-top: 1px solid var(--accent-border);
  padding-top: 12px;
}

.exp-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  font-size: 13px;
  color: var(--accent);
  font-weight: 600;
}

.exp-arrow {
  transition: transform 0.3s;
  display: inline-block;
}
.exp-arrow.open { transform: rotate(90deg); }

.exp-body {
  margin-top: 10px;
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.7;
  /* 豁免：解析正文允许划选复制 */
  -webkit-user-select: text;
  -moz-user-select: text;
  user-select: text;
  -webkit-touch-callout: default;
}

/* 结果页底部按钮 */
.lp-result-btn {
  flex: 1;
  height: 44px;
  border-radius: var(--radius-pill);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.25s var(--ease-out);
  border: none;
}

.lp-result-btn.primary {
  background: linear-gradient(135deg, var(--accent), #00c8d4);
  color: #000;
  box-shadow: 0 4px 16px var(--accent-soft);
}
.lp-result-btn.primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 28px var(--accent-soft);
}

.lp-result-btn.ghost {
  background: transparent;
  color: var(--accent);
  border: 1px solid var(--accent-border);
}
.lp-result-btn.ghost:hover {
  background: var(--accent-soft);
}

/* 手势教程弹窗 */
.tutorial-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(4px);
  z-index: 9500;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.tutorial-card {
  background: var(--bg-base);
  border: 1px solid var(--accent-border);
  border-radius: var(--radius-card);
  padding: 24px;
  max-width: 340px;
  width: 100%;
  box-shadow: 0 0 40px var(--accent-soft);
}

.tutorial-title {
  font-family: var(--font-display);
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
  text-align: center;
  margin-bottom: 20px;
}

.tutorial-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 20px;
}

.tutorial-item {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 13px;
  color: var(--text-secondary);
}

.t-gesture {
  min-width: 80px;
  padding: 4px 10px;
  background: var(--accent-soft);
  border-radius: var(--radius-sm);
  color: var(--accent);
  font-weight: 600;
  font-size: 12px;
  text-align: center;
}

.tutorial-close {
  width: 100%;
  height: 44px;
  background: linear-gradient(135deg, var(--accent), #00c8d4);
  border: none;
  border-radius: var(--radius-pill);
  color: #000;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
}
.tutorial-close:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px var(--accent-soft);
}
</style>
