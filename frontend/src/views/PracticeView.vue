<template>
  <div class="practice-view">
    <CyberNavbar title="刷题模式" :show-back="true" @back="goBack" />

    <div class="practice-container" v-if="allQuestions.length > 0">
      <!-- 顶部进度条 -->
      <div class="progress-header">
        <div class="progress-info">
          <span class="progress-label">复习进度</span>
          <span class="progress-num">{{ answeredCount }}/{{ allQuestions.length }}</span>
        </div>
        <CyberProgress :percentage="progressPct" :show-pivot="false" />
        <div class="progress-stats">
          <span class="stat-correct">✅ {{ correctCount }} 正确</span>
          <span class="stat-wrong">❌ {{ wrongCount }} 错误</span>
          <span class="stat-acc">📊 {{ accuracyPct }}%</span>
        </div>
      </div>

      <!-- 整卷提交按钮 -->
      <div class="batch-bar" v-if="(!allSubmitted && pendingCount > 0) || batchSubmitting">
        <CyberButton variant="warning" block :loading="batchSubmitting" @click="batchSubmit">
          {{ batchSubmitting ? '提交并生成解析中...' : '📤 整卷提交（' + pendingCount + '题待提交）' }}
        </CyberButton>
      </div>

      <!-- 题型Tab切换 -->
      <div v-if="hasBoth" class="cyber-tabs">
        <div
          class="tab-item"
          :class="{ active: qTab === 0 }"
          @click="qTab = 0"
        >客观题 ({{ objQ.length }})</div>
        <div
          class="tab-item"
          :class="{ active: qTab === 1 }"
          @click="qTab = 1"
        >主观题 ({{ subQ.length }})</div>
      </div>

      <!-- 客观题列表 -->
      <div v-if="!hasBoth || qTab === 0" class="q-scroll">
        <template v-if="chapterGroups.length > 0">
          <template v-for="g in chapterGroups" :key="g.name">
            <div v-if="g.questions.some(q=>q.type!=='subjective')" class="chapter-header">{{ g.name }}</div>
            <ObjectiveQuestionCard
              v-for="(q,i) in g.questions.filter(q=>q.type!=='subjective')"
              :key="getQid(q,i)"
              :question="q"
              :result="results[getQid(q,i)]||null"
              :index="i"
              :initial-answer="getDraftAnswer(getQid(q,i))"
              ref="objCardRefs"
              @submit="(e)=>handleSubmitObjective(e,getQid(q,i),q)"
              @change="(e)=>handleSelectionChange(e)"
              @update-answer="(e)=>handleUpdateAnswer(e,q)"
            />
          </template>
        </template>
        <template v-else>
          <ObjectiveQuestionCard
            v-for="(q,i) in objQ"
            :key="getQid(q,i)"
            :question="q"
            :result="results[getQid(q,i)]||null"
            :index="i"
            :initial-answer="getDraftAnswer(getQid(q,i))"
            ref="objCardRefs"
            @submit="(e)=>handleSubmitObjective(e,getQid(q,i),q)"
            @change="(e)=>handleSelectionChange(e)"
            @update-answer="(e)=>handleUpdateAnswer(e,q)"
          />
        </template>
      </div>

      <!-- 主观题列表 -->
      <div v-if="hasBoth && qTab === 1" class="q-scroll">
        <template v-if="chapterGroups.length > 0">
          <template v-for="g in chapterGroups" :key="g.name">
            <div v-if="g.questions.some(q=>q.type==='subjective')" class="chapter-header">{{ g.name }}</div>
            <SubjectiveQuestionCard
              v-for="(q,i) in g.questions.filter(q=>q.type==='subjective')"
              :key="getQid(q,i)"
              :question="q"
              :result="results[getQid(q,i)]||null"
              :index="i"
              ref="subCardRefs"
              @submit="(e)=>handleSubmitSubjective(e,getQid(q,i))"
              @change="(e)=>handleSubjectiveDraft(e)"
              @update-answer="(e)=>handleUpdateAnswer(e,q)"
            />
          </template>
        </template>
        <template v-else>
          <SubjectiveQuestionCard
            v-for="(q,i) in subQ"
            :key="getQid(q,i)"
            :question="q"
            :result="results[getQid(q,i)]||null"
            :index="i"
            ref="subCardRefs"
            @submit="(e)=>handleSubmitSubjective(e,getQid(q,i))"
            @change="(e)=>handleSubjectiveDraft(e)"
            @update-answer="(e)=>handleUpdateAnswer(e,q)"
          />
        </template>
      </div>

      <!-- 完成按钮 -->
      <div class="finish-bar" v-if="allSubmitted">
        <CyberButton variant="primary" block @click="showComplete">🎉 完成复习</CyberButton>
      </div>
    </div>

    <!-- 空状态 -->
    <div v-if="allQuestions.length===0" class="empty-state">
      <div class="empty-icon">📝</div>
      <div class="empty-title">还没有题目</div>
      <div class="empty-desc">先去首页生成题目吧！</div>
      <CyberButton variant="primary" @click="$router.push('/')">去首页出题</CyberButton>
    </div>

    <!-- 完成弹窗 -->
    <div v-if="showDialog" class="complete-dialog-overlay" @click.self="showDialog=false">
      <div class="complete-dialog">
        <div class="dialog-accent-line"></div>
        <div class="dialog-icon">🎉</div>
        <div class="dialog-title">复习完成</div>
        <div class="dialog-stats">
          <div class="ds-item">
            <span class="ds-num">{{ allQuestions.length }}</span>
            <span class="ds-label">总题数</span>
          </div>
          <div class="ds-item">
            <span class="ds-num correct">{{ correctCount }}</span>
            <span class="ds-label">答对</span>
          </div>
          <div class="ds-item">
            <span class="ds-num magenta">{{ accuracyPct }}%</span>
            <span class="ds-label">正确率</span>
          </div>
        </div>
        <p class="dialog-msg">{{ encouragement }}</p>
        <div class="dialog-actions">
          <CyberButton variant="primary" block @click="goHistory">📚 查看历史记录</CyberButton>
          <CyberButton variant="ghost" block @click="showDialog=false">继续复习</CyberButton>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useQuestionsStore } from '../stores/questions'
