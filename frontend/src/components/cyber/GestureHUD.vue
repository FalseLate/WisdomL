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
      <canvas ref="canvasRef" class="hud-canvas" width="176" height="132"></canvas>
      <!-- 加载中遮罩 -->
      <div v-if="loading" class="hud-overlay">
        <div class="hud-spinner"></div>
        <div class="hud-overlay-text">{{ loadingText }}</div>
      </div>
      <!-- 错误遮罩 -->
      <div v-if="channelError" class="hud-overlay error">
        <div class="hud-overlay-icon">⚠️</div>
        <div class="hud-overlay-text">{{ channelError }}</div>
        <button class="hud-retry-btn" @click.stop="retryChannels">重试</button>
      </div>
      <!-- 确认进度条（两阶段握拳） -->
      <div v-if="st.hand.progress > 0" class="hud-confirm-bar">
        <div class="hud-confirm-fill" :style="{ width: st.hand.progress + '%' }"></div>
      </div>
      <!-- 无通道提示 -->
      <div v-if="!anyChannel && !loading && !channelError" class="hud-overlay">
        <div class="hud-overlay-text">未开启感知通道\n请在「无障碍设置」中开启 手/头/臂</div>
      </div>
    </div>

    <!-- 三通道状态灯 + 步进选答提示 -->
    <div v-show="!minimized" class="hud-gesture" :class="{ armed: st.hand.armPhase === 'armed' }">
      <div class="lamp-row">
        <span class="lamp" :class="lampClass('hand')">手</span>
        <span class="lamp" :class="lampClass('head')">头</span>
        <span class="lamp" :class="lampClass('arm')">臂</span>
        <span v-if="debugOn && st.hand.on && st.hand.detected" class="lamp-ratio">稳定{{ Math.round(st.hand.ratio * 100) }}%</span>
      </div>
      <div class="gesture-label">{{ currentGestureText }}</div>
      <div v-if="headDebug" class="hud-debug">{{ headDebug }}</div>
      <div v-if="faceDebug" class="hud-debug">{{ faceDebug }}</div>
      <div class="gesture-action" :class="{ fired: !!firedAction }">{{ currentActionText }}</div>
    </div>

    <!-- 最小化时只显示状态点 -->
    <div v-if="minimized" class="hud-mini-status" @click.stop="minimized = false">
      <span class="status-dot" :class="statusClass"></span>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted, onUnmounted } from 'vue'
import { getRuntime } from '../../a11y/runtime.js'
import { loadSettings, onSettingsChange } from '../../a11y/settings.js'

const props = defineProps({
  visible: { type: Boolean, default: false }
})

const emit = defineEmits(['close'])

const { bus, manager } = getRuntime()
const canvasRef = ref(null)

const st = reactive({
  hand: { on: false, detected: false, candidate: null, firedGesture: null, ratio: 0, armPhase: 'idle', progress: 0 },
  head: { on: false, detected: false, candidate: null, firedGesture: null, angles: null, offscreen: false, debug: null },
  arm: { on: false, detected: false, candidate: null, firedGesture: null }
})
const firedAction = ref('')
const channelError = ref('')
const minimized = ref(false)
// 判定诊断（俯仰/峰/阈/速…）默认隐藏：数字一直跳动对用户无意义还占渲染，只在设置里按需打开
const debugOn = ref(false)
const loading = ref(false)
const loadingText = ref('')
let firedTimer = null
let drawRaf = null
let unsubBus = null

const anyChannel = computed(() => st.hand.on || st.head.on || st.arm.on)

const statusClass = computed(() => {
  if (loading.value) return 'loading'
  if (channelError.value) return 'error'
  if (st.hand.armPhase === 'armed' || st.hand.progress > 0) return 'confirm'
  if (!anyChannel.value) return 'none'
  return (st.hand.detected || st.head.detected || st.arm.detected) ? 'detected' : 'none'
})

const statusText = computed(() => {
  if (loading.value) return loadingText.value || '加载中...'
  if (channelError.value) return '通道异常'
  if (st.hand.armPhase === 'armed') return '待确认'
  if (!anyChannel.value) return '通道未开启'
  return '识别中'
})

function lampClass(ch) {
  const s = st[ch]
  if (!s.on) return ''
  return s.detected ? 'on hot' : 'on'
}

