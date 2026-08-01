<template>
  <div class="home-view">
    <van-nav-bar title="📚智复习" fixed placeholder>
      <template #right><van-icon name="user-o" size="20" class="user-icon" @click="goProfile" /></template>
    </van-nav-bar>
    <div class="page-container">
      <van-tabs v-model:active="activeTab" color="#667eea" title-active-color="#667eea">
        <van-tab title="✏️ 文生题">
          <TextInputCard v-model="inputText" :loading="loading" @generate="handleGenerate" />
          <LoadingSkeleton v-if="loading" />
        </van-tab>
        <van-tab title="📷 拍照识题">
          <PhotoInputCard :loading="pLoading" @generate="handlePhotoGenerate" />
          <LoadingSkeleton v-if="pLoading" />
          <div v-if="visImg" class="card viz-card">
            <div class="viz-title">🔍 AI 版面分析结果</div>
            <van-image :src="visImg" fit="contain" style="width:100%;border-radius:8px" @click="showViz=true" />
            <div class="viz-info">检测到 {{ regCount }} 个文字区域</div>
          </div>
          <div v-if="showViz" class="viz-overlay" @click="showViz=false"><van-image :src="visImg" fit="contain" style="max-width:100vw;max-height:100vh" /></div>
        </van-tab>
        <van-tab title="📁 上传文件">
          <FileUploadCard :loading="fLoading" @upload="handleFileUpload" />
          <LoadingSkeleton v-if="fLoading" />
          <div v-if="upDone" class="card section-list">
            <div class="summary-bar">
              📊 共 {{ fileResults.length }} 个文档，{{ totalSecCount }} 个章节，{{ totalWords }} 字
            </div>
            <div class="card type-selector-card">
              <van-radio-group v-model="fileQT" direction="horizontal">
                <van-radio name="all" shape="square">📝 全部</van-radio>
                <van-radio name="objective" shape="square">📋 客观</van-radio>
                <van-radio name="subjective" shape="square">✍️ 主观</van-radio>
              </van-radio-group>
            </div>

            <!-- 可滚动文件卡片区域 -->
            <div class="file-cards-scroll">
            <div v-for="(fr, fi) in fileResults" :key="fi" class="file-card" :class="{ 'pure-card': fr.isPure }">
              <div class="file-card-header">
                <span class="file-icon">{{ fr.isPure ? '🟢' : '📘' }}</span>
                <span class="file-name">{{ fr.name }}</span>
                <span class="file-tag">{{ fr.isPure ? '纯题目 · ' + fr.questions.length + '题' : '理论文档 · ' + fr.words + '字' }}</span>
              </div>

              <template v-if="fr.isPure">
                <div class="section-items" style="border-bottom:1px solid #f0f0f0">
                  <div class="section-item" :class="{checked:selPures.includes(fi)}" @click="togglePure(fi)">
                    <span class="sec-chk" :class="{checked:selPures.includes(fi)}"><van-icon v-if="selPures.includes(fi)" name="success" size="12" color="#fff" /></span>
                    <span class="sec-title">🟢 直接提取原题（{{ fr.questions.length }}题）</span>
                    <span class="sec-words">不AI改写</span>
                  </div>
                </div>
                <div class="section-items">
                  <div v-for="s in fr.sections" :key="s.id" class="section-item" :class="{checked:selSecs.includes(s.id)}" @click="toggleSec(s.id)">
                    <span class="sec-chk" :class="{checked:selSecs.includes(s.id)}"><van-icon v-if="selSecs.includes(s.id)" name="success" size="12" color="#fff" /></span>
                    <span class="sec-title">{{ s.title }}</span>
                    <span class="sec-words">({{ s.wordCount }}字)</span>
                  </div>
                </div>
              </template>

              <template v-if="!fr.isPure || fr.showSections">
                <div class="section-items">
                  <div v-for="s in fr.sections" :key="s.id" class="section-item" :class="{checked:selSecs.includes(s.id)}" @click="toggleSec(s.id)">
                    <span class="sec-chk" :class="{checked:selSecs.includes(s.id)}"><van-icon v-if="selSecs.includes(s.id)" name="success" size="12" color="#fff" /></span>
                    <span class="sec-title">{{ s.title }}</span>
                    <span class="sec-words">({{ s.wordCount }}字)</span>
                  </div>
                </div>
              </template>
            </div>
            </div>

            <div class="section-header" style="margin-top:8px">
              <span>已选 {{ selSecs.length }} 章节 + {{ selPures.length }} 纯题目</span>
              <van-button size="mini" plain type="primary" @click="selAll">全选</van-button>
              <van-button size="mini" plain type="default" @click="deselAll">取消</van-button>
            </div>
            <van-button block round class="gradient-btn" :loading="genLoading" :disabled="selSecs.length===0 && selPures.length===0" @click="genFromSecs">✅ 开始生成（{{ selSecs.length }}章节 + {{ selPures.length }}纯题目）</van-button>
          </div>
          <div v-if="upDone" class="reupload" @click="resetUp"><van-icon name="replay" /> 重新选择</div>
        </van-tab>
      </van-tabs>
      <div class="bottom-entries">
        <div class="entry-item" @click="$router.push('/question-bank')">📎 我的题库</div>
        <div class="entry-item" @click="$router.push('/history')">📚 历史记录</div>
      </div>
    </div>
    <!-- 登录弹窗 -->
    <van-dialog v-model:show="showLoginDialog" title="🔒 需要登录" :show-confirm-button="false">
      <div style="padding:12px 20px 20px;text-align:center">
        <p style="font-size:15px;color:#333;margin-bottom:16px">请先登录后再使用此功能</p>
        <van-button round block type="primary" class="gradient-btn" style="margin-bottom:8px" @click="$router.push('/login')">去登录</van-button>
        <van-button round plain block @click="showLoginDialog=false">留在首页</van-button>
      </div>
    </van-dialog>
    <van-dialog v-model:show="showGenDialog" title="✅ 出题完成！" :show-confirm-button="false">
      <div style="padding:0 20px 24px;text-align:center">
        <div style="font-size:48px;margin-bottom:8px">📎</div>
        <p style="font-size:15px;color:#333;margin-bottom:4px">共<b style="color:#667eea;font-size:20px">{{ genTotal }}</b> 道</p>
        <p style="font-size:12px;color:#999;margin-bottom:8px">客观{{ genObj }} · 主观{{ genSub }}</p>
        <p v-if="genMissingCount > 0" style="font-size:12px;color:#ee0a24;margin-bottom:8px">⚠️ {{ genMissingCount }} 道题答案/解析缺失，可进入刷题后手动重试生成</p>
        <van-button round block type="primary" class="gradient-btn" style="margin-bottom:8px" @click="goPractice">📝 立即刷题</van-button>
        <van-button round plain block @click="showGenDialog=false">留在首页</van-button>
      </div>
    </van-dialog>
    <LoadingDialog :visible="showLoadingDialog" />
  </div>
