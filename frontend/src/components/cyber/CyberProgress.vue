<template>
  <div class="cyber-progress">
    <div class="progress-bar">
      <div
        class="progress-fill"
        :class="{ complete: percentage >= 100 }"
        :style="{ width: Math.min(percentage, 100) + '%' }"
      ></div>
    </div>
    <span v-if="showPivot" class="progress-pivot">{{ Math.min(percentage, 100) }}%</span>
  </div>
</template>

<script setup>
defineProps({
  percentage: { type: Number, default: 0 },
  showPivot: { type: Boolean, default: true },
  strokeWidth: { type: Number, default: 6 }
})
</script>

<style scoped>
.cyber-progress {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
}

.progress-bar {
  flex: 1;
  height: 6px;
  background: var(--accent-soft);
  border-radius: 3px;
  overflow: hidden;
  position: relative;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--accent), var(--accent-deep));
  border-radius: 3px;
  box-shadow: none;
  transition: width 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  position: relative;
}

.progress-fill.complete {
  background: linear-gradient(90deg, var(--success), var(--success-deep));
  box-shadow: 0 0 8px rgba(0, 255, 136, 0.5);
}

/* 浅底不靠发光分层，绿色霓虹光晕在白卡片上只会糊成一圈脏边 */
[data-theme="light"] .progress-fill.complete { box-shadow: none; }

.progress-fill::after {
  content: '';
  position: absolute;
  right: 0;
  top: 0;
  width: 20px;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgb(var(--overlay-rgb) / 0.4));
  filter: blur(2px);
}

.progress-pivot {
  font-family: 'Orbitron', 'Courier New', monospace;
  font-size: 11px;
  font-weight: 700;
  color: var(--accent);
  min-width: 36px;
  text-align: right;
  
}
</style>
