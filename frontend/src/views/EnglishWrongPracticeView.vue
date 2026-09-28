<template>
  <div class="page-wrap">
    <van-nav-bar title="错题练习" left-arrow @click-left="router.back()" />

    <div class="page-container">
      <!-- 攻克横幅 -->
      <div class="conquer-banner" v-if="conquered">
        🎉 变式题 + 同类型题全部通过，本题已攻克，退出回流！
      </div>

      <!-- 原题回顾（只看不答，已知道正确答案） -->
      <div class="orig-card" v-if="orig">
        <div class="oc-title">📌 原题回顾 · 错 {{ orig.wrongCount }} 次</div>
        <div class="oc-q">{{ orig._q?.question }}</div>
        <div class="oc-opts">
          <div
            v-for="(v, k) in (orig._q?.options || {})"
            :key="k"
            class="opt"
            :class="{ right: k === orig.correctAnswer, mine: k === orig.userAnswer && k !== orig.correctAnswer }"
          >{{ k }}. {{ v }}</div>
        </div>
        <div class="oc-answers">
          你的答案：<span class="red">{{ orig.userAnswer }}</span>
          <span class="ans-divider">|</span>
          正确答案：<span class="green">{{ orig.correctAnswer }}</span>
        </div>
        <div class="oc-explain" v-if="orig.explanation">解析：{{ orig.explanation }}</div>
      </div>

      <div v-if="!orig && !loading" class="empty-tip">
        <van-empty description="没有找到这道错题">
          <van-button round type="primary" size="small" @click="router.back()">返回</van-button>
        </van-empty>
      </div>

      <template v-if="orig">
        <!-- 变式挑战：同考点加深一层 -->
        <div class="practice-card">
          <div class="pc-title">🎯 变式挑战 <span class="pc-sub">同考点加深一层 · 选项强干扰</span></div>
          <div class="p-loading" v-if="variantSt.loading">
            <div class="cyber-spinner"></div>
            <div class="p-loading-text">AI 正在出新题…</div>
          </div>
          <div class="p-fail" v-else-if="!variantSt.item">
            <div class="p-fail-text">出题失败了，稍等片刻再试</div>
            <div class="p-fail-err" v-if="variantSt.error">{{ variantSt.error }}</div>
            <van-button size="small" round type="warning" @click="regen(variantSt)">重新出题</van-button>
          </div>
          <template v-else>
            <div class="p-passage" v-if="variantSt.item.passage">📖 原文片段：{{ variantSt.item.passage }}</div>
            <div class="p-q">{{ variantSt.item.question }}</div>
            <div class="p-opts">
              <div
                v-for="(v, k) in (variantSt.item.options || {})"
                :key="k"
                class="opt"
                :class="optClass(variantSt, k)"
                @click="pick(variantSt, k)"
              >{{ k }}. {{ v }}</div>
            </div>
            <div class="p-explain" v-if="variantSt.picked !== null">
              <div class="p-answer">正确答案：{{ variantSt.item.answer }}. {{ (variantSt.item.options || {})[variantSt.item.answer] }}</div>
              <div>解析：{{ variantSt.item.explain }}</div>
            </div>
            <div class="p-done" v-if="variantSt.done">✅ 通过！</div>
            <div class="p-retry" v-else-if="variantSt.picked !== null">
              <div class="p-retry-tip">答错了没关系，看懂解析后换一题再来，直到做对为止 💪</div>
              <van-button size="small" round type="warning" :loading="variantSt.loading" @click="regen(variantSt)">再来一题</van-button>
            </div>
          </template>
        </div>

        <!-- 同类型实战：只给答案依据所在段落 -->
        <div class="practice-card">
          <div class="pc-title">📖 同类型实战 <span class="pc-sub">AI 原创短文 · 同题型只出一道</span></div>
          <div class="p-start" v-if="!similarSt.started">
            <div class="p-start-tip">第二道：AI 现写一段新短文，考与原题相同的题型，准备好再开始</div>
            <van-button size="small" round type="warning" @click="regen(similarSt)">变式二</van-button>
          </div>
          <div class="p-loading" v-else-if="similarSt.loading">
            <div class="cyber-spinner"></div>
            <div class="p-loading-text">AI 正在出新题…</div>
          </div>
          <div class="p-fail" v-else-if="!similarSt.item">
            <div class="p-fail-text">出题失败了，稍等片刻再试</div>
            <div class="p-fail-err" v-if="similarSt.error">{{ similarSt.error }}</div>
            <van-button size="small" round type="warning" @click="regen(similarSt)">重新出题</van-button>
          </div>
          <template v-else>
            <div class="p-passage" v-if="similarSt.item.passage">📖 原文片段：{{ similarSt.item.passage }}</div>
            <div class="p-q">{{ similarSt.item.question }}</div>
            <div class="p-opts">
              <div
                v-for="(v, k) in (similarSt.item.options || {})"
                :key="k"
                class="opt"
                :class="optClass(similarSt, k)"
                @click="pick(similarSt, k)"
              >{{ k }}. {{ v }}</div>
            </div>
            <div class="p-explain" v-if="similarSt.picked !== null">
              <div class="p-answer">正确答案：{{ similarSt.item.answer }}. {{ (similarSt.item.options || {})[similarSt.item.answer] }}</div>
              <div>解析：{{ similarSt.item.explain }}</div>
            </div>
            <div class="p-done" v-if="similarSt.done">✅ 通过！</div>
            <div class="p-retry" v-else-if="similarSt.picked !== null">
              <div class="p-retry-tip">答错了没关系，看懂解析后换一题再来，直到做对为止 💪</div>
              <van-button size="small" round type="warning" :loading="similarSt.loading" @click="regen(similarSt)">再来一题</van-button>
            </div>
          </template>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { showSuccessToast, showFailToast } from 'vant'
