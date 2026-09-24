<template>
  <div class="wrong-view">
    <CyberNavbar title="错题本" :show-back="true" @back="$router.back()" />

    <div class="page-container">
      <!-- 空状态 -->
      <div v-if="!loading && list.length===0" class="empty-state">
        <div class="empty-icon">🎉</div>
        <div class="empty-title">太棒了</div>
        <div class="empty-desc">暂无错题，继续保持！</div>
      </div>

      <!-- 错题卡片 -->
      <div v-for="item in list" :key="item.id" class="wrong-card" :class="{ mastered: item.status === 3 }">
        <div class="wrong-header">
          <CyberTag type="danger">错{{ item.wrongCount }}次</CyberTag>
          <CyberTag v-if="item.question" :type="typeTag(item.questionType)">
            {{ typeLabel(item.questionType) }}
          </CyberTag>
          <CyberTag :type="statusTag(item.status)">{{ statusLabel(item) }}</CyberTag>
          <CyberTag v-if="item.isSlow === 1" type="warning">🐢 慢题</CyberTag>
          <span class="remove-btn" @click="removeWrong(item.id)">移除</span>
        </div>

        <div v-if="item.question">
          <div class="wrong-question">{{ item.question.question }}</div>

          <!-- 选项：solution 标绿正确项；redo 可点选 -->
          <div class="wrong-opts" v-if="item.question.options">
            <span
              v-for="(v,k) in item.question.options"
              :key="k"
              class="wrong-opt"
              :class="{
                correct: modeOf(item.id)==='solution' && isCorrectOpt(item,k),
                pick: modeOf(item.id)==='redo' && isRedoPicked(item,k)
              }"
              @click="modeOf(item.id)==='redo' && pickRedo(item,k)"
            >{{ k }}. {{ v }}</span>
          </div>

          <!-- 概览：默认不展示答案，二选一 -->
          <div v-if="modeOf(item.id)==='overview'" class="action-row">
            <button class="wq-btn ghost" @click="viewSolution(item)">📖 查看订正</button>
            <button class="wq-btn primary" :disabled="redoLocked(item)" @click="startRedo(item)">
              {{ redoLocked(item) ? '🔒 ' + fmtDate(item.nextReviewTime) + ' 可重做' : '✍️ 动手重做' }}
            </button>
          </div>

          <!-- 查看订正：答案+解析，标记为“看过但未完成复习” -->
          <template v-if="modeOf(item.id)==='solution'">
            <div class="wrong-answer">你的答案：<span class="red">{{ item.userAnswer || '未作答' }}</span></div>
            <div class="wrong-answer">正确答案：<span class="green">{{ item.correctAnswer || item.question.answer }}</span></div>

            <!-- 重做结果反馈 -->
            <div v-if="feedbackOf(item.id)" class="redo-feedback" :class="feedbackOf(item.id).type">
              {{ feedbackOf(item.id).text }}
            </div>

            <div class="wrong-explain" v-if="item.explanation || item.question.explanation">
              {{ item.explanation || item.question.explanation }}
            </div>

            <!-- 错因标注/补标（可反复编辑，允许为空） -->
            <ErrorTypeTagger
              v-if="item.questionId"
              :question-id="item.questionId"
              :initial-types="item.errorTypes || ''"
              :initial-note="item.errorNote || ''"
              @saved="(p) => onErrorSaved(item, p)"
            />
            <div v-if="item.errorTypes" class="error-types-line">
              当前错因：{{ errorTypeText(item.errorTypes) }}
            </div>
            <div v-if="item.nextReviewTime && item.status !== 3" class="next-review-line">
              下次复习：{{ fmtDate(item.nextReviewTime) }}<span v-if="redoLocked(item)">（到期后重做才计入连对）</span>
            </div>

            <div class="action-row">
              <button class="wq-btn primary" :disabled="redoLocked(item)" @click="startRedo(item)">
                {{ redoLocked(item) ? '🔒 ' + fmtDate(item.nextReviewTime) + ' 可重做' : '✍️ 动手重做' }}
              </button>
              <button class="wq-btn ghost" @click="setMode(item.id,'overview')">收起</button>
            </div>
          </template>

          <!-- 动手重做：隐藏答案重新作答 -->
          <template v-if="modeOf(item.id)==='redo'">
            <!-- 主观题作答 -->
            <template v-if="item.questionType==='subjective'">
              <textarea
                v-model="redoTextMap[item.id]"
                class="redo-textarea"
                rows="5"
                placeholder="不看答案，重新作答..."
              ></textarea>
              <div v-if="evalOf(item.id)" class="ai-eval-box">
                <div class="ai-eval-score">AI 评分：{{ evalOf(item.id).score }}/5</div>
                <div class="ai-eval-text">{{ evalOf(item.id).evaluation }}</div>
              </div>
            </template>

            <div v-if="feedbackOf(item.id)" class="redo-feedback" :class="feedbackOf(item.id).type">
              {{ feedbackOf(item.id).text }}
            </div>

            <div class="action-row">
              <!-- 客观题：直接提交重做 -->
              <button v-if="item.questionType!=='subjective'" class="wq-btn primary" @click="submitRedo(item)">提交重做</button>
              <!-- 主观题：先保存作答，再由用户决定是否 AI 评价 -->
              <template v-else>
                <button class="wq-btn ghost" @click="submitRedo(item)">保存作答</button>
                <button class="wq-btn primary" :disabled="aiLoading===item.id" @click="aiEvalThenRedo(item)">
                  {{ aiLoading===item.id ? '评价中...' : 'AI 评价并判定' }}
                </button>
              </template>
              <button class="wq-btn ghost" @click="setMode(item.id,'overview')">返回</button>
            </div>
          </template>
        </div>

        <div v-else class="broken-line">题目数据缺失，可移除后重新练习</div>
      </div>

      <!-- 加载中 -->
      <div v-if="loading" class="loading-center">
        <div class="cyber-spinner"></div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { showSuccessToast, showFailToast } from 'vant'
