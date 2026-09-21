<template>
  <div class="obj-card" :style="{ borderLeft: '4px solid ' + barColor }">
    <div class="card-header">
      <span class="fav-btn" :class="{ active: isFav }" @click="toggleFav">
        {{ isFav ? '⭐' : '☆' }}
      </span>
      <CyberTag :color="barColor">{{ label }}</CyberTag>
      <span class="q-num">第{{ index + 1 }}题</span>
    </div>
    <div class="q-text">{{ q.question }}</div>

    <!-- 客观题选项 -->
    <div class="opts">
      <div v-for="(val, key) in q.options" :key="key"
        class="opt" :class="{ active: isSelected(key), disabled: !!result }"
        @click="toggle(key)">
        <span class="opt-box" :class="{ checked: isSelected(key), radio: isSingle }">
          <span v-if="isSelected(key) && !isSingle" class="check-icon">✓</span>
          <span v-if="isSelected(key) && isSingle" class="dot"></span>
        </span>
        <span class="opt-label">{{ key }}.</span>
        <span class="opt-text">{{ val }}</span>
      </div>
    </div>

    <!-- 提交按钮 -->
    <div v-if="!result" class="act">
      <CyberButton variant="primary" size="small" @click="submit">提交答案</CyberButton>
    </div>

    <!-- 答案/解析缺失：重试生成 -->
    <div v-if="isAnswerMissing" class="act retry-act">
      <CyberButton variant="danger" size="small" :loading="retrying" @click="retryGenerateAnswer">
        🔁 重新生成解析
      </CyberButton>
    </div>

    <!-- 结果/解析 -->
    <div v-if="result || hasExplanation" class="res">
      <div class="res-divider"></div>
      <div v-if="result" :class="result.correct ? 'correct' : 'wrong'">
        {{ result.correct ? '✅ 回答正确！' : '❌ 回答错误，正确答案是 ' + result.correctAnswer }}
      </div>
      <div class="exp-collapse">
        <div class="exp-header" @click="showExp = !showExp">
          <span>查看解析</span>
          <span class="exp-arrow" :class="{ open: showExp }">›</span>
        </div>
        <div v-if="showExp" class="exp-body">
          <div class="exp">{{ displayExplanation }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import request from '../utils/request.js'
import { loadFavoriteMap } from '../utils/favoriteStore.js'
import { showFailToast, showSuccessToast } from 'vant'
import { classify } from '../utils/questionType.js'
import { CyberButton, CyberTag } from './cyber'

const props = defineProps({
  question: { type: Object, required: true },
  result: { type: Object, default: null },
  index: { type: Number, default: 0 },
  // 来自另一模式/刷新恢复的未提交答案，用于回显选中态（已提交结果仍以 result 为准）
  initialAnswer: { type: String, default: null }
})
const emit = defineEmits(['submit', 'change', 'update-answer'])

const q = computed(() => props.question)
const qType = computed(() => classify(q.value))
const isSingle = computed(() => qType.value.type === 'single')
const qId = computed(() => q.value.id || q.value._id || props.index)
const barColor = computed(() => qType.value.color)
const label = computed(() => qType.value.label)

// 初始选中态：优先外部恢复的未提交答案（result 的回显由下方 watch 负责）
const selected = ref(isSingle.value && props.initialAnswer ? props.initialAnswer : null)
const multiSelected = ref(!isSingle.value && props.initialAnswer ? props.initialAnswer.split('') : [])
const showExp = ref(false)
const isFav = ref(false)
// 收藏表主键（取消收藏时用），favBusy 防止请求过程中重复点击
let favId = null
const favBusy = ref(false)
onMounted(async () => {
  const map = await loadFavoriteMap()
  const existId = map.get(String(qId.value))
  if (existId != null) { favId = existId; isFav.value = true }
})
const retrying = ref(false)

const isAnswerMissing = computed(() => {
  const ans = q.value.answer
  const exp = q.value.explanation
  const missing = !ans || typeof ans !== 'string' || ans === '参考答案未提供' || ans === '未提供' || ans.trim() === ''
  const missingExp = !exp || typeof exp !== 'string' || exp === '解析未提供' || exp === '解析生成失败' || exp === '未提供' || exp.trim() === ''
  return missing || missingExp
})

// 是否有解析可显示（不管有没有提交结果）
const hasExplanation = computed(() => {
  const exp = props.result?.explanation || q.value.explanation
  return exp && typeof exp === 'string' && exp.trim() !== '' && exp !== '未提供' && exp !== '解析未提供' && exp !== '解析生成失败'
})

// 显示的解析内容（优先用 result 的，回退到 question 的）
const displayExplanation = computed(() => {
  return props.result?.explanation || q.value.explanation || ''
})

watch(() => props.result, (v) => {
  if (v) {
    showExp.value = true
    if (v.userAnswer) {
      if (isSingle.value) {
        selected.value = v.userAnswer
      } else {
        multiSelected.value = v.userAnswer.split('')
      }
    }
  }
}, { immediate: true })

// 解析生成后自动展开（包括未提交但批量生成解析的题目）
watch(hasExplanation, (val) => {
  if (val) showExp.value = true
})

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

async function toggleFav() {
  if (favBusy.value) return
  favBusy.value = true
  try {
    if (isFav.value && favId != null) {
      // 已收藏 -> 取消
      await request.delete('/collection/' + favId)
      isFav.value = false
      favId = null
      const map = await loadFavoriteMap()
      map.delete(String(qId.value))
    } else {
      // 未收藏 -> 新增（后端对同一用户+相同题目做幂等，重复点不会插多条）
      const res = await request.post('/collection', {
        questionJson: JSON.stringify(q.value),
        questionType: qType.value.type || 'single'
      })
      favId = res?.id ?? null
      isFav.value = true
      if (favId != null) {
        const map = await loadFavoriteMap()
        map.set(String(qId.value), favId)
      }
    }
  } catch (e) {
    showFailToast(e.message || '收藏操作失败')
  } finally {
    favBusy.value = false
  }
}

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
.obj-card {
  background: var(--bg-card);
  border: 1px solid var(--accent-border);
  border-radius: var(--radius-card);
  padding: 20px;
  margin-bottom: 12px;
  backdrop-filter: blur(12px);
  transition: all 0.3s var(--ease-out);
}

.obj-card:hover {
  border-color: var(--accent);
  box-shadow: 0 4px 20px var(--accent-soft);
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

/* 选项 */
.opts {
  margin-bottom: 14px;
}

.opt {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  margin-bottom: 8px;
  border-radius: 10px;
  border: 1.5px solid var(--accent-border);
  cursor: pointer;
  transition: all 0.2s var(--ease-out);
  background: var(--bg-elevated);
}

.opt:hover:not(.disabled) {
  border-color: var(--accent);
  background: var(--accent-soft);
  transform: translateX(4px);
}

.opt.active {
  border-color: var(--accent);
  background: var(--accent-soft);
}

.opt.disabled {
  cursor: default;
  opacity: 0.8;
}

.opt-box {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border: 2px solid var(--text-muted);
  transition: all 0.2s;
}

.opt-box.radio {
  border-radius: 50%;
}

.opt-box.radio .dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #000;
}

.opt-box.checked {
  border-color: var(--accent);
  background: var(--accent);
}

.check-icon {
  color: #000;
  font-size: 12px;
  font-weight: 700;
}

.opt-label {
  font-weight: 700;
  color: var(--accent);
  font-size: 14px;
  min-width: 18px;
}

.opt-text {
  font-size: 14px;
  color: var(--text-primary);
  flex: 1;
}

/* 操作区 */
.act {
  text-align: right;
}

.retry-act {
  margin-top: 8px;
}

/* 结果 */
.res {
  margin-top: 12px;
}

.res-divider {
  height: 1px;
  background: var(--accent-border);
  margin: 12px 0;
}

.correct {
  color: var(--success);
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 10px;
}

.wrong {
  color: var(--danger);
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 10px;
}

/* 解析折叠 */
.exp-collapse {
  background: var(--bg-elevated);
  border-radius: 8px;
  border: 1px solid var(--accent-border);
  overflow: hidden;
}

.exp-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  cursor: pointer;
  font-size: 13px;
  color: var(--accent);
  font-weight: 600;
  transition: all 0.2s;
}

.exp-header:hover {
  background: var(--accent-soft);
}

.exp-arrow {
  font-size: 18px;
  transition: transform 0.3s;
}

.exp-arrow.open {
  transform: rotate(90deg);
}

.exp-body {
  padding: 0 14px 14px;
  border-top: 1px solid var(--accent-border);
}

.exp {
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-secondary);
  padding-top: 10px;
}
</style>
