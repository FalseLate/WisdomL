<template>
  <div class="practice-view">
    <van-nav-bar title="📑 刷题模式" left-text="返回" left-arrow @click-left="goBack" fixed placeholder />

    <div class="practice-container" v-if="allQuestions.length > 0">
      <!-- 顶部进度条 -->
      <div class="progress-header">
        <div class="progress-info">
          <span class="progress-label">复习进度</span>
          <span class="progress-num">{{ answeredCount }}/{{ allQuestions.length }}</span>
        </div>
        <van-progress :percentage="progressPct" :show-pivot="false" color="#667eea" stroke-width="6" />
        <div class="progress-stats">
          <span>✅ {{ correctCount }} 正确</span>
          <span>❌ {{ wrongCount }} 错误</span>
          <span>📊 {{ accuracyPct }}%</span>
        </div>
      </div>

      <!-- 整卷提交按钮 -->
      <div class="batch-bar" v-if="!allSubmitted && pendingCount > 0">
        <van-button round block type="warning" @click="batchSubmit" :loading="batchSubmitting">
          📤 整卷提交（{{ pendingCount }}题待提交）
        </van-button>
      </div>

      <!-- 题型Tab切换 -->
      <van-tabs v-if="hasBoth" v-model="qTab" color="#667eea" title-active-color="#667eea">
        <van-tab :title="'客观题(' + objQ.length + ')'">
          <div class="q-scroll">
            <template v-if="chapterGroups.length > 0">
              <template v-for="g in chapterGroups" :key="g.name">
                <div v-if="g.questions.some(q=>q.type!=='subjective')" class="chapter-header">{{ g.name }}</div>
                <ObjectiveQuestionCard v-for="(q,i) in g.questions.filter(q=>q.type!=='subjective')" :key="getQid(q,i)" :question="q" :result="results[getQid(q,i)]||null" :index="i" ref="objCardRefs" @submit="(e)=>handleSubmitObjective(e,getQid(q,i),q)" @change="(e)=>handleSelectionChange(e)" @update-answer="(e)=>handleUpdateAnswer(e,q)" />
              </template>
            </template>
            <template v-else>
              <ObjectiveQuestionCard v-for="(q,i) in objQ" :key="getQid(q,i)" :question="q" :result="results[getQid(q,i)]||null" :index="i" ref="objCardRefs" @submit="(e)=>handleSubmitObjective(e,getQid(q,i),q)" @change="(e)=>handleSelectionChange(e)" @update-answer="(e)=>handleUpdateAnswer(e,q)" />
            </template>
          </div>
        </van-tab>
        <van-tab :title="'主观题(' + subQ.length + ')'">
          <div class="q-scroll">
            <template v-if="chapterGroups.length > 0">
              <template v-for="g in chapterGroups" :key="g.name">
                <div v-if="g.questions.some(q=>q.type==='subjective')" class="chapter-header">{{ g.name }}</div>
                <SubjectiveQuestionCard v-for="(q,i) in g.questions.filter(q=>q.type==='subjective')" :key="getQid(q,i)" :question="q" :result="results[getQid(q,i)]||null" :index="i" ref="subCardRefs" @submit="(e)=>handleSubmitSubjective(e,getQid(q,i))" @update-answer="(e)=>handleUpdateAnswer(e,q)" />
              </template>
            </template>
            <template v-else>
              <SubjectiveQuestionCard v-for="(q,i) in subQ" :key="getQid(q,i)" :question="q" :result="results[getQid(q,i)]||null" :index="i" ref="subCardRefs" @submit="(e)=>handleSubmitSubjective(e,getQid(q,i))" @update-answer="(e)=>handleUpdateAnswer(e,q)" />
            </template>
          </div>
        </van-tab>
      </van-tabs>

      <!-- 仅客观题 -->
      <div v-if="!hasBoth && objQ.length>0" class="q-scroll">
        <template v-if="chapterGroups.length > 0">
          <template v-for="g in chapterGroups" :key="g.name">
            <div v-if="g.questions.some(q=>q.type!=='subjective')" class="chapter-header">{{ g.name }}</div>
            <ObjectiveQuestionCard v-for="(q,i) in g.questions.filter(q=>q.type!=='subjective')" :key="getQid(q,i)" :question="q" :result="results[getQid(q,i)]||null" :index="i" ref="objCardRefs" @submit="(e)=>handleSubmitObjective(e,getQid(q,i),q)" @change="(e)=>handleSelectionChange(e)" @update-answer="(e)=>handleUpdateAnswer(e,q)" />
          </template>
        </template>
        <template v-else>
          <ObjectiveQuestionCard v-for="(q,i) in objQ" :key="getQid(q,i)" :question="q" :result="results[getQid(q,i)]||null" :index="i" ref="objCardRefs" @submit="(e)=>handleSubmitObjective(e,getQid(q,i),q)" @change="(e)=>handleSelectionChange(e)" @update-answer="(e)=>handleUpdateAnswer(e,q)" />
        </template>
      </div>

      <!-- 仅主观题 -->
      <div v-if="!hasBoth && subQ.length>0" class="q-scroll">
        <template v-if="chapterGroups.length > 0">
          <template v-for="g in chapterGroups" :key="g.name">
            <div v-if="g.questions.some(q=>q.type==='subjective')" class="chapter-header">{{ g.name }}</div>
            <SubjectiveQuestionCard v-for="(q,i) in g.questions.filter(q=>q.type==='subjective')" :key="getQid(q,i)" :question="q" :result="results[getQid(q,i)]||null" :index="i" ref="subCardRefs" @submit="(e)=>handleSubmitSubjective(e,getQid(q,i))" @update-answer="(e)=>handleUpdateAnswer(e,q)" />
          </template>
        </template>
        <template v-else>
          <SubjectiveQuestionCard v-for="(q,i) in subQ" :key="getQid(q,i)" :question="q" :result="results[getQid(q,i)]||null" :index="i" ref="subCardRefs" @submit="(e)=>handleSubmitSubjective(e,getQid(q,i))" @update-answer="(e)=>handleUpdateAnswer(e,q)" />
        </template>
      </div>

      <!-- 完成按钮 -->
      <div class="finish-bar" v-if="allSubmitted">
        <van-button round block type="primary" class="gradient-btn" @click="showComplete">🎉 完成复习</van-button>
      </div>
    </div>

    <!-- 空状态 -->
    <van-empty v-if="allQuestions.length===0" description="还没有题目，先去首页生成吧！">
      <van-button round type="primary" @click="$router.push('/')">去首页出题</van-button>
    </van-empty>

    <!-- 完成弹窗 -->
    <van-dialog v-model:show="showDialog" title="🎉 复习完成！" :show-confirm-button="false" class="complete-dialog">
      <div class="dialog-body">
        <div class="dialog-stats">
          <div class="ds-item"><span class="ds-num">{{ allQuestions.length }}</span>总题数</div>
          <div class="ds-item"><span class="ds-num correct">{{ correctCount }}</span>答对</div>
          <div class="ds-item"><span class="ds-num">{{ accuracyPct }}%</span>正确率</div>
        </div>
        <p class="dialog-msg">{{ encouragement }}</p>
        <div class="dialog-actions">
          <van-button round block type="primary" class="gradient-btn" @click="goHistory">📚 查看历史记录</van-button>
          <van-button round plain block @click="showDialog=false; stay=true">继续复习</van-button>
        </div>
      </div>
    </van-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useQuestionsStore } from '../stores/questions'
