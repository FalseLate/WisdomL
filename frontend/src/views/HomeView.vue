<template>
  <div class="home-view">
    <!-- ===== 仪表盘首页 ===== -->
    <div v-if="mode === 'dashboard'" class="dashboard">
      <!-- 网格背景 -->
      <div class="grid-bg"></div>

      <!-- 顶部导航 -->
      <nav class="navbar" :class="{ visible: navVisible }">
        <div class="logo">智<span>复习</span></div>
        <div class="nav-actions">
          <div class="icon-btn" @click="goNotifications">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            </svg>
            <div class="badge-dot">3</div>
          </div>
          <div class="icon-btn" @click="goProfile">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
          </div>
        </div>
      </nav>

      <div class="container">
        <!-- Hero -->
        <section class="hero" :class="{ visible: heroVisible }">
          <div class="hero-eyebrow">
            <span class="pulse"></span>
            AI LEARNING SYSTEM
          </div>
          <h1 class="hero-title">
            <span class="line1">智能出题</span>
            <span class="line2">高效复习</span>
          </h1>
          <p class="hero-sub">拍照、文本、文件多模态输入，AI 智能生成试题，让每一分钟复习都有价值。</p>
        </section>

        <!-- 数据统计 -->
        <div class="stats-bar" :class="{ visible: statsVisible }">
          <div class="stat">
            <div class="stat-value cyan">{{ stats.total }}</div>
            <div class="stat-label">已生成</div>
          </div>
          <div class="stat">
            <div class="stat-value green">{{ stats.accuracy }}%</div>
            <div class="stat-label">正确率</div>
          </div>
          <div class="stat">
            <div class="stat-value magenta">{{ stats.streak }}</div>
            <div class="stat-label">连续天数</div>
          </div>
        </div>

        <!-- 出题方式 -->
        <section class="section" :class="{ visible: section1Visible }">
          <div class="section-head">
            <div class="section-name"><span class="bar"></span>出题方式</div>
            <div class="section-more" @click="openGenerate('text')">
              全部
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M9 18l6-6-6-6"/>
              </svg>
            </div>
          </div>
          <div class="func-grid">
            <!-- WORD 背单词 -->
            <div class="func-card" style="--card-accent: #00f5ff; --card-glow: rgba(0,245,255,0.12); --icon-bg: rgba(0,245,255,0.1); --icon-border: rgba(0,245,255,0.2);"
              @click="goWordQuiz">
              <div class="func-tag tag-new">NEW</div>
              <div class="func-icon">📖</div>
              <div class="func-name">WORD</div>
              <div class="func-desc">单词记忆智能刷题</div>
            </div>

            <!-- PHOTO -->
            <div class="func-card" style="--card-accent: #ff00ff; --card-glow: rgba(255,0,255,0.12); --icon-bg: rgba(255,0,255,0.1); --icon-border: rgba(255,0,255,0.2);"
              @click="openGenerate('photo')">
              <div class="func-tag tag-hot">HOT</div>
              <div class="func-icon">📷</div>
              <div class="func-name">PHOTO</div>
              <div class="func-desc">拍照 OCR 识别书本内容</div>
            </div>

            <!-- FILE -->
            <div class="func-card" style="--card-accent: #f9f002; --card-glow: rgba(249,240,2,0.12); --icon-bg: rgba(249,240,2,0.1); --icon-border: rgba(249,240,2,0.2);"
              @click="openGenerate('file')">
              <div class="func-icon">📁</div>
              <div class="func-name">FILE</div>
              <div class="func-desc">PDF / Word 按章节出题</div>
            </div>

            <!-- AI MIND -->
            <div class="func-card" style="--card-accent: #00ff88; --card-glow: rgba(0,255,136,0.12); --icon-bg: rgba(0,255,136,0.1); --icon-border: rgba(0,255,136,0.2);"
              @click="openAiMind">
              <div class="func-tag tag-new">NEW</div>
              <div class="func-icon">🧠</div>
              <div class="func-name">AI MIND</div>
              <div class="func-desc">知识图谱智能分析</div>
            </div>
          </div>
        </section>

        <!-- 学习中心 -->
        <section class="section" :class="{ visible: section2Visible }">
          <div class="section-head">
            <div class="section-name"><span class="bar"></span>学习中心</div>
          </div>
          <div class="quick-grid">
            <div class="quick-item" @click="$router.push('/question-bank')">
              <div class="quick-icon">📎</div>
              <div class="quick-label">题库</div>
            </div>
            <div class="quick-item" @click="$router.push('/wrong-questions')">
              <div class="quick-icon">❌</div>
              <div class="quick-label">错题</div>
            </div>
            <div class="quick-item" @click="$router.push('/favorites')">
              <div class="quick-icon">⭐</div>
              <div class="quick-label">收藏</div>
            </div>
            <div class="quick-item" @click="$router.push('/history')">
              <div class="quick-icon">📚</div>
              <div class="quick-label">历史</div>
            </div>
          </div>
        </section>
      </div>

      <!-- 底部导航 -->
      <nav class="bottom-nav" :class="{ visible: bottomNavVisible }">
        <div class="nav-item active" @click="scrollToTop">
          <div class="nav-icon">🏠</div>
          <div class="nav-label">首页</div>
        </div>
        <div class="nav-item" @click="$router.push('/question-bank')">
          <div class="nav-icon">📎</div>
          <div class="nav-label">题库</div>
        </div>
        <div class="nav-item" @click="goAnalysis">
          <div class="nav-icon">📊</div>
          <div class="nav-label">分析</div>
        </div>
        <div class="nav-item" @click="goProfile">
          <div class="nav-icon">👤</div>
          <div class="nav-label">我的</div>
        </div>
      </nav>
    </div>

    <!-- ===== 出题界面 ===== -->
    <div v-if="mode === 'generate'" class="generate-mode">
      <CyberNavbar title="智能出题" :show-back="true" @back="backToDashboard" />

      <div class="generate-container">
        <!-- Tab 切换 -->
        <div class="cyber-tabs">
          <div class="tab-item" :class="{ active: activeTab === 0 }" @click="activeTab = 0">✏️ 文生题</div>
          <div class="tab-item" :class="{ active: activeTab === 1 }" @click="activeTab = 1">📷 拍照识题</div>
          <div class="tab-item" :class="{ active: activeTab === 2 }" @click="activeTab = 2">📁 上传文件</div>
        </div>

        <!-- 文生题 -->
        <div v-if="activeTab === 0">
          <TextInputCard v-model="inputText" :loading="loading" @generate="handleGenerate" />
          <LoadingSkeleton v-if="loading" />
        </div>

        <!-- 拍照识题 -->
        <div v-if="activeTab === 1">
          <PhotoInputCard :loading="pLoading" @generate="handlePhotoGenerate" />
          <LoadingSkeleton v-if="pLoading" />
          <div v-if="visImg" class="viz-card">
            <div class="viz-title">🔍 AI 版面分析结果</div>
            <img :src="visImg" class="viz-img" @click="showViz=true" />
            <div class="viz-info">检测到 {{ regCount }} 个文字区域</div>
          </div>
          <div v-if="showViz" class="viz-overlay" @click="showViz=false">
            <img :src="visImg" class="viz-full" />
          </div>
        </div>

        <!-- 上传文件 -->
        <div v-if="activeTab === 2">
          <FileUploadCard :loading="fLoading" @upload="handleFileUpload" />
          <LoadingSkeleton v-if="fLoading" />

          <div v-if="upDone" class="section-list">
            <div class="summary-bar">
              📊 共 {{ fileResults.length }} 个文档，{{ totalSecCount }} 个章节，{{ totalWords }} 字
            </div>
            <div class="type-selector-card">
              <div class="type-label">出题类型：</div>
              <div class="radio-group">
                <label class="radio-item" :class="{ checked: fileQT === 'all' }" @click="fileQT='all'">
                  <span class="radio-dot"></span>📝 全部
                </label>
                <label class="radio-item" :class="{ checked: fileQT === 'objective' }" @click="fileQT='objective'">
                  <span class="radio-dot"></span>📋 客观
                </label>
                <label class="radio-item" :class="{ checked: fileQT === 'subjective' }" @click="fileQT='subjective'">
                  <span class="radio-dot"></span>✍️ 主观
                </label>
              </div>
            </div>

            <div class="file-cards-scroll">
              <div v-for="(fr, fi) in fileResults" :key="fi" class="file-card" :class="{ 'pure-card': fr.isPure }">
                <div class="file-card-header">
                  <span class="file-icon">{{ fr.isPure ? '🟢' : '📘' }}</span>
                  <span class="file-name">{{ fr.name }}</span>
                  <span class="file-tag">{{ fr.isPure ? '纯题目 · ' + fr.questions.length + '题' : '理论文档 · ' + fr.words + '字' }}</span>
                </div>

                <template v-if="fr.isPure">
                  <div class="section-items border-b">
                    <div class="section-item" :class="{checked:selPures.includes(fi)}" @click="togglePure(fi)">
                      <span class="sec-chk" :class="{checked:selPures.includes(fi)}">
                        <span v-if="selPures.includes(fi)" class="check-icon">✓</span>
                      </span>
                      <span class="sec-title">🟢 直接提取原题（{{ fr.questions.length }}题）</span>
                      <span class="sec-words">不AI改写</span>
                    </div>
                  </div>
                  <div class="section-items">
                    <div v-for="s in fr.sections" :key="s.id" class="section-item" :class="{checked:selSecs.includes(s.id)}" @click="toggleSec(s.id)">
                      <span class="sec-chk" :class="{checked:selSecs.includes(s.id)}">
                        <span v-if="selSecs.includes(s.id)" class="check-icon">✓</span>
                      </span>
                      <span class="sec-title">{{ s.title }}</span>
                      <span class="sec-words">({{ s.wordCount }}字)</span>
                    </div>
                  </div>
                </template>

                <template v-if="!fr.isPure || fr.showSections">
                  <div class="section-items">
                    <div v-for="s in fr.sections" :key="s.id" class="section-item" :class="{checked:selSecs.includes(s.id)}" @click="toggleSec(s.id)">
                      <span class="sec-chk" :class="{checked:selSecs.includes(s.id)}">
                        <span v-if="selSecs.includes(s.id)" class="check-icon">✓</span>
                      </span>
                      <span class="sec-title">{{ s.title }}</span>
                      <span class="sec-words">({{ s.wordCount }}字)</span>
                    </div>
                  </div>
                </template>
              </div>
            </div>

            <div class="section-header">
              <span>已选 {{ selSecs.length }} 章节 + {{ selPures.length }} 纯题目</span>
              <div class="header-actions">
                <span class="mini-btn" @click="selAll">全选</span>
                <span class="mini-btn ghost" @click="deselAll">取消</span>
              </div>
            </div>
            <CyberButton
              variant="primary"
              block
              :loading="genLoading"
              :disabled="selSecs.length===0 && selPures.length===0"
              class="gen-btn"
              @click="genFromSecs"
            >
              ✅ 开始生成（{{ selSecs.length }}章节 + {{ selPures.length }}纯题目）
            </CyberButton>
          </div>
          <div v-if="upDone" class="reupload" @click="resetUp">🔄 重新选择</div>
        </div>

        <!-- 快捷入口 -->
        <div class="bottom-entries">
          <div class="entry-item" @click="$router.push('/question-bank')">📎 我的题库</div>
          <div class="entry-item" @click="$router.push('/history')">📚 历史记录</div>
          <div class="entry-item" @click="goWordQuiz">📖 单词刷题</div>
        </div>
      </div>
    </div>

    <!-- ===== 登录弹窗 ===== -->
    <div v-if="showLoginDialog" class="dialog-overlay" @click.self="showLoginDialog=false">
      <div class="dialog-box">
        <div class="dialog-accent-line"></div>
        <div class="dialog-title">🔒 需要登录</div>
        <p class="dialog-msg">请先登录后再使用此功能</p>
        <div class="dialog-actions">
          <CyberButton variant="primary" block @click="$router.push('/login')">去登录</CyberButton>
          <CyberButton variant="ghost" block @click="showLoginDialog=false">留在首页</CyberButton>
        </div>
      </div>
    </div>

    <!-- ===== 出题完成弹窗 ===== -->
    <div v-if="showGenDialog" class="dialog-overlay" @click.self="showGenDialog=false">
      <div class="dialog-box">
        <div class="dialog-accent-line"></div>
        <div class="dialog-icon">📎</div>
        <div class="dialog-title">出题完成</div>
        <div class="dialog-stats">
          <div class="ds-item">
            <span class="ds-num">{{ genTotal }}</span>
            <span class="ds-label">总题数</span>
          </div>
          <div class="ds-item">
            <span class="ds-num cyan">{{ genObj }}</span>
            <span class="ds-label">客观题</span>
          </div>
          <div class="ds-item">
            <span class="ds-num magenta">{{ genSub }}</span>
            <span class="ds-label">主观题</span>
          </div>
        </div>
        <p v-if="genMissingCount > 0" class="dialog-warning">
          ⚠️ {{ genMissingCount }} 道题答案/解析缺失，可进入刷题后手动重试生成
        </p>
        <div class="dialog-actions">
          <CyberButton variant="primary" block @click="goPractice">📝 立即刷题</CyberButton>
          <CyberButton variant="ghost" block @click="showGenDialog=false">留在首页</CyberButton>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, nextTick } from 'vue'
