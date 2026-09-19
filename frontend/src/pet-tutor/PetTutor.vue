<template>
  <div class="pet-world" @pointerdown.capture="onPetAreaPointerDown">
    <!-- 桌宠层：只装人物，拖动/滚轮缩放；滚轮挂在 pet-holder 上不影响对话框文字 -->
    <div class="pet-combo" ref="comboRef" :style="comboStyle">
      <div class="pet-holder" ref="holderRef" :style="petScale" @wheel.prevent="onWheelZoom">
        <VirtualHuman ref="avatarRef" :model-url="modelUrl" @clicked="onAvatarClicked" @drag-move="onPetDrag" />
      </div>
    </div>

    <!-- 聊天面板：独立悬浮窗，不与人物绑定——拖标题栏移动、滚轮（标题栏上）缩放、位置大小记忆 -->
    <transition name="drawer">
      <div v-show="chatOpen" class="chat-drawer" :style="chatStyle">
        <div class="chat-container">
        <div class="chat-head" @pointerdown.prevent="onChatDragDown" @pointermove="onChatDragMove"
             @pointerup="onChatDragUp" @pointercancel="onChatDragUp" @wheel.prevent="onChatWheel">
          <h2>AI 英语口语教练</h2>
          <div class="head-actions">
            <button class="chat-zoom" title="缩小" @pointerdown.stop @click="zoomChat(-1)">➖</button>
            <button class="chat-zoom" title="放大" @pointerdown.stop @click="zoomChat(1)">➕</button>
            <button class="chat-close" title="收起" @pointerdown.stop @click="chatOpen = false">✕</button>
          </div>
        </div>
    <div class="chat-box" ref="chatBoxRef">
      <div v-for="(msg, index) in messages" :key="index" :class="['msg', msg.role]">
        <span class="role">{{ msg.role === 'user' ? '我' : 'AI' }}</span>
        <span class="content" :class="{ typing: msg.streaming }">{{ msg.text }}</span>
      </div>
    </div>
    <div class="input-area">
      <!-- 翻译模式标签：显示中点击可切回口语练习 -->
      <button v-if="mode === 'translate'" class="mode-chip"
              title="当前为翻译模式，点击切回口语练习"
              @click="mode = 'chat'">
        🔤 翻译 ✕
      </button>
      <!-- 按住说话（ASR）：翻译模式下隐藏（翻译打字/粘贴即可） -->
      <button v-if="mode !== 'translate'" class="mic-btn" :class="{ recording, busy: transcribing }"
              :disabled="loading" title="按住说话，松开转文字"
              @pointerdown.prevent="micDown" @pointerup.prevent="micUp" @pointerleave="micUp">
        {{ transcribing ? '✍️' : '🎤' }}
      </button>
      <input ref="inputRef" v-model="inputText" @keyup.enter="sendChat" :placeholder="mode === 'translate' ? '【翻译模式】翻译中英文句子（点左侧标签切回口语练习）' : '输入英文，回车发送...（或按住左边麦克风说话）'" :disabled="loading" />
      <button @click="sendChat" :disabled="loading">
        {{ loading ? '思考中...' : '发送' }}
      </button>
    </div>
    <div class="debug-bar">
      <label>
        <input type="checkbox" v-model="mockMode" />
        Mock 模式（跳过大模型，调试链路）
      </label>
      <select v-model="characterId" class="char-select" title="角色音色">
        <option v-for="v in voices" :key="v.id" :value="v.id">{{ v.label }}</option>
        <option v-if="voices.length === 0" value="jenny">（音色列表未加载）</option>
      </select>
    </div>        </div>
      </div>
    </transition>

    <!-- 点击角色 → 功能菜单（Teleport 到 body，fixed 定位跟随点击处） -->
    <Teleport to="body">
      <div v-if="menu.show" class="menu-backdrop" @click="menu.show = false"></div>
      <div v-if="menu.show" class="feature-menu" :style="{ left: menu.x + 'px', top: menu.y + 'px' }">
        <div class="menu-title">想让我帮点什么？</div>
        <button v-for="m in MENU_ITEMS" :key="m.key" class="menu-item" @click="pickFeature(m)">
          {{ m.icon }} {{ m.label }}
        </button>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { showToast } from 'vant'