import request from '../utils/request.js'
import ErrorTypeTagger from '../components/ErrorTypeTagger.vue'
import { CyberNavbar, CyberTag } from '../components/cyber'

const list = ref([])
const loading = ref(true)

// 每题 UI 模式：overview / solution / redo
const modeMap = reactive({})
// 重做作答：客观题答案串、主观题文本
const redoAnsMap = reactive({})
const redoTextMap = reactive({})
// 重做反馈 / 主观AI评价
const feedbackMap = reactive({})
const evalMap = reactive({})
const redoEnterMap = reactive({})
const aiLoading = ref(null)

const ERROR_TYPE_LABEL = {
  audit: '审题性', knowledge: '知识性', math: '数学性', strategy: '策略性', habit: '习惯性'
}

onMounted(loadList)

async function loadList() {
  loading.value = true
  try {
    const res = await request.get('/wrong-questions')
    list.value = (res || []).map(item => {
      let q = null
      try { q = JSON.parse(item.questionContent) } catch (e) { /* 忽略坏数据 */ }
      return { ...item, question: q }
    })
    list.value.forEach(it => { modeMap[it.id] = 'overview' })
  } catch (e) {
    showFailToast('加载失败')
  } finally {
    loading.value = false
  }
}

function modeOf(id) { return modeMap[id] || 'overview' }
function setMode(id, m) { modeMap[id] = m }
function feedbackOf(id) { return feedbackMap[id] || null }
function evalOf(id) { return evalMap[id] || null }

function typeLabel(t) {
  return t === 'single' ? '单选' : t === 'subjective' ? '主观' : t === 'judge' ? '判断' : '多选'
}
function typeTag(t) {
  return t === 'single' ? 'primary' : t === 'subjective' ? 'success' : 'warning'
}
function statusLabel(item) {
  switch (item.status) {
    case 1: return '看过未重做'
    case 2: return `复习中·连对${item.correctStreak || 0}/4`
    case 3: return '已掌握'
    default: return '未订正'
  }
}
function statusTag(s) {
  return s === 3 ? 'success' : s === 2 ? 'primary' : s === 1 ? 'warning' : 'danger'
}
function errorTypeText(codes) {
  return String(codes).split(',').map(c => ERROR_TYPE_LABEL[c] || c).join('、')
}
function fmtDate(s) { return s ? String(s).slice(0, 10) : '' }

function isCorrectOpt(item, key) {
  const ans = item.correctAnswer || item.question?.answer || ''
  return ans.includes(key)
}
function isRedoPicked(item, key) {
  return String(redoAnsMap[item.id] || '').includes(key)
}
function pickRedo(item, key) {
  if (item.questionType === 'multiple') {
    let arr = String(redoAnsMap[item.id] || '').split('').filter(Boolean)
    const i = arr.indexOf(key)
    if (i >= 0) arr.splice(i, 1); else arr.push(key)
    arr.sort()
    redoAnsMap[item.id] = arr.join('')
  } else {
    redoAnsMap[item.id] = key
  }
}

// 查看订正：展开答案解析，并把 0未订正 → 1看过未重做
async function viewSolution(item) {
  modeMap[item.id] = 'solution'
  if ((item.status || 0) === 0) {
    try {
      const r = await request.post(`/wrong-questions/${item.id}/view`)
      if (r?.success) item.status = r.status
    } catch (e) { /* 标记失败不影响查看 */ }
  }
}