import { showFailToast, showSuccessToast } from 'vant'
import { useRouter } from 'vue-router'
import { isLoggedIn } from '../utils/auth.js'
import { useQuestionsStore } from '../stores/questions'
import { usePracticeStore } from '../stores/practice'
import { useNotificationStore } from '../stores/notification'
import { pollTask } from '../utils/pollTask.js'
import request from '../utils/request.js'
import TextInputCard from '../components/TextInputCard.vue'
import PhotoInputCard from '../components/PhotoInputCard.vue'
import FileUploadCard from '../components/FileUploadCard.vue'
import LoadingSkeleton from '../components/LoadingSkeleton.vue'
import { CyberNavbar, CyberButton } from '../components/cyber'

const router = useRouter()
const qStore = useQuestionsStore()
const pStore = usePracticeStore()
const notifyStore = useNotificationStore()

// 模式切换
const mode = ref('dashboard')

// 入场动画
const heroVisible = ref(false)
const statsVisible = ref(false)
const section1Visible = ref(false)
const section2Visible = ref(false)
const navVisible = ref(false)
const bottomNavVisible = ref(false)

// 统计数据（模拟）
const stats = reactive({
  total: 256,
  accuracy: 89,
  streak: 7
})

// 原来的出题状态
const activeTab = ref(0)
const inputText = ref('')
const loading = ref(false)
const genLoading = ref(false)
const fLoading = ref(false)
const pLoading = ref(false)
const showGenDialog = ref(false)
const showLoginDialog = ref(false)
const genTotal = ref(0)
const genObj = ref(0)
const genSub = ref(0)
const genMissingCount = ref(0)
const visImg = ref('')
const showViz = ref(false)
const regCount = ref(0)
const upDone = ref(false)
const fileResults = ref([])
const selSecs = ref([])
const selPures = ref([])
const secTexts = ref({})
const fileQT = ref('all')

