<template>
  <div class="sub-card">
    <div class="card-header">
      <span class="fav-btn" :class="{ active: isFav }" @click="toggleFav">
        {{ isFav ? '⭐' : '☆' }}
      </span>
      <CyberTag color="#ff8c00">{{ q.category || '主观题' }}</CyberTag>
      <span class="q-num">第{{ index + 1 }}题</span>
    </div>
    <div class="q-text">{{ q.question }}</div>

    <!-- 作答区 -->
    <div class="answer-area">
      <textarea
        v-model="userAnswer"
        class="answer-textarea"
        placeholder="请在此输入你的答案..."
        rows="3"
        maxlength="2000"
        :disabled="isLocked"
      ></textarea>
      <div class="word-count">{{ userAnswer.length }}/2000</div>
    </div>

    <div class="btn-group">
      <CyberButton v-if="!isLocked" variant="primary" size="small" :loading="submitting" :disabled="!userAnswer.trim()" @click="submitAnswer">
        📤 提交答案
      </CyberButton>
      <CyberButton v-if="!isLocked" variant="ghost" size="small" @click="showReference = !showReference">
        📖 {{ showReference ? '隐藏参考答案' : '查看参考答案' }}
      </CyberButton>
      <CyberButton v-if="isLocked" variant="warning" size="small" @click="reAnswer">
        🔄 重新作答
      </CyberButton>
      <CyberButton v-if="isLocked" variant="ghost" size="small" @click="showReference = !showReference">
        📖 {{ showReference ? '隐藏参考答案' : '查看参考答案' }}
      </CyberButton>
      <CyberButton v-if="isAnswerMissing" variant="danger" size="small" :loading="retryingAnswer" @click="retryGenerateAnswer">
        🔁 重试生成解析
      </CyberButton>
    </div>

    <!-- AI 评价结果 -->
    <div v-if="showResult" class="result-section">
      <div class="res-divider"></div>
      <div class="ai-eval">
        <div class="eval-title">
          🤖 AI 评价
          <span v-if="score > 0" class="eval-score" :class="scoreClass">{{ score }} / 5 分</span>
        </div>
        <div class="eval-content">{{ evaluation }}</div>
      </div>
    </div>

    <!-- 参考答案 -->
    <div v-if="showReference" class="ref-section">
      <div class="res-divider"></div>
      <div class="ref-card"><div class="ref-title">📌 参考答案</div>{{ q.answer || '未提供' }}</div>
      <div class="ref-card idea"><div class="ref-title">💡 答题思路</div>{{ q.explanation || '未提供' }}</div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import request from '../utils/request.js'
import { showFailToast, showSuccessToast } from 'vant'
import { classify } from '../utils/questionType.js'
import { CyberButton, CyberTag } from './cyber'

const props = defineProps({
  question: { type: Object, required: true },
  result: { type: Object, default: null },
  index: { type: Number, default: 0 }
})

const emit = defineEmits(['submit', 'update-answer', 'change'])

const q = computed(() => props.question)
const storageKey = computed(() => 'subj_ans_' + (q.value.id || q.value._id || props.index))
const qIdValue = () => q.value.id || q.value._id || props.index

const userAnswer = ref(localStorage.getItem(storageKey.value) || '')
const showReference = ref(false)
const showResult = ref(false)
const evaluation = ref('')
const score = ref(0)
const submitting = ref(false)
const isLocked = ref(false)
const isFav = ref(false)
const retryingAnswer = ref(false)

const scoreClass = computed(() => {
  if (score.value >= 4) return 'score-high'
  if (score.value >= 3) return 'score-mid'
  return 'score-low'
})

const isAnswerMissing = computed(() => {
  const ans = q.value.answer
  const exp = q.value.explanation
  const missing = !ans || ans === '参考答案未提供' || ans === '未提供' || ans.trim() === ''
  const missingExp = !exp || exp === '解析未提供' || exp === '解析生成失败' || exp === '未提供' || exp.trim() === ''
  return missing || missingExp
})

watch(() => props.result, (val) => {
  if (val) {
    isLocked.value = true
    showResult.value = true
    showReference.value = true
    evaluation.value = val.evaluation || ''
    score.value = val.score || 0
  }
}, { immediate: true })

watch(() => props.question, (newQ, oldQ) => {
  if (newQ !== oldQ) {
    showReference.value = false
    showResult.value = false
    evaluation.value = ''
    score.value = 0
    isLocked.value = false
    const sk = 'subj_ans_' + (newQ.id || newQ._id || props.index)
    userAnswer.value = localStorage.getItem(sk) || ''
  }
})

watch(userAnswer, (val) => {
  if (val && val.trim()) {
    localStorage.setItem(storageKey.value, val)
  }
  // 同步给父级写入双模式统一草稿（切到懒人模式也能看到未提交的主观题）
  emit('change', { questionId: qIdValue(), userAnswer: val })
})