import { createWLipSyncNode } from 'wlipsync'
import VirtualHuman from './components/VirtualHuman.vue'
import { AudioSentenceQueue } from './utils/AudioSentenceQueue.js'
import lipSyncProfile from './assets/lip-sync-profile.json'
import {
  DEFAULT_API_BASE, DEFAULT_MODEL_URL,
  DEFAULT_CHARACTER_ID, DEFAULT_SESSION_ID
} from './config.js'

// ================================================================
// 对外接口：移植到其他项目时由宿主通过 props 注入配置，无需改本组件
// ================================================================
const props = defineProps({
  apiBase: { type: String, default: DEFAULT_API_BASE },        // 后端根地址（同源部署时传 ''）
  modelUrl: { type: String, default: DEFAULT_MODEL_URL },      // VRM 模型路径
  defaultCharacterId: { type: String, default: DEFAULT_CHARACTER_ID },
  sessionId: { type: String, default: DEFAULT_SESSION_ID }     // 会话 id（多用户接入时宿主须传唯一值）
})
// 对外事件：宿主的英语练习模块可监听记录学习数据
const emit = defineEmits(['chat-sent', 'reply-done'])

const messages = ref([])
const inputText = ref('')
const loading = ref(false)
const mockMode = ref(false)
// 功能模式：chat=口语陪练（默认，带语音），translate=纯翻译（只出文字，不朗读）
const mode = ref('chat')
const chatBoxRef = ref(null)
const avatarRef = ref(null)

// 句子级音频队列：口型不再消费后端 viseme —— 每个播放源会额外分接 wlipsync 分析节点，
// 虚拟人每帧从播放中的音频实时算嘴型（AIRI 同款路线）
const player = new AudioSentenceQueue()

// ========== 角色音色档案（后端 /unity/ai/voices 提供，选完即换声音） ==========
const characterId = ref(localStorage.getItem('pet-tutor-character') || props.defaultCharacterId)
const voices = ref([])
watch(characterId, v => { try { localStorage.setItem('pet-tutor-character', v) } catch { /* 忽略 */ } })
async function fetchVoices() {
  try {
    const list = await fetch(`${props.apiBase}/unity/ai/voices`).then(r => r.json())
    if (Array.isArray(list) && list.length) voices.value = list
  } catch (e) { console.warn('[voices] 拉取角色列表失败:', e) }
}

// ========== 按住说话（push-to-talk）→ /unity/ai/asr → 文本进输入框 ==========
const recording = ref(false)
const transcribing = ref(false)
let mediaRecorder = null
let audioChunks = []

async function micDown() {
  if (recording.value || transcribing.value) return
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    audioChunks = []
    mediaRecorder = new MediaRecorder(stream)
    mediaRecorder.ondataavailable = (e) => { if (e.data.size) audioChunks.push(e.data) }
    mediaRecorder.onstop = async () => {
      stream.getTracks().forEach(t => t.stop())     // 立即释放麦克风（录音红灯熄灭）
      await uploadSpeech(new Blob(audioChunks, { type: mediaRecorder.mimeType || 'audio/webm' }))
    }
    mediaRecorder.start()
    recording.value = true
  } catch (e) {
    alert('无法使用麦克风：' + e.message + '\n（检查浏览器麦克风权限；非 localhost 访问需 https）')
  }
}
function micUp() {
  if (recording.value && mediaRecorder && mediaRecorder.state !== 'inactive') {
    recording.value = false
    mediaRecorder.stop()
  }
}
async function uploadSpeech(blob) {
  transcribing.value = true
  try {
    const fd = new FormData()
    fd.append('file', blob, 'speech.webm')
    const r = await fetch(`${props.apiBase}/unity/ai/asr`, { method: 'POST', body: fd })
    const j = await r.json()
    if (j.text) {
      // 识别结果进输入框，人工确认后再发送（防识别错误直接进对话）
      inputText.value = (inputText.value ? inputText.value + ' ' : '') + j.text
      nextTick(() => inputRef.value?.focus())
    } else if (j.error) {
      console.error('[asr]', j.error)
      alert('识别失败：' + j.error)
    }
  } catch (e) {
    console.error('[asr] 上传失败:', e)
    alert('识别请求失败（后端或 asr_server 没起？）：' + e.message)
  } finally {
    transcribing.value = false
  }
}