const totalSecCount = computed(() => {
  let c = 0; fileResults.value.forEach(fr => c += fr.sections.length); return c
})
const totalWords = computed(() => {
  let w = 0; fileResults.value.forEach(fr => w += fr.words); return w
})

onMounted(async () => {
  // 等字体加载完成，避免文字闪烁
  try {
    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready
    }
  } catch (e) {}

  // 首次加载时 SplashScreen 显示 2.5s，等它结束后再播放入场动画
  // 从其他页面返回时立即播放
  const isFirstLoad = performance.now() < 2500
  const baseDelay = isFirstLoad ? 1500 : 50
  // 入场顺序：navbar → hero → stats → section1 → section2 → bottom-nav
  setTimeout(() => { navVisible.value = true }, baseDelay)
  setTimeout(() => { heroVisible.value = true }, baseDelay + 120)
  setTimeout(() => { statsVisible.value = true }, baseDelay + 240)
  setTimeout(() => { section1Visible.value = true }, baseDelay + 360)
  setTimeout(() => { section2Visible.value = true }, baseDelay + 480)
  setTimeout(() => { bottomNavVisible.value = true }, baseDelay + 600)
})

function openGenerate(tab) {
  const tabMap = { text: 0, photo: 1, file: 2 }
  activeTab.value = tabMap[tab] ?? 0
  mode.value = 'generate'
  nextTick(() => { window.scrollTo(0, 0) })
}

