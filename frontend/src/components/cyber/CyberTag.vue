<template>
  <span class="cyber-tag" :class="type" :style="customStyle">
    {{ text }}
  </span>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  text: { type: String, default: '' },
  type: { type: String, default: 'default' }, // default, primary, secondary, success, warning, danger
  color: { type: String, default: '' },
  bgColor: { type: String, default: '' }
})

const customStyle = computed(() => {
  const style = {}
  if (props.color) {
    style.color = props.color
    style.borderColor = props.color + '50'
    style.background = props.color + '15'
    style.textShadow = `0 0 8px ${props.color}80, 0 0 16px ${props.color}40`
    style.boxShadow = `0 0 12px ${props.color}20, inset 0 0 8px ${props.color}10`
  }
  if (props.bgColor) style.background = props.bgColor
  return style
})
</script>

<style scoped>
.cyber-tag {
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.5px;
  border: 1px solid;
  font-family: 'Noto Sans SC', sans-serif;
  white-space: nowrap;
}

/* default */
.cyber-tag.default {
  color: var(--text-muted);
  background: var(--bg-hover);
  border-color: var(--hairline);
}

/* primary 霓虹青 */
.cyber-tag.primary {
  color: var(--accent);
  background: var(--accent-soft);
  border-color: var(--accent-border);
}

/* secondary 品红 */
.cyber-tag.secondary {
  color: var(--secondary);
  background: var(--secondary-soft);
  border-color: var(--secondary-border);
}

/* success 绿色 */
.cyber-tag.success {
  color: var(--success);
  background: var(--success-soft);
  border-color: var(--success-border);
}

/* warning 黄色 */
.cyber-tag.warning {
  color: var(--warning);
  background: var(--warning-soft);
  border-color: var(--warning-border);
}

/* danger 红色 */
.cyber-tag.danger {
  color: var(--danger);
  background: var(--danger-soft);
  border-color: var(--danger-border);
}
</style>
