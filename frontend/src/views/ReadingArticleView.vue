<template>
  <div class="page-wrap">
    <van-nav-bar :title="article.title || '阅读'" left-arrow @click-left="router.back()" />

    <!-- 工具条：查词 / 解句 模式 -->
    <div class="mode-bar">
      <div class="mode-btn" :class="{ active: mode === 'word' }" @click="setMode(mode === 'word' ? 'none' : 'word')">
        🔍 查单词
      </div>
      <div class="mode-btn" :class="{ active: mode === 'sentence' }" @click="setMode(mode === 'sentence' ? 'none' : 'sentence')">
        🧩 解句子
      </div>
      <div class="mode-hint" v-if="modeHint">{{ modeHint }}</div>
    </div>

    <!-- 正文（内容压过全局粒子画布） -->
    <div class="page-container">
      <div
        class="article-body"
        :class="{ 'in-sentence-mode': mode === 'sentence' }"
        ref="bodyRef"
        @pointermove="onPointerMove"
      >
        <div class="para" v-for="(p, pi) in paragraphs" :key="pi">
          <span
            v-for="(s, si) in p._sentences"
            :key="si"
            class="sentence"
            :class="{ long: !!s._long, clickable: mode === 'none' && !!s._long }"
            @click="onSentenceClick(s, $event)"
          >
            <template v-for="(w, wi) in s._tokens" :key="w.gi">
              <span
                v-if="w.isWord"
                class="word"
                :data-gi="w.gi"
                :class="{ sel: selected.has(w.gi), pickable: mode !== 'none' }"
                @pointerdown.stop="handleWordPointerDown(w, $event)"
                @click.stop="onWordClick(w, $event)"
              >{{ w.text }}</span><span v-else class="sp">{{ w.text }}</span>
            </template>
          </span>
        </div>
      </div>

      <!-- 读后理解题（做完后不再显示） -->
      <section class="quiz-section" v-if="questions.length && !quizDone">
        <div class="quiz-title">读完啦？来 3 道理解题</div>
        <div class="quiz-card" v-for="(q, qi) in questions" :key="qi">
          <div class="q-stem">{{ qi + 1 }}. {{ q.stem }} <span class="q-type">{{ qTypeName(q.type) }}</span></div>
          <div class="q-options">
            <div
              v-for="(opt, oi) in q.options"
              :key="oi"
              class="q-option"
              :class="qOptionClass(q, oi)"
              @click="pickOption(q, oi)"
            >{{ 'ABCD'[oi] }}. {{ opt }}</div>
          </div>
          <div class="q-explain" v-if="q._picked !== null">
            {{ q._picked === q.answer ? '✅ 回答正确' : `❌ 正确答案：${'ABCD'[q.answer]}` }} · {{ q.explain }}
          </div>
        </div>
        <div class="quiz-score" v-if="allAnswered">得分：{{ quizScore }} / {{ questions.length }}</div>
      </section>

      <!-- 已完成标记（题目隐藏后给一行提示，方便回错题本复习） -->
      <div class="quiz-done-tip" v-if="questions.length && quizDone">
        ✅ 本篇阅读已完成<template v-if="allAnswered">（得分 {{ quizScore }} / {{ questions.length }}）</template> · 答错的题在<a class="done-link" @click="router.push('/wrong-questions')">错题本</a>里复习
      </div>
    </div>

    <!-- 解句模式：底部已选词条 -->
    <div class="select-bar" v-if="mode === 'sentence' && selected.size > 0">
      <span class="sb-count">已选 {{ selected.size }} 词</span>
      <van-button size="small" round plain @click="clearSelection">清空</van-button>
      <van-button size="small" round type="primary" :loading="analyzing" @click="analyzeSelected">解析句子</van-button>
    </div>

    <!-- 查词气泡 -->
    <div class="word-bubble" v-if="bubble.show" :style="{ left: bubble.x + 'px', top: bubble.y + 'px' }">
      <template v-if="bubble.loading">查询中...</template>
      <template v-else-if="bubble.word">
        <div class="wb-head">
          <span class="wb-word">{{ bubble.word.word }}</span>
          <span class="wb-phonetic" @click="petSpeak(bubble.word.word)">🔊 {{ bubble.word.phonetic }}</span>
        </div>
        <div class="wb-mean">{{ bubble.word.cnMean }}</div>
        <button class="wb-add" :disabled="bubble.added" @click="addBubbleWord">
          {{ bubble.added ? '已加入生词本' : '⭐ 加入生词本' }}
        </button>
      </template>
      <template v-else>
        <div class="wb-miss">词库未收录该词</div>
      </template>
      <div class="wb-close" @click="bubble.show = false">✕</div>
    </div>

    <!-- 句子解析卡片 -->
    <van-popup v-model:show="card.show" round position="bottom" :z-index="3000" :style="{ background: 'var(--bg-card)' }">
      <div class="analyze-card">
        <div class="ac-text">{{ card.text }}</div>
        <template v-if="card.data">
          <div class="ac-block">
            <div class="ac-label">翻译</div>
            <div class="ac-translation">{{ card.data.translation }}</div>
          </div>
          <div class="ac-block" v-if="card.data.chunks?.length">
            <div class="ac-label">结构拆解</div>
            <div class="ac-chunk" v-for="(c, ci) in card.data.chunks" :key="ci">
              <span class="ac-role">{{ c.role }}</span>
              <span class="ac-chunk-text">{{ c.text }}</span>
              <div class="ac-desc" v-if="c.desc">{{ c.desc }}</div>
            </div>
          </div>
          <div class="ac-block" v-else-if="card.data.analysis">
            <div class="ac-label">语法拆解</div>
            <div class="ac-translation">{{ card.data.analysis }}</div>
          </div>
          <div class="ac-block" v-if="card.data.grammar">
            <div class="ac-label">要点</div>
            <div class="ac-translation">{{ card.data.grammar }}</div>
          </div>
        </template>
        <div class="ac-loading" v-else-if="card.loading">虚拟人正在解析这个句子...</div>

        <div class="ac-actions">
          <div class="rate-row">
            语速
            <span v-for="r in ['慢', '正常', '快']" :key="r" class="rate-pill" :class="{ active: rate === r }" @click="rate = r">{{ r }}</span>
          </div>
          <van-button type="primary" round icon="volume-o" :disabled="card.loading" @click="speakCard">虚拟人朗读</van-button>
        </div>
      </div>
    </van-popup>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showSuccessToast, showFailToast } from 'vant'