function backToDashboard() {
  mode.value = 'dashboard'
  nextTick(() => { window.scrollTo(0, 0) })
}

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function goNotifications() {
  showSuccessToast('暂无新通知')
}

function goAnalysis() {
  showSuccessToast('数据分析功能开发中')
}

function openAiMind() {
  showSuccessToast('AI 知识图谱功能开发中')
}

// ===== 原来的出题逻辑（完整保留） =====
async function handleGenerate({ text, questionType }) {
  if (!text?.trim()) { showFailToast('请输入复习资料'); return }
  if (!isLoggedIn()) { showLoginDialog.value = true; return }
    loading.value = true
    notifyStore.startGenerating('正在分析文本，生成试题...')
    try {
      const res = await request.post('/generate-async', { text, questionType, title: '文本出题' })
      const taskId = res.taskId
      if (!taskId) { showFailToast('创建任务失败'); notifyStore.finishGenerating(null); return }
      notifyStore.message = 'AI正在出题中...（你可以去刷其他题目）'
      const result = await pollTask(taskId)
      popDialog(result)
    } catch (e) { showFailToast(e.message || '出题失败'); notifyStore.finishGenerating(null) }
    finally { loading.value = false }
}

async function handlePhotoGenerate({ files, questionType }) {
  if (!files || files.length===0) { showFailToast('请先拍照或选择图片'); return }
  if (!isLoggedIn()) { showLoginDialog.value = true; return }
  pLoading.value = true
  notifyStore.startGenerating('正在OCR识别，生成试题...')
  try {
    const tasks = files.map(file => {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('questionType', questionType)
      return request.post('/photo-and-generate-async', fd, { timeout: 180000 })
        .then(res => pollTask(res.taskId))
        .catch(() => null)
    })
    const results = await Promise.all(tasks)

    let allObj = [], allSub = [], totalCount = 0, objCount = 0, subCount = 0
    let firstVis = '', firstRegCount = 0

    results.forEach(r => {
      if (!r || r.error) return
      if (!firstVis && r.visualization) { firstVis = r.visualization; firstRegCount = r.regionCount || 0 }
      allObj.push(...(r.objectiveQuestions || []))
      allSub.push(...(r.subjectiveQuestions || []))
      totalCount += r.totalCount || 0
      objCount += r.objectiveCount || 0
      subCount += r.subjectiveCount || 0
    })

    if (allObj.length === 0 && allSub.length === 0) { showFailToast('所有图片识别失败'); notifyStore.finishGenerating(null); return }
    visImg.value = firstVis ? 'data:image/jpeg;base64,' + firstVis : ''
    regCount.value = firstRegCount
    popDialog({ totalCount, objectiveCount: objCount, subjectiveCount: subCount, objectiveQuestions: allObj, subjectiveQuestions: allSub })
  } catch (e) { showFailToast(e.message || '识别失败'); notifyStore.finishGenerating(null) }
  finally { pLoading.value = false }
}

async function handleFileUpload({ files, questionType }) {
  fLoading.value = true
  try {
    const tasks = files.map(file => {
      const fd = new FormData()
      fd.append('file', file)
      return request.post('/upload', fd, { timeout: 180000 }).catch(() => null)
    })
    const results = await Promise.all(tasks)

    const frList = []
    let secIdx = 0
    const txt = {}

    results.forEach((r, idx) => {
      if (!r || r.error) return
      const sections = (r.sections || []).map(s => {
        secIdx++
        const prefix = '[' + r.fileName + '] '
        const id = 'sec-' + secIdx
        const sec = { id, title: prefix + s.title, text: s.text, wordCount: s.wordCount }
        txt[id] = s.text
        return sec
      })
      frList.push({
        name: r.fileName || ('文件' + (idx + 1)),
        isPure: !!r.isPureQuestions,
        sections: sections,
        questions: r.extractedQuestions || [],
        words: r.totalWords || 0,
        showSections: false
      })
    })

    if (frList.length === 0) { showFailToast('未能提取到文字内容'); return }
    fileResults.value = frList
    secTexts.value = txt
    upDone.value = true
  } catch (e) { showFailToast(e.message || '上传失败') }
  finally { fLoading.value = false }
}

function toggleSec(id) { const i = selSecs.value.indexOf(id); i >= 0 ? selSecs.value.splice(i, 1) : selSecs.value.push(id) }
function selAll() { selSecs.value = []; fileResults.value.forEach(fr => fr.sections.forEach(s => selSecs.value.push(s.id))) }
function deselAll() { selSecs.value = []; selPures.value = [] }
function resetUp() { upDone.value = false; fileResults.value = []; selSecs.value = []; selPures.value = []; secTexts.value = {} }
function togglePure(fi) { const i = selPures.value.indexOf(fi); i >= 0 ? selPures.value.splice(i, 1) : selPures.value.push(fi) }

