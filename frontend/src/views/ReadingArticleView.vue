<template>
  <div class="page-wrap">
    <van-nav-bar :title="article.title || '阅读'" left-arrow @click-left="router.back()" />

    <!-- 正文（内容压过全局粒子画布）；查词/解句已升级为全局能力（虚拟人功能栏，任意页面可用） -->
    <div class="page-container">
      <div class="article-body" ref="bodyRef">
        <div class="para" v-for="(p, pi) in paragraphs" :key="pi">
          <span
            v-for="(s, si) in p._sentences"
            :key="si"
            class="sentence"
            :class="{ long: !!s._long, clickable: !!s._long }"
            @click="onSentenceClick(s, $event)"
          >
            <template v-for="(w, wi) in s._tokens" :key="w.gi">
              <span
                v-if="w.isWord"
                class="word"
                :class="{ 'in-vocab': inMyVocab(w.text) }"
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
        ✅ 本篇阅读已完成<template v-if="allAnswered">（得分 {{ quizScore }} / {{ questions.length }}）</template> · 答错的题去<a class="done-link" @click="router.push('/word/english-wrong')">英语错题复习</a>重做攻克
      </div>
    </div>

    <!-- 句子解析卡片（长难句点按解析仍在用） -->
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
import { ref, reactive, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showSuccessToast, showFailToast } from 'vant'
import { getReadingArticle, getReadingDone, finishReadingQuiz } from '../api/reading'
import { getMyCollectList } from '../api/word'
import { authState } from '../utils/auth.js'
import request from '../utils/request'

const route = useRoute()
const router = useRouter()

const article = ref({})
const paragraphs = ref([])
const questions = ref([])

// ===== 查词/解句已迁移为虚拟人功能栏的全局能力（PetTutor 内置），本页只保留长难句点按与生词本高亮 =====

// ===== 渲染模型：段落 → 句子 → 词元（词级 span 供生词本高亮着色） =====
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

// ===== 生词本高亮：阅读正文里命中生词本的词标黄（含常见词形变化） =====
const myVocab = ref(new Set())

function inMyVocab(token) {
  const t = cleanToken(token)
  if (!t || !myVocab.value.size) return false
  if (myVocab.value.has(t)) return true
  // 简单词形还原：collects→collect、lived→live、studying→study（还原后词根≥3字母才比对）
  for (const suf of ['s', 'es', 'ed', 'ing', "'s"]) {
    if (t.endsWith(suf)) {
      const base = t.slice(0, -suf.length)
      if (base.length >= 3 && myVocab.value.has(base)) return true
    }
  }
  return false
}

async function loadMyVocab() {
  try {
    const uid = await ensureUserId()
    if (!uid) return
    const res = await getMyCollectList(uid)
    if (res.code === 200 && Array.isArray(res.data)) {
      myVocab.value = new Set(res.data.map(w => (w.word || '').toLowerCase()))
    }
  } catch (e) { /* 生词本加载失败不影响正文展示 */ }
}

const totalWords = ref(0)

// ===== 长难句点击（点高亮句弹出解析卡片）=====
const card = reactive({ show: false, text: '', data: null, loading: false })

function onSentenceClick(s) {
  if (!s._long) return
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
  loadMyVocab()
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
</script>

<style scoped>
.page-wrap {
  min-height: 100dvh;
  background: var(--bg-base);
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

/* 生词本命中词：标黄 + 虚线下划线 */
.word.in-vocab {
  background: rgba(255, 193, 7, 0.28);
  box-shadow: inset 0 -2px 0 rgba(255, 152, 0, 0.55);
  border-radius: 3px;
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
