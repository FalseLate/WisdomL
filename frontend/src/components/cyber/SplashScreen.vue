<template>
  <transition name="splash-fade">
    <div v-if="visible" class="splash-screen">
      <!-- 四角 HUD 装饰 -->
      <div class="splash-corner tl"></div>
      <div class="splash-corner tr"></div>
      <div class="splash-corner bl"></div>
      <div class="splash-corner br"></div>

      <!-- 扫描线 -->
      <div class="splash-scanline"></div>

      <!-- Logo -->
      <div class="splash-logo">
        <span class="zhi">智</span><span class="xi">复习</span>
      </div>
      <div class="splash-subtitle">AI LEARNING SYSTEM</div>

      <!-- 进度条 -->
      <div class="splash-progress-wrap">
        <div class="splash-progress-label">
          <span>SYSTEM BOOT</span>
          <span class="percent">{{ percent }}%</span>
        </div>
        <div class="splash-progress-bar">
          <div class="splash-progress-fill" :style="{ width: percent + '%' }"></div>
        </div>
        <div class="splash-status">{{ statusText }}</div>
      </div>
    </div>
  </transition>
</template>

<script setup>
import { ref, onMounted } from 'vue'

const emit = defineEmits(['complete'])

const visible = ref(true)
const percent = ref(0)
const statusText = ref('Initializing...')

const statusTexts = [
  'Initializing...',
  'Loading AI Engine...',
  'Connecting OCR...',
  'Calibrating Neural Net...',
  'System Ready.'
]

onMounted(() => {
  let statusIndex = 0
  const interval = setInterval(() => {
    percent.value += Math.random() * 8 + 3
    if (percent.value >= 100) {
      percent.value = 100
      clearInterval(interval)
      statusText.value = statusTexts[statusTexts.length - 1]
      setTimeout(() => {
        visible.value = false
        emit('complete')
      }, 100)
      return
    }
    const newIndex = Math.min(Math.floor(percent.value / 25), statusTexts.length - 1)
    if (newIndex !== statusIndex) {
      statusIndex = newIndex
      statusText.value = statusTexts[statusIndex]
    }
  }, 80)
})
</script>

<style scoped>
.splash-screen {
  position: fixed;
  inset: 0;
  background: #0a0a0f;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.splash-fade-enter-active,
.splash-fade-leave-active {
  transition: opacity 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}

.splash-fade-enter-from,
.splash-fade-leave-to {
  opacity: 0;
}

/* 四角装饰 */
.splash-corner {
  position: absolute;
  width: 28px;
  height: 28px;
  border-color: #00f5ff;
  opacity: 0.6;
}
.splash-corner.tl { top: 24px; left: 24px; border-top: 2px solid; border-left: 2px solid; }
.splash-corner.tr { top: 24px; right: 24px; border-top: 2px solid; border-right: 2px solid; }
.splash-corner.bl { bottom: 24px; left: 24px; border-bottom: 2px solid; border-left: 2px solid; }
.splash-corner.br { bottom: 24px; right: 24px; border-bottom: 2px solid; border-right: 2px solid; }

/* 扫描线 */
.splash-scanline {
  position: absolute;
  left: 0;
  right: 0;
  height: 2px;
  background: linear-gradient(90deg, transparent, #00f5ff, transparent);
  box-shadow: 0 0 12px #00f5ff;
  opacity: 0.5;
  animation: scanMove 2s linear infinite;
}

@keyframes scanMove {
  0% { top: 0; }
  100% { top: 100%; }
}

/* Logo */
.splash-logo {
  font-family: 'Orbitron', 'Courier New', monospace;
  font-size: 42px;
  font-weight: 900;
  letter-spacing: 6px;
  margin-bottom: 8px;
}

.splash-logo .zhi {
  color: #00f5ff;
  text-shadow: 0 0 20px rgba(0, 245, 255, 0.6), 0 0 40px rgba(0, 245, 255, 0.3);
  animation: logoPulse 1.5s ease-in-out infinite;
}

.splash-logo .xi {
  color: #ff00ff;
  text-shadow: 0 0 20px rgba(255, 0, 255, 0.6), 0 0 40px rgba(255, 0, 255, 0.3);
  animation: logoPulse 1.5s ease-in-out 0.3s infinite;
}

@keyframes logoPulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

.splash-subtitle {
  font-family: 'Orbitron', 'Courier New', monospace;
  font-size: 10px;
  letter-spacing: 4px;
  color: #555566;
  margin-bottom: 40px;
  text-transform: uppercase;
}

/* 进度条 */
.splash-progress-wrap {
  width: 220px;
}

.splash-progress-label {
  display: flex;
  justify-content: space-between;
  font-family: 'Orbitron', 'Courier New', monospace;
  font-size: 9px;
  letter-spacing: 2px;
  color: #555566;
  margin-bottom: 8px;
  text-transform: uppercase;
}

.splash-progress-label .percent {
  color: #00f5ff;
}

.splash-progress-bar {
  width: 100%;
  height: 3px;
  background: rgba(0, 245, 255, 0.1);
  border-radius: 2px;
  overflow: hidden;
}

.splash-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #00f5ff, #ff00ff);
  border-radius: 2px;
  box-shadow: 0 0 10px #00f5ff;
  transition: width 0.1s linear;
  position: relative;
}

.splash-progress-fill::after {
  content: '';
  position: absolute;
  right: 0;
  top: 0;
  width: 20px;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.6));
  filter: blur(2px);
}

.splash-status {
  margin-top: 16px;
  font-family: 'Orbitron', 'Courier New', monospace;
  font-size: 9px;
  letter-spacing: 2px;
  color: #555566;
  height: 14px;
  text-transform: uppercase;
}
</style>