async function genFromSecs() {
  if (selSecs.value.length === 0 && selPures.value.length === 0) { showFailToast('请选择章节或纯题目'); return }
  if (!isLoggedIn()) { showLoginDialog.value = true; return }
  genLoading.value = true
  notifyStore.startGenerating('正在生成试题...')
  try {
    let allQs = []
    let pureQuestions = []
    for (const fi of selPures.value) {
      const fr = fileResults.value[fi]
      if (!fr || fr.questions.length === 0) continue
      try { const res = await request.post('/verify-answers', { questions: fr.questions }); const verified = res.questions || fr.questions; allQs.push(...verified); pureQuestions.push(...verified) }
      catch(e) { allQs.push(...fr.questions); pureQuestions.push(...fr.questions) }
    }
    if (pureQuestions.length > 0) {
      try { await request.post('/generate-from-extracted', { questions: pureQuestions }) } catch(e) { console.warn('纯题目保存失败', e.message) }
    }
    if (selSecs.value.length > 0) {
      const createRes = await request.post('/generate-from-sections-async', { sectionIds: selSecs.value, sectionTexts: secTexts.value, questionType: fileQT.value, title: fileResults.value[selPures.value[0]]?.name || '文件出题' })
      const taskId = createRes.taskId
      notifyStore.message = 'AI正在按章节出题...（你可以去刷其他题目）'
      const result = await pollTask(taskId)
      if (result.error) { showFailToast(result.error); notifyStore.finishGenerating(null); return }
      allQs.push(...(result.objectiveQuestions || []))
      allQs.push(...(result.subjectiveQuestions || []))
    }
    if (allQs.length === 0) { showFailToast('生成失败'); return }
    const subQs = allQs.filter(q => q.type === 'subjective')
    const objQs = allQs.filter(q => q.type !== 'subjective')
    popDialog({ totalCount: allQs.length, objectiveQuestions: objQs, subjectiveQuestions: subQs })
  } catch (e) { showFailToast(e.message || '出题失败'); notifyStore.finishGenerating(null) }
  finally { genLoading.value = false }
}

function popDialog(r) {
  const qs = r.objectiveQuestions || []; const ss = r.subjectiveQuestions || []
  const all = [...qs, ...ss]
  genTotal.value = r.totalCount || qs.length + ss.length
  genObj.value = qs.length
  genSub.value = ss.length
  genMissingCount.value = countMissingAnswers(all)
  notifyStore.finishGenerating({
    total: r.totalCount || qs.length + ss.length,
    objectiveCount: qs.length,
    subjectiveCount: ss.length,
    missingCount: countMissingAnswers(all)
  })
  showGenDialog.value = true
}

function countMissingAnswers(questions) {
  return questions.filter(q => {
    const ans = q.answer
    const exp = q.explanation
    const missingAns = ans == null || typeof ans !== 'string' || ans === '参考答案未提供' || ans === '未提供' || ans.trim() === ''
    const missingExp = exp == null || typeof exp !== 'string' || exp === '解析未提供' || exp === '解析生成失败' || exp === '未提供' || exp.trim() === ''
    return missingAns || missingExp
  }).length
}

function goPractice() { showGenDialog.value = false; if (router.currentRoute.value.path === '/question-bank') { window.location.reload() } else { router.push('/question-bank') } }
function goProfile() {
  if (!isLoggedIn()) { showLoginDialog.value = true; return }
  router.push("/user-center")
}

const goWordQuiz = () => {
  if (!isLoggedIn()) {
    showLoginDialog.value = true
    return
  }
  router.push('/word-quiz')
}
</script>

<style scoped>
.home-view {
  min-height: 100dvh;
  background: var(--bg-base);
  position: relative;
}

/* ===== 仪表盘 ===== */
.dashboard {
  min-height: 100dvh;
  position: relative;
}

.grid-bg {
  position: fixed;
  inset: 0;
  background-image:
    linear-gradient(rgba(0, 245, 255, 0.02) 1px, transparent 1px),
    linear-gradient(90deg, rgba(0, 245, 255, 0.02) 1px, transparent 1px);
  background-size: 48px 48px;
  pointer-events: none;
  z-index: 0;
}

.container {
  position: relative;
  z-index: 10;
  max-width: 480px;
  margin: 0 auto;
  padding: 0 20px 120px;
  min-height: 100dvh;
}

/* 顶部导航 */
.navbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  height: 60px;
  position: relative;
  z-index: 20;
  max-width: 480px;
  margin: 0 auto;
  opacity: 0;
  transform: translateY(-12px);
  transition: opacity 0.6s var(--ease-out), transform 0.6s var(--ease-out);
}

.navbar.visible {
  opacity: 1;
  transform: translateY(0);
}

.logo {
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 900;
  color: var(--accent);
  text-shadow: 0 0 10px rgba(0,245,255,0.8), 0 0 30px rgba(0,245,255,0.4), 0 0 60px rgba(0,245,255,0.2);
  letter-spacing: 3px;
}

.logo span {
  color: var(--secondary);
  text-shadow: 0 0 10px rgba(255,0,255,0.8), 0 0 30px rgba(255,0,255,0.4), 0 0 60px rgba(255,0,255,0.2);
}

.nav-actions { display: flex; gap: 8px; }

