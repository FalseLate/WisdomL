<template>
  <div class="obj-card" :style="{ borderLeft: '4px solid ' + barColor }">
    <div class="card-header">
        <van-icon :name="isFav ? 'star' : 'star-o'" size="18" :color="isFav?'#ff8c00':'#ccc'" class="fav-btn" @click="toggleFav" />
      <van-tag :color="barColor" size="medium">{{ label }}</van-tag>
      <span class="q-num">第{{ index + 1 }}题</span>
    </div>
    <div class="q-text">{{ q.question }}</div>

    <!-- 客观题选项 -->
    <div class="opts">
      <div v-for="(val, key) in q.options" :key="key"
        class="opt" :class="{ active: isSelected(key) }"
        @click="toggle(key)">
        <span class="opt-box" :class="{ checked: isSelected(key), radio: isSingle }">
          <van-icon v-if="isSelected(key) && !isSingle" name="success" size="12" color="#fff" />
          <span v-if="isSelected(key) && isSingle" class="dot"></span>
        </span>
        <span class="opt-label">{{ key }}.</span>
        <span class="opt-text">{{ val }}</span>
      </div>
    </div>

    <!-- 提交按钮 -->
    <div v-if="!result" class="act">
      <van-button plain type="primary" size="small" round @click="submit">提交答案</van-button>
    </div>
    <!-- 答案/解析缺失：重试生成 -->
    <div v-if="isAnswerMissing" class="act" style="margin-top:4px">
      <van-button size="small" round plain type="danger" @click="retryGenerateAnswer" :loading="retrying">🔁 重新生成解析</van-button>
    </div>

    <!-- 结果 -->
    <div v-if="result" class="res">
      <van-divider />
      <div :class="result.correct ? 'correct' : 'wrong'">
        {{ result.correct ? '✅ 回答正确！' : '❌ 回答错误，正确答案是 ' + result.correctAnswer }}
      </div>
      <van-collapse v-model="expandKeys">
        <van-collapse-item title="查看解析" name="x">
          <div class="exp">{{ result.explanation }}</div>
        </van-collapse-item>
      </van-collapse>
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
const emit = defineEmits(['submit', 'change', 'update-answer'])

const q = computed(() => props.question)
const qType = computed(() => classify(q.value))
const isSingle = computed(() => qType.value.type === 'single')
const qId = computed(() => q.value.id || q.value._id || props.index)
const barColor = computed(() => qType.value.color)
const label = computed(() => qType.value.label)

const selected = ref(null)
const multiSelected = ref([])
const expandKeys = ref([]); const isFav = ref(false)
const retrying = ref(false)

const isAnswerMissing = computed(() => {
  const ans = q.value.answer
  const exp = q.value.explanation
  const missing = !ans || typeof ans !== 'string' || ans === '参考答案未提供' || ans === '未提供' || ans.trim() === ''
  const missingExp = !exp || typeof exp !== 'string' || exp === '解析未提供' || exp === '解析生成失败' || exp === '未提供' || exp.trim() === ''
  return missing || missingExp
})

watch(() => props.result, (v) => {
  if (v) {
    expandKeys.value = ['x']
    // 恢复用户之前选择的选项
    if (v.userAnswer) {
      if (isSingle.value) {
        selected.value = v.userAnswer
      } else {
        multiSelected.value = v.userAnswer.split('')
      }
    }
  }
}, { immediate: true })

function isSelected(key) {
  return isSingle.value ? selected.value === key : multiSelected.value.includes(key)
}

function toggle(key) {
  if (props.result) return
  if (isSingle.value) {
    selected.value = key
    emit('change', { questionId: qId.value, userAnswer: String(key) })
  } else {
    const i = multiSelected.value.indexOf(key)
    i >= 0 ? multiSelected.value.splice(i, 1) : multiSelected.value.push(key)
    emit('change', { questionId: qId.value, userAnswer: [...multiSelected.value].sort().join('') })
  }
}

function submit() {
  const ans = isSingle.value ? selected.value : [...multiSelected.value].sort().join('')
  if (!ans) return
  try { navigator.vibrate?.(20) } catch (e) {}
  emit('submit', { questionId: qId.value, userAnswer: ans })
}

async function toggleFav() { isFav.value = !isFav.value }

async function retryGenerateAnswer() {
  retrying.value = true
  try {
    const res = await request.post('/generate-answer', {
      question: q.value.question,
      type: q.value.type || 'single',
      category: q.value.category || '',
      options: q.value.options || null,
      answer: q.value.answer || ''
    })
    if (res.answer) q.value.answer = res.answer
    if (res.explanation) q.value.explanation = res.explanation
    showSuccessToast('解析已生成')
    emit('update-answer', { questionId: qId.value, answer: res.answer, explanation: res.explanation })
  } catch (e) {
    showFailToast(e.message || '解析生成失败')
  } finally {
    retrying.value = false
  }
}

defineExpose({
  getCurrentAnswer: () => {
    return isSingle.value ? selected.value : (multiSelected.value.length > 0 ? [...multiSelected.value].sort().join('') : '')
  }
})
</script>

<style scoped>
.obj-card { background: #fff; border-radius: 16px; padding: 20px; margin-bottom: 12px; box-shadow: 0 2px 12px rgba(0,0,0,0.06); }
.card-header { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.q-num { font-size: 13px; color: #999; }
.q-text { font-size: 15px; font-weight: 500; color: #333; line-height: 1.6; margin-bottom: 12px; }
.opts { margin-bottom: 12px; }
.opt { display: flex; align-items: center; gap: 10px; padding: 10px 12px; margin-bottom: 6px; border-radius: 10px; border: 1.5px solid #eee; cursor: pointer; transition: .15s; }
.opt.active { border-color: #667eea; background: #f5f5ff; }
.opt-box { width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; border: 2px solid #ddd; transition: .15s; }
.opt-box.radio { border-radius: 50%; }
.opt-box.radio .dot { width: 8px; height: 8px; border-radius: 50%; background: #fff; }
.opt-box.checked { border-color: #667eea; background: #667eea; }
.opt-label { font-weight: 600; color: #667eea; font-size: 14px; min-width: 18px; }
.opt-text { font-size: 14px; color: #333; }
.act { text-align: right; }
.correct { color: #07c160; font-size: 14px; font-weight: 500; margin-bottom: 8px; }
.wrong { color: #ee0a24; font-size: 14px; font-weight: 500; margin-bottom: 8px; }
.exp { font-size: 13px; line-height: 1.6; color: #555; }
</style>
