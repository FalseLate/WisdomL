<template>
  <div class="page-wrap">
    <!-- 内容压过全局粒子画布（tsParticles fullScreen 的 fixed canvas 在根层级），否则点击被吃掉 -->
    <div class="page-container">
      <!-- 单词记忆进度 -->
      <div class="progress-card" v-if="plan">
        <div class="pc-head">
          <div class="pc-name">{{ plan.book?.name || '当前词书' }}</div>
          <div class="pc-count">已背 {{ plan.learned }} / {{ plan.total }} 词</div>
        </div>
        <van-progress :percentage="progressPct" stroke-width="8" :show-pivot="false" color="#4F7CFF" track-color="rgba(255,255,255,0.08)" />
        <van-button type="primary" round block class="pc-btn" @click="goStudy">
          继续学习
        </van-button>
      </div>
      <div class="progress-card empty" v-else @click="$router.push('/word/book')">
        <div class="pc-name">还没有学习计划</div>
        <div class="pc-count">去选一本词书，开启今日计划 ›</div>
      </div>

      <!-- 学习记录 -->
      <div class="section-title">学习记录</div>
      <div class="cell-list">
        <div class="cell-item" @click="$router.push('/word/notebook')">
          <span class="cell-icon">🔤</span><span class="cell-name">生词本</span><span class="cell-arrow">›</span>
        </div>
        <div class="cell-item" @click="$router.push('/wrong-questions')">
          <span class="cell-icon">❌</span><span class="cell-name">错题本</span><span class="cell-arrow">›</span>
        </div>
        <div class="cell-item" @click="$router.push('/word/english-wrong')">
          <span class="cell-icon">📝</span><span class="cell-name">英语错题复习</span><span class="cell-arrow">›</span>
        </div>
        <div class="cell-item" @click="$router.push({ path: '/word/plan', query: { level: planLevel } })" v-if="plan">
          <span class="cell-icon">📖</span><span class="cell-name">背词设置</span><span class="cell-arrow">›</span>
        </div>
      </div>

      <!-- 敬请期待占位 -->
      <div class="section-title">更多功能</div>
      <div class="cell-list">
        <div class="cell-item disabled" @click="comingSoon('学习报告')">
          <span class="cell-icon">📈</span><span class="cell-name">学习报告</span><span class="cell-arrow">›</span>
        </div>
        <div class="cell-item disabled" @click="comingSoon('打卡日历')">
          <span class="cell-icon">📅</span><span class="cell-name">打卡日历</span><span class="cell-arrow">›</span>
        </div>
      </div>
    </div>

    <!-- 底部导航：首页 / 我的学习（z-index 3000 压过虚拟人物层 2000，避免挡住 tab 文字） -->
    <van-tabbar :model-value="1" :z-index="3000" class="word-tabbar">
      <van-tabbar-item icon="home-o" to="/word/home">首页</van-tabbar-item>
      <van-tabbar-item icon="user-o" to="/word/my">我的学习</van-tabbar-item>
    </van-tabbar>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { showSuccessToast } from 'vant'
import { getMyPlan } from '../api/study'

const router = useRouter()

const plan = ref(null)

const planLevel = computed(() => plan.value?.plan?.level || '4')

const progressPct = computed(() => {
  const p = plan.value
  if (!p || !p.total) return 0
  return Math.min(100, Math.round((p.learned / p.total) * 100))
})

onMounted(async () => {
  try {
    const res = await getMyPlan()
    if (res.code === 200) plan.value = res.data
  } catch (e) { /* 未登录或无计划时显示空态 */ }
})

// 直接进入刷单词：后端会自动恢复进行中的会话（断点续刷）
function goStudy() {
  router.push({ path: '/word/study', query: { level: planLevel.value, mode: 'choice' } })
}

function comingSoon(name) {
  showSuccessToast(`${name}功能开发中，敬请期待`)
}
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
  max-width: 480px;
  margin: 0 auto;
  padding: 16px 20px 120px;
}

/* 手机宽度下给右下角的虚拟人物留出空间 */
@media (max-width: 900px) {
  .page-container {
    padding-bottom: 400px;
  }
}

/* 单词进度卡 */
.progress-card {
  padding: 18px 16px;
  background: var(--bg-card);
  border: 1px solid var(--accent-border);
  border-radius: 16px;
}

.progress-card.empty {
  cursor: pointer;
  transition: border-color 0.2s;
}

.progress-card.empty:hover {
  border-color: var(--accent);
}

.pc-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 12px;
}

.pc-name {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
}

.pc-count {
  font-size: 13px;
  color: var(--text-secondary);
}

.pc-btn {
  margin-top: 16px;
}

/* 分组标题 */
.section-title {
  margin: 20px 0 10px;
  font-size: 14px;
  font-weight: 700;
  color: var(--text-secondary);
}

/* 单元格列表 */
.cell-list {
  background: var(--bg-card);
  border: 1px solid var(--accent-border);
  border-radius: 16px;
  overflow: hidden;
}

.cell-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 15px 16px;
  font-size: 15px;
  color: var(--text-primary);
  cursor: pointer;
  transition: background 0.15s;
}

.cell-item:hover {
  background: var(--bg-elevated);
}

.cell-item + .cell-item {
  border-top: 1px solid var(--accent-border);
}

.cell-item.disabled {
  color: var(--text-muted);
}

.cell-icon { font-size: 18px; }
.cell-name { flex: 1; }
.cell-arrow { color: var(--text-muted); }

/* 底部导航（van-tabbar 样式微调） */
.word-tabbar :deep(.van-tabbar-item--active) {
  color: var(--accent);
}
</style>