import { usePracticeStore } from '../stores/practice'
import { showSuccessToast, showFailToast } from 'vant'
import request from '../utils/request.js'
import { classify } from '../utils/questionType.js'
import { loadDraftStore, saveDraftAnswer, removeDraftAnswer } from '../utils/practiceDraft.js'
import ObjectiveQuestionCard from '../components/ObjectiveQuestionCard.vue'
import SubjectiveQuestionCard from '../components/SubjectiveQuestionCard.vue'
import { CyberNavbar, CyberButton, CyberProgress } from '../components/cyber'

const router = useRouter()
const qStore = useQuestionsStore()
const pStore = usePracticeStore()
const qTab = ref(0)
const results = reactive({})
const showDialog = ref(false)
const batchSubmitting = ref(false)
const objCardRefs = ref([])
const subCardRefs = ref([])

/** 统一题目 ID 提取：id → _id → 数组索引 */
function getQid(q, idx) { return q?.id || q?._id || idx }

// 暂存用户选择但未提交的答案
const pendingAnswers = reactive(new Map())
// 双模式共享的未提交草稿缓存（供客观题卡片 initial-answer 回显）
const draftCache = reactive({})
function getDraftAnswer(qid) { return draftCache[qid]?.answer || null }
function findQIndex(qid) {
  return allQuestions.value.findIndex((q, i) => getQid(q, i) === qid)
}

const allQuestions = computed(() => qStore.questions || [])
const objQ = computed(() => allQuestions.value.filter(q => q.type !== 'subjective'))
const subQ = computed(() => allQuestions.value.filter(q => q.type === 'subjective'))
const hasBoth = computed(() => objQ.value.length > 0 && subQ.value.length > 0)

// 章节分组：按 chapterName 分组题目
const chapterGroups = computed(() => {
  const groups = []
  const seen = new Set()
  for (const q of allQuestions.value) {
    const name = q.chapterName || '默认分组'
    if (!seen.has(name)) {
      seen.add(name)
      groups.push({ name, questions: allQuestions.value.filter(x => (x.chapterName || '默认分组') === name) })
    }
  }
  return groups.length > 1 ? groups : []
})

const answeredCount = computed(() => Object.keys(results).length)
const correctCount = computed(() => Object.values(results).filter(r => r?.correct).length)
const wrongCount = computed(() => answeredCount.value - correctCount.value)
const progressPct = computed(() => {
  return allQuestions.value.length > 0 ? Math.round(answeredCount.value / allQuestions.value.length * 100) : 0
})
const accuracyPct = computed(() => answeredCount.value > 0 ? Math.round(correctCount.value / answeredCount.value * 100) : 0)
const allSubmitted = computed(() => answeredCount.value >= allQuestions.value.length)

