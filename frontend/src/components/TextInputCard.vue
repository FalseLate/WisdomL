<template>
  <div class="card text-input-card">
    <div class="input-guide">📝 粘贴或输入复习资料</div>
    <van-field
      :model-value="modelValue"
      @update:model-value="$emit('update:modelValue', $event)"
      type="textarea" rows="4" autosize maxlength="5000" show-word-limit
      placeholder="例如：光合作用是指绿色植物利用光能，将二氧化碳和水转化为有机物并释放氧气的过程..."
    />

    <!-- 题型选择 -->
    <div class="type-selector">
      <span class="type-label">出题类型：</span>
      <van-radio-group v-model="questionType" direction="horizontal">
        <van-radio name="all" shape="square">📝 全部</van-radio>
        <van-radio name="objective" shape="square">📖 客观</van-radio>
        <van-radio name="subjective" shape="square">✍️ 主观</van-radio>
      </van-radio-group>
    </div>

    <van-button :loading="loading" loading-text="正在生成..." block round class="gradient-btn generate-btn"
      @click="$emit('generate', { text: modelValue, questionType })">
      ✨ 生成题目
    </van-button>
  </div>
</template>

<script setup>
import { ref } from 'vue'

defineProps({
  modelValue: { type: String, default: '' },
  loading: { type: Boolean, default: false }
})
defineEmits(['update:modelValue', 'generate'])

const questionType = ref('all')
</script>

<style scoped>
.text-input-card { padding: 20px; }
.input-guide { font-size: 15px; font-weight: 500; color: #333; margin-bottom: 12px; }
.type-selector { display: flex; align-items: center; gap: 8px; margin: 12px 0; font-size: 14px; }
.type-label { color: #666; white-space: nowrap; }
.generate-btn { margin-top: 8px; }
</style>