.icon-btn {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-button);
  border: 1px solid var(--accent-border);
  background: var(--bg-elevated);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--accent);
  cursor: pointer;
  transition: all 0.25s var(--ease-out);
  backdrop-filter: blur(10px);
  position: relative;
}

.icon-btn:hover {
  border-color: var(--accent);
  box-shadow: var(--accent-glow);
  transform: translateY(-1px);
}

.icon-btn:active { transform: translateY(0) scale(0.97); }

.badge-dot {
  position: absolute;
  top: -4px;
  right: -4px;
  width: 16px;
  height: 16px;
  background: var(--secondary);
  border-radius: 50%;
  font-size: 9px;
  font-weight: 700;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 0 8px var(--secondary);
}

/* Hero */
.hero {
  margin: 20px 0 28px;
  opacity: 0;
  transform: translateY(20px);
  transition: opacity 0.7s var(--ease-out), transform 0.7s var(--ease-out);
}

.hero.visible { opacity: 1; transform: translateY(0); }

.hero-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 5px 14px;
  border: 1px solid var(--accent-border);
  border-radius: var(--radius-pill);
  font-size: 10px;
  font-family: var(--font-display);
  font-weight: 600;
  color: var(--accent);
  letter-spacing: 2px;
  margin-bottom: 18px;
  background: var(--accent-soft);
}

.hero-eyebrow .pulse {
  width: 6px;
  height: 6px;
  background: var(--success);
  border-radius: 50%;
  box-shadow: 0 0 8px var(--success);
  animation: pulse 2s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.4; transform: scale(0.8); }
}

.hero-title {
  font-family: var(--font-display);
  font-size: 38px;
  font-weight: 900;
  line-height: 1.15;
  margin-bottom: 14px;
  letter-spacing: -0.5px;
}

.hero-title .line1 {
  display: block;
  background: linear-gradient(135deg, #ffffff 0%, #a0faff 50%, var(--accent) 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  filter: drop-shadow(0 0 12px rgba(0,245,255,0.3));
}

.hero-title .line2 {
  display: block;
  background: linear-gradient(135deg, var(--accent) 0%, #a855f7 50%, var(--secondary) 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  filter: drop-shadow(0 0 12px rgba(255,0,255,0.3));
}

.hero-sub {
  font-size: 14px;
  color: var(--text-secondary);
  line-height: 1.7;
  max-width: 320px;
}

/* 数据统计 */
.stats-bar {
  display: flex;
  background: var(--bg-elevated);
  border: 1px solid var(--accent-border);
  border-radius: var(--radius-card);
  padding: 18px 14px;
  margin-bottom: 28px;
  backdrop-filter: blur(12px);
  opacity: 0;
  transform: translateY(20px);
  transition: opacity 0.6s var(--ease-out), transform 0.6s var(--ease-out);
}

.stats-bar.visible { opacity: 1; transform: translateY(0); }

.stat {
  flex: 1;
  text-align: center;
  position: relative;
}

.stat:not(:last-child)::after {
  content: '';
  position: absolute;
  right: 0;
  top: 20%;
  height: 60%;
  width: 1px;
  background: var(--accent-border);
}

.stat-value {
  font-family: var(--font-display);
  font-size: 26px;
  font-weight: 800;
  margin-bottom: 4px;
}

.stat-value.cyan { color: var(--accent); text-shadow: 0 0 8px rgba(0,245,255,0.6), 0 0 20px rgba(0,245,255,0.3); }
.stat-value.green { color: var(--success); text-shadow: 0 0 8px rgba(0,255,136,0.6), 0 0 20px rgba(0,255,136,0.3); }
.stat-value.magenta { color: var(--secondary); text-shadow: 0 0 8px rgba(255,0,255,0.6), 0 0 20px rgba(255,0,255,0.3); }

.stat-label {
  font-size: 11px;
  color: var(--text-muted);
  letter-spacing: 0.5px;
}

/* Section */
.section {
  margin-bottom: 26px;
  opacity: 0;
  transform: translateY(20px);
  transition: opacity 0.6s var(--ease-out), transform 0.6s var(--ease-out);
}

.section.visible { opacity: 1; transform: translateY(0); }

.section-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;
  padding: 0 2px;
}

.section-name {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 10px;
  letter-spacing: 0.5px;
}

.section-name .bar {
  width: 3px;
  height: 14px;
  background: var(--accent);
  border-radius: 2px;
  box-shadow: 0 0 8px var(--accent);
}

.section-more {
  font-size: 12px;
  color: var(--text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 2px;
  transition: color 0.2s;
}

.section-more:hover { color: var(--accent); }

/* 功能卡片 2x2 */
.func-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.func-card {
  position: relative;
  padding: 18px 14px;
  border-radius: var(--radius-card);
  background: var(--bg-elevated);
  border: 1px solid var(--accent-border);
  backdrop-filter: blur(12px);
  cursor: pointer;
  transition: all 0.35s var(--ease-out);
  overflow: hidden;
  min-height: 148px;
  display: flex;
  flex-direction: column;
}

.func-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: linear-gradient(90deg, transparent, var(--card-accent, var(--accent)), transparent);
  opacity: 0;
  transition: opacity 0.3s;
}

.func-card:hover {
  transform: translateY(-4px);
  border-color: var(--card-accent, var(--accent));
  background: var(--bg-hover);
  box-shadow: 0 12px 32px rgba(0,0,0,0.3), 0 0 24px var(--card-glow, rgba(0,245,255,0.12));
}

.func-card:hover::before { opacity: 1; }
.func-card:active { transform: translateY(-2px) scale(0.98); }

.func-icon {
  width: 44px;
  height: 44px;
  border-radius: var(--radius-button);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  margin-bottom: 12px;
  background: var(--icon-bg, var(--accent-soft));
  border: 1px solid var(--icon-border, var(--accent-border));
}

.func-name {
  font-family: var(--font-display);
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 4px;
  letter-spacing: 0.5px;
}

.func-desc {
  font-size: 11px;
  color: var(--text-secondary);
  line-height: 1.5;
  flex: 1;
}

.func-tag {
  position: absolute;
  top: 12px;
  right: 12px;
  padding: 2px 7px;
  border-radius: 6px;
  font-size: 8px;
  font-weight: 700;
  letter-spacing: 1px;
  font-family: var(--font-display);
}

.tag-new {
  background: var(--secondary-soft);
  color: var(--secondary);
  border: 1px solid rgba(255,0,255,0.3);
}

.tag-hot {
  background: rgba(249,240,2,0.12);
  color: var(--warning);
  border: 1px solid rgba(249,240,2,0.3);
}

/* 快捷入口 */
.quick-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
}

