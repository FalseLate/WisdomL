<template>
  <div class="page-wrap">
    <van-nav-bar title="背词设置" left-arrow @click-left="router.back()" />

    <div v-if="book" class="plan-body">
      <!-- 词书摘要 -->
      <div class="book-summary">
        <div class="book-cover" :style="{ background: `linear-gradient(135deg, ${book.coverColor}, ${book.coverColor}AA)` }">
          <span class="cover-text">{{ book.name.slice(0, 2) }}<br>{{ book.name.slice(2) }}</span>
        </div>
        <div class="summary-info">
          <div class="summary-name">{{ book.name }}</div>
          <div class="summary-sub">{{ book.wordCount }}词 · 核心词汇</div>
          <van-progress :percentage="progressPct" stroke-width="8" :show-pivot="false" color="#4F7CFF" track-color="rgba(255,255,255,0.08)" />
          <div class="summary-progress">
            <span>已背单词</span>
            <span>{{ myProgress.learned }}/{{ myProgress.total }}</span>
          </div>
        </div>
      </div>

      <!-- 每日计划选择表 -->
      <div class="plan-card">
        <div class="plan-eta" v-if="selectedCount">
          预计 <em>{{ etaText }}</em> 背完
        </div>
        <div class="plan-table">
          <div class="plan-row plan-head">
            <span>每天背单词</span>
            <span>完成天数</span>
          </div>
          <div
            v-for="opt in dailyOptions"
            :key="opt"
            class="plan-row"
            :class="{ active: selectedCount === opt }"
            @click="selectedCount = opt"
          >
            <span>{{ opt }}个</span>
            <span>{{ daysNeeded(opt) }}天</span>
          </div>
        </div>
      </div>

      <!-- 模式选择（保存计划后弹出） -->
      <van-popup v-model:show="showModeSelect" round position="bottom" :style="{ background: 'var(--bg-card)' }">
        <div class="mode-popup">
          <div class="mode-title">选择学习方式</div>
          <div class="mode-item" @click="goStudy('choice')">
            <span class="mode-icon">📝</span>
            <div class="mode-text">
              <div class="mode-name">刷单词</div>
              <div class="mode-desc">看单词选释义，四选一</div>
            </div>
            <span class="mode-arrow">›</span>
          </div>
          <div class="mode-item" @click="goStudy('spell')">
            <span class="mode-icon">✏️</span>
            <div class="mode-text">
              <div class="mode-name">拼写单词</div>
              <div class="mode-desc">看释义默写单词，可当复习</div>
            </div>
            <span class="mode-arrow">›</span>
          </div>
          <div class="mode-cancel" @click="showModeSelect = false">取消</div>
        </div>
      </van-popup>

      <div class="save-btn-wrap">
        <van-button type="primary" round block :loading="saving" @click="onSave">
          保存计划
        </van-button>
      </div>
    </div>

    <van-loading v-else class="page-loading" size="24" vertical>加载中...</van-loading>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showFailToast, showSuccessToast } from 'vant'
import { getBooks, getMyPlan, getStudyProgress, savePlan } from '../api/study'

const route = useRoute()
const router = useRouter()
const level = route.query.level || '4'

const book = ref(null)
const myPlan = ref(null)
const myProgress = ref({ learned: 0, total: 0, remaining: 0 })
const selectedCount = ref(50)
const saving = ref(false)
const showModeSelect = ref(false)

// 每天 20~100 个的候选
const dailyOptions = [20, 30, 40, 50, 60, 80, 100]

const remaining = computed(() => Math.max(0, myProgress.value.remaining))

function daysNeeded(n) {
  const r = remaining.value
  return r === 0 ? 0 : Math.ceil(r / n)
}