// ========== 点击角色 → 功能菜单（快捷填入提问模板；translate 切独立模式） ==========
const MENU_ITEMS = [
  { key: 'translate', icon: '🔤', label: '帮我翻译这句', tip: '' },
  { key: 'practice',  icon: '🗣️', label: '陪我练口语',   tip: '' },
  { key: 'story',     icon: '📖', label: '讲个短故事',    tip: 'Tell me a short English story. ' },
  { key: 'lookup-word',    icon: '🔍', label: '查单词（阅读页）' },
  { key: 'analyze-sentence', icon: '🧩', label: '解句子（阅读页）' },
  { key: 'chat',      icon: '🗨️', label: '打开聊天面板' }
]
const menu = ref({ show: false, x: 0, y: 0 })
const inputRef = ref(null)
function onAvatarClicked(e) {
  menu.value = {
    show: true,
    x: Math.min(e.clientX, window.innerWidth - 210),
    y: Math.min(e.clientY, window.innerHeight - 200)
  }
}
function pickFeature(m) {
  menu.value.show = false
  if (m.key === 'chat') {
    chatOpen.value = true
    nextTick(() => inputRef.value?.focus())
    return
  }
  // 阅读页联动：广播模式事件，阅读页自行切换 查词/解句 状态
  if (m.key === 'lookup-word' || m.key === 'analyze-sentence') {
    window.dispatchEvent(new CustomEvent('reading-mode', { detail: { mode: m.key === 'lookup-word' ? 'word' : 'sentence' } }))
    showToast(m.key === 'lookup-word' ? '已进入查词模式，去点文章里的单词吧' : '已进入解句模式，去选文章里的句子吧')
    return
  }
  // 翻译走独立 mode（后端换翻译提示词、关闭 TTS），其余功能仍在 chat 模式
  mode.value = m.key === 'translate' ? 'translate' : 'chat'
  inputText.value = m.tip
  nextTick(() => inputRef.value?.focus())
}

