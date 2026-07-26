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
          <div v-if="upDone && pureQuestions.length === 0" class="card section-list">
            <div class="card section-info">📁 {{ upName }} · {{ upWords }}字 · {{ secs.length }}章节</div>
            <div class="section-ai-hint">章节由AI根据文档内容自动生成</div>
            <div class="card type-selector-card">
              <van-radio-group v-model="fileQT" direction="horizontal">
                <van-radio name="all" shape="square">📝 全部</van-radio>
                <van-radio name="objective" shape="square">📋 客观</van-radio>
                <van-radio name="subjective" shape="square">✍️ 主观</van-radio>
              </van-radio-group>
            </div>
            <div class="section-header"><span>选择章节：</span><van-button size="mini" plain type="primary" @click="selAll">全选</van-button><van-button size="mini" plain type="default" @click="deselAll">取消</van-button></div>
            <div class="section-items">
              <div v-for="s in secs" :key="s.id" class="section-item" :class="{checked:selSecs.includes(s.id)}" @click="toggleSec(s.id)">
                <span class="sec-chk" :class="{checked:selSecs.includes(s.id)}"><van-icon v-if="selSecs.includes(s.id)" name="success" size="12" color="#fff" /></span>
                <span class="sec-title">{{ s.title }}</span><span class="sec-words">({{ s.wordCount }}字)</span>
              </div>
            </div>
            <van-button block round class="gradient-btn" :loading="genLoading" :disabled="selSecs.length===0" @click="genFromSecs">✅ 生成（{{selSecs.length}}章节）</van-button>
          </div>
                    <div v-if="pureQuestions.length > 0" class="card section-list" style="border-left: 4px solid #07c160;">
            <div class="card section-info">📝 检测到纯题目文档，共 {{ pureQuestionCount }} 道题目</div>
            <div class="section-ai-hint">系统将直接提取原题，不做AI二次改写</div>
            <van-button block round class="gradient-btn" @click="usePureQuestions">✅ 直接使用提取的题目</van-button>
            <van-button block round plain style="margin-top:8px" @click="pureQuestions=[];pureQuestionCount=0">❌ 改为AI重新出题</van-button>
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
  </div>
</template>
<script setup>
import { ref } from 'vue'
 import { showLoadingToast, closeToast, showFailToast, showSuccessToast } from 'vant'
import { useRouter } from 'vue-router'
import { isLoggedIn } from '../utils/auth.js'
import { useQuestionsStore } from '../stores/questions'
import { usePracticeStore } from '../stores/practice'
import request from '../utils/request.js'
import TextInputCard from '../components/TextInputCard.vue'
import PhotoInputCard from '../components/PhotoInputCard.vue'
import FileUploadCard from '../components/FileUploadCard.vue'
import LoadingSkeleton from '../components/LoadingSkeleton.vue'

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
const upName = ref('')
const upWords = ref(0)
const secs = ref([])
const selSecs = ref([])
const secTexts = ref({})
const fileQT = ref('all')
const pureQuestions = ref([])
const pureQuestionCount = ref(0)

async function handleGenerate({ text, questionType }) {
  if (!text?.trim()) { showFailToast('请输入复习资料'); return }
  if (!isLoggedIn()) { showLoginDialog.value = true; return }
  loading.value = true
  showLoadingToast({ message: 'AI正在努力出题中...', forbidClick: true, duration: 0 })
  try {
    const r = await request.post('/generate', { text, questionType })
    if (r.errorMessage) { showFailToast(r.errorMessage); return }
    popDialog(r)
  } catch (e) { showFailToast(e.message || "error") }
  finally { loading.value = false; closeToast() }
}

async function handlePhotoGenerate({ files, questionType }) {
  if (!files || files.length===0) { showFailToast('请先拍照或选择图片'); return }
  if (!isLoggedIn()) { showLoginDialog.value = true; return }
  pLoading.value = true
  showLoadingToast({ message: 'AI正在分析' + files.length + '张图片...', forbidClick: true, duration: 0 })
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
  finally { pLoading.value = false; closeToast() }
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
      return request.post('/upload', fd, { timeout: 120000 }).catch(() => null)
    })
    const results = await Promise.all(tasks)

    let allSecs = []; let allNames = []; let totalWords = 0; let secIdx = 0
    let allExtracted = []; let isPure = false

    results.forEach(r => {
      if (!r || r.error) return
      allNames.push(r.fileName)
      totalWords += r.totalWords
      if (r.sections) {
        r.sections.forEach(s => {
          secIdx++
          const prefix = files.length > 1 ? '[' + r.fileName + '] ' : ''
          allSecs.push({ id: 'sec-' + secIdx, title: prefix + s.title, text: s.text, wordCount: s.wordCount })
        })
      }
      if (r.isPureQuestions) { isPure = true; allExtracted.push(...(r.extractedQuestions || [])) }
    })

    if (allSecs.length === 0) { showFailToast('未能提取到文字内容'); return }
    upName.value = allNames.join(', '); upWords.value = totalWords; secs.value = allSecs
    const txt = {}; allSecs.forEach(s => txt[s.id] = s.text); secTexts.value = txt
    upDone.value = true
    if (isPure && allExtracted.length > 0) {
      pureQuestions.value = allExtracted
      pureQuestionCount.value = allExtracted.length
    }
  } catch (e) { showFailToast(e.message || '上传失败') }
  finally { fLoading.value = false }
}