import { getEnglishWrongList } from '../api/englishWrong'
import { generatePractice, answerPractice } from '../api/englishAgent'

const router = useRouter()
const route = useRoute()

const loading = ref(true)
const orig = ref(null)
const conquered = ref(false)

/** 每种题的独立状态：started 是否已开始出题 / loading 出题中 / item 题目数据 / picked 已选字母 / done 本题通过 */
function blankState() {
  return { started: false, loading: false, item: null, picked: null, done: false, error: null }
}
const variantSt = ref(blankState())
const similarSt = ref(blankState())

onMounted(async () => {
  const qid = route.query.qid
  if (!qid) {
    showFailToast('缺少题目参数')
    loading.value = false
    return
  }
  try {
    const res = await getEnglishWrongList()
    if (res.code === 200) {
      const item = (res.data || []).find(i => i.questionId === qid)
      if (!item) {
        loading.value = false
        return
      }
      let q = null
      try { q = JSON.parse(item.questionContent) } catch (e) { /* 内容解析失败按无题处理 */ }
      orig.value = { ...item, _q: q }
    } else {
      showFailToast(res.msg || '加载失败')
    }
  } catch (e) {
    showFailToast(e.message || '网络异常')
  } finally {
    loading.value = false
  }
  // 先出第一道变式题；第二道（同类型题）点「变式二」按钮后再出，避免两题一起等太久
  regen(variantSt.value)
})

async function regen(st) {
  if (!orig.value || st.loading) return
  st.started = true
  st.loading = true
  st.item = null
  st.picked = null
  st.done = false
  st.error = null
  try {
    const kind = st === variantSt.value ? 'variant' : 'similar'
    const res = await generatePractice(orig.value.questionId, kind)
    if (res.code === 200 && res.data) {
      st.item = res.data
    } else {
      st.error = res.msg || 'AI 出题失败'
      showFailToast(st.error)
    }
  } catch (e) {
    st.error = e.message || 'AI 出题失败，可稍后再试'
    showFailToast(st.error)
  } finally {
    st.loading = false
  }
}

function optClass(st, k) {
  if (st.picked === null) return { pickable: true }
  return {
    correct: k === st.item?.answer,
    wrong: k === st.picked && k !== st.item?.answer
  }
}

function isCorrect(st) {
  return st.picked === st.item?.answer
}

async function pick(st, k) {
  if (st.picked !== null || st.done || !st.item) return
  st.picked = k
  const correct = k === st.item.answer
  if (correct) st.done = true   // 本地判题即时生效，回写失败也不影响展示
  try {
    const res = await answerPractice(st.item.id, correct)
    if (res.code === 200) {
      if (res.conquered) {
        conquered.value = true
        showSuccessToast('全部通过，本题已攻克 🎉')
      } else if (correct) {
        showSuccessToast('通过！')
      }
    }
  } catch (e) { /* 回写失败不阻断本地判题展示 */ }
}
</script>