// 候选文案：手（沿用）+ 头 + 臂
const candidateMap = {
  'select:A': '伸1指 → 选A', 'select:B': '伸2指 → 选B', 'select:C': '伸3指 → 选C', 'select:D': '伸4指 → 选D',
  'clear': '五指张开 → 清空', 'prev': '点赞偏左 → 上一题', 'next': '点赞偏右 → 下一题',
  'fist': '握拳保持中…（拇指要收回贴掌）',
  'submit-arm': '松手后再握拳 = 确认提交',
  'turnLeft': '左扭头', 'turnRight': '右扭头',
  'nod': '点头 ✓', 'lookUp': '抬头', 'shake': '摇头', 'mouthOpen': '张嘴 ✓', 'smile': '微笑 ✓',
  'elbowUp:left': '左举肘', 'elbowUp:right': '右举肘', 'handsUp': '变身姿势', 'sweep': '横扫'
}
// 识别成功的手势名（下面那行回显用）
const gestureWords = {
  'select:A': '伸1指', 'select:B': '伸2指', 'select:C': '伸3指', 'select:D': '伸4指',
  clear: '五指张开', prev: '点赞偏左', next: '点赞偏右', fist: '握拳',
  'submit-arm': '握拳待确认', submit: '提交手势',
  turnLeft: '左扭头', turnRight: '右扭头',
  nod: '点头', lookUp: '抬头', shake: '摇头', mouthOpen: '张嘴', smile: '微笑',
  'elbowUp:left': '左举肘', 'elbowUp:right': '右举肘', handsUp: '双手过头', sweep: '横扫'
}
const actionMap = {
  selectA: '✓ 已选择 A', selectB: '✓ 已选择 B', selectC: '✓ 已选择 C', selectD: '✓ 已选择 D',
  clear: '✓ 已清空重选', prev: '← 上一题', next: '下一题 →',
  'submit-arm': '再次握拳 = 确认提交', submit: '正在提交整卷…',
  optNext: '→ 下一选项', optPrev: '← 上一选项', confirm: '✓ 确认选中', undo: '↺ 已撤销', cancel: '已取消'
}

const currentGestureText = computed(() => {
  const c = st.hand.candidate || st.head.candidate || st.arm.candidate
  if (c) return candidateMap[c] || '识别中…'
  if (anyChannel.value) return '等待手势...'
  return '等待手势...'
})

// 下面一行：识别成功的手势 -> 落到的动作
const currentActionText = computed(() => {
  if (firedAction.value) return firedAction.value
  if (st.hand.on && st.hand.detected && st.hand.candidate === 'fist') return '保持 1.5 秒进入待确认'
  return '等待手势触发'
})

// 俯仰判定链：显示真正参与判定的相对值/峰值/速度，哪道门拦住的肉眼可见
const headDebug = computed(() => {
  const d = st.head.debug
  if (!st.head.on || !d) return ''
  const exc = d.excOpen ? ' 开口' : ''
  return `俯仰${d.pitchRel ?? '—'}° 峰${d.peak ?? 0}° 阈${d.thresh ?? 5}° 速${d.vel ?? 0}|${d.meanVel ?? 0}${exc}`
})

const faceDebug = computed(() => {
  const d = st.head.debug
  if (!st.head.on || !d) return ''
  return `源${d.src || '矩阵'} 矩${d.pitchMat}° 几${d.geo ?? '—'} 嘴${d.jaw ?? '—'} 笑${d.smile ?? '—'}`
})

// ============ 通道同步：设置变化/挂载时按开关 open/close（开哪条加载哪条模型） ============
async function syncChannels() {
  if (!props.visible) return
  const all = loadSettings()
  debugOn.value = !!all.feedback.debug
  const s = all.channels
  loading.value = true
  loadingText.value = '加载模型/请求摄像头...'
  channelError.value = ''
  const errs = []
  for (const name of ['hand', 'head', 'arm']) {
    try {
      if (s[name] && !manager.channels.has(name)) await manager.open(name)
      else if (!s[name] && manager.channels.has(name)) await manager.close(name)
    } catch (e) {
      errs.push(`${name}: ${e.message}`)
    }
  }
  loading.value = false
  if (errs.length) {
    const msg = errs.join('；')
    channelError.value = msg.includes('Permission') || msg.includes('NotAllowed') || msg.includes('权限')
      ? '摄像头权限被拒绝，请在浏览器设置中允许'
      : ('通道启动失败: ' + msg.substring(0, 60))
  }
}

function retryChannels() {
  channelError.value = ''
  syncChannels()
}

