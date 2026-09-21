<template>
  <div class="err-tagger" v-if="questionId">
    <div class="et-title">
      错因标注
      <span class="et-hint">（可多选，用于针对性复习与个人错因统计）</span>
    </div>
    <div class="et-chips">
      <span
        v-for="t in TYPES"
        :key="t.code"
        class="et-chip"
        :class="{ on: selected.includes(t.code) }"
        :title="t.tip"
        @click="toggle(t.code)"
      >{{ t.label }}</span>
    </div>
    <textarea
      v-model="note"
      class="et-note"
      rows="2"
      maxlength="500"
      placeholder="简单记录反思 / 自我小结（选填）"
    ></textarea>
    <button class="et-save" :class="{ saved }" @click="save">
      {{ saved ? '已保存 ✓' : '保存错因' }}
    </button>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { showSuccessToast, showFailToast } from 'vant'
import request from '../utils/request.js'

const props = defineProps({
  questionId: [String, Number],
  // 已保存错因（逗号分隔英文码）与反思，用于回显/补标
  initialTypes: { type: String, default: '' },
  initialNote: { type: String, default: '' }
})
const emit = defineEmits(['saved'])

// 五大错因（对应论文加涅学习结果分类：审题/知识/数学/策略/习惯）
const TYPES = [
  { code: 'audit', label: '审题性', tip: '遗漏关键数据 / 隐含条件，如漏看“光滑、缓慢、不计”等' },
  { code: 'knowledge', label: '知识性', tip: '知识空白遗忘、概念规律混淆、理解不透彻' },
  { code: 'math', label: '数学性', tip: '数学知识不足或运算错误' },
  { code: 'strategy', label: '策略性', tip: '解题策略没掌握：问题表征、模型法、逆推、整体/隔离法' },
  { code: 'habit', label: '习惯性', tip: '缺乏反思监控、书写不规范等习惯问题' }
]

const selected = ref(props.initialTypes ? props.initialTypes.split(',').map(s => s.trim()).filter(Boolean) : [])
const note = ref(props.initialNote || '')
const saved = ref(false)

// 未传入已存错因时（做题页/懒人页），挂载后按 questionId 回拉，实现刷新回显；错题本传了 initial 则不请求
onMounted(async () => {
  if (!props.questionId) return
  if (props.initialTypes || props.initialNote) return
  try {
    const res = await request.get('/wrong-questions/error-type/' + props.questionId)
    const remoteTypes = res?.errorTypes || ''
    const remoteNote = res?.errorNote || ''
    if (remoteTypes) selected.value = remoteTypes.split(',').map(s => s.trim()).filter(Boolean)
    if (remoteNote) note.value = remoteNote
  } catch (e) { /* 静默：回拉失败不影响手动标注 */ }
})

function toggle(code) {
  saved.value = false
  const i = selected.value.indexOf(code)
  if (i >= 0) selected.value.splice(i, 1)
  else selected.value.push(code)
}

async function save() {
  if (!props.questionId) { showFailToast('缺少题目ID'); return }
  try {
    await request.post('/wrong-questions/error-type', {
      questionId: String(props.questionId),
      errorTypes: selected.value.join(','),
      errorNote: note.value
    })
    saved.value = true
    // 允许错因为空（可只写反思或清空），保存后回传父组件同步列表数据
    emit('saved', { errorTypes: selected.value.join(','), errorNote: note.value })
    showSuccessToast('错因已保存')
  } catch (e) {
    showFailToast('保存失败，请重试')
  }
}
</script>

<style scoped>
.err-tagger {
  margin-top: 14px;
  padding: 12px;
  background: rgba(255, 68, 68, 0.06);
  border: 1px solid rgba(255, 68, 68, 0.25);
  border-radius: var(--radius-button);
}
.et-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 8px;
}
.et-hint {
  font-size: 11px;
  font-weight: 400;
  color: var(--text-muted);
}
.et-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
}
.et-chip {
  padding: 5px 12px;
  font-size: 12px;
  border-radius: var(--radius-pill);
  background: var(--bg-elevated);
  border: 1px solid var(--accent-border);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s;
}
.et-chip.on {
  background: var(--danger-soft);
  border-color: var(--danger);
  color: var(--danger);
  font-weight: 700;
}
.et-note {
  width: 100%;
  padding: 10px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-primary);
  background: var(--bg-elevated);
  border: 1px solid var(--accent-border);
  border-radius: var(--radius-sm);
  resize: none;
  font-family: inherit;
  margin-bottom: 10px;
  -webkit-user-select: text;
  -moz-user-select: text;
  user-select: text;
  -webkit-touch-callout: default;
}
.et-note:focus {
  outline: none;
  border-color: var(--accent);
}
.et-save {
  height: 36px;
  padding: 0 18px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--danger);
  background: transparent;
  color: var(--danger);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}
.et-save.saved {
  border-color: var(--success);
  color: var(--success);
}
</style>