// 待提交计数：客观题pendingAnswers + 主观题已输入未提交
const pendingCount = computed(() => {
  let count = pendingAnswers.size
  const subCards = subCardRefs.value || []
  subQ.value.forEach((q, idx) => {
    const qId = getQid(q, idx)
    if (!results[qId]) {
      const card = subCards[idx]
      const ans = card?.getCurrentAnswer?.() || localStorage.getItem('subj_ans_' + qId) || ''
      if (ans.trim()) count++
    }
  })
  return count
})

const encouragements = [
  '坚持就是胜利，你离学霸又近了一步！',
  '复习是最好的老师，继续保持！',
  '今天的努力是明天的实力！',
  '每一次复习都是对知识的致敬！',
  '你的认真程度已经超过了99%的人！'
]
const encouragement = computed(() => encouragements[Math.floor(Math.random() * encouragements.length)])

// setup 阶段立即恢复共享草稿：必须早于子组件 setup（主观卡挂载即读 subj_ans localStorage）
;(function restoreDraftOnSetup() {
  const sectionId = pStore.currentSectionId
  if (!sectionId) return
  const validQids = (qStore.questions || []).map((q, i) => getQid(q, i))
  const store = loadDraftStore(sectionId, validQids)
  // recordId 不被 questions store 持久化，刷新后回填，保证提交仍关联套题
  if (qStore.recordId == null && store.recordId != null) qStore.recordId = store.recordId
  Object.entries(store.answers || {}).forEach(([qid, item]) => {
    draftCache[qid] = item
    if (item.type === 'subjective') {
      // 主观卡挂载时直接从该 key 读取，必须在其 setup 前写好
      try { localStorage.setItem('subj_ans_' + qid, item.answer) } catch (e) { /* 忽略 */ }
    } else {
      pendingAnswers.set(qid, item.answer)
    }
  })
})()

onMounted(() => {
  initFromStore()
})

function initFromStore() {
  const sectionId = pStore.currentSectionId
  if (!sectionId) return
  Object.keys(results).forEach(k => delete results[k])
  pStore.initSection(sectionId, allQuestions.value.length, '刷题练习', 'practice')
  const saved = pStore.getSectionAnswers(sectionId)
  Object.keys(saved).forEach(k => {
    results[k] = saved[k]
    // 已提交结果优先：清掉对应未提交草稿，避免卡片回显旧选择、待提交数虚高
    if (draftCache[k]) { delete draftCache[k]; pendingAnswers.delete(k) }
  })
}

function handleSelectionChange(e) {
  if (results[e.questionId]) return
  const secId = pStore.currentSectionId
  const qi = findQIndex(e.questionId)
  const type = qi >= 0 ? classify(allQuestions.value[qi]).type : ''
  if (e.userAnswer) {
    pendingAnswers.set(e.questionId, e.userAnswer)
    draftCache[e.questionId] = { answer: e.userAnswer, type, ts: Date.now() }
    saveDraftAnswer(secId, e.questionId, e.userAnswer, type)
  } else {
    pendingAnswers.delete(e.questionId)
    delete draftCache[e.questionId]
    removeDraftAnswer(secId, e.questionId)
  }
}

// 主观题输入同步到共享草稿（subj_ans 镜像仍由子组件自己维护）
function handleSubjectiveDraft(e) {
  if (results[e.questionId]) return
  const secId = pStore.currentSectionId
  const val = (e.userAnswer || '').trim()
  if (val) {
    draftCache[e.questionId] = { answer: e.userAnswer, type: 'subjective', ts: Date.now() }
    saveDraftAnswer(secId, e.questionId, e.userAnswer, 'subjective')
  } else {
    delete draftCache[e.questionId]
    removeDraftAnswer(secId, e.questionId)
  }
}

// 已提交：从共享草稿移除（结果归 pinia 持久化），并清本地缓存
function dropDraft(questionId) {
  delete draftCache[questionId]
  removeDraftAnswer(pStore.currentSectionId, questionId)
}

async function handleSubmitObjective(e, questionId, question) {
  if (results[questionId]) return
  if (!question) { results[questionId] = e; return }

  try {
    // 修复：单题提交必须带 recordId，打通后端进度链路
    const r = await request.post("/check", {
      questionId,
      userAnswer: e.userAnswer,
      question,
      questionType: question.type,
      recordId: qStore.recordId || null
    })
    r.userAnswer = e.userAnswer
    results[questionId] = r
    pendingAnswers.delete(questionId)
    dropDraft(questionId)
    const secId = pStore.currentSectionId
    if (!secId) return
    pStore.recordAnswer(secId, r?.correct === true)
    pStore.recordAnswerResult(secId, questionId, r)
  } catch(err) {
    console.error('客观题提交失败:', err)
    showFailToast('提交失败，请重试')
  }
}

