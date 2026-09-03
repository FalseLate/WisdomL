<template>
  <div
    v-if="visible"
    class="gesture-hud"
    :style="{ left: pos.x + 'px', top: pos.y + 'px' }"
    @mousedown="startDrag"
    @touchstart="startDrag"
  >
    <!-- HUD 边框装饰 -->
    <div class="hud-corner tl"></div>
    <div class="hud-corner tr"></div>
    <div class="hud-corner bl"></div>
    <div class="hud-corner br"></div>

    <!-- 标题栏 -->
    <div class="hud-header">
      <div class="hud-title">
        <span class="status-dot" :class="statusClass"></span>
        <span>{{ statusText }}</span>
      </div>
      <div class="hud-actions">
        <span class="hud-minimize" @click.stop="minimized = !minimized">{{ minimized ? '▢' : '—' }}</span>
        <span class="hud-close" @click.stop="handleClose">✕</span>
      </div>
    </div>

    <!-- 视频+画布区域 -->
    <div v-show="!minimized" class="hud-video-wrap">
      <video ref="videoRef" class="hud-video" playsinline muted></video>
      <canvas ref="canvasRef" class="hud-canvas" width="160" height="120"></canvas>
      <!-- 加载中遮罩 -->
      <div v-if="loading" class="hud-overlay">
        <div class="hud-spinner"></div>
        <div class="hud-overlay-text">{{ loadingText }}</div>
      </div>
      <!-- 错误遮罩 -->
      <div v-if="error" class="hud-overlay error">
        <div class="hud-overlay-icon">⚠️</div>
        <div class="hud-overlay-text">{{ error }}</div>
        <button class="hud-retry-btn" @click.stop="retryInit">重试</button>
      </div>
      <!-- 确认进度条 -->
      <div v-if="confirmProgress > 0" class="hud-confirm-bar">
        <div class="hud-confirm-fill" :style="{ width: confirmProgress + '%' }"></div>
      </div>
    </div>

    <!-- 当前手势（实时显示识别候选/稳定度/两阶段提交提示） -->
    <div v-show="!minimized" class="hud-gesture" :class="{ armed }">
      <div class="gesture-label">{{ currentGestureText }}</div>
      <div class="gesture-action">{{ currentActionText }}</div>
    </div>

    <!-- 最小化时只显示状态点 -->
    <div v-if="minimized" class="hud-mini-status" @click.stop="minimized = false">
      <span class="status-dot" :class="statusClass"></span>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { GestureRecognizer } from '../../utils/gestureRecognizer.js'

const props = defineProps({
  visible: { type: Boolean, default: false }
})

const emit = defineEmits(['close', 'gesture', 'handDetected'])

const videoRef = ref(null)
const canvasRef = ref(null)

// 重要：recognizer 用普通变量，不进 Vue 响应式系统，避免 WASM 实例被 Proxy 代理
let recognizer = null
let initialized = false
let destroyed = false
let firedTimer = null

const handDetected = ref(false)
// 识别器每帧上报的稳定候选 { key, ratio, armPhase }
const candidate = ref({ key: null, ratio: 0, armPhase: 'idle' })
// 手势刚触发时的动作闪示
const firedAction = ref('')
// 两阶段握拳：是否处于“再次握拳确认提交”状态
const armed = ref(false)
const confirmProgress = ref(0)
const minimized = ref(false)
const loading = ref(false)
const loadingText = ref('')
const error = ref('')

// 位置（可拖动）
const pos = ref({ x: 20, y: 100 })
let dragStart = null
let posStart = null

const statusClass = computed(() => {
  if (loading.value) return 'loading'
  if (error.value) return 'error'
  if (armed.value || confirmProgress.value > 0) return 'confirm'
  return handDetected.value ? 'detected' : 'none'
})

const statusText = computed(() => {
  if (loading.value) return loadingText.value || '加载中...'
  if (error.value) return '初始化失败'
  if (armed.value) return '待确认'
  if (confirmProgress.value > 0) return '确认中...'
  return handDetected.value ? '识别中' : '未检测到手'
})

