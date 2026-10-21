<template>
  <div
    v-if="visible"
    ref="hudRef"
    class="gesture-hud"
    :class="{ minimized }"
    :style="{ left: pos.x + 'px', top: pos.y + 'px', width: size.w + 'px' }"
  >
    <!-- HUD 边框装饰 -->
    <div class="hud-corner tl"></div>
    <div class="hud-corner tr"></div>
    <div class="hud-corner bl"></div>
    <div class="hud-corner br"></div>

    <!-- 标题栏（拖动只在这里起手，避免和缩放/按钮抢事件） -->
    <div class="hud-header" @pointerdown="startDrag">
      <div class="hud-title">
        <span class="status-dot" :class="statusClass"></span>
        <span>{{ statusText }}</span>
      </div>
      <div class="hud-actions">
        <span class="hud-minimize" @click.stop="toggleMinimize">{{ minimized ? '▢' : '—' }}</span>
        <span class="hud-close" @click.stop="handleClose">✕</span>
      </div>
    </div>

    <!-- 视频+画布区域 -->
    <div v-show="!minimized" class="hud-video-wrap" :style="{ height: videoH + 'px' }">
      <canvas ref="canvasRef" class="hud-canvas" :width="canvasW" :height="canvasH"></canvas>
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
    <div v-if="minimized" class="hud-mini-status" @click.stop="toggleMinimize">
      <span class="status-dot" :class="statusClass"></span>
    </div>

    <!-- 右下角缩放手把（pointer 事件，鼠标与触摸通用） -->
    <div
      v-show="!minimized"
      class="hud-resize"
      aria-label="拖动调整小窗大小"
      title="拖动调整大小"
      @pointerdown.stop="startResize"
    ></div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { getRuntime } from '../../a11y/runtime.js'
import { loadSettings, onSettingsChange } from '../../a11y/settings.js'
import { canvasColor } from '../../utils/themeAssets.js'

const props = defineProps({
  visible: { type: Boolean, default: false }
})

const emit = defineEmits(['close'])

const { bus, manager } = getRuntime()
const canvasRef = ref(null)

const st = reactive({
  hand: { on: false, detected: false, candidate: null, firedGesture: null, ratio: 0, armPhase: 'idle', progress: 0, remainMs: null },
  head: { on: false, detected: false, candidate: null, firedGesture: null, angles: null, offscreen: false, debug: null },
  arm: { on: false, detected: false, candidate: null, firedGesture: null }
})
const firedAction = ref('')
const channelError = ref('')
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

// 两阶段握拳全程把"下一步该做什么"顶在最显眼的一行，并显出剩余秒数（真机反馈：不知道窗口还剩多久）
const armHint = computed(() => {
  const p = st.hand.armPhase
  const left = st.hand.remainMs != null ? `（剩 ${(st.hand.remainMs / 1000).toFixed(1)} 秒）` : ''
  if (p === 'arm1') return `第一握保持中 ${Math.round(st.hand.progress)}%`
  if (p === 'armed') return '✓ 第一握完成，张开手'
  if (p === 'arm2') return st.hand.progress >= 99
    ? `✋ 再握拳 = 提交整卷${left}`
    : `第二握 ${Math.round(st.hand.progress)}%…${left}`
  return ''
})

const currentGestureText = computed(() => {
  if (armHint.value) return armHint.value
  const c = st.hand.candidate || st.head.candidate || st.arm.candidate
  if (c) return candidateMap[c] || '识别中…'
  if (anyChannel.value) return '等待手势...'
  return '等待手势...'
})

