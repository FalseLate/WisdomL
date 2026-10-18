<template>
  <div class="tutor-chat">
    <!-- 人物：仅「口语练习 / 故事」tab 渲染；通用对话不显示。默认左下角，可拖动 + 滚轮/双指缩放 -->
    <div class="tc-avatar-float" v-if="activeTab !== 'chat'" :style="avatarStyle"
         @pointerdown="onAvatarDown" @pointermove="onAvatarMove"
         @pointerup="onAvatarUp" @pointercancel="onAvatarUp" @lostpointercapture="onAvatarUp"
         @wheel.prevent="onAvatarWheel">
      <VirtualHuman v-if="avatarMode === '3d'" ref="avatarRef" :model-url="modelUrl" :follow-mouse="false" @ready="onAvatarReady" />
      <div v-else class="tc-avatar-2d">🖼️ 2D 形象开发中，敬请期待</div>
    </div>

    <!-- 顶栏 -->
    <div class="tc-head">
      <span class="tc-menu" @click="drawer = true">☰</span>
      <span class="tc-back" @click="router.back()">‹</span>
      <span class="tc-title">AI 口语教练</span>
      <button class="tc-toggle" @click="avatarMode = avatarMode === '3d' ? '2d' : '3d'">
        {{ avatarMode === '3d' ? '🧊 3D' : '🖼️ 2D' }}
      </button>
      <select v-model="characterId" class="tc-voice" title="音色">
        <option v-for="v in voices" :key="v.id" :value="v.id">{{ v.label }}</option>
        <option v-if="!voices.length" value="jenny">jenny</option>
      </select>
    </div>

    <!-- 历史会话抽屉（手机覆盖式滑入）-->
    <div class="tc-mask" v-if="drawer" @click="drawer = false"></div>
    <aside class="tc-drawer" :class="{ open: drawer }">
      <div class="dw-head">
        <span class="dw-title">对话历史</span>
        <span class="dw-close" @click="drawer = false">✕</span>
      </div>
      <button class="dw-new" @click="onNewChat">＋ 新对话</button>
      <div class="dw-list">
        <div v-for="s in sessions" :key="s.id" class="dw-item" :class="{ active: s.id === currentId }" @click="openSession(s)">
          <div class="dw-item-main">
            <div class="dw-item-title">{{ s.title }}</div>
            <div class="dw-item-time">{{ fmtTime(s.createdAt) }}</div>
          </div>
          <span class="dw-del" @click.stop="deleteSession(s)">🗑</span>
        </div>
        <div v-if="!sessions.length" class="dw-empty">还没有历史对话</div>
      </div>
    </aside>

    <!-- 对话(通用) / 口语练习 / 故事 三分段 -->
    <div class="tc-tabs">
      <div class="tc-tab" :class="{ active: activeTab === 'chat' }" @click="activeTab = 'chat'">💬 对话</div>
      <div class="tc-tab" :class="{ active: activeTab === 'oral' }" @click="activeTab = 'oral'">🗣️ 口语练习</div>
      <div class="tc-tab" :class="{ active: activeTab === 'story' }" @click="activeTab = 'story'">📖 故事</div>
    </div>

    <!-- 消息列表 -->
    <div class="tc-msgs" ref="boxRef">
      <div v-if="!curMessages.length" class="tc-empty">
        {{ activeTab === 'story' ? '想听什么故事？说一句试试，比如“an adventure about a brave cat”'
          : activeTab === 'oral' ? '用英语打个招呼吧，比如 “Hi, how are you?”（会朗读并练口语）'
          : '问我任何问题，中英文都行；英语相关会答得更准。' }}
      </div>
      <div v-for="(m, i) in curMessages" :key="i" class="tc-msg" :class="m.role">
        <div class="tc-bubble">
          <span v-if="m.role === 'user'" class="tc-text" :class="{ typing: m.streaming }">{{ m.text }}</span>
          <span v-else class="tc-md" :class="{ typing: m.streaming }" v-html="renderMarkdown(m.text)"></span>
        </div>
      </div>
    </div>

    <!-- 翻译 chip（仅口语练习 tab）-->
    <div class="tc-chipbar" v-if="activeTab === 'oral' && mode === 'translate'">
      <span class="tc-chip" @click="mode = 'chat'">🔤 翻译模式 · 点击退出</span>
    </div>

    <!-- 底部输入条 -->
    <div class="tc-input">
      <button v-if="!(activeTab === 'oral' && mode === 'translate')" class="tc-mic" :class="{ recording, busy: transcribing }"
              :disabled="loading" @pointerdown.prevent="micDown" @pointerup.prevent="micUp" @pointerleave="micUp">
        {{ transcribing ? '✍️' : '🎤' }}
      </button>
      <button v-else class="tc-mic tc-mic-tx" :disabled="loading" @click="mode = 'chat'">🔤</button>
      <input ref="inputRef" v-model="inputText" :disabled="loading"
             :placeholder="inputPlaceholder"
             @keyup.enter="sendChat" />
      <button class="tc-send" :disabled="loading || !inputText.trim()" @click="sendChat">
        {{ loading ? '…' : '发送' }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { AudioSentenceQueue } from '../pet-tutor/utils/AudioSentenceQueue.js'
import { renderMarkdown } from '../utils/markdown'
import { createWLipSyncNode } from 'wlipsync'
import VirtualHuman from '../pet-tutor/components/VirtualHuman.vue'
import lipSyncProfile from '../pet-tutor/assets/lip-sync-profile.json'
import { DEFAULT_MODEL_URL } from '../pet-tutor/config'

const router = useRouter()
const apiBase = import.meta.env.PROD ? '' : 'http://127.0.0.1:8080'

const activeTab = ref('chat')          // chat(通用对话) | oral(口语练习) | story
const mode = ref('chat')               // 仅 oral tab 有效：chat | translate

// ===== 多会话（豆包式）：localStorage 持久化，进来即新对话；sessionId = 会话 id（AI 记忆按对话隔离）=====
const STORE_KEY = 'tutor-chat-sessions'
const sessions = ref(loadSessions())
const currentId = ref(null)
const current = computed(() => sessions.value.find(s => s.id === currentId.value))
const curMessages = computed(() => (current.value ? current.value.boxes[activeTab.value] : []))

function loadSessions() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || '[]') } catch { return [] }
}
function saveSessions() {
  const persist = sessions.value
    .filter(s => s.boxes.chat.length || s.boxes.oral.length || s.boxes.story.length)  // 丢弃空会话
    .map(s => ({
      id: s.id, title: s.title, createdAt: s.createdAt, lastTab: s.lastTab,
      boxes: {
        chat: s.boxes.chat.map(m => ({ role: m.role, text: m.text })),
        oral: s.boxes.oral.map(m => ({ role: m.role, text: m.text })),
        story: s.boxes.story.map(m => ({ role: m.role, text: m.text }))
      }
    }))
  try { localStorage.setItem(STORE_KEY, JSON.stringify(persist)) } catch { /* 超额/隐私模式忽略 */ }
}
function uid() { return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7) }
function newSession() {
  const s = { id: uid(), title: '新对话', createdAt: Date.now(), lastTab: 'chat', boxes: { chat: [], oral: [], story: [] } }
  sessions.value.unshift(s)          // 新的在前
  currentId.value = s.id
  activeTab.value = 'chat'
  saveSessions()
}

