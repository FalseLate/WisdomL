<template>
  <Teleport to="body">
    <div v-if="open" class="dialog-overlay gen-complete-overlay" @click.self="$emit('close')">
      <div class="dialog-box" role="dialog" aria-modal="true" aria-labelledby="gen-complete-title">
        <div class="dialog-accent-line"></div>
        <div class="dialog-icon" aria-hidden="true">📎</div>
        <div id="gen-complete-title" class="dialog-title">出题完成</div>
        <div class="dialog-stats">
          <div class="ds-item">
            <span class="ds-num">{{ total }}</span>
            <span class="ds-label">总题数</span>
          </div>
          <div class="ds-item">
            <span class="ds-num cyan">{{ objective }}</span>
            <span class="ds-label">客观题</span>
          </div>
          <div class="ds-item">
            <span class="ds-num magenta">{{ subjective }}</span>
            <span class="ds-label">主观题</span>
          </div>
        </div>
        <p v-if="missing > 0" class="dialog-warning">
          ⚠️ {{ missing }} 道题答案/解析缺失，可进入刷题后手动重试生成
        </p>
        <div class="dialog-actions">
          <CyberButton variant="primary" block @click="$emit('practice')">📝 立即刷题</CyberButton>
          <CyberButton variant="ghost" block @click="$emit('close')">留在此页</CyberButton>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed } from 'vue'
import CyberButton from './CyberButton.vue'

const props = defineProps({
  open: { type: Boolean, default: false },
  result: { type: Object, default: () => ({}) }
})

defineEmits(['close', 'practice'])

const total = computed(() => Number(props.result.total) || 0)
const objective = computed(() => Number(props.result.objective) || 0)
const subjective = computed(() => Number(props.result.subjective) || 0)
const missing = computed(() => Number(props.result.missing) || 0)
</script>

<style scoped>
.dialog-overlay {
  position: fixed;
  inset: 0;
  z-index: 5000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: var(--scrim);
  backdrop-filter: blur(4px);
  animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.dialog-box {
  position: relative;
  width: 100%;
  max-width: 360px;
  max-height: calc(100vh - 40px);
  overflow-y: auto;
  padding: 32px 24px 24px;
  border: 1px solid var(--accent-border);
  border-radius: 20px;
  background: var(--surface-solid);
  box-shadow: var(--bar-shadow), 0 20px 60px var(--scrim);
  text-align: center;
  animation: dialogPop 0.4s var(--ease-out);
}

@keyframes dialogPop {
  from { opacity: 0; transform: scale(0.9) translateY(20px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}

.dialog-accent-line {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: linear-gradient(90deg, var(--accent), var(--secondary));
}

.dialog-icon {
  margin-bottom: 12px;
  font-size: 48px;
  line-height: 1;
  filter: drop-shadow(0 0 12px var(--accent-soft));
}

.dialog-title {
  margin-bottom: 16px;
  color: var(--text-primary);
  font-family: var(--font-display);
  font-size: 20px;
  font-weight: 700;
  letter-spacing: 2px;
}

.dialog-stats {
  display: flex;
  justify-content: space-around;
  margin-bottom: 16px;
  padding: 16px 0;
  border-top: 1px solid var(--accent-border);
  border-bottom: 1px solid var(--accent-border);
}

.ds-item { text-align: center; }

.ds-num {
  display: block;
  margin-bottom: 4px;
  color: var(--text-primary);
  font-family: var(--font-display);
  font-size: 24px;
  font-weight: 700;
}

.ds-num.cyan {
  color: var(--accent);
  text-shadow: 0 0 10px var(--accent-soft);
}

.ds-num.magenta {
  color: var(--secondary);
  text-shadow: 0 0 10px var(--secondary-soft);
}

.ds-label {
  color: var(--text-muted);
  font-size: 11px;
}

.dialog-warning {
  margin-bottom: 16px;
  color: var(--warning);
  font-size: 12px;
  line-height: 1.5;
}

.dialog-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
</style>