const etaText = computed(() => {
  const d = daysNeeded(selectedCount.value)
  const date = new Date(Date.now() + d * 86400000)
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`
})

const progressPct = computed(() => {
  const { learned, total } = myProgress.value
  return total ? Math.min(100, Math.round((learned / total) * 100)) : 0
})

onMounted(async () => {
  const [booksRes, planRes, progressRes] = await Promise.all([
    getBooks(),
    getMyPlan(),
    getStudyProgress(level)
  ])
  const list = booksRes.code === 200 ? booksRes.data || [] : []
  book.value = list.find(b => b.level === level) || null
  if (planRes.code === 200 && planRes.data) myPlan.value = planRes.data
  if (progressRes.code === 200) myProgress.value = progressRes.data
  // 已有同词书计划 → 预选原数量
  if (myPlan.value?.plan?.level === level) {
    selectedCount.value = myPlan.value.plan.dailyCount || 50
  }
})

async function onSave() {
  saving.value = true
  try {
    const res = await savePlan(level, selectedCount.value)
    if (res.code === 200) {
      showSuccessToast('计划已保存')
      showModeSelect.value = true
    } else {
      showFailToast(res.msg || '保存失败')
    }
  } catch (err) {
    showFailToast(err.message || '网络异常')
  } finally {
    saving.value = false
  }
}

function goStudy(mode) {
  showModeSelect.value = false
  router.push({ path: '/word/study', query: { level, mode } })
}
</script>

<style scoped>
.page-wrap {
  min-height: 100dvh;
  background: var(--bg-base);
}

.plan-body {
  padding: 12px 16px 40px;
  /* 压过全局粒子画布，否则点击被吃掉 */
  position: relative;
  z-index: 10;
}

/* 手机宽度下给右下角的虚拟人物留出空间，避免盖住保存按钮 */
@media (max-width: 900px) {
  .plan-body {
    padding-bottom: 400px;
  }
}

/* 词书摘要 */
.book-summary {
  display: flex;
  gap: 14px;
  padding: 16px;
  background: var(--bg-card);
  border: 1px solid var(--accent-border);
  border-radius: 16px;
}

.book-cover {
  width: 92px;
  height: 124px;
  border-radius: 12px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.cover-text {
  color: #fff;
  font-size: 17px;
  font-weight: 800;
  line-height: 1.4;
  text-align: left;
  text-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
}

.summary-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.summary-name {
  font-size: 17px;
  font-weight: 700;
  color: var(--text-primary);
}

.summary-sub {
  font-size: 13px;
  color: var(--text-secondary);
  margin: 6px 0 12px;
}

.summary-progress {
  display: flex;
  justify-content: space-between;
  margin-top: 8px;
  font-size: 13px;
  color: var(--text-secondary);
}

/* 计划表 */
.plan-card {
  margin-top: 14px;
  padding: 16px;
  background: var(--bg-card);
  border: 1px solid var(--accent-border);
  border-radius: 16px;
}

.plan-eta {
  font-size: 14px;
  color: var(--text-secondary);
  margin-bottom: 12px;
}

.plan-eta em {
  font-style: normal;
  color: var(--accent);
  font-weight: 700;
}

.plan-table {
  border-radius: 12px;
  overflow: hidden;
}

.plan-row {
  display: flex;
  justify-content: space-around;
  padding: 15px 0;
  font-size: 15px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s;
}

.plan-row + .plan-row {
  border-top: 1px solid var(--accent-border);
}

.plan-row.plan-head {
  font-weight: 700;
  color: var(--text-primary);
  cursor: default;
}

.plan-row.active {
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 700;
}

/* 模式选择弹层 */
.mode-popup {
  padding: 20px 16px 12px;
}

.mode-title {
  text-align: center;
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 16px;
}

.mode-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 12px;
  border-radius: 12px;
  cursor: pointer;
  transition: background 0.2s;
}

.mode-item:active {
  background: var(--bg-elevated);
}

.mode-icon {
  font-size: 24px;
}

.mode-text {
  flex: 1;
}

.mode-name {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
}

.mode-desc {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 2px;
}

.mode-arrow {
  color: var(--text-muted);
  font-size: 20px;
}

.mode-cancel {
  margin-top: 8px;
  padding: 14px;
  text-align: center;
  color: var(--text-muted);
  border-top: 1px solid var(--accent-border);
  cursor: pointer;
}

/* 保存按钮 */
.save-btn-wrap {
  margin-top: 24px;
}

.page-loading {
  padding: 100px 0;
  text-align: center;
}
</style>