import { getReadingArticle, analyzeSentence, getReadingDone, finishReadingQuiz } from '../api/reading'
import { queryWord, addWordCollect } from '../api/word'
import { authState } from '../utils/auth.js'
import request from '../utils/request'

const route = useRoute()
const router = useRouter()

const article = ref({})
const paragraphs = ref([])
const questions = ref([])

// ===== 模式：none 普通 / word 点词查词 / sentence 选词解句 =====
const mode = ref('none')
const modeHint = computed(() => ({
  word: '点任意单词，弹出音标和释义',
  sentence: '点选（或拖选）多个单词，再点底部「解析句子」'
}[mode.value] || ''))

function setMode(m) {
  mode.value = m
  clearSelection()
  bubble.show = false
}

// 虚拟人菜单「查单词/解句子」通过 window 事件联动本页
function onReadingModeEvent(e) {
  const m = e.detail?.mode
  if (m === 'word' || m === 'sentence') {
    setMode(m)
    showSuccessToast(m === 'word' ? '查词模式已开启' : '解句模式已开启')
  }
}

// ===== 渲染模型：段落 → 句子 → 词元（gi 为全文词序号，供拖选/点选定位） =====
function buildRenderModel(content) {
  let gi = 0
  content.paragraphs = content.paragraphs || []
  content.paragraphs.forEach(p => {
    p._sentences = (p.sentences || []).map(text => {
      const tokens = []
      text.split(/\s+/).forEach(tk => {
        const m = tk.match(/[A-Za-z'’-]+/)
        if (m) {
          tokens.push({ isWord: true, text: tk, gi: gi++ })
          tokens.push({ isWord: false, text: ' ' })
        } else {
          tokens.push({ isWord: false, text: tk + ' ' })
        }
      })
      return {
        text,
        _tokens: tokens,
        _long: (p.longSentences || []).find(l => l.text === text) || null
      }
    })
  })
  return gi
}

const bodyRef = ref(null)

// ===== 查词气泡 =====
const bubble = reactive({ show: false, x: 0, y: 0, loading: false, word: null, added: false })

// 生词本按 userId 隔离；老会话可能只有 token，兜底再查一次 profile
let userId = authState.user?.id || null
async function ensureUserId() {
  if (userId) return userId
  try {
    const res = await request.get('/user/profile')
    userId = res.user?.id || null
  } catch (e) { /* 未登录时保持 null */ }
  return userId
}

function cleanToken(t) {
  return (t.replace(/[^A-Za-z'’-]/g, '') || '').toLowerCase()
}

async function onWordClick(w, e) {
  if (mode.value === 'sentence') {
    // 刚结束一次拖选的 click 不当作点选（避免松手时把拖选结果又反转掉）
    if (wasDragging()) { dragState = null; return }
    toggleSelect(w.gi)
    return
  }
  if (mode.value !== 'word') return
  const token = cleanToken(w.text)
  if (!token) return
  bubble.show = true
  bubble.loading = true
  bubble.word = null
  bubble.added = false
  bubble.x = Math.min(e.clientX + 10, window.innerWidth - 250)
  bubble.y = Math.min(e.clientY + 16, window.innerHeight - 170)
  try {
    const res = await queryWord(token)
    bubble.word = res.code === 200 ? res.data : null
  } catch (err) {
    bubble.word = null
  } finally {
    bubble.loading = false
  }
}

async function addBubbleWord() {
  if (!bubble.word || bubble.added) return
  try {
    const res = await addWordCollect(await ensureUserId(), bubble.word.id)
    if (res.code === 200) {
      bubble.added = true
      showSuccessToast('已加入生词本')
    } else {
      // 后端对重复加入返回 400，也视为已加入
      bubble.added = true
      showSuccessToast(res.msg || '已在生词本中')
    }
  } catch (err) {
    showFailToast(err.message || '网络异常')
  }
}

// ===== 解句模式：点选 + 拖选 =====
const selected = ref(new Set())
const analyzing = ref(false)
let dragState = null // { startGi, moved }

function toggleSelect(gi) {
  const s = new Set(selected.value)
  if (s.has(gi)) s.delete(gi)
  else s.add(gi)
  selected.value = s
}

function clearSelection() {
  selected.value = new Set()
  dragState = null
}

function onPointerMove(e) {
  if (mode.value !== 'sentence' || !dragState) return
  if (!(e.buttons & 1) && e.pointerType === 'mouse') { dragState = null; return }
  const el = document.elementFromPoint(e.clientX, e.clientY)
  const wordEl = el?.closest?.('.word')
  if (!wordEl) return
  const gi = Number(wordEl.dataset ? wordEl.dataset.gi : wordEl.getAttribute('data-gi'))
  if (Number.isNaN(gi)) return
  if (gi !== dragState.lastGi) {
    dragState.lastGi = gi
    dragState.moved = true
    const s = new Set()
    for (let i = Math.min(dragState.startGi, gi); i <= Math.max(dragState.startGi, gi); i++) s.add(i)
    selected.value = s
  }
}

function onWordPointerDown(w, e) {
  if (mode.value !== 'sentence') return
  dragState = { startGi: w.gi, lastGi: w.gi, moved: false }
}

function onWindowPointerUp() {
  dragState = null
}

// 点词：解句模式下是点选/拖选入口；查词模式下查词
function handleWordPointerDown(w, e) {
  if (mode.value === 'sentence') onWordPointerDown(w, e)
}

// 拖动结束在别的元素上松手时，把「点一下」和「拖选」区分开：
// onWordClick 在 click 阶段触发，此时若刚发生拖选（moved）则跳过 toggle
function wasDragging() {
  return !!dragState?.moved
}

const totalWords = ref(0)

async function analyzeSelected() {
  if (selected.value.size === 0) return
  const allTokens = []
  paragraphs.value.forEach(p => p._sentences.forEach(s => s._tokens.forEach(t => { if (t.isWord) allTokens[t.gi] = t.text })))
  const idx = [...selected.value].sort((a, b) => a - b)
  const text = idx.map(i => allTokens[i]).join(' ')
    .replace(/\s+([,.!?;:])/g, '$1')
    .trim()
  if (!text) return
  analyzing.value = true
  try {
    const res = await analyzeSentence(text)
    if (res.code === 200) {
      card.text = text
      card.data = res.data
      card.loading = false
      card.show = true
    } else {
      showFailToast(res.msg || '解析失败')
    }
  } catch (err) {
    showFailToast(err.message || '网络异常')
  } finally {
    analyzing.value = false
  }
}

// ===== 长难句点击（普通模式下点高亮句）=====
const card = reactive({ show: false, text: '', data: null, loading: false })

function onSentenceClick(s) {
  if (mode.value !== 'none' || !s._long) return
  card.text = s.text
  card.data = { analysis: s._long.analysis }
  card.loading = false
  card.show = true
}

// ===== 虚拟人朗读 =====
const rate = ref('正常')
const rateValue = computed(() => ({ '慢': '-20%', '正常': '+0%', '快': '+25%' }[rate.value] || '+0%'))

function petSpeak(text) {
  window.dispatchEvent(new CustomEvent('pet-speak', { detail: { text, rate: rateValue.value } }))
  showSuccessToast('虚拟人开始朗读')
}

function speakCard() {
  petSpeak(card.text)
}

// ===== 读后理解题 =====
const quizDone = ref(false) // 已做完本篇题目：题目不再显示

function qTypeName(t) {
  return { main: '主旨题', detail: '细节题', guess: '猜词题' }[t] || '理解题'
}

function pickOption(q, oi) {
  if (q._picked !== null) return
  q._picked = oi
  // 3 题全答完自动交卷：标记完成 + 错题进错题本
  if (allAnswered.value) submitQuiz()
}

async function submitQuiz() {
  const wrongs = questions.value
    .map((q, qi) => ({ q, qi }))
    .filter(({ q }) => q._picked !== q.answer)
    .map(({ q, qi }) => ({
      qi, stem: q.stem, options: q.options,
      answer: q.answer, picked: q._picked, explain: q.explain, type: q.type
    }))
  try {
    const res = await finishReadingQuiz({
      articleId: route.query.id,
      articleTitle: article.value.title || '',
      wrongs
    })
    if (res.code === 200) {
      quizDone.value = true
      // 当前会话保留已答状态的得分展示；下次进入题目即隐藏
      if (wrongs.length) showSuccessToast(`错题已加入错题本（${wrongs.length} 道）`)
    }
  } catch (err) { /* 交卷失败不影响本次答题展示，下次做完可再交 */ }
}

const qOptionClass = (q, oi) => ({
  right: q._picked !== null && oi === q.answer,
  wrong: q._picked !== null && oi === q._picked && q._picked !== q.answer
})

const allAnswered = computed(() => questions.value.length > 0 && questions.value.every(q => q._picked !== null))
const quizScore = computed(() => questions.value.filter(q => q._picked === q.answer).length)

// ===== 生命周期 =====
onMounted(async () => {
  window.addEventListener('reading-mode', onReadingModeEvent)
  window.addEventListener('pointerup', onWindowPointerUp)
  try {
    const id = route.query.id
    const res = await getReadingArticle(id)
    if (res.code === 200 && res.data) {
      article.value = res.data
      let content
      try { content = JSON.parse(res.data.content) } catch { content = {} }
      totalWords.value = buildRenderModel(content)
      paragraphs.value = content.paragraphs
      questions.value = (content.questions || []).map(q => ({ ...q, _picked: null }))
      // 做过题的文章：题目不再显示
      try {
        const doneRes = await getReadingDone(id)
        if (doneRes.code === 200) quizDone.value = !!doneRes.data
      } catch (e) { /* 查询失败时按未完成处理 */ }
    } else {
      showFailToast(res.msg || '文章加载失败')
    }
  } catch (err) {
    showFailToast(err.message || '网络异常')
  }
})

onUnmounted(() => {
  window.removeEventListener('reading-mode', onReadingModeEvent)
  window.removeEventListener('pointerup', onWindowPointerUp)
})
</script>

<style scoped>
.page-wrap {
  min-height: 100dvh;
  background: var(--bg-base);
}

/* 工具条 */
.mode-bar {
  position: relative;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
}

.mode-btn {
  padding: 7px 16px;
  border-radius: 999px;
  border: 1px solid var(--accent-border);
  background: var(--bg-elevated);
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.mode-btn.active {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
  font-weight: 700;
}

.mode-hint {
  font-size: 11px;
  color: var(--text-secondary);
  margin-left: auto;
}

/* 内容压过全局粒子画布（tsParticles fullScreen 的 fixed canvas 在根层级），否则点击被吃掉 */
.page-container {
  position: relative;
  z-index: 10;
  padding: 6px 16px 60px;
}

/* 手机宽度下给右下角的虚拟人物留出空间 */
@media (max-width: 900px) {
  .page-container {
    padding-bottom: 420px;
  }
}

/* 正文排版 */
.article-body {
  padding: 18px 18px;
  background: var(--bg-card);
  border: 1px solid var(--accent-border);
  border-radius: 16px;
  font-size: 16px;
  line-height: 2.1;
  color: var(--text-primary);
}

.article-body.in-sentence-mode {
  user-select: none;
}

.para + .para {
  margin-top: 14px;
}

.sentence.long {
  background: rgba(249, 115, 22, 0.14);
  border-bottom: 2px solid #f97316;
  border-radius: 4px;
  padding: 1px 2px;
}

.sentence.clickable {
  cursor: pointer;
}

.word {
  border-radius: 4px;
  transition: background 0.15s;
}

.word.pickable {
  cursor: pointer;
}

.word.pickable:hover {
  background: var(--accent-soft, rgba(79, 124, 255, 0.15));
}

.word.sel {
  background: rgba(79, 124, 255, 0.35);
  color: #fff;
}

/* 读后理解题 */
.quiz-section {
  margin-top: 20px;
}

.quiz-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 10px;
}

.quiz-card {
  padding: 16px;
  margin-bottom: 12px;
  background: var(--bg-card);
  border: 1px solid var(--accent-border);
  border-radius: 14px;
}

.q-stem {
  font-size: 14px;
  color: var(--text-primary);
  line-height: 1.6;
}

.q-type {
  font-size: 11px;
  color: var(--accent);
  border: 1px solid var(--accent-border);
  border-radius: 999px;
  padding: 1px 8px;
  margin-left: 6px;
}

.q-options {
  margin-top: 10px;
}

.q-option {
  padding: 11px 14px;
  margin: 6px 0;
  border: 1px solid var(--accent-border);
  border-radius: 10px;
  background: var(--bg-elevated);
  font-size: 14px;
  color: var(--text-primary);
  cursor: pointer;
  transition: all 0.2s;
}

.q-option.right {
  border-color: var(--success, #34d399);
  color: var(--success, #34d399);
  background: var(--success-soft, rgba(52, 211, 153, 0.1));
  font-weight: 700;
}

.q-option.wrong {
  border-color: var(--danger, #f87171);
  color: var(--danger, #f87171);
  background: var(--danger-soft, rgba(248, 113, 113, 0.1));
}

.q-explain {
  margin-top: 10px;
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.6;
  border-top: 1px dashed var(--accent-border);
  padding-top: 10px;
}

.quiz-score {
  text-align: center;
  font-size: 15px;
  font-weight: 700;
  color: var(--accent);
}

/* 完成提示条（题目隐藏后显示） */
.quiz-done-tip {
  margin-top: 20px;
  padding: 14px 16px;
  background: var(--bg-card);
  border: 1px dashed var(--accent-border);
  border-radius: 14px;
  font-size: 13px;
  color: var(--text-secondary);
}

.done-link {
  color: var(--accent);
  cursor: pointer;
  margin: 0 2px;
}

/* 解句模式底部操作条 */
.select-bar {
  position: fixed;
  left: 50%;
  transform: translateX(-50%);
  bottom: 90px;
  z-index: 3000;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  background: var(--bg-card);
  border: 1px solid var(--accent-border);
  border-radius: 999px;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.35);
}

.sb-count {
  font-size: 13px;
  color: var(--text-primary);
}

/* 查词气泡 */
.word-bubble {
  position: fixed;
  z-index: 4000;
  width: 240px;
  padding: 12px 14px;
  background: var(--bg-card);
  border: 1px solid var(--accent-border);
  border-radius: 12px;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.4);
}

.wb-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.wb-word {
  font-size: 17px;
  font-weight: 700;
  color: var(--text-primary);
  font-family: var(--font-display);
}

.wb-phonetic {
  font-size: 12px;
  color: var(--accent);
  cursor: pointer;
}

.wb-mean {
  margin-top: 6px;
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.5;
}

.wb-add {
  margin-top: 10px;
  width: 100%;
  padding: 7px 0;
  border-radius: 8px;
  border: 1px solid var(--accent);
  background: transparent;
  color: var(--accent);
  font-size: 13px;
  cursor: pointer;
}

.wb-add:disabled {
  opacity: 0.6;
  cursor: default;
}

.wb-miss {
  font-size: 13px;
  color: var(--text-secondary);
}

.wb-close {
  position: absolute;
  right: 8px;
  top: 6px;
  font-size: 12px;
  color: var(--text-muted);
  cursor: pointer;
}

/* 解析卡片 */
.analyze-card {
  padding: 20px 18px 24px;
  max-height: 62vh;
  overflow-y: auto;
}

.ac-text {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.7;
  font-family: var(--font-display);
}

.ac-block {
  margin-top: 14px;
}

.ac-label {
  font-size: 12px;
  color: var(--accent);
  margin-bottom: 6px;
  font-weight: 700;
}

.ac-translation {
  font-size: 14px;
  color: var(--text-primary);
  line-height: 1.7;
}

.ac-chunk {
  padding: 8px 10px;
  margin: 6px 0;
  background: var(--bg-elevated);
  border-radius: 8px;
  font-size: 13px;
  color: var(--text-primary);
}

.ac-role {
  color: var(--accent);
  font-weight: 700;
  margin-right: 8px;
}

.ac-chunk-text {
  font-family: var(--font-display);
}

.ac-desc {
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-secondary);
}

.ac-loading {
  margin-top: 16px;
  text-align: center;
  font-size: 13px;
  color: var(--text-secondary);
}

.ac-actions {
  margin-top: 18px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.rate-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-secondary);
}

.rate-pill {
  padding: 4px 12px;
  border-radius: 999px;
  border: 1px solid var(--accent-border);
  cursor: pointer;
}

.rate-pill.active {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}
</style>