// 实时候选文案（识别器当前认为你在比什么）
const candidateMap = {
  'select:A': '伸1指 → 选A',
  'select:B': '伸2指 → 选B',
  'select:C': '伸3指 → 选C',
  'select:D': '伸4指 → 选D',
  'clear': '五指张开 → 清空',
  'prev': '点赞偏左 → 上一题',
  'next': '点赞偏右 → 下一题',
  'fist': '握拳保持中…（拇指要收回贴掌）'
}

// 手势真正触发瞬间的动作文案
const actionMap = {
  'select:A': '✓ 已选择 A',
  'select:B': '✓ 已选择 B',
  'select:C': '✓ 已选择 C',
  'select:D': '✓ 已选择 D',
  'clear': '✓ 已清空重选',
  'prev': '← 上一题',
  'next': '下一题 →',
  'submit-arm': '再次握拳 = 确认提交',
  'submit': '正在提交整卷…'
}

function eventKey(g) {
  if (!g) return ''
  return g.type === 'select' ? `select:${g.data?.option || ''}` : g.type
}

const currentGestureText = computed(() => {
  if (armed.value) return '⚠ 再次握拳确认提交'
  if (firedAction.value) return firedAction.value
  const key = candidate.value.key
  if (key) return candidateMap[key] || '手势稳定中…'
  if (handDetected.value) return '手势稳定中…'
  return '等待手势...'
})

const currentActionText = computed(() => {
  if (armed.value) return '改比其他手势可取消'
  if (!firedAction.value && candidate.value.key) {
    const r = Math.round((candidate.value.ratio || 0) * 100)
    let text = r > 0 ? `稳定度 ${r}%` : ''
    // 点赞切题时实时显示拇指偏移量，真机调 LIKE_DIR 直接看这个数（负=偏左，正=偏右）
    if ((candidate.value.key === 'prev' || candidate.value.key === 'next') &&
      typeof candidate.value.likeOffset === 'number') {
      text += (text ? ' · ' : '') + `偏移 ${candidate.value.likeOffset.toFixed(2)}`
    }
    return text
  }
  return ''
})

// 初始化识别器（只执行一次，后续开关只启停摄像头）
async function initRecognizer() {
  if (initialized || destroyed) return
  if (!videoRef.value || !canvasRef.value) return

  initialized = true
  loading.value = true
  error.value = ''
  handDetected.value = false
  candidate.value = { key: null, ratio: 0, armPhase: 'idle', likeOffset: null }
  firedAction.value = ''
  armed.value = false
  confirmProgress.value = 0

  try {
    loadingText.value = '加载手势模型...'
    recognizer = new GestureRecognizer()
    recognizer.setGestureCallback((g) => {
      emit('gesture', g)
      confirmProgress.value = 0
      if (g.type === 'submit-arm') {
        // 进入两阶段提交的待确认态（由 armChange 驱动 armed，这里兜底）
        armed.value = true
        firedAction.value = ''
      } else {
        const text = actionMap[eventKey(g)]
        if (text) {
          firedAction.value = text
          clearTimeout(firedTimer)
          firedTimer = setTimeout(() => { firedAction.value = '' }, 1200)
        }
      }
    })
    recognizer.setHandDetectedCallback((detected) => {
      handDetected.value = detected
      emit('handDetected', detected)
      if (!detected) {
        candidate.value = { key: null, ratio: 0, armPhase: 'idle', likeOffset: null }
        confirmProgress.value = 0
      }
    })
    recognizer.setConfirmCallback((progress) => {
      confirmProgress.value = progress
    })
    recognizer.setCandidateCallback((c) => {
      candidate.value = c
    })
    recognizer.setArmChangeCallback((isArmed) => {
      armed.value = isArmed
      if (!isArmed) confirmProgress.value = 0
    })

    loadingText.value = '加载模型中...'
    await recognizer.init(videoRef.value, canvasRef.value)

    loadingText.value = '请求摄像头权限...'
    await recognizer.start()

    loading.value = false
    loadingText.value = ''
  } catch (e) {
    console.error('手势识别初始化失败:', e)
    loading.value = false
    loadingText.value = ''
    initialized = false // 失败后允许重试
    const msg = e.message || String(e)
    if (msg.includes('Permission') || msg.includes('权限') || msg.includes('NotAllowed')) {
      error.value = '摄像头权限被拒绝，请在浏览器设置中允许'
    } else if (msg.includes('NotFound') || msg.includes('找不到') || msg.includes('no video')) {
      error.value = '未检测到摄像头设备'
    } else if (msg.includes('加载失败') || msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
      error.value = '模型加载失败，请检查网络后重试'
    } else {
      error.value = '初始化失败: ' + msg.substring(0, 40)
    }
  }
}