// 到期锁：已答对过(复习中、连对≥1)且下次复习时间还在未来 → 未到期不能再计入连对
function redoLocked(item) {
  if (item.status === 2 && (item.correctStreak || 0) >= 1 && item.nextReviewTime) {
    return new Date(item.nextReviewTime).getTime() > Date.now()
  }
  return false
}

function onErrorSaved(item, p) {
  item.errorTypes = p.errorTypes || null
  item.errorNote = p.errorNote || null
}

function startRedo(item) {
  if (redoLocked(item)) {
    showFailToast('还没到复习时间，' + fmtDate(item.nextReviewTime) + ' 后重做才计入连对')
    return
  }
  modeMap[item.id] = 'redo'
  redoEnterMap[item.id] = Date.now()
  if (item.questionType === 'subjective') redoTextMap[item.id] = item.userAnswer || ''
  else redoAnsMap[item.id] = ''
  feedbackMap[item.id] = null
  evalMap[item.id] = null
}

function redoAnswerTime(item) {
  const start = redoEnterMap[item.id]
  return start ? Math.max(1, Math.round((Date.now() - start) / 1000)) : null
}

// 客观题提交重做；主观题“保存作答”只存文本、不判定（needEval）
async function submitRedo(item) {
  const isSub = item.questionType === 'subjective'
  const userAnswer = isSub ? (redoTextMap[item.id] || '').trim() : (redoAnsMap[item.id] || '')
  if (!userAnswer) { showFailToast(isSub ? '请先输入答案' : '请先选择答案'); return }
  try {
    const payload = { userAnswer, answerTime: redoAnswerTime(item) }
    const r = await request.post(`/wrong-questions/${item.id}/redo`, payload)
    applyRedoResult(item, r, userAnswer)
    if (isSub && r?.needEval) {
      feedbackMap[item.id] = { type: 'info', text: '作答已保存，点「AI 评价并判定」完成本次重做' }
    } else if (!isSub) {
      modeMap[item.id] = 'solution'
    }
  } catch (e) {
    showFailToast('提交失败，请重试')
  }
}

// 主观题：先调只评分端点拿分，再带分 redo 推进状态机（避免 /check-subjective 重复落库）
async function aiEvalThenRedo(item) {
  const userAnswer = (redoTextMap[item.id] || '').trim()
  if (!userAnswer) { showFailToast('请先输入答案'); return }
  aiLoading.value = item.id
  try {
    const ev = await request.post('/wrong-questions/eval-subjective', {
      question: item.question, userAnswer
    })
    evalMap[item.id] = { score: ev.score, evaluation: ev.evaluation }
    const r = await request.post(`/wrong-questions/${item.id}/redo`, {
      userAnswer, score: ev.score, answerTime: redoAnswerTime(item)
    })
    applyRedoResult(item, r, userAnswer)
    modeMap[item.id] = 'solution'
  } catch (e) {
    showFailToast('AI 评价失败，请重试')
  } finally {
    aiLoading.value = null
  }
}

function applyRedoResult(item, r, userAnswer) {
  if (!r?.success) { showFailToast(r?.error || '重做失败'); return }
  item.userAnswer = userAnswer
  // 未到复习时间：后端不计连对，前端也不推进状态
  if (r.notTime) {
    feedbackMap[item.id] = { type: 'info', text: `⏳ 还没到复习时间，${fmtDate(r.lockedUntil)} 后重做才计入连对（本次作答已保存）` }
    return
  }
  item.status = r.status
  if (r.correctStreak != null) item.correctStreak = r.correctStreak
  if (r.reviewCount != null) item.reviewCount = r.reviewCount
  item.nextReviewTime = r.nextReviewTime ?? null
  if (r.correct === true) {
    if (r.status === 3) {
      feedbackMap[item.id] = { type: 'ok', text: `🎉 第 ${r.correctStreak} 次重做正确，已掌握并移出复习队列` }
    } else {
      feedbackMap[item.id] = { type: 'ok', text: `✅ 重做正确（连对 ${r.correctStreak}/4），${fmtDate(r.nextReviewTime)} 再次复习` }
    }
  } else if (r.correct === false) {
    feedbackMap[item.id] = { type: 'bad', text: '❌ 重做仍错误，连对已清零，可立即再做一次' }
  }
}

async function removeWrong(id) {
  await request.delete('/wrong-questions/' + id)
  list.value = list.value.filter(i => i.id !== id)
  showSuccessToast('已移除')
}
</script>