</template>
<script setup>
import { ref, computed } from 'vue'
 import { showFailToast, showSuccessToast } from 'vant'
import { useRouter } from 'vue-router'
import { isLoggedIn } from '../utils/auth.js'
import { useQuestionsStore } from '../stores/questions'
import { usePracticeStore } from '../stores/practice'
import request from '../utils/request.js'
import TextInputCard from '../components/TextInputCard.vue'
import PhotoInputCard from '../components/PhotoInputCard.vue'
import FileUploadCard from '../components/FileUploadCard.vue'
import LoadingSkeleton from '../components/LoadingSkeleton.vue'
import LoadingDialog from '../components/LoadingDialog.vue'

const router = useRouter()
const qStore = useQuestionsStore()
const pStore = usePracticeStore()
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
// 按文件分组: [{ name, isPure, sections, questions, words, showSections }]
const fileResults = ref([])
const selSecs = ref([])
const selPures = ref([])
const secTexts = ref({})
const fileQT = ref('all')
const showLoadingDialog = ref(false)

const totalSecCount = computed(() => {
  let c = 0; fileResults.value.forEach(fr => c += fr.sections.length); return c
})
const totalWords = computed(() => {
  let w = 0; fileResults.value.forEach(fr => w += fr.words); return w
})

async function handleGenerate({ text, questionType }) {
  if (!text?.trim()) { showFailToast('请输入复习资料'); return }
  if (!isLoggedIn()) { showLoginDialog.value = true; return }
  loading.value = true
  showLoadingDialog.value = true
  try {
    const r = await request.post('/generate', { text, questionType })
    if (r.errorMessage) { showFailToast(r.errorMessage); return }
    popDialog(r)
  } catch (e) { showFailToast(e.message || "error") }
  finally { loading.value = false; showLoadingDialog.value = false }
}

async function handlePhotoGenerate({ files, questionType }) {
  if (!files || files.length===0) { showFailToast('请先拍照或选择图片'); return }
  if (!isLoggedIn()) { showLoginDialog.value = true; return }
  pLoading.value = true
  showLoadingDialog.value = true
  try {
    // ================================================================
    // Promise.all 并发上传多张图片
    // 每张图片独立发请求，后端 Tomcat 多线程并行处理
    // 单个图片失败不影响其他，用 .catch(() => null) 吞掉错误
    // ================================================================
    const tasks = files.map(file => {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('questionType', questionType)
      return request.post('/photo-and-generate', fd, { timeout: 180000 }).catch(() => null)
    })
    const results = await Promise.all(tasks)

    let allObj = [], allSub = [], totalCount = 0, objCount = 0, subCount = 0
    let firstVis = '', firstRegCount = 0

    results.forEach(r => {
      if (!r || r.error) return  // 失败的跳过
      if (!firstVis && r.visualization) { firstVis = r.visualization; firstRegCount = r.regionCount || 0 }
      allObj.push(...(r.objectiveQuestions || []))
      allSub.push(...(r.subjectiveQuestions || []))
      totalCount += r.totalCount || 0
      objCount += r.objectiveCount || 0
      subCount += r.subjectiveCount || 0
    })

    if (allObj.length === 0 && allSub.length === 0) { showFailToast('所有图片识别失败'); return }
    visImg.value = firstVis ? 'data:image/jpeg;base64,' + firstVis : ''
    regCount.value = firstRegCount
    popDialog({ totalCount, objectiveCount: objCount, subjectiveCount: subCount, objectiveQuestions: allObj, subjectiveQuestions: allSub })
  } catch (e) { showFailToast(e.message || '识别失败') }
  finally { pLoading.value = false; showLoadingDialog.value = false }
}

