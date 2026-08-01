<template>
  <div class="sub-card">
    <div class="card-header">
        <van-icon :name="isFav ? 'star' : 'star-o'" size="18" :color="isFav?'#ff8c00':'#ccc'" class="fav-btn" @click="toggleFav" />
      <van-tag color="#ff8c00" size="medium">{{ q.category || '主观题' }}</van-tag>
      <span class="q-num">第{{ index + 1 }}题</span>
    </div>
    <div class="q-text">{{ q.question }}</div>

    <!-- 作答区 -->
    <div class="answer-area">
      <van-field v-model="userAnswer" type="textarea" :placeholder="'请在此输入你的答案...'" rows="3" autosize :maxlength="2000" show-word-limit :disabled="isLocked" />
    </div>

    <div class="btn-group">
      <!-- 未锁定：显示提交和查看答案 -->
      <van-button v-if="!isLocked" size="small" round type="primary" @click="submitAnswer" :loading="submitting" :disabled="!userAnswer.trim()">📤 提交答案</van-button>
      <van-button v-if="!isLocked" size="small" round plain @click="showReference = !showReference">📖 {{ showReference ? '隐藏参考答案' : '查看参考答案' }}</van-button>
      <!-- 已锁定：显示重新作答 -->
      <van-button v-if="isLocked" size="small" round type="warning" @click="reAnswer">🔄 重新作答</van-button>
      <van-button v-if="isLocked" size="small" round plain @click="showReference = !showReference">📖 {{ showReference ? '隐藏参考答案' : '查看参考答案' }}</van-button>
      <!-- 答案/解析缺失：重试生成 -->
      <van-button v-if="isAnswerMissing" size="small" round plain type="danger" @click="retryGenerateAnswer" :loading="retryingAnswer">🔁 重试生成解析</van-button>
    </div>

    <!-- AI 评价结果 -->
    <div v-if="showResult" class="result-section">
      <van-divider />
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
      <van-divider />
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

const props = defineProps({
  question: { type: Object, required: true },
  result: { type: Object, default: null },
  index: { type: Number, default: 0 }
})

const emit = defineEmits(['submit', 'update-answer'])

const q = computed(() => props.question)
const storageKey = computed(() => 'subj_ans_' + (q.value.id || q.value._id || props.index))

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
// 检测答案/解析是否缺失
const isAnswerMissing = computed(() => {
  const ans = q.value.answer
  const exp = q.value.explanation
  const missing = !ans || ans === '参考答案未提供' || ans === '未提供' || ans.trim() === ''
  const missingExp = !exp || exp === '解析未提供' || exp === '解析生成失败' || exp === '未提供' || exp.trim() === ''
  return missing || missingExp
})

// 预加载结果时：仅显示历史评价，不锁定输入框
watch(() => props.result, (val) => {
  if (val) {
    showResult.value = true
    evaluation.value = val.evaluation || ''
    score.value = val.score || 0
  }
})

// 当题目对象引用变化时重置状态（而非监听 index）
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

// 实时保存草稿到 localStorage
watch(userAnswer, (val) => {
  if (val && val.trim()) {
    localStorage.setItem(storageKey.value, val)
  }
})

async function toggleFav() { isFav.value = !isFav.value }

defineExpose({
  getCurrentAnswer: () => userAnswer.value
})

// 重新作答：解锁输入框，清除评价结果
function reAnswer() {
  isLocked.value = false
  showResult.value = false
  evaluation.value = ''
  score.value = 0
  localStorage.removeItem(storageKey.value)
}

// 重试生成解析：调用后端接口为当前题目生成答案和解析
async function retryGenerateAnswer() {
  retryingAnswer.value = true
  try {
    const res = await request.post('/generate-answer', {
      question: q.value.question,
      type: q.value.type || 'subjective',
      category: q.value.category || ''
    })
    if (res.answer) {
      q.value.answer = res.answer
    }
    if (res.explanation) {
      q.value.explanation = res.explanation
    }
    showSuccessToast('解析已生成')
    // 通知父组件答案已更新
    emit('update-answer', { questionId: q.value.id || q.value._id || props.index, answer: res.answer, explanation: res.explanation })
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
  const qId = q.value.id || q.value._id || props.index
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
.sub-card { background: #fff; border-radius: 16px; padding: 20px; margin-bottom: 12px; border-left: 4px solid #ff8c00; box-shadow: 0 2px 12px rgba(0,0,0,0.06); }
.card-header { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.q-num { font-size: 13px; color: #999; }
.q-text { font-size: 15px; font-weight: 500; color: #333; line-height: 1.6; margin-bottom: 12px; }
.answer-area { margin-bottom: 10px; }
.btn-group { display: flex; gap: 8px; flex-wrap: wrap; }
.result-section { margin-top: 12px; }
.ai-eval { background: #f0f8ff; border-radius: 10px; padding: 14px; }
.eval-title { font-size: 14px; font-weight: 600; color: #333; margin-bottom: 8px; display: flex; align-items: center; gap: 8px; }
.eval-score { font-size: 13px; font-weight: 700; padding: 2px 10px; border-radius: 10px; }
.eval-score.score-high { background: #e8f5e9; color: #2e7d32; }
.eval-score.score-mid { background: #fff3e0; color: #e65100; }
.eval-score.score-low { background: #ffebee; color: #c62828; }
.eval-content { font-size: 13px; line-height: 1.6; color: #555; white-space: pre-wrap; }
.ref-section { margin-top: 4px; }
.ref-card { background: #fff8f0; border-radius: 10px; padding: 14px; margin-bottom: 10px; font-size: 13px; line-height: 1.6; color: #555; }
.ref-card.idea { background: #f0f8ff; }
.ref-title { font-size: 14px; font-weight: 600; color: #333; margin-bottom: 6px; }
</style>