const drawer = ref(false)
function onNewChat() { newSession(); drawer.value = false }
function openSession(s) {
  currentId.value = s.id
  activeTab.value = s.lastTab || 'chat'
  drawer.value = false
  scrollBottom()
}
function deleteSession(s) {
  sessions.value = sessions.value.filter(x => x.id !== s.id)
  if (currentId.value === s.id) newSession()   // 删的是当前会话 → 回到新对话
  else saveSessions()
}
function fmtTime(ts) {
  const d = new Date(ts), now = new Date()
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  return d.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
}
const inputPlaceholder = computed(() => {
  if (activeTab.value === 'story') return '想要什么故事…'
  if (activeTab.value === 'oral') return mode.value === 'translate' ? '输入要翻译的内容' : '用英语聊聊…'
  return '问我任何问题…'
})

const inputText = ref('')
const loading = ref(false)
const recording = ref(false)
const transcribing = ref(false)
const voices = ref([])
const characterId = ref('jenny')

const boxRef = ref(null)
const inputRef = ref(null)
const player = new AudioSentenceQueue()

const avatarMode = ref('3d')          // 3d | 2d
const avatarRef = ref(null)
const modelUrl = DEFAULT_MODEL_URL    // 与悬浮 PetTutor 同款人物
let lipNode = null

