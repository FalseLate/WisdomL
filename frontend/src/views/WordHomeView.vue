<template>
  <div class="page-wrap">
    <!-- 内容压过全局粒子画布（tsParticles fullScreen 的 fixed canvas 在根层级），否则点击被吃掉 -->
    <div class="page-container">
      <!-- 顶部词书状态条 -->
      <header class="top-bar" @click="goContinue">
        <div class="book-status">
          <div class="book-name">{{ plan ? plan.book?.name || '当前词书' : '选择词书开始学习' }}</div>
          <div class="book-sub">{{ plan ? `已背 ${plan.learned} / ${plan.total} 词` : '挑一本词书，开启今日计划' }}</div>
        </div>
        <span class="top-arrow">›</span>
      </header>

      <!-- Banner 占位（之后可换成轮播） -->
      <div class="banner-card">
        <div class="banner-title">边玩边学 · 轻量化学习</div>
        <div class="banner-sub">碎片化刷题，步步有反馈</div>
        <div class="banner-page">1/3</div>
      </div>

      <!-- 两宫格大入口 -->
      <div class="entry-grid">
        <div class="entry-card" @click="comingSoon('分层阅读练习')">
          <div class="entry-icon">📚</div>
          <div class="entry-name">分层阅读练习</div>
          <div class="entry-desc">分级阅读训练</div>
        </div>
        <div class="entry-card accent" @click="$router.push('/word/book')">
          <div class="entry-icon">📝</div>
          <div class="entry-name">记单词</div>
          <div class="entry-desc">词书 · 刷题 · 拼写</div>
        </div>
      </div>

      <!-- 小图标入口行（位置预留，点击提示开发中） -->
      <div class="mini-row">
        <div class="mini-item" v-for="m in miniItems" :key="m.label" @click="comingSoon(m.label)">
          <div class="mini-icon">{{ m.icon }}</div>
          <div class="mini-label">{{ m.label }}</div>
        </div>
      </div>

      <!-- 学习中心（位置预留） -->
      <section class="home-section">
        <div class="section-name"><span class="bar"></span>学习中心</div>
        <div class="quick-grid">
          <div class="quick-item" v-for="q in quickItems" :key="q.label" @click="q.to ? $router.push(q.to) : comingSoon(q.label)">
            <div class="quick-icon">{{ q.icon }}</div>
            <div class="quick-label">{{ q.label }}</div>
          </div>
        </div>
      </section>

      <!-- 数据统计 -->
      <div class="stats-bar">
        <div class="stat">
          <div class="stat-value cyan">{{ plan ? plan.learned : 0 }}</div>
          <div class="stat-label">已背单词</div>
        </div>
        <div class="stat">
          <div class="stat-value green">{{ plan ? plan.total : 0 }}</div>
          <div class="stat-label">词书总量</div>
        </div>
        <div class="stat">
          <div class="stat-value magenta">{{ plan ? plan.plan?.dailyCount ?? 0 : 0 }}</div>
          <div class="stat-label">每日计划</div>
        </div>
      </div>
    </div>

    <!-- 底部导航：首页 / 我的学习（z-index 3000 压过虚拟人物层 2000，避免挡住 tab 文字） -->
    <van-tabbar :model-value="0" :z-index="3000" class="word-tabbar">
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

// 位置预留：等后续加功能时替换
const miniItems = [
  { icon: '🥊', label: '单词PK' },
  { icon: '📄', label: '备考干货' },
  { icon: '🎧', label: '听力训练' },
  { icon: '✍️', label: '情景写作' },
  { icon: '🔥', label: '打卡挑战' }
]

// to 有值的是已开放功能，没值的点击提示开发中
const quickItems = [
  { icon: '🔤', label: '生词本', to: '/word/notebook' },
  { icon: '📅', label: '学习日历' },
  { icon: '🏆', label: '成就徽章' },
  { icon: '📈', label: '学习报告' }
]

const planLevel = computed(() => plan.value?.plan?.level || '4')

onMounted(async () => {
  try {
    const res = await getMyPlan()
    if (res.code === 200) plan.value = res.data
  } catch (e) { /* 未登录或无计划时显示默认文案 */ }
})

