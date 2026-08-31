<template>
  <button
    class="cyber-button"
    :class="[variant, size, { block, disabled: disabled || loading, loading }]"
    :disabled="disabled || loading"
    @click="handleClick"
  >
    <span v-if="loading" class="btn-spinner"></span>
    <slot></slot>
  </button>
</template>

<script setup>
const props = defineProps({
  variant: { type: String, default: 'primary' }, // primary, secondary, success, danger, ghost
  size: { type: String, default: 'normal' }, // small, normal, large
  block: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  loading: { type: Boolean, default: false }
})

const emit = defineEmits(['click'])

function handleClick(e) {
  if (!props.disabled && !props.loading) {
    emit('click', e)
  }
}
</script>

<style scoped>
.cyber-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: none;
  border-radius: 12px;
  font-family: 'Noto Sans SC', sans-serif;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  letter-spacing: 0.5px;
  position: relative;
  overflow: hidden;
}

.cyber-button:active:not(:disabled) {
  transform: translateY(0) scale(0.97);
}

.cyber-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 尺寸 */
.cyber-button.small {
  height: 32px;
  padding: 0 14px;
  font-size: 12px;
  border-radius: 8px;
}

.cyber-button.normal {
  height: 44px;
  padding: 0 20px;
  font-size: 14px;
}

.cyber-button.large {
  height: 52px;
  padding: 0 28px;
  font-size: 16px;
}

.cyber-button.block {
  width: 100%;
}

/* 变体：primary 霓虹青 */
.cyber-button.primary {
  background: linear-gradient(135deg, #00f5ff, #00c8d4);
  color: #000;
  box-shadow: 0 4px 16px rgba(0, 245, 255, 0.3);
}

.cyber-button.primary:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 8px 28px rgba(0, 245, 255, 0.5);
}

/* 变体：secondary 品红 */
.cyber-button.secondary {
  background: linear-gradient(135deg, #ff00ff, #cc00cc);
  color: #fff;
  box-shadow: 0 4px 16px rgba(255, 0, 255, 0.3);
}

.cyber-button.secondary:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 8px 28px rgba(255, 0, 255, 0.5);
}

/* 变体：success 绿色 */
.cyber-button.success {
  background: linear-gradient(135deg, #00ff88, #00cc6a);
  color: #000;
  box-shadow: 0 4px 16px rgba(0, 255, 136, 0.3);
}

.cyber-button.success:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 8px 28px rgba(0, 255, 136, 0.5);
}

/* 变体：danger 红色 */
.cyber-button.danger {
  background: linear-gradient(135deg, #ff4444, #cc0000);
  color: #fff;
  box-shadow: 0 4px 16px rgba(255, 68, 68, 0.3);
}

.cyber-button.danger:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 8px 28px rgba(255, 68, 68, 0.5);
}

/* 变体：warning 黄色 */
.cyber-button.warning {
  background: linear-gradient(135deg, #f9f002, #e0d000);
  color: #000;
  font-weight: 700;
  box-shadow: 0 4px 16px rgba(249, 240, 2, 0.35);
}

.cyber-button.warning:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 8px 32px rgba(249, 240, 2, 0.55);
}

/* 变体：ghost 幽灵按钮 */
.cyber-button.ghost {
  background: transparent;
  color: #00f5ff;
  border: 1px solid rgba(0, 245, 255, 0.4);
}

.cyber-button.ghost:hover:not(:disabled) {
  background: rgba(0, 245, 255, 0.1);
  border-color: #00f5ff;
  box-shadow: 0 0 16px rgba(0, 245, 255, 0.2);
}

/* 加载动画 */
.btn-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(0, 0, 0, 0.2);
  border-top-color: currentColor;
  border-radius: 50%;
  animation: btn-spin 0.8s linear infinite;
}

@keyframes btn-spin {
  to { transform: rotate(360deg); }
}
</style>
