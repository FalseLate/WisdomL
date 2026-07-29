<template>
  <div class="loading-overlay" v-if="visible">
    <div class="loading-card">
      <div class="loader-emoji">🤖</div>
      <div class="loader-text">{{ currentText }}</div>
      <div class="loader-sub">{{ subtitle }}</div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'

const props = defineProps({
  visible: { type: Boolean, default: false }
})

const emit = defineEmits(['update:visible'])

const texts = [
  '正在读取文档内容',
  '正在提取文本信息',
  '正在梳理核心知识点',
  '正在划分知识章节',
  '正在根据知识点生成试题',
  '试题生成中，请耐心等待'
]

const currentIndex = ref(0)
const currentText = ref(texts[0])
const subtitle = ref('请不要关闭页面')
const elapsed = ref(0)

let textTimer = null
let elapsedTimer = null

function start() {
  stop()
  currentIndex.value = 0
  currentText.value = texts[0]
  subtitle.value = '请不要关闭页面'
  elapsed.value = 0

  textTimer = setInterval(() => {
    currentIndex.value = (currentIndex.value + 1) % texts.length
    currentText.value = texts[currentIndex.value]
  }, 1200)

  elapsedTimer = setInterval(() => {
    elapsed.value++
    if (elapsed.value >= 30) {
      subtitle.value = '文档篇幅较长，正在分片解析，请耐心等待'
    }
  }, 1000)
}

function stop() {
  if (textTimer) { clearInterval(textTimer); textTimer = null }
  if (elapsedTimer) { clearInterval(elapsedTimer); elapsedTimer = null }
}

watch(() => props.visible, (v) => {
  if (v) start()
  else stop()
})

onUnmounted(() => stop())
</script>

<style scoped>
.loading-overlay {
  position: fixed;
  bottom: 60px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 3000;
  pointer-events: none;
}
.loading-card {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(12px);
  border-radius: 20px;
  padding: 20px 28px 18px;
  box-shadow: 0 4px 24px rgba(102, 126, 234, 0.15), 0 1px 4px rgba(0, 0, 0, 0.06);
  text-align: center;
  min-width: 240px;
  border: 1px solid rgba(102, 126, 234, 0.08);
}
.loader-emoji {
  font-size: 36px;
  animation: breathe 2.4s ease-in-out infinite;
  margin-bottom: 10px;
  line-height: 1;
}
@keyframes breathe {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-6px); }
}
.loader-text {
  font-size: 14px;
  color: #333;
  font-weight: 500;
  margin-bottom: 6px;
  transition: opacity 0.3s;
  white-space: nowrap;
}
.loader-sub {
  font-size: 11px;
  color: #999;
  transition: color 0.5s;
}
</style>