import { usePracticeStore } from '../stores/practice'
import { showSuccessToast, showFailToast } from 'vant'
import request from '../utils/request.js'
import ObjectiveQuestionCard from '../components/ObjectiveQuestionCard.vue'
import SubjectiveQuestionCard from '../components/SubjectiveQuestionCard.vue'

const router = useRouter()
const qStore = useQuestionsStore()
const pStore = usePracticeStore()
const qTab = ref(0)
const results = reactive({})
const showDialog = ref(false)
const stay = ref(false)
const batchSubmitting = ref(false)
const objCardRefs = ref([])
const subCardRefs = ref([])

/** 统一题目 ID 提取：id → _id → 数组索引 */
function getQid(q, idx) { return q?.id || q?._id || idx }

// 暂存用户选择但未提交的答案
const pendingAnswers = reactive(new Map())

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
  '坚持就是胜利，你离学霸又近了一步！📚',
  '复习是最好的老师，继续保持！💪',
  '今天的努力是明天的实力！🌟',
  '每一次复习都是对知识的致敬！🎓',
  '你的认真程度已经超过了99%的人！👍'
]
const encouragement = computed(() => encouragements[Math.floor(Math.random() * encouragements.length)])

onMounted(() => {
  initFromStore()
})

function initFromStore() {
  const sectionId = pStore.currentSectionId
  if (!sectionId) return
  Object.keys(results).forEach(k => delete results[k])
  pendingAnswers.clear()
  pStore.initSection(sectionId, allQuestions.value.length, '刷题练习', 'practice')
  const saved = pStore.getSectionAnswers(sectionId)
  Object.keys(saved).forEach(k => { results[k] = saved[k] })
}

