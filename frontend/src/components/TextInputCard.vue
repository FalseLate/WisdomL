<template>
  <div class="text-input-card">
    <div class="input-guide">📝 粘贴或输入复习资料</div>
    <textarea
      :value="modelValue"
      @input="$emit('update:modelValue', $event.target.value)"
      rows="4"
      maxlength="5000"
      class="cyber-textarea"
      placeholder="例如：光合作用是指绿色植物利用光能，将二氧化碳和水转化为有机物并释放氧气的过程..."
    ></textarea>
    <div class="word-count">{{ modelValue.length }}/5000</div>

    <!-- 题型选择 -->
    <div class="type-selector">
      <span class="type-label">出题类型：</span>
      <div class="radio-group">
        <label class="radio-item" :class="{ checked: questionType === 'all' }" @click="questionType='all'">
          <span class="radio-dot"></span>📝 全部
        </label>
        <label class="radio-item" :class="{ checked: questionType === 'objective' }" @click="questionType='objective'">
          <span class="radio-dot"></span>📖 客观
        </label>
        <label class="radio-item" :class="{ checked: questionType === 'subjective' }" @click="questionType='subjective'">
          <span class="radio-dot"></span>✍️ 主观
        </label>
      </div>
    </div>

    <CyberButton
      variant="primary"
      block
      :loading="loading"
      class="generate-btn"
      @click="$emit('generate', { text: modelValue, questionType })"
    >
      ✨ 生成题目
    </CyberButton>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { CyberButton } from './cyber'

defineProps({
  modelValue: { type: String, default: '' },
  loading: { type: Boolean, default: false }
})
defineEmits(['update:modelValue', 'generate'])

const questionType = ref('all')
</script>

<style scoped>
.text-input-card {
  background: var(--bg-card);
  border: 1px solid var(--accent-border);
  border-radius: var(--radius-card);
  backdrop-filter: blur(12px);
  padding: 20px;
  margin-bottom: 16px;
}

.input-guide {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 12px;
  font-family: var(--font-display);
  letter-spacing: 0.5px;
}

.cyber-textarea {
  width: 100%;
  min-height: 120px;
  padding: 14px;
  background: var(--bg-elevated);
  border: 1px solid var(--accent-border);
  border-radius: 12px;
  font-size: 14px;
  color: var(--text-primary);
  font-family: var(--font-body);
  line-height: 1.6;
  resize: vertical;
  outline: none;
  transition: all 0.25s var(--ease-out);
}

.cyber-textarea:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft), 0 0 16px var(--accent-soft);
}

.cyber-textarea::placeholder {
  color: var(--text-muted);
}

.word-count {
  text-align: right;
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 6px;
  font-family: var(--font-display);
}

/* 题型选择 */
.type-selector {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 16px 0;
  flex-wrap: wrap;
}

.type-label {
  color: var(--text-secondary);
  white-space: nowrap;
  font-size: 13px;
  font-weight: 600;
}

.radio-group {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.radio-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: var(--bg-elevated);
  border: 1px solid var(--accent-border);
  border-radius: 8px;
  font-size: 12px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s;
}

.radio-item.checked {
  border-color: var(--accent);
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 600;
}

.radio-dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid var(--accent-border);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.radio-item.checked .radio-dot {
  border-color: var(--accent);
}

.radio-item.checked .radio-dot::after {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent);
}

.generate-btn {
  margin-top: 8px;
}
</style>