// ================================================================
// Promise.all 并发上传多个文件
// 每个文件独立发请求，后端 Tomcat 多线程并行处理
// 单个文件失败不影响其他，用 .catch(() => null) 吞掉错误
// ================================================================
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
  showLoadingDialog.value = true
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
      const r = await request.post('/generate-from-sections', { sectionIds: selSecs.value, sectionTexts: secTexts.value, questionType: fileQT.value })
      if (!r.error) { allQs.push(...(r.questions || [])); allQs.push(...(r.subjectiveQuestions || [])) }
    }
    if (allQs.length === 0) { showFailToast('生成失败'); return }
    const subQs = allQs.filter(q => q.type === 'subjective')
    const objQs = allQs.filter(q => q.type !== 'subjective')
    popDialog({ totalCount: allQs.length, objectiveQuestions: objQs, subjectiveQuestions: subQs })
  } catch (e) { showFailToast(e.message || '出题失败') }
  finally { genLoading.value = false; showLoadingDialog.value = false }
}

function popDialog(r) {
  const qs = r.objectiveQuestions || []; const ss = r.subjectiveQuestions || []
  const all = [...qs, ...ss]
  qStore.setQuestions(all)
  pStore.currentSectionId = 'sec-' + Date.now()
  pStore.initSection(pStore.currentSectionId, all.length, '新题目', 'text')
  genTotal.value = r.totalCount || qs.length + ss.length
  genObj.value = qs.length
  genSub.value = ss.length
  genMissingCount.value = countMissingAnswers(all)
  showLoadingDialog.value = false
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

function goPractice() { showGenDialog.value = false; router.push('/question-bank') }
function goProfile() {
  if (!isLoggedIn()) { showLoginDialog.value = true; return }
  router.push("/user-center")
}
</script>
<style scoped>
.home-view { min-height: 100vh; }
.user-icon { color: #667eea; padding: 0 8px; }
.viz-card { padding: 16px; margin: 8px 0; }
.viz-title { font-size: 15px; font-weight: 600; color: #333; margin-bottom: 10px; }
.viz-info { font-size: 13px; color: #999; margin-top: 8px; text-align: center; }
.viz-overlay { position: fixed; z-index: 9999; inset: 0; background: rgba(0,0,0,0.9); display: flex; align-items: center; justify-content: center; }
.section-info { font-size: 14px; padding: 12px 16px; color: #666; }
.section-ai-hint { font-size: 12px; color: #999; padding: 0 16px 8px; }
.section-list { padding: 0; }
.section-header { display: flex; align-items: center; gap: 8px; padding: 10px 16px; border-bottom: 1px solid #f5f5f5; }
.section-header span { font-size: 14px; color: #333; }
.section-items { padding: 4px 0; }
.section-item { display: flex; align-items: center; gap: 10px; padding: 10px 16px; cursor: pointer; border-bottom: 1px solid #f5f5f5; }
.section-item.checked { background: #f0f0ff; }
.sec-chk { width: 20px; height: 20px; border-radius: 4px; border: 2px solid #ddd; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.sec-chk.checked { border-color: #667eea; background: #667eea; }
.sec-title { font-size: 14px; color: #333; font-weight: 600; }
.sec-words { font-size: 12px; color: #999; margin-left: 6px; }
.reupload { text-align: center; padding: 12px; font-size: 13px; color: #667eea; cursor: pointer; }
.type-selector-card { padding: 12px 16px; }
.summary-bar { font-size: 13px; color: #667eea; padding: 10px 16px; background: #f0f0ff; border-bottom: 1px solid #e0e0f0; }
.file-card { background: #fafbfc; border: 1px solid #e8e8f0; border-radius: 12px; margin: 8px 12px; }
.file-card + .file-card { margin-top: 14px; border-top: 2px dashed #e0e0f0; padding-top: 4px; }
.file-card.pure-card { border-left: 4px solid #07c160; }
.file-card-header { display: flex; align-items: center; gap: 8px; padding: 10px 14px; background: #fafafa; }
.file-icon { font-size: 14px; }
.file-name { font-size: 14px; font-weight: 600; color: #333; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.file-tag { font-size: 11px; color: #999; flex-shrink: 0; }
.file-actions { display: flex; gap: 8px; padding: 10px 14px; }
.file-cards-scroll { max-height: 48vh; overflow-y: auto; -webkit-overflow-scrolling: touch; }
.bottom-entries { display: flex; justify-content: center; gap: 20px; padding: 30px 0 50px; }
.entry-item { text-align: center; color: rgba(255,255,255,0.85); font-size: 14px; cursor: pointer; padding: 10px 16px; border-radius: 20px; background: rgba(255,255,255,0.15); }
</style>
