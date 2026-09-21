<template>
  <div class="review-view">
    <CyberNavbar title="今日复习" :show-back="true" @back="$router.back()" />

    <div class="page-container">
      <!-- 加载 -->
      <div v-if="loading" class="center-box"><div class="cyber-spinner"></div></div>

      <!-- 空队列 -->
      <div v-else-if="queue.length === 0" class="empty-state">
        <div class="empty-icon">✅</div>
        <div class="empty-title">今日复习已完成</div>
        <div class="empty-desc">没有到期的错题，去刷题吧</div>
        <button class="rv-btn primary" @click="$router.back()">返回</button>
      </div>

      <!-- 全部复习完 -->
      <div v-else-if="finished" class="empty-state">
        <div class="empty-icon">🎯</div>
        <div class="empty-title">本轮复习完成</div>
        <div class="summary-line">共复习 {{ roundTotal }} 题</div>
        <div class="summary-line ok">本轮答对 {{ roundOk }} 题</div>
        <div class="summary-line bad">仍需巩固 {{ roundTotal - roundOk }} 题</div>
        <button class="rv-btn primary" @click="$router.back()">完成</button>
      </div>

      <!-- 复习卡片 -->
      <template v-else>
        <div class="rv-progress">第 {{ idx + 1 }} / {{ queue.length }} 题</div>
        <div class="rv-card" v-if="current">
          <div class="rv-tags">
            <CyberTag :type="current.questionType==='subjective'?'success':'primary'">
              {{ typeLabel(current.questionType) }}
            </CyberTag>
            <CyberTag v-if="current.isSlow === 1" type="warning">🐢 慢题，注意提速</CyberTag>
            <CyberTag type="danger">错{{ current.wrongCount }}次</CyberTag>
          </div>

          <div class="rv-question">{{ current.question?.question }}</div>

          <!-- 客观作答 -->
          <div v-if="current.questionType!=='subjective'" class="rv-options">
            <div
              v-for="(val,key) in current.question?.options"
              :key="key"
              class="rv-option"
              :class="{
                pick: !feedback && picked.includes(key),
                correct: feedback && (current.correctAnswer||current.question?.answer||'').includes(key),
                wrong: feedback && picked.includes(key) && !(current.correctAnswer||current.question?.answer||'').includes(key)
              }"
              @click="pick(key)"
            >
              <span class="o-key">{{ key }}</span><span class="o-text">{{ val }}</span>
            </div>
          </div>

          <!-- 主观作答 -->
          <textarea
            v-else
            v-model="subText"
            class="rv-textarea"
            rows="6"
            placeholder="不看答案，重新作答..."
          ></textarea>

          <!-- 反馈 -->
          <div v-if="feedback" class="rv-feedback" :class="feedback.type">
            <div>{{ feedback.text }}</div>
            <div class="fb-answer" v-if="current.questionType!=='subjective'">
              正确答案：<b>{{ current.correctAnswer || current.question?.answer }}</b>
            </div>
            <div class="fb-explain" v-if="current.explanation || current.question?.explanation">
              {{ current.explanation || current.question.explanation }}
            </div>
          </div>

          <!-- 主观 AI 评价 -->
          <div v-if="aiEval" class="ai-box">
            <div class="ai-score">AI 评分：{{ aiEval.score }}/5</div>
            <div class="ai-text">{{ aiEval.evaluation }}</div>
          </div>

          <!-- 操作 -->
          <div class="rv-actions">
            <template v-if="!feedback">
              <button v-if="current.questionType!=='subjective'" class="rv-btn primary" @click="submitObjective">提交</button>
              <template v-else>
                <button class="rv-btn ghost" :disabled="busy" @click="saveSubjective">保存作答</button>
                <button class="rv-btn primary" :disabled="busy" @click="aiThenRedo">{{ busy?'评价中...':'AI 评价并判定' }}</button>
              </template>
            </template>
            <button v-else class="rv-btn primary" @click="nextOne">{{ idx + 1 >= queue.length ? '完成本轮' : '下一题' }}</button>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { showFailToast } from 'vant'
import request from '../utils/request.js'
import { CyberNavbar, CyberTag } from '../components/cyber'