// 顶部状态条：有计划去计划页继续，无计划去选词书
function goContinue() {
  if (plan.value) {
    router.push({ path: '/word/plan', query: { level: planLevel.value } })
  } else {
    router.push('/word/book')
  }
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

/* 顶部词书状态条 */
.top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  background: var(--bg-card);
  border: 1px solid var(--accent-border);
  border-radius: 14px;
  cursor: pointer;
  transition: border-color 0.2s;
}

.top-bar:hover {
  border-color: var(--accent);
}

.book-name {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
}

.book-sub {
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-secondary);
}

.top-arrow {
  color: var(--text-muted);
  font-size: 20px;
}

/* Banner 占位 */
.banner-card {
  position: relative;
  margin-top: 14px;
  padding: 20px 18px;
  border-radius: 16px;
  background: linear-gradient(120deg, #4f7cff 0%, #7c3aed 100%);
  color: #fff;
  overflow: hidden;
}

.banner-card::after {
  content: '';
  position: absolute;
  right: -30px;
  top: -30px;
  width: 120px;
  height: 120px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.12);
}

.banner-title {
  font-size: 18px;
  font-weight: 800;
}

.banner-sub {
  margin-top: 6px;
  font-size: 13px;
  opacity: 0.85;
}

.banner-page {
  position: absolute;
  right: 14px;
  bottom: 12px;
  font-size: 12px;
  opacity: 0.8;
}

/* 两宫格大入口 */
.entry-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
  margin-top: 14px;
}

.entry-card {
  padding: 20px 16px;
  background: var(--bg-card);
  border: 1px solid var(--accent-border);
  border-radius: 16px;
  cursor: pointer;
  transition: all 0.2s;
}

.entry-card:hover {
  border-color: var(--accent);
  transform: translateY(-2px);
}

.entry-card.accent {
  background: linear-gradient(135deg, rgba(79, 124, 255, 0.16), rgba(124, 58, 237, 0.1));
  border-color: rgba(79, 124, 255, 0.45);
}

.entry-icon {
  font-size: 30px;
}

.entry-name {
  margin-top: 10px;
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
}

.entry-desc {
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-secondary);
}

/* 小图标入口行 */
.mini-row {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-top: 16px;
  padding: 14px 8px;
  background: var(--bg-card);
  border: 1px solid var(--accent-border);
  border-radius: 16px;
}

.mini-item {
  flex: 1;
  text-align: center;
  cursor: pointer;
  transition: transform 0.15s;
}

.mini-item:active {
  transform: scale(0.92);
}

.mini-icon {
  font-size: 22px;
}

.mini-label {
  margin-top: 6px;
  font-size: 11px;
  color: var(--text-secondary);
  white-space: nowrap;
}

/* 学习中心 */
.home-section {
  margin-top: 20px;
}

.section-name {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
}

.section-name .bar {
  width: 4px;
  height: 16px;
  border-radius: 2px;
  background: var(--accent);
}

.quick-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
  margin-top: 12px;
}

.quick-item {
  padding: 14px 0;
  text-align: center;
  background: var(--bg-card);
  border: 1px solid var(--accent-border);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.quick-item:hover {
  border-color: var(--accent);
}

.quick-icon {
  font-size: 20px;
}

.quick-label {
  margin-top: 6px;
  font-size: 12px;
  color: var(--text-secondary);
}

/* 数据统计 */
.stats-bar {
  display: flex;
  justify-content: space-around;
  margin-top: 20px;
  padding: 16px 0;
  background: var(--bg-card);
  border: 1px solid var(--accent-border);
  border-radius: 16px;
}

.stat {
  text-align: center;
}

.stat-value {
  font-size: 22px;
  font-weight: 800;
  font-family: var(--font-display);
}

.stat-value.cyan { color: var(--accent); }
.stat-value.green { color: var(--success, #34d399); }
.stat-value.magenta { color: #f472b6; }

.stat-label {
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-secondary);
}

/* 底部导航（van-tabbar 样式微调） */
.word-tabbar :deep(.van-tabbar-item--active) {
  color: var(--accent);
}
</style>