// 人物位置/缩放：默认左下角，可拖动 + 滚轮/双指捏合缩放，记忆到 localStorage
const avatarPos = reactive({ x: 8, y: 88 })     // 距左 / 距底 像素
const avatarScale = ref(1)
const pointers = new Map()
let dragStart = null
let pinchStart = null
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const avatarStyle = computed(() => ({
  left: avatarPos.x + 'px',
  bottom: avatarPos.y + 'px',
  transform: `scale(${avatarScale.value})`,
  transformOrigin: 'bottom left'
}))
function saveAvatarLayout() {
  localStorage.setItem('tutor-chat-avatar', JSON.stringify({ x: avatarPos.x, y: avatarPos.y, s: avatarScale.value }))
}
function loadAvatarLayout() {
  try { const j = JSON.parse(localStorage.getItem('tutor-chat-avatar') || ''); if (j) { avatarPos.x = j.x; avatarPos.y = j.y; avatarScale.value = j.s } } catch { /* 首次无记录用默认 */ }
}
function onAvatarDown(e) {
  e.currentTarget.setPointerCapture?.(e.pointerId)
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
  if (pointers.size === 1) { dragStart = { x: e.clientX, y: e.clientY, px: avatarPos.x, py: avatarPos.y }; pinchStart = null }
  else if (pointers.size === 2) {
    dragStart = null
    const [a, b] = [...pointers.values()]
    pinchStart = { dist: Math.hypot(a.x - b.x, a.y - b.y), scale: avatarScale.value }
  }
}
function onAvatarMove(e) {
  if (!pointers.has(e.pointerId)) return
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
  if (pointers.size === 2 && pinchStart) {
    const [a, b] = [...pointers.values()]
    const d = Math.hypot(a.x - b.x, a.y - b.y)
    avatarScale.value = clamp(pinchStart.scale * (d / pinchStart.dist), 0.5, 2.2)
    return
  }
  if (dragStart) {
    avatarPos.x = clamp(dragStart.px + (e.clientX - dragStart.x), 0, window.innerWidth - 100)
    avatarPos.y = clamp(dragStart.py - (e.clientY - dragStart.y), 0, window.innerHeight - 140)
  }
}
function onAvatarUp(e) {
  pointers.delete(e.pointerId)
  if (pointers.size < 2) pinchStart = null
  if (pointers.size === 0) { dragStart = null; saveAvatarLayout() }
}
function onAvatarWheel(e) {
  avatarScale.value = clamp(avatarScale.value - Math.sign(e.deltaY) * 0.1, 0.5, 2.2)
  saveAvatarLayout()
}

onMounted(() => {
  newSession()
  loadAvatarLayout()
  loadVoices()
  // 音频管线：建 AudioContext → 创建 wlipsync 分析节点 → 注入播放器与虚拟人（口型）
  ;(async () => {
    try {
      const ctx = player.ensureContext()
      lipNode = await createWLipSyncNode(ctx, lipSyncProfile)
      player.analyserNode = lipNode
      avatarRef.value?.attachLipSyncNode(lipNode)
    } catch (e) {
      console.error('[wlipsync] 初始化失败，口型保持静默:', e)
    }
  })()
})

// 人物（重）挂载就绪后再注入一次，保证 2D→3D 切回时口型仍接得上
function onAvatarReady() {
  if (lipNode) avatarRef.value?.attachLipSyncNode(lipNode)
}

async function loadVoices() {
  try {
    const list = await fetch(`${apiBase}/unity/ai/voices`).then(r => r.json())
    if (Array.isArray(list)) voices.value = list
  } catch (e) { /* 音色列表失败不致命 */ }
}

async function scrollBottom() {
  await nextTick()
  if (boxRef.value) boxRef.value.scrollTop = boxRef.value.scrollHeight
}

// ===== 按住说话 → ASR =====
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
      stream.getTracks().forEach(t => t.stop())
      await uploadSpeech(new Blob(audioChunks, { type: mediaRecorder.mimeType || 'audio/webm' }))
    }
    mediaRecorder.start()
    recording.value = true
  } catch (e) {
    alert('无法使用麦克风：' + e.message)
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
    const r = await fetch(`${apiBase}/unity/ai/asr`, { method: 'POST', body: fd })
    const j = await r.json()
    if (j.text) inputText.value = (inputText.value ? inputText.value + ' ' : '') + j.text
    else if (j.error) alert('识别失败：' + j.error)
  } catch (e) {
    alert('识别请求失败：' + e.message)
  } finally {
    transcribing.value = false
  }
}