// 下面一行：识别成功的手势 -> 落到的动作
const currentActionText = computed(() => {
  if (firedAction.value) return firedAction.value
  if (st.hand.armPhase === 'armed') return '松开手后 6 秒内再握一次，摇头或 Esc 取消'
  if (st.hand.armPhase === 'arm2') return st.hand.progress >= 99 ? '现在再握拳，握紧不放直到进度满' : '握紧别松，松手就要重新来'
  if (st.hand.armPhase === 'arm1') return '握满 1.5 秒才进入待确认，不会直接提交'
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
// 模型初始化要几秒，用户往往在这期间就切走了页面。HUD 实例死亡后必须停止继续 open，
// 否则 ChannelManager 单例会带着三路推理和摄像头在后台永跑（整站卡顿）。
let hudAlive = false

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
    if (!hudAlive) break
    try {
      if (s[name] && !manager.channels.has(name)) await manager.open(name)
      else if (!s[name] && manager.channels.has(name)) await manager.close(name)
    } catch (e) {
      errs.push(`${name}: ${e.message}`)
    }
  }
  if (!hudAlive) { manager.closeAll(); return }
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

function closeAllChannels() {
  return manager.closeAll()
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
  // 背衬按 dpr 放大后，线宽/点径要同比放大，否则缩放大窗时骨架会变细
  const s = dpr
  // 骨架色来自 token：视口里是摄像头画面（永远偏暗），所以浅色主题反而给更亮的青/品红，
  // 由 tokens-light.css 的 --hud-skel-* 决定，这里不写死
  const line = canvasColor('--hud-skel-line')
  const joint = canvasColor('--hud-skel-joint')
  ctx.strokeStyle = line
  ctx.lineWidth = 2 * s
  ctx.shadowColor = line
  ctx.shadowBlur = 4 * s
  if (conn) {
    for (const [a, b] of conn) {
      if (!pts[a] || !pts[b]) continue
      ctx.beginPath()
      ctx.moveTo(pts[a].x * w, pts[a].y * h)
      ctx.lineTo(pts[b].x * w, pts[b].y * h)
      ctx.stroke()
    }
  }
  ctx.fillStyle = joint
  ctx.shadowColor = joint
  for (const p of pts) {
    ctx.beginPath()
    ctx.arc(p.x * w, p.y * h, 2 * s, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.shadowBlur = 0
}

// ============ 布局：可拖拽 + 右下角自由缩放，位置/尺寸/最小化态记忆 ============
const LAYOUT_KEY = 'lazy_hud_layout_v1'
const hudRef = ref(null)
// tsParticles 之外这里也要限 DPR：3 倍屏按 3 倍背衬绘制，HUD 只是预览小窗，2 足够
const dpr = Math.min(window.devicePixelRatio || 1, 2)
const MIN_W = 150
const maxW = () => Math.max(MIN_W, Math.min(420, window.innerWidth - 24))

function defaultW() {
  return window.innerWidth <= 560 ? 150 : 180
}

const size = ref({ w: defaultW() })
const pos = ref({ x: 20, y: 100 })
const minimized = ref(false)

const videoH = computed(() => Math.round(size.value.w * 0.75))   // 跟随原 176:132 比例
const canvasW = computed(() => Math.max(1, Math.round((size.value.w - 4) * dpr)))
const canvasH = computed(() => Math.max(1, Math.round(videoH.value * dpr)))

function loadLayout() {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY)
    if (!raw) return
    const l = JSON.parse(raw)
    if (Number.isFinite(l.w)) size.value = { w: Math.min(Math.max(l.w, MIN_W), maxW()) }
    if (Number.isFinite(l.x) && Number.isFinite(l.y)) pos.value = { x: l.x, y: l.y }
    if (typeof l.min === 'boolean') minimized.value = l.min
  } catch { /* 存档坏了就用默认值 */ }
  clampPos()
}

function saveLayout() {
  try {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify({ x: pos.value.x, y: pos.value.y, w: size.value.w, min: minimized.value }))
  } catch { /* 隐私模式忽略 */ }
}

function clampPos() {
  const h = hudRef.value?.getBoundingClientRect().height || 300
  pos.value = {
    x: Math.min(Math.max(pos.value.x, 4), Math.max(4, window.innerWidth - size.value.w - 4)),
    y: Math.min(Math.max(pos.value.y, 4), Math.max(4, window.innerHeight - h - 4))
  }
}

// pointer 事件统一鼠标与触摸；拖动只在标题栏，缩放只在右下角手把
let gesture = null

function startDrag(e) {
  if (e.target.classList.contains('hud-close') || e.target.classList.contains('hud-minimize')) return
  beginGesture('drag', e)
}

function startResize(e) {
  beginGesture('resize', e)
}

function beginGesture(mode, e) {
  gesture = {
    mode,
    sx: e.clientX, sy: e.clientY,
    w0: size.value.w,
    x0: pos.value.x, y0: pos.value.y
  }
  try { e.currentTarget.setPointerCapture?.(e.pointerId) } catch { /* 合成事件/指针已失效时忽略 */ }
  window.addEventListener('pointermove', onGestureMove)
  window.addEventListener('pointerup', endGesture)
  window.addEventListener('pointercancel', endGesture)
}