function toggleSec(id) { const i = selSecs.value.indexOf(id); i >= 0 ? selSecs.value.splice(i, 1) : selSecs.value.push(id) }
function selAll() { selSecs.value = secs.value.map(s => s.id) }
function deselAll() { selSecs.value = [] }
function resetUp() { upDone.value = false; upName.value = ''; secs.value = []; selSecs.value = []; secTexts.value = {}; pureQuestions.value = []; pureQuestionCount.value = 0 }

 async function usePureQuestions() {
   if (pureQuestions.value.length === 0) { showFailToast('未检测到题目'); return }
   showLoadingToast({ message: 'AI正在校验答案...', forbidClick: true, duration: 0 })
   try {
     const res = await request.post('/verify-answers', { questions: pureQuestions.value })
     if (res.error) { showFailToast(res.error); closeToast(); return }
     const qs = res.questions || pureQuestions.value
     qStore.setQuestions(qs)
     pStore.currentSectionId = 'sec-' + Date.now()
     genTotal.value = qs.length
     genObj.value = qs.filter(q => q.type !== 'subjective').length
     genSub.value = qs.filter(q => q.type === 'subjective').length
     genMissingCount.value = countMissingAnswers(qs)
     showGenDialog.value = true
     closeToast()
     // 保存到后端
     request.post('/generate-from-extracted', { questions: qs }).catch(() => {})
   } catch (e) {
     closeToast()
     showFailToast('答案校验失败: ' + (e.message || '请稍后重试'))
   }
 }

async function genFromSecs() {
  if (selSecs.value.length === 0) { showFailToast('请选择章节'); return }
  if (!isLoggedIn()) { showLoginDialog.value = true; return }
  genLoading.value = true
  showLoadingToast({ message: 'AI正在努力出题中...', forbidClick: true, duration: 0 })
  try {
    const r = await request.post('/generate-from-sections', { sectionIds: selSecs.value, sectionTexts: secTexts.value, questionType: fileQT.value })
    if (r.error) { showFailToast(r.error); return }
    const qs = r.questions || []; const ss = r.subjectiveQuestions || []
    qStore.setQuestions([...qs, ...ss])
    popDialog({ totalCount: r.totalCount || 0, objectiveQuestions: qs, subjectiveQuestions: ss })
  } catch (e) { showFailToast(e.message || '出题失败') }
  finally { genLoading.value = false; closeToast() }
}

function popDialog(r) {
  const qs = r.objectiveQuestions || []; const ss = r.subjectiveQuestions || []
  const all = [...qs, ...ss]
  qStore.setQuestions(all)
  // 每次出题都生成新的 sectionId，确保刷题进度从零开始
  pStore.currentSectionId = 'sec-' + Date.now()
  genTotal.value = r.totalCount || qs.length + ss.length
  genObj.value = r.objectiveCount || qs.length
  genSub.value = r.subjectiveCount || ss.length
  genMissingCount.value = countMissingAnswers(all)
  showGenDialog.value = true
}

function countMissingAnswers(questions) {
  return questions.filter(q => {
    const ans = q.answer
    const exp = q.explanation
    const missingAns = !ans || ans === '参考答案未提供' || ans === '未提供' || ans.trim() === ''
    const missingExp = !exp || exp === '解析未提供' || exp === '解析生成失败' || exp === '未提供' || exp.trim() === ''
    return missingAns || missingExp
  }).length
}

function goPractice() { showGenDialog.value = false; router.push('/practice') }
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
.bottom-entries { display: flex; justify-content: center; gap: 20px; padding: 30px 0 50px; }
.entry-item { text-align: center; color: rgba(255,255,255,0.85); font-size: 14px; cursor: pointer; padding: 10px 16px; border-radius: 20px; background: rgba(255,255,255,0.15); }
</style>