function handleSelectionChange(e) {
  if (results[e.questionId]) return
  if (e.userAnswer) {
    pendingAnswers.set(e.questionId, e.userAnswer)
  } else {
    pendingAnswers.delete(e.questionId)
  }
}

async function handleSubmitObjective(e, questionId, question) {
  if (results[questionId]) return
  if (!question) { results[questionId] = e; return }
  
  try {
    const r = await request.post("/check", { 
      questionId, 
      userAnswer: e.userAnswer, 
      question,
      questionType: question.type
    })
    results[questionId] = r
    pendingAnswers.delete(questionId)
    const secId = pStore.currentSectionId
    if (!secId) return
    pStore.recordAnswer(secId, r?.correct === true)
    pStore.recordAnswerResult(secId, questionId, r)
  } catch(err) {
    console.error('客观题提交失败:', err)
  }
}

function handleSubmitSubjective(e, questionId) {
  if (results[questionId]) return
  results[questionId] = { correct: e.isCorrect === true, evaluation: e.evaluation || '', score: e.score || 0 }
  pendingAnswers.delete(questionId)
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
      const secId = pStore.currentSectionId
      if (!secId) return
      pStore.recordAnswer(secId, r?.correct === true)
      pStore.recordAnswerResult(secId, qId, r)
    })
    
    showSuccessToast(`已提交 ${answers.length} 题`)
    
    // 批量并行生成缺失的解析
    const missingExps = allQuestions.value.filter((q, qi) => {
      const qId = getQid(q, qi)
      const r = results[qId]
      const exp = r?.explanation || q.explanation
      return !exp || typeof exp !== 'string' || exp === '未提供' || exp === '解析未提供' || exp === '解析生成失败' || exp.trim() === ''
    })
    if (missingExps.length > 0) {
      let genOk = 0, genFail = 0
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
      if (genOk > 0) showSuccessToast(`解析生成完成 (${genOk}/${missingExps.length})`)
      if (genFail > 0) showFailToast(`${genFail} 道题解析生成失败`)
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
.practice-view { min-height: 100vh; background: #f5f5f5; }
.practice-container { padding: 12px 16px 80px; }
.progress-header { background: #fff; border-radius: 16px; padding: 16px; margin-bottom: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); }
.progress-info { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.progress-label { font-size: 14px; color: #666; }
.progress-num { font-size: 18px; font-weight: 700; color: #667eea; }
.progress-stats { display: flex; justify-content: space-around; margin-top: 8px; font-size: 12px; color: #999; }
.batch-bar { position: sticky; top: 0; z-index: 10; background: #fff; border-radius: 16px; padding: 12px; margin-bottom: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); }
.q-scroll { padding-bottom: 16px; }
.chapter-header { font-size: 14px; font-weight: 700; color: #667eea; background: #f0f0ff; border-left: 4px solid #667eea; padding: 10px 14px; margin: 12px 0 8px; border-radius: 0 8px 8px 0; }
.finish-bar { position: fixed; bottom: 0; left: 50%; transform: translateX(-50%); width: 100%; max-width: 480px; padding: 12px 16px 20px; background: #fff; box-shadow: 0 -2px 10px rgba(0,0,0,0.06); }
.dialog-body { padding: 0 16px 20px; text-align: center; }
.dialog-stats { display: flex; justify-content: space-around; margin-bottom: 16px; }
.ds-item { text-align: center; font-size: 12px; color: #999; }
.ds-num { display: block; font-size: 28px; font-weight: 700; color: #667eea; margin-bottom: 2px; }
.ds-num.correct { color: #07c160; }
.dialog-msg { font-size: 15px; color: #333; margin-bottom: 16px; line-height: 1.6; }
.dialog-actions { display: flex; flex-direction: column; gap: 8px; }
</style>