function handleSubmitSubjective(e, questionId) {
  if (results[questionId]) return
  results[questionId] = { correct: e.isCorrect === true, evaluation: e.evaluation || '', score: e.score || 0 }
  pendingAnswers.delete(questionId)
  dropDraft(questionId)
  const secId = pStore.currentSectionId
  if (!secId) return
  pStore.recordAnswer(secId, e.isCorrect === true)
  pStore.recordAnswerResult(secId, questionId, { correct: e.isCorrect === true, score: e.score || 0 })
}

// 处理主观题答案/解析更新（来自子组件的手动重试生成）
function handleUpdateAnswer(e, question) {
  if (e.answer) question.answer = e.answer
  if (e.explanation) {
    question.explanation = e.explanation
    const qId = e.questionId || getQid(question, allQuestions.value.indexOf(question))
    if (results[qId]) results[qId].explanation = e.explanation
  }
}

async function batchSubmit() {
  if (batchSubmitting.value) return
  batchSubmitting.value = true

  try {
    const answers = []

    // 收集客观题待提交答案
    for (const [questionId, userAnswer] of pendingAnswers.entries()) {
      const q = allQuestions.value.find(x => (x.id || x._id) === questionId)
      if (q && !results[questionId] && userAnswer) {
        const idx = allQuestions.value.indexOf(q)
        answers.push({
          question: q,
          userAnswer: userAnswer,
          questionType: q.type || 'single',
          questionIndex: idx,
          recordId: qStore.recordId
        })
      }
    }

    // 收集主观题答案（从组件 ref 读取，回退 localStorage）
    const subCards = subCardRefs.value || []
    subQ.value.forEach((q, idx) => {
      const qId = getQid(q, idx)
      if (!results[qId]) {
        const card = subCards[idx]
        const userAnswer = card?.getCurrentAnswer?.() || localStorage.getItem('subj_ans_' + qId) || ''
        if (userAnswer.trim()) {
          answers.push({
            question: q,
            userAnswer: userAnswer,
            questionType: 'subjective',
            questionIndex: allQuestions.value.indexOf(q),
            recordId: qStore.recordId
          })
        }
      }
    })

    if (answers.length === 0) {
      showFailToast('没有待提交的题目')
      batchSubmitting.value = false
      return
    }

    const res = await request.post('/check-batch', { answers })

    res.results.forEach((r, idx) => {
      const qId = getQid(answers[idx].question, answers[idx].questionIndex)
      if (results[qId]) return
      results[qId] = r
      pendingAnswers.delete(qId)
      dropDraft(qId)
      const secId = pStore.currentSectionId
      if (!secId) return
      pStore.recordAnswer(secId, r?.correct === true)
      pStore.recordAnswerResult(secId, qId, r)
    })

    // 提交成功，先不弹提示，等解析生成完一起弹

    // 只处理已提交的题目中缺失解析的（没提交的不处理，避免坏数据报错）
    const missingExps = allQuestions.value.filter((q, qi) => {
      const qId = getQid(q, qi)
      const r = results[qId]
      if (!r) return false // 没提交的跳过
      const exp = r.explanation || q.explanation
      return !exp || typeof exp !== 'string' || exp === '未提供' || exp === '解析未提供' || exp === '解析生成失败' || exp.trim() === ''
    })

    let genOk = 0, genFail = 0
    if (missingExps.length > 0) {
      const genTasks = missingExps.map(q => {
        const qIdx = allQuestions.value.indexOf(q)
        return request.post('/generate-answer', {
          question: q.question,
          type: q.type || 'subjective',
          category: q.category || ''
        }).then(res => {
          genOk++
          const qId = getQid(q, qIdx)
          if (res.answer) q.answer = res.answer
          if (res.explanation) {
            q.explanation = res.explanation
            if (results[qId]) results[qId].explanation = res.explanation
          }
        }).catch(() => { genFail++ })
      })
      await Promise.all(genTasks)
    }

    // 等解析全部生成完成后，弹出最终提示
    if (genFail > 0) {
      showSuccessToast(`已提交 ${answers.length} 题，${genOk} 道解析已生成，${genFail} 道失败（可点"重新生成解析"重试）`)
    } else if (genOk > 0) {
      showSuccessToast(`已提交 ${answers.length} 题，解析全部生成完成`)
    } else {
      showSuccessToast(`已提交 ${answers.length} 题`)
    }
  } catch (err) {
    showFailToast(err.message || '整卷提交失败')
  } finally {
    batchSubmitting.value = false
  }
}