// ========== 纯 TTS 朗读：阅读页通过 pet-speak 事件让虚拟人读指定句子 ==========
async function speakText(text, rate) {
  if (!text) return
  try {
    const actx = player.ensureContext()
    await actx.resume()
    player.beginTurn(actx)
    const resp = await fetch(`${props.apiBase}/unity/ai/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, rate, characterId: characterId.value })
    })
    const res = await resp.json()
    if (res.code === 200 && res.data?.audioUrl) {
      await player.push({ audioUrl: res.data.audioUrl, sentenceIndex: 0, text })
    } else {
      showToast(res.msg || '朗读失败')
    }
  } catch (e) {
    console.warn('[PetTutor] pet-speak 失败', e)
    showToast('朗读失败，请稍后再试')
  }
}
function onPetSpeak(e) {
  speakText(e.detail?.text, e.detail?.rate)
}
window.addEventListener('pet-speak', onPetSpeak)
onUnmounted(() => window.removeEventListener('pet-speak', onPetSpeak))

// ========== 桌宠层：拖拽移动 / 滚轮缩放 / 位置记忆（localStorage） ==========
const chatOpen = ref(false)   // 进页面只出人物；点角色菜单「打开聊天面板」才弹出
const PET_LAYOUT_KEY = 'pet-tutor-layout-v3'
const petPos = ref({ x: 24, y: 24, scale: 1 })
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)) }
function initPetLayout() {
  try {
    const saved = JSON.parse(localStorage.getItem(PET_LAYOUT_KEY) || 'null')
    if (saved && typeof saved.x === 'number') { petPos.value = saved; return }
  } catch { /* 存档损坏则用默认 */ }
  // 人物停靠屏幕右下角；手机宽度下默认缩小一号，少挡页面内容。
  // 注意按"缩放后的视觉尺寸"贴边（holder 的 scale 以左下角为原点）
  const small = window.innerWidth <= 900
  const baseW = small ? 300 : 380
  const baseH = small ? 500 : 600
  const scale = small ? 0.75 : 1
  petPos.value = {
    x: Math.max(16, window.innerWidth - baseW * scale - 24),
    y: Math.max(16, window.innerHeight - baseH * scale - 24),
    scale
  }
}
function savePetLayout() {
  try { localStorage.setItem(PET_LAYOUT_KEY, JSON.stringify(petPos.value)) } catch { /* 忽略 */ }
}
// 组合层只负责定位（拖动）；缩放挂在人物层，保证对话框文字不跟着糊
const comboStyle = computed(() => ({
  left: petPos.value.x + 'px',
  top: petPos.value.y + 'px'
}))
const petScale = computed(() => ({
  transform: `scale(${petPos.value.scale})`,
  transformOrigin: 'bottom left'
}))
function onPetDrag(d) {
  petPos.value = {
    ...petPos.value,
    x: clamp(petPos.value.x + d.dx, -100, window.innerWidth - 100),
    y: clamp(petPos.value.y + d.dy, -100, window.innerHeight - 100)
  }
  savePetLayout()
}
function onWheelZoom(e) {
  petPos.value = {
    ...petPos.value,
    scale: clamp(petPos.value.scale - Math.sign(e.deltaY) * 0.08, 0.5, 1.8)
  }
  savePetLayout()
}

// ========== 空白穿透：combo 是矩形，人物是透明背景的模型 ——
// 落在人物成像区之外的按下事件转发给下层页面元素，否则整个矩形都会挡住页面点击 ==========
const comboRef = ref(null)
const holderRef = ref(null)
// 人物在 holder 内的大致成像区（比例），命中区内保留拖拽/点击人物本身。
// 用 holder 的 getBoundingClientRect（含缩放 transform），人物缩小后空白区自动扩大穿透范围。
const PET_HIT = { x0: 0.18, x1: 0.82, y0: 0.05, y1: 0.96 }

function onPetAreaPointerDown(e) {
  const combo = comboRef.value
  if (!combo || !combo.contains(e.target)) return // 聊天窗/菜单等不受影响
  const holder = holderRef.value
  if (!holder) return
  const r = holder.getBoundingClientRect() // 实际视觉矩形（缩放后）
  const relX = (e.clientX - r.left) / r.width
  const relY = (e.clientY - r.top) / r.height
  const inHit = relX >= PET_HIT.x0 && relX <= PET_HIT.x1 &&
                relY >= PET_HIT.y0 && relY <= PET_HIT.y1
  if (!inHit) { startPassThrough(e, combo); return }

  // 命中人物区：但脚下若是可以点的页面控件（指针样式/表单元素），优先让位给页面。
  // 否则人物压住按钮时（小屏难免），按钮永远点不到
  combo.style.pointerEvents = 'none'
  const beneath = document.elementFromPoint(e.clientX, e.clientY)
  const interactive = beneath && (getComputedStyle(beneath).cursor === 'pointer' ||
    beneath.closest('button, a, input, textarea, select, label'))
  combo.style.pointerEvents = ''
  if (interactive) startPassThrough(e, combo)
}

function startPassThrough(e, combo) {
  // 拦截并转发给下层
  e.stopPropagation()
  e.preventDefault()
  combo.style.pointerEvents = 'none'
  const opts = {
    bubbles: true, cancelable: true, view: window,
    clientX: e.clientX, clientY: e.clientY,
    pointerId: e.pointerId, pointerType: e.pointerType, isPrimary: e.isPrimary,
    button: e.button, buttons: e.buttons
  }
  const beneath = document.elementFromPoint(e.clientX, e.clientY)
  if (beneath) beneath.dispatchEvent(new PointerEvent('pointerdown', opts))
  const restore = () => { combo.style.pointerEvents = '' }
  // pointerup 时把 click 补发给当时所在的下层元素（合成事件浏览器不会自动生成 click）
  const onUp = (up) => {
    window.removeEventListener('pointerup', onUp, true)
    window.removeEventListener('pointercancel', onUp, true)
    clearTimeout(safety)
    const target = document.elementFromPoint(up.clientX, up.clientY)
    restore()
    if (target && up.type === 'pointerup') {
      target.dispatchEvent(new MouseEvent('click', {
        bubbles: true, cancelable: true, view: window,
        clientX: up.clientX, clientY: up.clientY
      }))
    }
  }
  // 兜底：极少数情况下 pointerup 丢失，超时恢复 combo 可点
  const safety = setTimeout(restore, 2000)
  window.addEventListener('pointerup', onUp, true)
  window.addEventListener('pointercancel', onUp, true)
}

// ========== 聊天悬浮窗：独立于人物——拖标题栏移动、标题栏上滚轮缩放、布局记忆 ==========
const CHAT_LAYOUT_KEY = 'pet-tutor-chat-layout-v1'
const CHAT_W = 420
const chatPos = ref({ x: 0, y: 0, scale: 1 })
function initChatLayout() {
  try {
    const saved = JSON.parse(localStorage.getItem(CHAT_LAYOUT_KEY) || 'null')
    if (saved && typeof saved.x === 'number') { chatPos.value = saved; return }
  } catch { /* 存档损坏则用默认 */ }
  // 默认停靠屏幕右上角
  chatPos.value = { x: Math.max(16, window.innerWidth - CHAT_W - 24), y: 16, scale: 1 }
}
function saveChatLayout() {
  try { localStorage.setItem(CHAT_LAYOUT_KEY, JSON.stringify(chatPos.value)) } catch { /* 忽略 */ }
}
const chatStyle = computed(() => ({
  left: chatPos.value.x + 'px',
  top: chatPos.value.y + 'px',
  transform: `scale(${chatPos.value.scale})`,
  transformOrigin: 'top right'   // 从右上角缩放，面板朝左下生长，不飘出屏幕
}))
let chatDragStart = null, chatDragFrom = null, chatDragging = false
function onChatDragDown(e) {
  // Pointer Capture：把后续 move/up 事件锁在标题栏元素上，
  // 拖出窗口/快速甩动都不会丢事件（比 window 全局监听可靠）
  try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* 旧环境忽略 */ }
  chatDragStart = { x: e.clientX, y: e.clientY }
  chatDragFrom = { x: chatPos.value.x, y: chatPos.value.y }
  chatDragging = false
}
function onChatDragMove(e) {
  if (!chatDragStart || !chatDragFrom) return
  const dx = e.clientX - chatDragStart.x, dy = e.clientY - chatDragStart.y
  if (!chatDragging && Math.hypot(dx, dy) > 6) chatDragging = true   // 6px 内算点击，不误拖
  if (!chatDragging) return
  chatPos.value = {
    ...chatPos.value,
    x: clamp(chatDragFrom.x + dx, -(CHAT_W - 80), window.innerWidth - 80),
    y: clamp(chatDragFrom.y + dy, -100, window.innerHeight - 60)
  }
}
function onChatDragUp() {
  if (chatDragging) saveChatLayout()   // 松手才落盘，拖动过程零 IO 更跟手
  chatDragStart = chatDragFrom = null
  chatDragging = false
}
function onChatWheel(e) {
  chatPos.value = {
    ...chatPos.value,
    scale: clamp(chatPos.value.scale - Math.sign(e.deltaY) * 0.08, 0.5, 1.8)
  }
  saveChatLayout()
}
/** ➖➕ 按钮缩放（dir: -1 缩小 / 1 放大）——比滚轮更直白的兜底入口 */
function zoomChat(dir) {
  chatPos.value = {
    ...chatPos.value,
    scale: clamp(chatPos.value.scale + dir * 0.1, 0.5, 1.8)
  }
  saveChatLayout()
}

onMounted(() => {
  initPetLayout()
  initChatLayout()
  fetchVoices()
  // 音频管线：先建 AudioContext（未手势前处于 suspended，首次发送时 resume）
  // 再创建 wlipsync 分析节点，注入播放器与虚拟人
  ;(async () => {
    try {
      const ctx = player.ensureContext()
      const node = await createWLipSyncNode(ctx, lipSyncProfile)
      player.analyserNode = node
      avatarRef.value?.attachLipSyncNode(node)
      console.log('[wlipsync] 实时口型分析器就绪')
    } catch (e) {
      console.error('[wlipsync] 初始化失败，口型将保持静默（其余功能不受影响）:', e)
    }
  })()
})

// ========== 发送聊天（SSE 流式，增量追加渲染打字机效果） ==========
async function sendChat() {
  if (!inputText.value.trim() || loading.value) return

  const userSay = inputText.value
  menu.value.show = false
  messages.value.push({ role: 'user', text: userSay })
  inputText.value = ''
  loading.value = true
  emit('chat-sent', { sessionId: props.sessionId, mode: mode.value, text: userSay })

  // 必须在点击手势链里同步创建/恢复 AudioContext（浏览器自动播放策略），并开启新一轮播放
  const actx = player.ensureContext()
  player.beginTurn(actx)
  avatarRef.value?.silenceMouth()

  // 先插入一条空的 AI 消息占位，delta 到达后逐段追加
  messages.value.push({ role: 'ai', text: '', streaming: true, audioClips: [] })
  const aiMsg = messages.value[messages.value.length - 1]
  await scrollBottom()

  // ===== 解析一帧 SSE（event: xxx / data: {...}）并分发 =====
  function handleFrame(frame) {
    let event = 'message'
    let data = ''
    for (const line of frame.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim()
      else if (line.startsWith('data:')) data += line.slice(5).trim()
    }
    if (!data) return
    let payload
    try { payload = JSON.parse(data) } catch { return }

    if (event === 'delta') {
      aiMsg.text += payload.text          // ★ 增量追加：打字机效果的核心
      scrollBottom()
    } else if (event === 'done') {
      console.log(`[SSE] 文本流完成，耗时 ${(payload.costMs / 1000).toFixed(1)}s`)
    } else if (event === 'audio') {
      aiMsg.audioClips.push(payload)
      player.push(payload)   // 下载解码后按 sentenceIndex 严格有序无缝播放，并驱动口型
    } else if (event === 'error') {
      console.error('[SSE] 服务端错误事件:', payload)
      if (!aiMsg.text) aiMsg.text = '【失败】' + payload.message
    }
  }

  try {
    const resp = await fetch(`${props.apiBase}/unity/ai/chat/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: props.sessionId,
        userInput: userSay,
        mockMode: mockMode.value,
        characterId: characterId.value,
        mode: mode.value          // translate=纯翻译（后端关 TTS），其余=chat
      })
    })
    if (!resp.ok || !resp.body) throw new Error(`HTTP ${resp.status}`)

    // ===== 手动解析 SSE 流：POST 请求用不了 EventSource，改用 fetch + ReadableStream =====
    const reader = resp.body.getReader()
    const decoder = new TextDecoder('utf-8')
    let buf = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })   // stream:true 防止多字节汉字被截断
      let idx
      while ((idx = buf.indexOf('\n\n')) >= 0) {       // SSE 帧以空行分隔
        handleFrame(buf.slice(0, idx))
        buf = buf.slice(idx + 2)
      }
    }
  } catch (e) {
    console.error('[SSE] 请求异常:', e)
    if (!aiMsg.text) aiMsg.text = '【错误】' + e.message
  } finally {
    aiMsg.streaming = false
    loading.value = false
    // 翻译模式保持不变：只有用户主动点标签/菜单切回，才回到口语练习
    await scrollBottom()
    emit('reply-done', { sessionId: props.sessionId, mode: mode.value, text: aiMsg.text })
  }
}