function onGestureMove(e) {
  if (!gesture) return
  e.preventDefault?.()
  if (gesture.mode === 'drag') {
    pos.value = { x: gesture.x0 + (e.clientX - gesture.sx), y: gesture.y0 + (e.clientY - gesture.sy) }
    clampPos()
  } else {
    size.value = { w: Math.min(Math.max(gesture.w0 + (e.clientX - gesture.sx), MIN_W), maxW()) }
  }
}

function endGesture() {
  gesture = null
  window.removeEventListener('pointermove', onGestureMove)
  window.removeEventListener('pointerup', endGesture)
  window.removeEventListener('pointercancel', endGesture)
  clampPos()
  saveLayout()
  // 视频高度随宽度联动，本次手势造成的重排还没发生：重排后再钳一次，避免底部溢出视口
  nextTick(() => requestAnimationFrame(clampPos))
}

function toggleMinimize() {
  minimized.value = !minimized.value
  saveLayout()
}

let resizeRaf = 0
function onWindowResize() {
  if (resizeRaf) return
  resizeRaf = requestAnimationFrame(() => {
    resizeRaf = 0
    if (size.value.w > maxW()) size.value = { w: maxW() }
    clampPos()
  })
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
  hudAlive = true
  loadLayout()
  window.addEventListener('resize', onWindowResize)
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
    firedTimer = setTimeout(() => { firedAction.value = '' }, 3200)
  })
  unsubSettings = onSettingsChange(() => syncChannels())
  drawRaf = requestAnimationFrame(drawLoop)
  if (props.visible) syncChannels()
})

onUnmounted(() => {
  hudAlive = false
  // manager 是模块单例，路由切换不销毁它；这里不清空回调，泄漏的帧循环会每帧写死组件的 reactive
  manager.onState = () => {}
  cancelAnimationFrame(drawRaf)
  clearTimeout(firedTimer)
  if (resizeRaf) cancelAnimationFrame(resizeRaf)
  if (unsubBus) unsubBus()
  if (unsubSettings) unsubSettings()
  endGesture()
  window.removeEventListener('resize', onWindowResize)
  closeAllChannels()
})
</script>

<style scoped>
.gesture-hud {
  position: fixed;
  /* 低于 Vant 弹层基准 2000：提交确认框/toast 必须能盖住 HUD，否则小窗会挡住弹窗（v8.1 教训） */
  z-index: 1500;
  /* 宽度由内联 style 控制（可拖右下角缩放并记忆） */
  background: rgb(var(--ink-rgb) / 0.92);
  border: 1px solid rgb(var(--accent-rgb) / 0.3);
  border-radius: 10px;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  box-shadow: var(--hud-shadow);
  user-select: none;
  overflow: hidden;
}

/* 右下角缩放手把：pointer 事件 + touch-action:none 防拖动手势被浏览器抢走 */
.hud-resize {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 18px;
  height: 18px;
  cursor: nwse-resize;
  touch-action: none;
  background:
    linear-gradient(135deg, transparent 0 50%, rgb(var(--accent-rgb) / 0.55) 50% 60%, transparent 60% 72%,
      rgb(var(--accent-rgb) / 0.55) 72% 82%, transparent 82%);
}

.hud-corner {
  position: absolute;
  width: 10px;
  height: 10px;
  border-color: var(--accent);
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
  border-bottom: 1px solid rgb(var(--accent-rgb) / 0.15);
  cursor: move;
  touch-action: none;
}

.hud-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-family: 'Courier New', monospace;
  font-size: 10px;
  color: var(--text-secondary);
  letter-spacing: 1px;
  text-transform: uppercase;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--hud-dim);
  transition: all 0.3s;
}
.status-dot.detected { background: var(--success); box-shadow: 0 0 8px var(--success); animation: pulse 1.5s ease-in-out infinite; }
.status-dot.none { background: var(--danger); box-shadow: 0 0 8px var(--danger); }
.status-dot.confirm { background: var(--warning); box-shadow: 0 0 8px var(--warning); animation: pulse 0.5s ease-in-out infinite; }
.status-dot.loading { background: var(--accent); box-shadow: 0 0 8px var(--accent); animation: pulse 0.8s ease-in-out infinite; }
.status-dot.error { background: var(--hud-error); box-shadow: 0 0 8px var(--hud-error); }

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.hud-actions { display: flex; gap: 8px; }
.hud-minimize, .hud-close {
  cursor: pointer;
  color: var(--hud-dim);
  font-size: 12px;
  transition: color 0.2s;
  line-height: 1;
}
.hud-minimize:hover { color: var(--accent); }
.hud-close:hover { color: var(--danger); }