// ===== 发送（SSE 流式，复用 PetTutor 同款解析）=====
async function sendChat() {
  if (!inputText.value.trim() || loading.value) return
  const cur = current.value
  let sendMode, box
  if (activeTab.value === 'story') { sendMode = 'story'; box = cur.boxes.story }
  else if (activeTab.value === 'oral') { sendMode = mode.value; box = cur.boxes.oral }   // chat | translate
  else { sendMode = 'assistant'; box = cur.boxes.chat }                                    // 通用对话
  const userSay = inputText.value
  box.push({ role: 'user', text: userSay })
  if (cur.title === '新对话') cur.title = userSay.slice(0, 20)                             // 首条消息作标题
  cur.lastTab = activeTab.value
  inputText.value = ''
  loading.value = true

  const actx = player.ensureContext()
  player.beginTurn(actx)
  avatarRef.value?.silenceMouth()

  box.push({ role: 'ai', text: '', streaming: true, audioClips: [] })
  const aiMsg = box[box.length - 1]
  await scrollBottom()

  function handleFrame(frame) {
    let event = 'message', data = ''
    for (const line of frame.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim()
      else if (line.startsWith('data:')) data += line.slice(5).trim()
    }
    if (!data) return
    let payload
    try { payload = JSON.parse(data) } catch { return }
    if (event === 'delta') { aiMsg.text += payload.text; scrollBottom() }
    else if (event === 'audio') { aiMsg.audioClips.push(payload); player.push(payload) }
    else if (event === 'error') { if (!aiMsg.text) aiMsg.text = '【失败】' + payload.message }
  }

  try {
    const resp = await fetch(`${apiBase}/unity/ai/chat/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: currentId.value, userInput: userSay, characterId: characterId.value, mode: sendMode })
    })
    if (!resp.ok || !resp.body) throw new Error(`HTTP ${resp.status}`)
    const reader = resp.body.getReader()
    const decoder = new TextDecoder('utf-8')
    let buf = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      let idx
      while ((idx = buf.indexOf('\n\n')) >= 0) { handleFrame(buf.slice(0, idx)); buf = buf.slice(idx + 2) }
    }
  } catch (e) {
    if (!aiMsg.text) aiMsg.text = '【错误】' + e.message
  } finally {
    aiMsg.streaming = false
    loading.value = false
    saveSessions()
    await scrollBottom()
  }
}
</script>

<style scoped>
.tutor-chat {
  position: relative;
  z-index: 10;
  display: flex;
  flex-direction: column;
  height: 100dvh;
  background: var(--bg-base);
  padding-bottom: env(safe-area-inset-bottom);
}
.tc-head {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--accent-border);
}
.tc-back { font-size: 26px; line-height: 1; color: var(--text-primary); cursor: pointer; padding: 0 6px; }
.tc-title { flex: 1; font-size: 16px; font-weight: 700; color: var(--text-primary); }
.tc-voice { background: var(--bg-elevated); color: var(--text-primary); border: 1px solid var(--accent-border); border-radius: 8px; padding: 4px 8px; font-size: 12px; }

.tc-avatar-float { position: absolute; z-index: 3; width: 180px; height: 260px; touch-action: none; cursor: grab; }
.tc-avatar-2d { color: var(--text-muted); font-size: 14px; }
/* 人物浮在消息列表之上（可拖拽），但顶栏/tab/输入条压在人物之上，避免透明盒子抢它们的点击 */
.tc-msgs { position: relative; z-index: 2; }
.tc-head, .tc-tabs, .tc-chipbar, .tc-input { position: relative; z-index: 5; }
.tc-toggle { font-size: 12px; padding: 4px 10px; border-radius: 999px; border: 1px solid var(--accent-border); background: var(--bg-elevated); color: var(--text-primary); cursor: pointer; }

.tc-menu { font-size: 20px; color: var(--text-primary); cursor: pointer; padding: 0 4px; }
.tc-mask { position: fixed; inset: 0; background: rgba(0, 0, 0, .5); z-index: 40; }
.tc-drawer {
  position: fixed; top: 0; left: 0; bottom: 0; width: 78%; max-width: 320px; z-index: 41;
  background: var(--bg-card); border-right: 1px solid var(--accent-border);
  transform: translateX(-100%); transition: transform .25s ease;
  display: flex; flex-direction: column; padding-bottom: env(safe-area-inset-bottom);
}
.tc-drawer.open { transform: translateX(0); }
.dw-head { display: flex; align-items: center; justify-content: space-between; padding: 14px 16px; }
.dw-title { font-size: 16px; font-weight: 700; color: var(--text-primary); }
.dw-close { font-size: 18px; color: var(--text-muted); cursor: pointer; }
.dw-new { margin: 0 16px 8px; border: none; background: var(--accent); color: var(--accent-contrast); border-radius: 10px; padding: 9px; font-size: 14px; cursor: pointer; }
.dw-list { flex: 1; overflow-y: auto; padding: 4px 8px; }
.dw-item { display: flex; align-items: center; gap: 8px; padding: 10px; border-radius: 10px; cursor: pointer; }
.dw-item.active { background: var(--bg-elevated); }
.dw-item-main { flex: 1; min-width: 0; }
.dw-item-title { font-size: 14px; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dw-item-time { font-size: 11px; color: var(--text-muted); margin-top: 2px; }
.dw-del { flex-shrink: 0; font-size: 14px; color: var(--text-muted); padding: 4px 6px; }
.dw-empty { text-align: center; color: var(--text-muted); font-size: 13px; margin-top: 30px; }

/* 桌面端（≥900px）：抽屉常驻左侧，主内容右移让位，遮罩与开关隐藏 */
@media (min-width: 900px) {
  .tutor-chat { margin-left: 280px; }
  .tc-mask { display: none; }
  .tc-drawer { width: 280px; max-width: 280px; transform: translateX(0); box-shadow: 2px 0 12px rgba(0, 0, 0, .25); }
  .tc-menu, .dw-close { display: none; }
}

.tc-tabs { display: flex; gap: 8px; padding: 10px 14px 0; }
.tc-tab { padding: 6px 18px; border-radius: 999px; font-size: 13px; border: 1px solid var(--accent-border); background: var(--bg-elevated); color: var(--text-secondary); cursor: pointer; }
.tc-tab.active { background: var(--accent); border-color: var(--accent); color: var(--accent-contrast); font-weight: 700; }

.tc-msgs { flex: 1; overflow-y: auto; padding: 12px 14px; display: flex; flex-direction: column; gap: 10px; }
.tc-empty { text-align: center; color: var(--text-muted); font-size: 13px; margin-top: 30px; line-height: 1.7; }
.tc-msg { display: flex; }
.tc-msg.user { justify-content: flex-end; }
.tc-msg.ai { justify-content: flex-start; }
.tc-bubble { max-width: 78%; padding: 9px 13px; border-radius: 14px; font-size: 14px; line-height: 1.6; word-break: break-word; }
.tc-msg.user .tc-bubble { background: var(--accent); color: var(--accent-contrast); border-bottom-right-radius: 4px; }
.tc-msg.ai .tc-bubble { background: var(--bg-card); color: var(--text-primary); border: 1px solid var(--accent-border); border-bottom-left-radius: 4px; }
.typing::after { content: '▋'; animation: tcblink 1s steps(2) infinite; }
@keyframes tcblink { 50% { opacity: 0; } }

.tc-md { display: block; }
.tc-md :deep(p) { margin: 4px 0; }
.tc-md :deep(p:first-child) { margin-top: 0; }
.tc-md :deep(p:last-child) { margin-bottom: 0; }
.tc-md :deep(h3), .tc-md :deep(h4), .tc-md :deep(h5), .tc-md :deep(h6) {
  margin: 8px 0 4px; font-size: 14px; color: var(--accent); font-weight: 700;
}
.tc-md :deep(h3:first-child), .tc-md :deep(h4:first-child) { margin-top: 0; }
.tc-md :deep(ul) { margin: 4px 0; padding-left: 20px; }
.tc-md :deep(li) { margin: 2px 0; }
.tc-md :deep(strong) { color: var(--text-primary); font-weight: 700; }
.tc-md :deep(code) { background: var(--bg-elevated); padding: 1px 5px; border-radius: 4px; font-size: 12px; }

.tc-chipbar { padding: 0 14px 6px; }
.tc-chip { font-size: 12px; color: var(--violet-text); background: rgb(var(--purple-deep-rgb) / 0.12); padding: 4px 12px; border-radius: 999px; cursor: pointer; }

.tc-input { display: flex; align-items: center; gap: 8px; padding: 10px 14px; border-top: 1px solid var(--accent-border); background: var(--bg-card); }
.tc-mic { flex-shrink: 0; width: 44px; height: 44px; border-radius: 50%; border: 1px solid var(--accent); background: var(--bg-elevated); color: var(--accent); font-size: 20px; cursor: pointer; }
.tc-mic.recording { background: var(--accent); color: var(--accent-contrast); }
.tc-mic.busy { opacity: 0.6; }
.tc-mic-tx { font-size: 16px; }
.tc-input input { flex: 1; min-width: 0; background: var(--bg-elevated); border: 1px solid var(--accent-border); border-radius: 22px; padding: 10px 14px; font-size: 14px; color: var(--text-primary); }
.tc-send { flex-shrink: 0; border: none; background: var(--accent); color: var(--accent-contrast); border-radius: 22px; padding: 10px 16px; font-size: 14px; cursor: pointer; }
.tc-send:disabled { opacity: 0.5; }
</style>