async function toggleFav() { isFav.value = !isFav.value }

defineExpose({
  getCurrentAnswer: () => userAnswer.value
})

function reAnswer() {
  isLocked.value = false
  showResult.value = false
  evaluation.value = ''
  score.value = 0
  localStorage.removeItem(storageKey.value)
}

async function retryGenerateAnswer() {
  retryingAnswer.value = true
  try {
    const res = await request.post('/generate-answer', {
      question: q.value.question,
      type: q.value.type || 'subjective',
      category: q.value.category || '',
      answer: q.value.answer || '',
      explanation: q.value.explanation || ''
    })
    if (res.answer) {
      q.value.answer = res.answer
    }
    if (res.explanation) {
      q.value.explanation = res.explanation
    }
    showSuccessToast('解析已生成')
    emit('update-answer', { questionId: qIdValue(), answer: res.answer, explanation: res.explanation })
  } catch (e) {
    showFailToast(e.message || '解析生成失败')
  } finally {
    retryingAnswer.value = false
  }
}

async function submitAnswer() {
  if (!userAnswer.value.trim()) {
    showFailToast('请输入答案')
    return
  }
  if (isLocked.value) return

  submitting.value = true
  const qId = qIdValue()
  try {
    const res = await request.post('/check-subjective', {
      questionId: qId,
      userAnswer: userAnswer.value,
      question: q.value
    })

    showResult.value = true
    evaluation.value = res.evaluation || '评价生成失败'
    score.value = res.score || 0
    isLocked.value = true

    localStorage.setItem(storageKey.value, userAnswer.value)

    emit('submit', {
      questionId: qId,
      userAnswer: userAnswer.value,
      isCorrect: score.value >= 3,
      evaluation: res.evaluation || '',
      score: score.value
    })
  } catch (e) {
    showFailToast(e.message || '提交失败')
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.sub-card {
  background: var(--bg-card);
  border: 1px solid var(--accent-border);
  border-radius: var(--radius-card);
  padding: 20px;
  margin-bottom: 12px;
  border-left: 4px solid #ff8c00;
  backdrop-filter: blur(12px);
  transition: all 0.3s var(--ease-out);
}

.sub-card:hover {
  border-color: #ff8c00;
  box-shadow: 0 4px 20px rgba(255, 140, 0, 0.1);
}

.card-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.fav-btn {
  font-size: 18px;
  cursor: pointer;
  opacity: 0.5;
  transition: all 0.2s;
}

.fav-btn:hover, .fav-btn.active {
  opacity: 1;
  transform: scale(1.1);
}

.q-num {
  font-size: 12px;
  color: var(--text-muted);
  font-family: var(--font-display);
}

.q-text {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.6;
  margin-bottom: 14px;
}

/* 作答区 */
.answer-area {
  margin-bottom: 12px;
}

.answer-textarea {
  width: 100%;
  min-height: 80px;
  padding: 12px;
  background: var(--bg-elevated);
  border: 1px solid var(--accent-border);
  border-radius: 10px;
  font-size: 14px;
  color: var(--text-primary);
  font-family: var(--font-body);
  line-height: 1.6;
  resize: vertical;
  outline: none;
  transition: all 0.25s var(--ease-out);
}

.answer-textarea:focus {
  border-color: #ff8c00;
  box-shadow: 0 0 0 3px rgba(255, 140, 0, 0.1);
}

.answer-textarea:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.answer-textarea::placeholder {
  color: var(--text-muted);
}

.word-count {
  text-align: right;
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 4px;
  font-family: var(--font-display);
}

/* 按钮组 */
.btn-group {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

/* 结果区 */
.result-section {
  margin-top: 14px;
}

.res-divider {
  height: 1px;
  background: var(--accent-border);
  margin: 12px 0;
}

.ai-eval {
  background: rgba(0, 245, 255, 0.05);
  border: 1px solid var(--accent-border);
  border-radius: 10px;
  padding: 14px;
}

.eval-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: var(--font-display);
}

.eval-score {
  font-size: 12px;
  font-weight: 700;
  padding: 2px 10px;
  border-radius: 10px;
}

.eval-score.score-high {
  background: var(--success-soft);
  color: var(--success);
}

.eval-score.score-mid {
  background: var(--warning-soft);
  color: var(--warning);
}

.eval-score.score-low {
  background: var(--danger-soft);
  color: var(--danger);
}

.eval-content {
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-secondary);
  white-space: pre-wrap;
}

/* 参考答案 */
.ref-section {
  margin-top: 8px;
}

.ref-card {
  background: rgba(255, 140, 0, 0.05);
  border: 1px solid rgba(255, 140, 0, 0.2);
  border-radius: 10px;
  padding: 14px;
  margin-bottom: 10px;
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-secondary);
}

.ref-card.idea {
  background: rgba(0, 245, 255, 0.05);
  border-color: var(--accent-border);
}

.ref-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 6px;
}
</style>