function showComplete() {
  showDialog.value = true
}

function goBack() {
  router.back()
}

function goHistory() {
  showDialog.value = false
  router.push('/history')
}
</script>

<style scoped>
.practice-view {
  min-height: 100dvh;
  background: var(--bg-base);
  position: relative;
}

.practice-container {
  padding: 12px 16px 100px;
  position: relative;
  z-index: 10;
}

/* 进度头部 */
.progress-header {
  background: var(--bg-card);
  border: 1px solid var(--accent-border);
  border-radius: var(--radius-card);
  backdrop-filter: blur(12px);
  padding: 16px;
  margin-bottom: 12px;
}

.progress-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.progress-label {
  font-size: 13px;
  color: var(--text-secondary);
  letter-spacing: 0.5px;
}

.progress-num {
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 700;
  color: var(--accent);
  text-shadow: 0 0 8px var(--accent-soft);
}

.progress-stats {
  display: flex;
  justify-content: space-around;
  margin-top: 10px;
  font-size: 12px;
}

.stat-correct { color: var(--success); }
.stat-wrong { color: var(--danger); }
.stat-acc { color: var(--accent); }

/* 整卷提交栏 */
.batch-bar {
  position: sticky;
  top: 56px;
  z-index: 20;
  margin-bottom: 12px;
}

.batch-bar .cyber-button.warning {
  animation: batchPulse 2s ease-in-out infinite;
  letter-spacing: 1px;
}

@keyframes batchPulse {
  0%, 100% {
    box-shadow: 0 4px 16px rgba(249, 240, 2, 0.35);
  }
  50% {
    box-shadow: 0 4px 32px rgba(249, 240, 2, 0.65), 0 0 24px rgba(249, 240, 2, 0.3);
  }
}

/* 题型Tabs */
.cyber-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
  background: var(--bg-elevated);
  padding: 4px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--accent-border);
}

.tab-item {
  flex: 1;
  text-align: center;
  padding: 8px 12px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  border-radius: var(--radius-pill);
  cursor: pointer;
  transition: all 0.25s var(--ease-out);
}

.tab-item.active {
  background: linear-gradient(135deg, var(--accent), #00c8d4);
  color: #000;
  box-shadow: 0 2px 12px var(--accent-soft);
}

/* 题目滚动区 */
.q-scroll {
  padding-bottom: 16px;
}

/* 章节标题 */
.chapter-header {
  font-size: 13px;
  font-weight: 700;
  color: var(--accent);
  background: var(--accent-soft);
  border-left: 3px solid var(--accent);
  padding: 8px 14px;
  margin: 16px 0 10px;
  border-radius: 0 8px 8px 0;
  letter-spacing: 0.5px;
}

/* 完成按钮栏 */
.finish-bar {
  position: fixed;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 100%;
  max-width: 480px;
  padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
  background: rgba(10, 10, 15, 0.95);
  backdrop-filter: blur(20px);
  border-top: 1px solid var(--accent-border);
  z-index: 30;
}

/* 完成弹窗 */
.complete-dialog-overlay {
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

.complete-dialog {
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
  margin-bottom: 20px;
  letter-spacing: 2px;
}

.dialog-stats {
  display: flex;
  justify-content: space-around;
  margin-bottom: 16px;
  padding: 16px 0;
  border-top: 1px solid var(--accent-border);
  border-bottom: 1px solid var(--accent-border);
}

.ds-item {
  text-align: center;
}

.ds-num {
  display: block;
  font-family: var(--font-display);
  font-size: 24px;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.ds-num.correct {
  color: var(--success);
  text-shadow: 0 0 10px var(--success-soft);
}

.ds-num.magenta {
  color: var(--secondary);
  text-shadow: 0 0 10px var(--secondary-soft);
}

.ds-label {
  font-size: 11px;
  color: var(--text-muted);
}

.dialog-msg {
  font-size: 14px;
  color: var(--text-secondary);
  text-align: center;
  margin-bottom: 16px;
  line-height: 1.6;
}

.dialog-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
</style>