const loading = ref(true)
const queue = ref([])
const idx = ref(0)
const picked = ref('')
const subText = ref('')
const feedback = ref(null)
const aiEval = ref(null)
const busy = ref(false)
const enterAt = ref(0)
const roundTotal = ref(0)
const roundOk = ref(0)
const finished = ref(false)

const current = computed(() => queue.value[idx.value] || null)

onMounted(async () => {
  try {
    const res = await request.get('/wrong-questions/review-today')
    queue.value = (res?.list || []).map(it => {
      let q = null
      try { q = JSON.parse(it.questionContent) } catch (e) { /* 忽略 */ }
      return { ...it, question: q }
    }).filter(it => it.question)
    roundTotal.value = queue.value.length
    enterQuestion()
  } catch (e) {
    showFailToast('加载复习队列失败')
  } finally {
    loading.value = false
  }
})

function enterQuestion() {
  picked.value = ''
  subText.value = ''
  feedback.value = null
  aiEval.value = null
  enterAt.value = Date.now()
}
function answerTime() {
  return Math.max(1, Math.round((Date.now() - enterAt.value) / 1000))
}
function typeLabel(t) { return t === 'single' ? '单选' : t === 'subjective' ? '主观' : t === 'judge' ? '判断' : '多选' }

function pick(key) {
  if (feedback.value) return
  const it = current.value
  if (it.questionType === 'multiple') {
    let arr = picked.value.split('').filter(Boolean)
    const i = arr.indexOf(key)
    if (i >= 0) arr.splice(i, 1); else arr.push(key)
    arr.sort()
    picked.value = arr.join('')
  } else {
    picked.value = key
  }
}

async function doRedo(payload) {
  const it = current.value
  const r = await request.post(`/wrong-questions/${it.id}/redo`, payload)
  if (!r?.success) { showFailToast(r?.error || '提交失败'); return null }
  it.status = r.status
  it.correctStreak = r.correctStreak
  it.nextReviewTime = r.nextReviewTime
  return r
}

async function submitObjective() {
  if (!picked.value) { showFailToast('请先选择答案'); return }
  const r = await doRedo({ userAnswer: picked.value, answerTime: answerTime() })
  if (!r) return
  if (r.correct && !r.notTime) roundOk.value++
  feedback.value = feedbackBy(r)
}

async function saveSubjective() {
  if (!subText.value.trim()) { showFailToast('请先输入答案'); return }
  const r = await doRedo({ userAnswer: subText.value.trim(), answerTime: answerTime() })
  if (r?.needEval) feedback.value = { type: 'info', text: '作答已保存，点「AI 评价并判定」完成本次复习' }
}

async function aiThenRedo() {
  const it = current.value
  if (!subText.value.trim()) { showFailToast('请先输入答案'); return }
  busy.value = true
  try {
    const ev = await request.post('/wrong-questions/eval-subjective', { question: it.question, userAnswer: subText.value.trim() })
    aiEval.value = { score: ev.score, evaluation: ev.evaluation }
    const r = await doRedo({ userAnswer: subText.value.trim(), score: ev.score, answerTime: answerTime() })
    if (!r) return
    if (r.correct && !r.notTime) roundOk.value++
    feedback.value = feedbackBy(r)
  } catch (e) {
    showFailToast('AI 评价失败')
  } finally {
    busy.value = false
  }
}

function feedbackBy(r) {
  if (r.notTime) return { type: 'info', text: `⏳ 还没到复习时间，${fmt(r.lockedUntil)} 后重做才计入连对` }
  if (r.correct === true) {
    return r.status === 3
      ? { type: 'ok', text: `🎉 第 ${r.correctStreak} 次答对，已掌握并移出复习队列` }
      : { type: 'ok', text: `✅ 答对（连对 ${r.correctStreak}/4），${fmt(r.nextReviewTime)} 再次复习` }
  }
  if (r.correct === false) return { type: 'bad', text: '❌ 仍答错，连对已清零，可立即再做一次' }
  return { type: 'info', text: '已保存' }
}
function fmt(s) { return s ? String(s).slice(0, 10) : '' }

function nextOne() {
  if (idx.value + 1 >= queue.value.length) {
    finished.value = true
  } else {
    idx.value++
    enterQuestion()
  }
}
</script>