<style scoped>
.wrong-view {
  min-height: 100dvh;
  background: var(--bg-base);
  position: relative;
}

.page-container {
  padding: 16px 16px 40px;
  position: relative;
  z-index: 10;
}

.empty-state { text-align: center; padding: 80px 0; }
.empty-icon { font-size: 48px; margin-bottom: 12px; }
.empty-title { font-size: 18px; font-weight: 700; color: var(--text-primary); margin-bottom: 6px; }
.empty-desc { font-size: 13px; color: var(--text-secondary); }

.wrong-card {
  background: var(--bg-card);
  border: 1px solid rgba(255, 68, 68, 0.2);
  border-radius: var(--radius-card);
  backdrop-filter: blur(12px);
  padding: 16px;
  margin-bottom: 12px;
  transition: all 0.3s var(--ease-out);
}
.wrong-card.mastered { border-color: rgba(0, 255, 136, 0.35); }

.wrong-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.remove-btn {
  margin-left: auto;
  font-size: 12px;
  color: var(--danger);
  cursor: pointer;
  padding: 4px 10px;
  border: 1px solid var(--danger);
  border-radius: 6px;
  transition: all 0.2s;
}
.remove-btn:hover { background: var(--danger-soft); }

.wrong-question {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.6;
  margin-bottom: 10px;
}

.wrong-opts { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
.wrong-opt {
  font-size: 12px;
  padding: 5px 12px;
  border-radius: var(--radius-pill);
  background: var(--bg-elevated);
  color: var(--text-secondary);
  border: 1px solid var(--accent-border);
}
.wrong-opt.correct {
  background: var(--success-soft);
  color: var(--success);
  border-color: var(--success);
  font-weight: 600;
}
.wrong-opt.pick {
  background: var(--accent-soft);
  color: var(--accent);
  border-color: var(--accent);
  font-weight: 600;
  cursor: pointer;
}

.action-row { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 10px; }
.wq-btn {
  height: 38px;
  padding: 0 16px;
  border-radius: var(--radius-pill);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  border: 1px solid var(--accent-border);
}
.wq-btn.primary {
  background: linear-gradient(135deg, var(--accent), #00c8d4);
  color: #000;
  border: none;
}
.wq-btn.primary:disabled { opacity: 0.6; cursor: not-allowed; }
.wq-btn.ghost { background: transparent; color: var(--accent); }
.wq-btn.ghost:hover { background: var(--accent-soft); }

.wrong-answer { font-size: 13px; color: var(--text-secondary); margin-bottom: 6px; }
.red { color: var(--danger); font-weight: 600; }
.green { color: var(--success); font-weight: 600; }

.wrong-explain {
  font-size: 13px;
  color: var(--text-secondary);
  background: var(--bg-elevated);
  padding: 12px;
  border-radius: 8px;
  margin-top: 10px;
  line-height: 1.6;
  border-left: 3px solid var(--accent);
  -webkit-user-select: text;
  user-select: text;
}

.error-types-line { font-size: 12px; color: var(--danger); margin-top: 8px; font-weight: 600; }
.error-note-line { font-size: 12px; color: var(--text-secondary); margin-top: 4px; }
.next-review-line { font-size: 12px; color: var(--accent); margin-top: 4px; }

.redo-textarea {
  width: 100%;
  padding: 12px;
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-primary);
  background: var(--bg-elevated);
  border: 1px solid var(--accent-border);
  border-radius: var(--radius-button);
  resize: vertical;
  font-family: inherit;
}
.redo-textarea:focus { outline: none; border-color: var(--accent); }

.redo-feedback {
  margin-top: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  font-size: 13px;
  line-height: 1.5;
}
.redo-feedback.ok { background: rgba(0,255,136,0.1); color: var(--success); border: 1px solid rgba(0,255,136,0.3); }
.redo-feedback.bad { background: rgba(255,68,68,0.1); color: var(--danger); border: 1px solid rgba(255,68,68,0.3); }
.redo-feedback.info { background: var(--accent-soft); color: var(--accent); border: 1px solid var(--accent-border); }

.ai-eval-box {
  margin-top: 10px;
  padding: 10px 12px;
  background: var(--bg-elevated);
  border-radius: 8px;
  border-left: 3px solid var(--secondary);
}
.ai-eval-score { font-size: 13px; font-weight: 700; color: var(--secondary); margin-bottom: 4px; }
.ai-eval-text { font-size: 12px; color: var(--text-secondary); line-height: 1.6; }

.broken-line { font-size: 13px; color: var(--text-muted); }

.loading-center { display: flex; justify-content: center; padding: 40px 0; }
</style>