async function closeAllChannels() {
  for (const name of ['hand', 'head', 'arm']) {
    try { await manager.close(name) } catch { /* noop */ }
  }
}

// ============ 画面绘制：镜像视频帧 + 三套骨架（霓虹风格沿用原 HUD） ============
const HAND_CONN = [
  [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20], [0, 17]
]
const POSE_CONN = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16]]
const FACE_IDX = [1, 10, 33, 133, 263, 362, 61, 291, 152, 17, 269]

function drawLoop() {
  const cv = canvasRef.value
  if (cv) {
    const ctx = cv.getContext('2d')
    const w = cv.width, h = cv.height
    ctx.save()
    ctx.clearRect(0, 0, w, h)
    ctx.translate(w, 0)
    ctx.scale(-1, 1)
    const video = manager.videoEl
    if (video && video.srcObject && video.readyState >= 2) {
      ctx.globalAlpha = 0.4   // 旧版视频底透明度
      ctx.drawImage(video, 0, 0, w, h)
      ctx.globalAlpha = 1
    } else {
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, w, h)
    }
    const d = manager.latestDraw
    // 旧版霓虹配色：青色描边发光 + 品红关键点发光
    if (st.hand.on) drawSet(ctx, d.hand, HAND_CONN, w, h)
    if (st.head.on) drawSet(ctx, d.face ? FACE_IDX.map(i => d.face[i]).filter(Boolean) : null, null, w, h)
    if (st.arm.on) drawSet(ctx, d.pose ? pickPose(d.pose) : null, POSE_CONN_IDX, w, h)
    ctx.restore()
  }
  drawRaf = requestAnimationFrame(drawLoop)
}

const POSE_IDX = [11, 12, 13, 14, 15, 16]
const POSE_CONN_IDX = [[0, 1], [0, 2], [2, 4], [1, 3], [3, 5]]
function pickPose(pose) { return POSE_IDX.map(i => pose[i]).filter(Boolean) }

