<template>
  <div class="question-card" :style="{ borderLeft: '4px solid ' + accentColor }">
    <div class="card-header">
      <van-tag :color="accentColor" size="medium">{{ isSingle ? '单选题' : '多选题' }}</van-tag>
      <span class="q-number">第{{ index + 1 }}题</span>
    </div>

    <div class="question-text">{{ question.question }}</div>

    <!-- 单选 -->
    <div v-if="isSingle" class="options-area">
      <div v-for="(val, key) in question.options" :key="key"
        class="option-item" :class="{ active: localAnswer === key }"
        @click="selectSingle(key)">
        <span class="option-circle" :class="{ checked: localAnswer === key }">
          <span v-if="localAnswer === key" class="dot"></span>
        </span>
        <span class="option-label">{{ key }}.</span>
        <span class="option-text">{{ val }}</span>
      </div>
    </div>

    <!-- 多选 -->
    <div v-else class="options-area">
      <div v-for="(val, key) in question.options" :key="key"
        class="option-item multi" :class="{ active: localMultiAnswer.includes(key) }"
        @click="toggleMulti(key)">
        <span class="option-square" :class="{ checked: localMultiAnswer.includes(key) }">
          <van-icon v-if="localMultiAnswer.includes(key)" name="success" size="14" color="#fff" />
        </span>
        <span class="option-label">{{ key }}.</span>
        <span class="option-text">{{ val }}</span>
      </div>
    </div>

    <!-- 提交按钮 -->
    <div v-if="!result" class="submit-area">
      <van-button plain type="primary" size="small" round @click="handleSubmit">提交答案</van-button>
    </div>

    <!-- 结果 -->
    <div v-if="result" class="result-area">
      <van-divider />
      <div v-if="result.correct" class="result-correct">✅ 回答正确！</div>
      <div v-else class="result-wrong">❌ 回答错误，正确答案是 {{ result.correctAnswer }}</div>
      <van-collapse v-model="expandKeys">
        <van-collapse-item title="查看解析" name="explain">
          <div class="explain-content">{{ result.explanation }}</div>
        </van-collapse-item>
      </van-collapse>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'

const props = defineProps({
  question: { type: Object, required: true },
  result: { type: Object, default: null },
  index: { type: Number, default: 0 }
})

const emit = defineEmits(['submit'])

const isSingle = computed(() => props.question.type === 'single' || props.question.type === '单选题')
const accentColor = computed(() => isSingle.value ? '#667eea' : '#ee6a9c')

const localAnswer = ref('')
const localMultiAnswer = ref([])
const expandKeys = ref([])

watch(() => props.result, (val) => { if (val) expandKeys.value = ['explain'] })

function selectSingle(key) {
  if (props.result) return
  localAnswer.value = key
}

function toggleMulti(key) {
  if (props.result) return
  const idx = localMultiAnswer.value.indexOf(key)
  if (idx >= 0) localMultiAnswer.value.splice(idx, 1)
  else localMultiAnswer.value.push(key)
}

function handleSubmit() {
  const userAnswer = isSingle.value
    ? localAnswer.value
    : [...localMultiAnswer.value].sort().join('')

  if (!userAnswer) return
  try { navigator.vibrate?.(20) } catch (e) {}
  emit('submit', { questionId: props.question.id || props.index, userAnswer })
}
</script>

<style scoped>
.question-card {
  background: #fff; border-radius: 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.08);
  padding: 20px; margin-bottom: 12px;
}
.card-header { display: flex; align-items: center; gap: 10px; }
.q-number { font-size: 14px; color: #999; }
.question-text { font-size: 16px; font-weight: 500; color: #333; margin: 12px 0; line-height: 1.6; }

.options-area { margin-bottom: 12px; }
.option-item {
  display: flex; align-items: center; gap: 10px;
  padding: 12px 14px; margin-bottom: 6px;
  border-radius: 10px; border: 1.5px solid #eee;
  cursor: pointer; transition: all 0.2s;
}
.option-item:hover { border-color: #ccc; }
.option-item.active { border-color: #667eea; background: #f0f0ff; }
.option-item.multi.active { border-color: #ee6a9c; background: #fff0f5; }

.option-circle {
  width: 20px; height: 20px; border-radius: 50%;
  border: 2px solid #ddd; display: flex; align-items: center; justify-content: center;
  flex-shrink: 0; transition: all 0.2s;
}
.option-circle.checked { border-color: #667eea; background: #667eea; }
.option-circle .dot { width: 8px; height: 8px; border-radius: 50%; background: #fff; }

.option-square {
  width: 20px; height: 20px; border-radius: 4px;
  border: 2px solid #ddd; display: flex; align-items: center; justify-content: center;
  flex-shrink: 0; transition: all 0.2s;
}
.option-square.checked { border-color: #ee6a9c; background: #ee6a9c; }

.option-label { font-weight: 600; color: #666; font-size: 14px; }
.option-text { font-size: 14px; color: #333; }

.submit-area { text-align: right; }

.result-correct { color: #07c160; font-weight: 500; font-size: 14px; margin-bottom: 8px; }
.result-wrong { color: #ee0a24; font-weight: 500; font-size: 14px; margin-bottom: 8px; }
.explain-content { font-size: 13px; line-height: 1.6; color: #555; }
</style>