.hud-video-wrap {
  position: relative;
  width: 100%;
  /* 高度由内联 style 按宽度 3:4 比例控制 */
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
  background: rgb(var(--warning-rgb) / 0.2);
}
.hud-confirm-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--warning), var(--accent));
  transition: width 0.1s linear;
}

.hud-gesture {
  padding: 8px 10px;
  border-top: 1px solid rgb(var(--accent-rgb) / 0.15);
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
  color: var(--hud-dim);
  font-family: 'Courier New', monospace;
}
.lamp::before {
  content: '';
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--hud-off);
  border: 1px solid var(--hud-dim);
}
.lamp.on { color: var(--text-secondary); }
.lamp.on::before { background: var(--warning); border-color: var(--warning); box-shadow: 0 0 6px var(--warning); }
.lamp.hot::before { background: var(--success); border-color: var(--success); box-shadow: 0 0 6px var(--success); }
.lamp-ratio { margin-left: auto; font-size: 9px; color: var(--text-secondary); font-variant-numeric: tabular-nums; }

.gesture-label {
  font-family: 'Courier New', monospace;
  font-size: 11px;
  color: var(--accent);
  font-weight: 600;
  margin-bottom: 2px;
  text-shadow: 0 0 6px rgb(var(--accent-rgb) / 0.4);
}

.hud-debug {
  font-size: 9px;
  color: var(--hud-debug-text);
  font-family: 'Courier New', monospace;
  margin-bottom: 2px;
  font-variant-numeric: tabular-nums;
}

.gesture-action {
  font-size: 10px;
  color: var(--text-secondary);
}

.hud-gesture.armed {
  background: rgb(var(--warning-rgb) / 0.1);
  box-shadow: inset 0 0 12px rgb(var(--warning-rgb) / 0.15);
}
.hud-gesture.armed .gesture-label { color: var(--warning); text-shadow: 0 0 6px rgb(var(--warning-rgb) / 0.5); }
.hud-gesture.armed .gesture-action { color: var(--hud-armed-text); }

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
  border: 2px solid rgb(var(--accent-rgb) / 0.2);
  border-top-color: var(--accent);
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
  background: rgb(var(--accent-rgb) / 0.15);
  border: 1px solid rgb(var(--accent-rgb) / 0.4);
  border-radius: 4px;
  color: var(--accent);
  font-size: 10px;
  cursor: pointer;
  transition: all 0.2s;
}
.hud-retry-btn:hover { background: rgb(var(--accent-rgb) / 0.25); }

/* 识别成功的手势：绿色霓虹强调，入场脉冲一下，避免"一闪而过看不见" */
.gesture-action.fired {
  color: var(--success);
  font-size: 12px;
  font-weight: 700;
  text-shadow: 0 0 8px rgb(var(--success-rgb) / 0.55);
  animation: firedPop 0.35s var(--ease-out, ease-out);
}
@keyframes firedPop {
  0% { transform: scale(0.86); opacity: 0.2; }
  60% { transform: scale(1.06); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}

/* 两阶段握拳进行中：整块黄底呼吸，提示不可能被忽略 */
.hud-gesture.armed .gesture-label {
  animation: armBreath 0.9s ease-in-out infinite;
}
@keyframes armBreath {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.55; }
}

/* 手机端：整体收缩，触控区放大 */
/* 手机端：只放大触控区，尺寸本身交给用户拖拽（写死会把缩放结果打回去） */
@media (max-width: 560px) {
  .hud-header { padding: 8px 10px; }
  .hud-minimize, .hud-close { font-size: 16px; padding: 4px; }
  .gesture-label { font-size: 10px; }
  .hud-debug { font-size: 8px; line-height: 1.35; }
  .gesture-action { font-size: 10px; }
  .hud-resize { width: 26px; height: 26px; }
}
</style>