function drawSet(ctx, pts, conn, w, h) {
  if (!pts || !pts.length) return
  ctx.strokeStyle = '#00f5ff'
  ctx.lineWidth = 2
  ctx.shadowColor = '#00f5ff'
  ctx.shadowBlur = 4
  if (conn) {
    for (const [a, b] of conn) {
      if (!pts[a] || !pts[b]) continue
      ctx.beginPath()
      ctx.moveTo(pts[a].x * w, pts[a].y * h)
      ctx.lineTo(pts[b].x * w, pts[b].y * h)
      ctx.stroke()
    }
  }
  ctx.fillStyle = '#ff00ff'
  ctx.shadowColor = '#ff00ff'
  for (const p of pts) {
    ctx.beginPath()
    ctx.arc(p.x * w, p.y * h, 2, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.shadowBlur = 0
}

// 位置（可拖动，沿用原实现）
const pos = ref({ x: 20, y: 100 })
let dragStart = null
let posStart = null

function startDrag(e) {
  if (e.target.classList.contains('hud-close') || e.target.classList.contains('hud-minimize') ||
      e.target.classList.contains('hud-retry-btn')) return
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
    x: Math.max(0, Math.min(window.innerWidth - 190, posStart.x + point.clientX - dragStart.x)),
    y: Math.max(0, Math.min(window.innerHeight - 140, posStart.y + point.clientY - dragStart.y))
  }
}

function stopDrag() {
  dragStart = null
  document.removeEventListener('mousemove', onDrag)
  document.removeEventListener('mouseup', stopDrag)
  document.removeEventListener('touchmove', onDrag)
  document.removeEventListener('touchend', stopDrag)
}

function handleClose() {
  closeAllChannels()
  emit('close')
}

let unsubSettings = null

watch(() => props.visible, (val) => {
  if (val) syncChannels()
  else closeAllChannels()
})

onMounted(() => {
  manager.onState = (s) => {
    Object.assign(st.hand, s.hand)
    Object.assign(st.head, s.head)
    Object.assign(st.arm, s.arm)
  }
  unsubBus = bus.on((evt) => {
    // 手势名直接读 manager 的实时状态：st 是每帧同步的副本，emit 时还是上一帧的值
    const src = manager.state[evt.source]
    const raw = src && src.firedGesture
    const g = raw ? (gestureWords[raw] || raw) : ''
    const a = actionMap[evt.action] || evt.action
    firedAction.value = g ? `✓ ${g} → ${a.replace(/^[✓→←]+\s*/, '')}` : `✓ ${a}`
    clearTimeout(firedTimer)
    firedTimer = setTimeout(() => { firedAction.value = '' }, 2000)
  })
  unsubSettings = onSettingsChange(() => syncChannels())
  drawRaf = requestAnimationFrame(drawLoop)
  if (props.visible) syncChannels()
})

onUnmounted(() => {
  cancelAnimationFrame(drawRaf)
  clearTimeout(firedTimer)
  if (unsubBus) unsubBus()
  if (unsubSettings) unsubSettings()
  stopDrag()
  closeAllChannels()
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
.status-dot.detected { background: #00ff88; box-shadow: 0 0 8px #00ff88; animation: pulse 1.5s ease-in-out infinite; }
.status-dot.none { background: #ff4444; box-shadow: 0 0 8px #ff4444; }
.status-dot.confirm { background: #f9f002; box-shadow: 0 0 8px #f9f002; animation: pulse 0.5s ease-in-out infinite; }
.status-dot.loading { background: #00f5ff; box-shadow: 0 0 8px #00f5ff; animation: pulse 0.8s ease-in-out infinite; }
.status-dot.error { background: #ff8800; box-shadow: 0 0 8px #ff8800; }

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.hud-actions { display: flex; gap: 8px; }
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
  height: 132px;
  background: #000;
  overflow: hidden;
}

.hud-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
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

.lamp-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}
.lamp {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 9px;
  color: #555;
  font-family: 'Courier New', monospace;
}
.lamp::before {
  content: '';
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #333;
  border: 1px solid #555;
}
.lamp.on { color: #8a8a9a; }
.lamp.on::before { background: #f9f002; border-color: #f9f002; box-shadow: 0 0 6px #f9f002; }
.lamp.hot::before { background: #00ff88; border-color: #00ff88; box-shadow: 0 0 6px #00ff88; }
.lamp-ratio { margin-left: auto; font-size: 9px; color: #8a8a9a; font-variant-numeric: tabular-nums; }

.gesture-label {
  font-family: 'Courier New', monospace;
  font-size: 11px;
  color: #00f5ff;
  font-weight: 600;
  margin-bottom: 2px;
  text-shadow: 0 0 6px rgba(0, 245, 255, 0.4);
}

.hud-debug {
  font-size: 9px;
  color: #6a7a8a;
  font-family: 'Courier New', monospace;
  margin-bottom: 2px;
  font-variant-numeric: tabular-nums;
}

.gesture-action {
  font-size: 10px;
  color: #8a8a9a;
}

.hud-gesture.armed {
  background: rgba(249, 240, 2, 0.1);
  box-shadow: inset 0 0 12px rgba(249, 240, 2, 0.15);
}
.hud-gesture.armed .gesture-label { color: #f9f002; text-shadow: 0 0 6px rgba(249, 240, 2, 0.5); }
.hud-gesture.armed .gesture-action { color: #c9c24a; }

.hud-mini-status {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 12px;
  cursor: pointer;
}

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
.hud-overlay.error { background: rgba(20, 5, 0, 0.9); }

.hud-spinner {
  width: 24px;
  height: 24px;
  border: 2px solid rgba(0, 245, 255, 0.2);
  border-top-color: #00f5ff;
  border-radius: 50%;
  animation: hudSpin 0.8s linear infinite;
}
@keyframes hudSpin { to { transform: rotate(360deg); } }

.hud-overlay-icon { font-size: 20px; }

.hud-overlay-text {
  font-size: 10px;
  color: #aaa;
  text-align: center;
  padding: 0 8px;
  line-height: 1.4;
  white-space: pre-line;
}
.hud-overlay.error .hud-overlay-text { color: #ffaa66; }

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
.hud-retry-btn:hover { background: rgba(0, 245, 255, 0.25); }

/* 识别成功的手势：绿色霓虹强调 */
.gesture-action.fired {
  color: #00ff88;
  font-weight: 700;
  text-shadow: 0 0 8px rgba(0, 255, 136, 0.55);
}

/* 手机端：整体收缩，触控区放大 */
@media (max-width: 560px) {
  .gesture-hud { width: 150px; }
  .hud-video-wrap { height: 112px; }
  .hud-header { padding: 8px 10px; }
  .hud-minimize, .hud-close { font-size: 16px; padding: 4px; }
  .gesture-label { font-size: 10px; }
  .hud-debug { font-size: 8px; line-height: 1.35; }
  .gesture-action { font-size: 10px; }
}
</style>