.quick-item {
  padding: 16px 6px;
  border-radius: var(--radius-button);
  background: var(--bg-elevated);
  border: 1px solid var(--accent-border);
  backdrop-filter: blur(10px);
  text-align: center;
  cursor: pointer;
  transition: all 0.25s var(--ease-out);
}

.quick-item:hover {
  border-color: var(--accent);
  background: var(--bg-hover);
  transform: translateY(-2px);
}

.quick-item:active { transform: translateY(0) scale(0.97); }

.quick-icon { font-size: 20px; margin-bottom: 6px; }
.quick-label { font-size: 11px; color: var(--text-secondary); }

/* 底部导航 */
.bottom-nav {
  position: fixed;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 100%;
  max-width: 480px;
  padding: 10px 16px calc(10px + env(safe-area-inset-bottom));
  background: rgba(10, 10, 15, 0.92);
  backdrop-filter: blur(20px);
  border-top: 1px solid var(--accent-border);
  display: flex;
  justify-content: space-around;
  z-index: 50;
  opacity: 0;
  transform: translateX(-50%) translateY(20px);
  transition: opacity 0.5s var(--ease-out), transform 0.5s var(--ease-out);
}

.bottom-nav.visible {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
}

.nav-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 6px 14px;
  border-radius: var(--radius-button);
  cursor: pointer;
  transition: all 0.2s;
  color: var(--text-muted);
}

.nav-item.active {
  color: var(--accent);
  background: var(--accent-soft);
}

.nav-item.active .nav-icon {
  filter: drop-shadow(0 0 6px var(--accent));
  transform: translateY(-1px);
}

.nav-icon { font-size: 18px; transition: all 0.2s; }
.nav-label { font-size: 10px; font-weight: 500; }

/* ===== 出题界面 ===== */
.generate-mode {
  min-height: 100dvh;
  background: var(--bg-base);
  position: relative;
}

.generate-container {
  max-width: 480px;
  margin: 0 auto;
  padding: 16px 16px 100px;
  position: relative;
  z-index: 10;
}

/* Tab 切换 */
.cyber-tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 16px;
  background: var(--bg-elevated);
  padding: 4px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--accent-border);
}

.tab-item {
  flex: 1;
  text-align: center;
  padding: 10px 8px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  border-radius: var(--radius-pill);
  cursor: pointer;
  transition: all 0.25s var(--ease-out);
  white-space: nowrap;
}

.tab-item.active {
  background: linear-gradient(135deg, var(--accent), #00c8d4);
  color: #000;
  box-shadow: 0 2px 12px var(--accent-soft);
}

/* 版面分析 */
.viz-card {
  background: var(--bg-card);
  border: 1px solid var(--accent-border);
  border-radius: var(--radius-card);
  padding: 16px;
  margin: 8px 0;
  backdrop-filter: blur(12px);
}

.viz-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 10px;
}

.viz-img {
  width: 100%;
  border-radius: 8px;
  cursor: pointer;
}

.viz-info {
  font-size: 13px;
  color: var(--text-secondary);
  margin-top: 8px;
  text-align: center;
}

.viz-overlay {
  position: fixed;
  z-index: 9999;
  inset: 0;
  background: rgba(0,0,0,0.9);
  display: flex;
  align-items: center;
  justify-content: center;
}

.viz-full {
  max-width: 100vw;
  max-height: 100vh;
}

/* 文件章节选择 */
.section-list {
  background: var(--bg-card);
  border: 1px solid var(--accent-border);
  border-radius: var(--radius-card);
  overflow: hidden;
  margin: 8px 0;
  backdrop-filter: blur(12px);
}

.summary-bar {
  font-size: 13px;
  color: var(--accent);
  padding: 10px 16px;
  background: var(--accent-soft);
  border-bottom: 1px solid var(--accent-border);
  font-weight: 600;
}

.type-selector-card {
  padding: 12px 16px;
  border-bottom: 1px solid var(--accent-border);
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.type-label {
  font-size: 13px;
  color: var(--text-secondary);
  font-weight: 600;
  white-space: nowrap;
}

.radio-group {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.radio-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: var(--bg-elevated);
  border: 1px solid var(--accent-border);
  border-radius: 8px;
  font-size: 12px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s;
}

.radio-item.checked {
  border-color: var(--accent);
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 600;
}

.radio-dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid var(--accent-border);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.radio-item.checked .radio-dot {
  border-color: var(--accent);
}

.radio-item.checked .radio-dot::after {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent);
}