function retryInit() {
  error.value = ''
  initialized = false
  initRecognizer()
}

// 停止摄像头（不销毁实例，保留单例供下次开启复用）
async function stopRecognizer() {
  if (recognizer) {
    try {
      await recognizer.stop()
    } catch (e) {
      console.warn('stop error:', e)
    }
  }
  clearTimeout(firedTimer)
  handDetected.value = false
  candidate.value = { key: null, ratio: 0, armPhase: 'idle', likeOffset: null }
  firedAction.value = ''
  armed.value = false
  confirmProgress.value = 0
  loading.value = false
}

function handleClose() {
  stopRecognizer()
  emit('close')
}

// 拖动
function startDrag(e) {
  if (e.target.classList.contains('hud-close') || e.target.classList.contains('hud-minimize')) return
  const point = e.touches ? e.touches[0] : e
  dragStart = { x: point.clientX, y: point.clientY }
  posStart = { ...pos.value }
  document.addEventListener('mousemove', onDrag)
  document.addEventListener('mouseup', stopDrag)
  document.addEventListener('touchmove', onDrag, { passive: false })
  document.addEventListener('touchend', stopDrag)
}

function onDrag(e) {
  if (!dragStart) return
  e.preventDefault?.()
  const point = e.touches ? e.touches[0] : e
  pos.value = {
    x: Math.max(0, Math.min(window.innerWidth - 180, posStart.x + point.clientX - dragStart.x)),
    y: Math.max(0, Math.min(window.innerHeight - 120, posStart.y + point.clientY - dragStart.y))
  }
}

function stopDrag() {
  dragStart = null
  document.removeEventListener('mousemove', onDrag)
  document.removeEventListener('mouseup', stopDrag)
  document.removeEventListener('touchmove', onDrag)
  document.removeEventListener('touchend', stopDrag)
}

// visible 变化：只启停摄像头，不销毁实例（避免 WASM 单例冲突）
watch(() => props.visible, (val) => {
  if (val) {
    if (!initialized) {
      setTimeout(initRecognizer, 100)
    } else if (recognizer) {
      recognizer.start().catch(e => console.warn('start error:', e))
    }
  } else {
    stopRecognizer()
  }
})

onMounted(() => {
  if (props.visible) {
    setTimeout(initRecognizer, 100)
  }
})

// 组件卸载时才真正销毁实例（只执行一次）
onUnmounted(async () => {
  if (destroyed) return
  destroyed = true
  stopDrag()
  if (recognizer) {
    try {
      await recognizer.destroy()
    } catch (e) {
      console.warn('destroy error:', e)
    }
    recognizer = null
  }
})
</script>

<style scoped>
.gesture-hud {
  position: fixed;
  z-index: 9000;
  width: 180px;
  background: rgba(10, 10, 15, 0.92);
  border: 1px solid rgba(0, 245, 255, 0.3);
  border-radius: 10px;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.5), 0 0 20px rgba(0, 245, 255, 0.1);
  user-select: none;
  cursor: move;
  overflow: hidden;
}

/* 四角装饰 */
.hud-corner {
  position: absolute;
  width: 10px;
  height: 10px;
  border-color: #00f5ff;
  opacity: 0.6;
}
.hud-corner.tl { top: 3px; left: 3px; border-top: 2px solid; border-left: 2px solid; }
.hud-corner.tr { top: 3px; right: 3px; border-top: 2px solid; border-right: 2px solid; }
.hud-corner.bl { bottom: 3px; left: 3px; border-bottom: 2px solid; border-left: 2px solid; }
.hud-corner.br { bottom: 3px; right: 3px; border-bottom: 2px solid; border-right: 2px solid; }

