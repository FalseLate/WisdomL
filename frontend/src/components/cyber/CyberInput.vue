<template>
  <div class="cyber-input-wrap">
    <label v-if="label" class="input-label">{{ label }}</label>
    <div class="input-container" :class="{ focused, error: errorMessage }">
      <span v-if="icon" class="input-icon">{{ icon }}</span>
      <input
        ref="inputRef"
        v-model="inputValue"
        :type="type"
        :placeholder="placeholder"
        class="cyber-input"
        @focus="focused = true"
        @blur="focused = false"
        @input="handleInput"
      />
    </div>
    <span v-if="errorMessage" class="input-error">{{ errorMessage }}</span>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  modelValue: { type: [String, Number], default: '' },
  label: { type: String, default: '' },
  type: { type: String, default: 'text' },
  placeholder: { type: String, default: '' },
  icon: { type: String, default: '' },
  errorMessage: { type: String, default: '' }
})

const emit = defineEmits(['update:modelValue', 'input', 'focus', 'blur'])

const inputValue = ref(props.modelValue)
const focused = ref(false)
const inputRef = ref(null)

watch(() => props.modelValue, (val) => {
  inputValue.value = val
})

function handleInput(e) {
  emit('update:modelValue', e.target.value)
  emit('input', e.target.value)
}

defineExpose({
  focus: () => inputRef.value?.focus()
})
</script>

<style scoped>
.cyber-input-wrap {
  width: 100%;
  margin-bottom: 16px;
}

.input-label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: #8a8a9a;
  margin-bottom: 8px;
  letter-spacing: 0.5px;
}

.input-container {
  display: flex;
  align-items: center;
  gap: 10px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(0, 245, 255, 0.2);
  border-radius: 12px;
  padding: 0 14px;
  height: 48px;
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.input-container.focused {
  border-color: #00f5ff;
  background: rgba(0, 245, 255, 0.04);
  box-shadow: 0 0 0 3px rgba(0, 245, 255, 0.1), 0 0 16px rgba(0, 245, 255, 0.15);
}

.input-container.error {
  border-color: #ff4444;
}

.input-icon {
  font-size: 18px;
  opacity: 0.6;
  flex-shrink: 0;
}

.cyber-input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  font-size: 15px;
  color: #e8e8f0;
  font-family: 'Noto Sans SC', sans-serif;
  min-width: 0;
}

.cyber-input::placeholder {
  color: #555566;
}

.cyber-input:-webkit-autofill {
  -webkit-box-shadow: 0 0 0 30px #0a0a0f inset;
  -webkit-text-fill-color: #e8e8f0;
}

.input-error {
  display: block;
  font-size: 12px;
  color: #ff4444;
  margin-top: 6px;
}
</style>