<style scoped>
.review-view { min-height: 100dvh; background: var(--bg-base); }
.page-container { padding: 16px; max-width: 480px; margin: 0 auto; }
.center-box { display: flex; justify-content: center; padding: 60px 0; }
.empty-state { text-align: center; padding: 70px 16px; }
.empty-icon { font-size: 46px; margin-bottom: 12px; }
.empty-title { font-size: 18px; font-weight: 700; color: var(--text-primary); margin-bottom: 8px; }
.empty-desc { font-size: 13px; color: var(--text-secondary); margin-bottom: 18px; }
.summary-line { font-size: 14px; color: var(--text-secondary); margin-bottom: 6px; }
.summary-line.ok { color: var(--success); font-weight: 700; }
.summary-line.bad { color: var(--danger); font-weight: 700; }

.rv-progress { text-align: center; font-size: 13px; color: var(--accent); margin-bottom: 12px; font-weight: 600; }
.rv-card {
  background: var(--bg-card);
  border: 1px solid var(--accent-border);
  border-radius: var(--radius-card);
  padding: 20px 16px;
  backdrop-filter: blur(12px);
}
.rv-tags { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 14px; }
.rv-question { font-size: 16px; font-weight: 600; color: var(--text-primary); line-height: 1.6; margin-bottom: 16px; }

.rv-options { display: flex; flex-direction: column; gap: 10px; }
.rv-option {
  display: flex; align-items: center; gap: 12px;
  padding: 13px 14px;
  background: var(--bg-elevated);
  border: 1px solid var(--accent-border);
  border-radius: var(--radius-button);
  cursor: pointer;
}
.rv-option.pick { border-color: var(--accent); background: var(--accent-soft); }
.rv-option.correct { border-color: var(--success); background: rgba(0,255,136,0.1); }
.rv-option.wrong { border-color: var(--danger); background: rgba(255,68,68,0.1); }
.o-key { width: 26px; height: 26px; border-radius: 50%; background: var(--accent-soft); color: var(--accent); display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 13px; flex-shrink: 0; }
.o-text { font-size: 14px; color: var(--text-primary); }

.rv-textarea {
  width: 100%; padding: 12px; font-size: 14px; line-height: 1.6;
  background: var(--bg-elevated); border: 1px solid var(--accent-border);
  border-radius: var(--radius-button); color: var(--text-primary);
  resize: vertical; font-family: inherit;
}
.rv-textarea:focus { outline: none; border-color: var(--accent); }

.rv-feedback { margin-top: 14px; padding: 12px; border-radius: 8px; font-size: 13px; line-height: 1.6; }
.rv-feedback.ok { background: rgba(0,255,136,0.1); color: var(--success); border: 1px solid rgba(0,255,136,0.3); }
.rv-feedback.bad { background: rgba(255,68,68,0.1); color: var(--danger); border: 1px solid rgba(255,68,68,0.3); }
.rv-feedback.info { background: var(--accent-soft); color: var(--accent); border: 1px solid var(--accent-border); }
.fb-answer { margin-top: 6px; font-weight: 600; }
.fb-explain { margin-top: 8px; color: var(--text-secondary); font-size: 12px; line-height: 1.6; }

.ai-box { margin-top: 12px; padding: 10px 12px; background: var(--bg-elevated); border-left: 3px solid var(--secondary); border-radius: 8px; }
.ai-score { font-size: 13px; font-weight: 700; color: var(--secondary); margin-bottom: 4px; }
.ai-text { font-size: 12px; color: var(--text-secondary); line-height: 1.6; }

.rv-actions { display: flex; gap: 10px; margin-top: 16px; }
.rv-btn {
  flex: 1; height: 44px; border-radius: var(--radius-pill);
  font-size: 14px; font-weight: 600; cursor: pointer; border: 1px solid var(--accent-border);
}
.rv-btn.primary { background: linear-gradient(135deg, var(--accent), #00c8d4); color: #000; border: none; }
.rv-btn.primary:disabled, .rv-btn.ghost:disabled { opacity: 0.6; cursor: not-allowed; }
.rv-btn.ghost { background: transparent; color: var(--accent); }
</style>