.hud-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 10px;
  border-bottom: 1px solid rgba(0, 245, 255, 0.15);
}

.hud-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-family: 'Courier New', monospace;
  font-size: 10px;
  color: #8a8a9a;
  letter-spacing: 1px;
  text-transform: uppercase;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #555;
  transition: all 0.3s;
}
.status-dot.detected {
  background: #00ff88;
  box-shadow: 0 0 8px #00ff88;
  animation: pulse 1.5s ease-in-out infinite;
}
.status-dot.none {
  background: #ff4444;
  box-shadow: 0 0 8px #ff4444;
}
.status-dot.confirm {
  background: #f9f002;
  box-shadow: 0 0 8px #f9f002;
  animation: pulse 0.5s ease-in-out infinite;
}
.status-dot.loading {
  background: #00f5ff;
  box-shadow: 0 0 8px #00f5ff;
  animation: pulse 0.8s ease-in-out infinite;
}
.status-dot.error {
  background: #ff8800;
  box-shadow: 0 0 8px #ff8800;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.hud-actions {
  display: flex;
  gap: 8px;
}
.hud-minimize, .hud-close {
  cursor: pointer;
  color: #555;
  font-size: 12px;
  transition: color 0.2s;
  line-height: 1;
}
.hud-minimize:hover { color: #00f5ff; }
.hud-close:hover { color: #ff4444; }

.hud-video-wrap {
  position: relative;
  width: 100%;
  height: 120px;
  background: #000;
  overflow: hidden;
}

.hud-video {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  transform: scaleX(-1); /* 镜像 */
  opacity: 0.4;
}

.hud-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  transform: scaleX(-1); /* 镜像 */
}

.hud-confirm-bar {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: rgba(249, 240, 2, 0.2);
}
.hud-confirm-fill {
  height: 100%;
  background: linear-gradient(90deg, #f9f002, #00f5ff);
  transition: width 0.1s linear;
}

.hud-gesture {
  padding: 8px 10px;
  border-top: 1px solid rgba(0, 245, 255, 0.15);
}

.gesture-label {
  font-family: 'Courier New', monospace;
  font-size: 11px;
  color: #00f5ff;
  font-weight: 600;
  margin-bottom: 2px;
  text-shadow: 0 0 6px rgba(0, 245, 255, 0.4);
}

.gesture-action {
  font-size: 10px;
  color: #8a8a9a;
}

/* 两阶段握拳待确认态 */
.hud-gesture.armed {
  background: rgba(249, 240, 2, 0.1);
  box-shadow: inset 0 0 12px rgba(249, 240, 2, 0.15);
}
.hud-gesture.armed .gesture-label {
  color: #f9f002;
  text-shadow: 0 0 6px rgba(249, 240, 2, 0.5);
}
.hud-gesture.armed .gesture-action {
  color: #c9c24a;
}

.hud-mini-status {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 12px;
  cursor: pointer;
}

/* 加载/错误遮罩 */
.hud-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  z-index: 10;
}

.hud-overlay.error {
  background: rgba(20, 5, 0, 0.9);
}

.hud-spinner {
  width: 24px;
  height: 24px;
  border: 2px solid rgba(0, 245, 255, 0.2);
  border-top-color: #00f5ff;
  border-radius: 50%;
  animation: hudSpin 0.8s linear infinite;
}

@keyframes hudSpin {
  to { transform: rotate(360deg); }
}

.hud-overlay-icon {
  font-size: 20px;
}

.hud-overlay-text {
  font-size: 10px;
  color: #aaa;
  text-align: center;
  padding: 0 8px;
  line-height: 1.4;
}

.hud-overlay.error .hud-overlay-text {
  color: #ffaa66;
}

.hud-retry-btn {
  margin-top: 4px;
  padding: 4px 12px;
  background: rgba(0, 245, 255, 0.15);
  border: 1px solid rgba(0, 245, 255, 0.4);
  border-radius: 4px;
  color: #00f5ff;
  font-size: 10px;
  cursor: pointer;
  transition: all 0.2s;
}
.hud-retry-btn:hover {
  background: rgba(0, 245, 255, 0.25);
}
</style>