<style scoped>
.page-wrap {
  min-height: 100dvh;
  background: var(--bg-base);
}

.page-container {
  position: relative;
  z-index: 10;
  padding: 12px 16px 40px;
}

@media (max-width: 900px) {
  .page-container {
    padding-bottom: 400px;
  }
}

/* 攻克横幅 */
.conquer-banner {
  padding: 14px 16px;
  border-radius: 14px;
  background: rgba(52, 211, 153, 0.12);
  border: 1px solid rgba(52, 211, 153, 0.6);
  color: var(--success, #34d399);
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 12px;
  line-height: 1.6;
}

/* 原题回顾 */
.orig-card {
  padding: 14px 16px;
  background: var(--bg-card);
  border: 1px solid var(--accent-border);
  border-radius: 14px;
  margin-bottom: 12px;
}

.oc-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--accent);
  margin-bottom: 10px;
}

.oc-q {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.6;
  margin-bottom: 10px;
}

.oc-answers {
  font-size: 13px;
  color: var(--text-secondary);
  margin: 10px 0 6px;
}

.oc-explain {
  font-size: 13px;
  color: var(--text-secondary);
  background: var(--bg-elevated);
  padding: 10px 12px;
  border-radius: 8px;
  line-height: 1.6;
  border-left: 3px solid var(--accent);
}

.ans-divider {
  margin: 0 8px;
  color: var(--text-muted);
}

.red { color: var(--danger, #f87171); font-weight: 600; }
.green { color: var(--success, #34d399); font-weight: 600; }

.empty-tip {
  margin-top: 60px;
}

/* 练习卡片 */
.practice-card {
  padding: 14px 16px;
  background: var(--bg-card);
  border: 1px dashed rgba(251, 146, 60, 0.5);
  border-radius: 14px;
  background-color: rgba(251, 146, 60, 0.04);
  margin-bottom: 12px;
}

.pc-title {
  font-size: 14px;
  font-weight: 600;
  color: #fb923c;
  margin-bottom: 10px;
}

.pc-sub {
  font-size: 12px;
  font-weight: 400;
  color: var(--text-secondary);
  margin-left: 6px;
}

.p-passage {
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-secondary);
  background: var(--bg-elevated);
  border-left: 3px solid var(--accent);
  padding: 10px 12px;
  border-radius: 8px;
  margin-bottom: 10px;
}

.p-q {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.6;
  margin-bottom: 10px;
}

.p-opts {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.opt {
  font-size: 13px;
  padding: 8px 12px;
  border-radius: 10px;
  background: var(--bg-elevated);
  color: var(--text-secondary);
  border: 1px solid var(--accent-border);
  transition: all 0.2s;
}

.opt.pickable {
  cursor: pointer;
}

.opt.pickable:hover {
  border-color: var(--accent);
}

.opt.right,
.opt.correct {
  background: var(--success-soft, rgba(52, 211, 153, 0.12));
  color: var(--success, #34d399);
  border-color: var(--success, #34d399);
  font-weight: 600;
}

.opt.mine,
.opt.wrong {
  background: var(--danger-soft, rgba(248, 113, 113, 0.12));
  color: var(--danger, #f87171);
  border-color: var(--danger, #f87171);
}

.p-explain {
  margin-top: 10px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-secondary);
  background: var(--bg-elevated);
  padding: 8px 12px;
  border-radius: 8px;
}

.p-answer {
  color: var(--success, #34d399);
  font-weight: 600;
  margin-bottom: 4px;
}

.p-done {
  margin-top: 10px;
  font-size: 13px;
  font-weight: 600;
  color: var(--success, #34d399);
}

.p-retry {
  margin-top: 10px;
}

.p-retry-tip {
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 8px;
  line-height: 1.6;
}

.p-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 24px 0;
}

.p-loading-text {
  font-size: 12px;
  color: var(--text-secondary);
}

.p-fail {
  text-align: center;
  padding: 12px 0;
}

.p-fail-text {
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 10px;
}

.p-fail-err {
  font-size: 11px;
  color: var(--danger, #f87171);
  background: rgba(248, 113, 113, 0.08);
  border-radius: 8px;
  padding: 6px 10px;
  margin-bottom: 10px;
  word-break: break-all;
}

.p-start {
  text-align: center;
  padding: 12px 0;
}

.p-start-tip {
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 10px;
  line-height: 1.6;
}
</style>
