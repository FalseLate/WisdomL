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
  color: #8a8a9a;
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.1);
}

/* primary 霓虹青 */
.cyber-tag.primary {
  color: #00f5ff;
  background: rgba(0, 245, 255, 0.1);
  border-color: rgba(0, 245, 255, 0.3);
}

/* secondary 品红 */
.cyber-tag.secondary {
  color: #ff00ff;
  background: rgba(255, 0, 255, 0.1);
  border-color: rgba(255, 0, 255, 0.3);
}

/* success 绿色 */
.cyber-tag.success {
  color: #00ff88;
  background: rgba(0, 255, 136, 0.1);
  border-color: rgba(0, 255, 136, 0.3);
}

/* warning 黄色 */
.cyber-tag.warning {
  color: #f9f002;
  background: rgba(249, 240, 2, 0.1);
  border-color: rgba(249, 240, 2, 0.3);
}

/* danger 红色 */
.cyber-tag.danger {
  color: #ff4444;
  background: rgba(255, 68, 68, 0.1);
  border-color: rgba(255, 68, 68, 0.3);
}
</style>