async function scrollBottom() {
  await nextTick()
  if (chatBoxRef.value) {
    chatBoxRef.value.scrollTop = chatBoxRef.value.scrollHeight
  }
}
</script>

<style scoped>
/* ===== 桌宠世界：全屏透明层，角色浮在上面 ===== */
/* 嵌入宿主页面：透明层放行所有鼠标事件，只有人物+对话框区域可交互，
   否则整个 .pet-world 会像玻璃罩一样挡住底下页面的点击。
   z-index 2000：压过宿主内容层（z-10）和粒子背景（z-1），
   但低于宿主页内弹窗（5000）与全局弹窗（3000/4000） */
.pet-world { position: fixed; inset: 0; overflow: hidden; pointer-events: none; z-index: 2000; }
/* 组合层：人物+对话面板绑定，拖动时整体移动 */
.pet-combo {
  position: absolute;
  width: 380px; height: 600px;
  will-change: left, top;
  user-select: none;
  pointer-events: auto;
}
.pet-holder {
  position: absolute; inset: 0;
  will-change: transform;
}
/* ===== 聊天面板：独立悬浮窗（位置/缩放由 chatStyle 内联控制），与人物互不绑定 ===== */
.chat-drawer {
  position: fixed;
  width: 420px;
  height: min(600px, 78dvh);
  z-index: 2000;   /* 与人物同层：压过宿主内容，低于弹窗 */
  /* 关键：父层 .pet-world 是 pointer-events:none（放行宿主页面点击），
     聊天窗解绑后是其直接子元素会继承 none —— 必须自己开回 auto，否则收不到任何鼠标事件 */
  pointer-events: auto;
}
.chat-container {
  height: 100%; box-sizing: border-box;
  display: flex; flex-direction: column;
  padding: 16px 20px;
  font-family: sans-serif;
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(6px);
  border: 1px solid #e3e6ef;
  border-radius: 14px;
  box-shadow: 0 6px 24px rgba(30, 40, 90, 0.14);
}
.chat-head {
  display: flex; align-items: center; justify-content: space-between;
  cursor: grab;            /* 标题栏 = 拖拽把手 */
  user-select: none;
  touch-action: none;      /* 触屏拖动不触发滚动 */
}
.chat-head:active { cursor: grabbing; }
.head-actions { display: flex; align-items: center; gap: 2px; }
.chat-zoom {
  border: none; background: none; font-size: 13px; cursor: pointer;
  color: #8a93a6; padding: 2px 7px; border-radius: 6px;
}
.chat-zoom:hover { background: #eef2fb; color: #333; }
.chat-head h2 { margin: 0; }
.chat-close {
  border: none; background: none; font-size: 16px; cursor: pointer;
  color: #8a93a6; padding: 2px 8px; border-radius: 6px;
}
.chat-close:hover { background: #eef2fb; color: #333; }
.drawer-enter-active, .drawer-leave-active { transition: transform 0.25s ease, opacity 0.25s ease; }
.drawer-enter-from, .drawer-leave-to { transform: translateX(24px); opacity: 0; }
@media (max-width: 900px) {
  /* 小屏：combo 盒子同步缩小（与 .pet-holder 一致），定位/命中计算才不会错位 */
  .pet-combo { width: 300px; height: 500px; }
  .pet-holder { width: 300px; height: 500px; top: auto; bottom: 0; }
}
/* ===== 点击角色的功能菜单 ===== */
.menu-backdrop { position: fixed; inset: 0; z-index: 6000; }
.feature-menu {
  position: fixed; z-index: 6001; min-width: 180px;
  background: #fff; border-radius: 10px; padding: 6px;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.18);
}
.menu-title { font-size: 12px; color: #8a93a6; padding: 6px 10px 4px; }
.menu-item {
  display: block; width: 100%; text-align: left;
  padding: 8px 10px; font-size: 14px; border: none; background: none;
  border-radius: 6px; cursor: pointer; color: #333;
}
.menu-item:hover { background: #eef2fb; }
h2 { text-align: center; }
.chat-box {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  border: 1px solid #ddd;
  padding: 12px;
  border-radius: 8px;
  margin-bottom: 12px;
}
.msg {
  margin-bottom: 10px;
  display: flex;
  gap: 8px;
  align-items: flex-start;
}
.msg.user { justify-content: flex-end; }
.role {
  font-weight: bold;
  color: #2c7be5;
  min-width: 30px;
  padding-top: 4px;
}
.msg.user .role { color: #e5533c; }
.content {
  background: #f0f0f0;
  padding: 8px 12px;
  border-radius: 6px;
  max-width: 75%;
  line-height: 1.5;
  white-space: pre-wrap;   /* LLM 输出含 \n，必须保留换行 */
  word-break: break-word;
}
/* 打字机光标：流未结束时在文字末尾闪 ▍ */
.content.typing::after {
  content: '▍';
  color: #2c7be5;
  animation: cursor-blink 0.8s infinite;
}
@keyframes cursor-blink {
  50% { opacity: 0; }
}
.msg.user .content { background: #d4e4fc; }
.input-area { display: flex; gap: 8px; }
.input-area input {
  flex: 1;
  padding: 10px;
  border: 1px solid #ccc;
  border-radius: 6px;
  font-size: 14px;
}
.input-area button {
  padding: 10px 20px;
  background: #2c7be5;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}
.input-area button:disabled {
  background: #aaa;
  cursor: not-allowed;
}
/* ===== 翻译模式标签：翻译中显示，点击切回口语练习 ===== */
.mode-chip {
  flex: 0 0 auto;
  padding: 0 10px !important;
  background: #eef6ff !important;
  color: #2c7be5 !important;
  border: 1px solid #9cc3f5 !important;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
}
.mode-chip:hover { background: #dcebfc !important; }
/* ===== 按住说话按钮 ===== */
.mic-btn {
  flex: 0 0 auto;
  width: 44px;
  padding: 10px 0 !important;
  background: #fff !important;
  color: #2c7be5 !important;
  border: 1px solid #cfd6e4 !important;
  font-size: 18px;
}
.mic-btn:hover { background: #eef2fb !important; }
.mic-btn.recording {
  background: #e5533c !important;
  color: #fff !important;
  border-color: #e5533c !important;
  animation: mic-pulse 1s infinite;
}
@keyframes mic-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(229, 83, 60, 0.5); }
  50% { box-shadow: 0 0 0 8px rgba(229, 83, 60, 0); }
}
.debug-bar {
  margin-top: 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #666;
}
.char-select {
  flex: 0 1 auto;
  min-width: 0;
  padding: 4px 6px;
  font-size: 13px;
  border: 1px solid #cfd6e4;
  border-radius: 6px;
  background: #fff;
  color: #333;
  cursor: pointer;
}
</style>