.file-cards-scroll {
  max-height: 48vh;
  overflow-y: auto;
  padding: 8px 0;
}

.file-card {
  background: var(--bg-elevated);
  border: 1px solid var(--accent-border);
  border-radius: 12px;
  margin: 8px 12px;
  overflow: hidden;
}

.file-card + .file-card {
  margin-top: 14px;
}

.file-card.pure-card {
  border-left: 4px solid var(--success);
}

.file-card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: rgba(255,255,255,0.02);
  border-bottom: 1px solid var(--accent-border);
}

.file-icon { font-size: 14px; }

.file-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-tag {
  font-size: 11px;
  color: var(--text-muted);
  flex-shrink: 0;
}

.section-items {
  padding: 4px 0;
}

.section-items.border-b {
  border-bottom: 1px solid var(--accent-border);
}

.section-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  cursor: pointer;
  border-bottom: 1px solid rgba(0,245,255,0.05);
  transition: all 0.2s;
}

.section-item:hover {
  background: var(--bg-hover);
}

.section-item.checked {
  background: var(--accent-soft);
}

.sec-chk {
  width: 20px;
  height: 20px;
  border-radius: 4px;
  border: 2px solid var(--text-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.2s;
}

.sec-chk.checked {
  border-color: var(--accent);
  background: var(--accent);
}

.check-icon {
  color: #000;
  font-size: 12px;
  font-weight: 700;
}

.sec-title {
  font-size: 14px;
  color: var(--text-primary);
  font-weight: 600;
  flex: 1;
}

.sec-words {
  font-size: 12px;
  color: var(--text-muted);
  margin-left: 6px;
  flex-shrink: 0;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 16px;
  border-top: 1px solid var(--accent-border);
}

.section-header span {
  font-size: 13px;
  color: var(--text-secondary);
  font-weight: 600;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.mini-btn {
  padding: 4px 10px;
  background: var(--accent-soft);
  border: 1px solid var(--accent);
  border-radius: 6px;
  font-size: 11px;
  color: var(--accent);
  cursor: pointer;
  transition: all 0.2s;
}

.mini-btn.ghost {
  background: transparent;
  border-color: var(--accent-border);
  color: var(--text-muted);
}

.mini-btn:hover {
  opacity: 0.8;
}

.gen-btn {
  margin: 12px 16px 16px;
  width: calc(100% - 32px);
}

.reupload {
  text-align: center;
  padding: 12px;
  font-size: 13px;
  color: var(--accent);
  cursor: pointer;
  transition: all 0.2s;
}

.reupload:hover {
  text-decoration: underline;
}

/* 底部快捷入口 */
.bottom-entries {
  display: flex;
  justify-content: center;
  gap: 12px;
  padding: 30px 0 20px;
  flex-wrap: wrap;
}

.entry-item {
  text-align: center;
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
  padding: 10px 16px;
  border-radius: 20px;
  background: var(--bg-elevated);
  border: 1px solid var(--accent-border);
  transition: all 0.25s var(--ease-out);
}

.entry-item:hover {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--accent-soft);
}

/* ===== 弹窗 ===== */
.dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(4px);
  z-index: 4000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.dialog-box {
  position: relative;
  background: rgba(10, 10, 15, 0.98);
  border: 1px solid var(--accent-border);
  border-radius: 20px;
  padding: 32px 24px 24px;
  max-width: 360px;
  width: 100%;
  box-shadow: 0 0 40px var(--accent-soft), 0 20px 60px rgba(0, 0, 0, 0.5);
  animation: dialogPop 0.4s var(--ease-out);
  overflow: hidden;
}

@keyframes dialogPop {
  from { opacity: 0; transform: scale(0.9) translateY(20px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}

.dialog-accent-line {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: linear-gradient(90deg, var(--accent), var(--secondary));
}

.dialog-icon {
  font-size: 48px;
  text-align: center;
  margin-bottom: 12px;
  filter: drop-shadow(0 0 12px var(--accent-soft));
}

.dialog-title {
  font-family: var(--font-display);
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary);
  text-align: center;
  margin-bottom: 16px;
  letter-spacing: 2px;
}

.dialog-msg {
  font-size: 14px;
  color: var(--text-secondary);
  text-align: center;
  margin-bottom: 20px;
  line-height: 1.6;
}

.dialog-stats {
  display: flex;
  justify-content: space-around;
  margin-bottom: 16px;
  padding: 16px 0;
  border-top: 1px solid var(--accent-border);
  border-bottom: 1px solid var(--accent-border);
}

.ds-item { text-align: center; }

.ds-num {
  display: block;
  font-family: var(--font-display);
  font-size: 24px;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.ds-num.cyan {
  color: var(--accent);
  text-shadow: 0 0 10px var(--accent-soft);
}

.ds-num.magenta {
  color: var(--secondary);
  text-shadow: 0 0 10px var(--secondary-soft);
}

.ds-label {
  font-size: 11px;
  color: var(--text-muted);
}

.dialog-warning {
  font-size: 12px;
  color: var(--warning);
  text-align: center;
  margin-bottom: 16px;
  line-height: 1.5;
}

.dialog-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
</style>
