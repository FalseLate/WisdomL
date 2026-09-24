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
        <div class="entry-card" @click="$router.push('/reading/home')">
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

      <!-- 学习中心 -->
      <section class="home-section">
        <div class="section-name"><span class="bar"></span>学习中心</div>
        <div class="quick-grid">
          <div class="quick-item" v-for="q in quickItems" :key="q.label" @click="$router.push(q.to)">
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
// 学习中心入口（全部为已开放功能）
const quickItems = [
  { icon: '🔤', label: '生词本', to: '/word/notebook' },
  { icon: '📝', label: '英语错题', to: '/word/english-wrong' },
  { icon: '🌱', label: '我的Wiki', to: '/wiki/mine' },
  { icon: '📈', label: '学习图谱', to: '/study-map' }
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

/* 顶部词书状态条：玻璃卡 + 霓虹呼吸 */
.top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  background: var(--bg-card);
  backdrop-filter: blur(8px);
  border: 1px solid var(--accent-border);
  border-radius: 14px;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.top-bar:hover {
  border-color: var(--accent);
  box-shadow: var(--accent-glow);
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
  letter-spacing: 0.5px;
}

.top-arrow {
  color: var(--accent);
  font-size: 20px;
  text-shadow: 0 0 8px rgba(0, 245, 255, 0.6);
}

/* Banner：深空玻璃 + 网格底纹 + 青→品红渐变标题 */
.banner-card {
  position: relative;
  margin-top: 14px;
  padding: 22px 18px;
  border-radius: 16px;
  background:
    linear-gradient(135deg, rgba(0, 245, 255, 0.08), rgba(255, 0, 255, 0.06)),
    var(--bg-card);
  border: 1px solid rgba(0, 245, 255, 0.35);
  color: #fff;
  overflow: hidden;
  box-shadow: inset 0 0 30px rgba(0, 245, 255, 0.05), 0 0 24px rgba(0, 245, 255, 0.08);
}

/* 卡内叠加一层迷你网格，呼应全局背景 */
.banner-card::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(0, 245, 255, 0.05) 1px, transparent 1px),
    linear-gradient(90deg, rgba(0, 245, 255, 0.05) 1px, transparent 1px);
  background-size: 24px 24px;
  pointer-events: none;
}

.banner-card::after {
  content: '';
  position: absolute;
  right: -40px;
  top: -40px;
  width: 150px;
  height: 150px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(0, 245, 255, 0.22), transparent 70%);
}

.banner-title {
  position: relative;
  z-index: 1;
  font-family: var(--font-display);
  font-size: 17px;
  font-weight: 800;
  letter-spacing: 2px;
  background: linear-gradient(90deg, #00f5ff, #ff00ff);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.banner-sub {
  position: relative;
  z-index: 1;
  margin-top: 8px;
  font-size: 13px;
  color: rgba(232, 232, 240, 0.72);
  letter-spacing: 1px;
}

.banner-page {
  position: absolute;
  right: 14px;
  bottom: 12px;
  z-index: 1;
  font-family: var(--font-display);
  font-size: 11px;
  color: rgba(0, 245, 255, 0.6);
  letter-spacing: 1px;
}

/* 两宫格大入口：赛博角标 + hover 发光 */
.entry-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
  margin-top: 14px;
}

.entry-card {
  position: relative;
  padding: 20px 16px;
  background: var(--bg-card);
  border: 1px solid var(--accent-border);
  border-radius: 12px;
  cursor: pointer;
  transition: all var(--transition-fast);
  overflow: hidden;
}

/* 左上/右下 cyber 角线 */
.entry-card::before,
.entry-card::after {
  content: '';
  position: absolute;
  width: 14px;
  height: 14px;
  border: 2px solid rgba(0, 245, 255, 0.55);
  transition: all var(--transition-fast);
}

.entry-card::before {
  top: 7px;
  left: 7px;
  border-right: none;
  border-bottom: none;
}

.entry-card::after {
  bottom: 7px;
  right: 7px;
  border-left: none;
  border-top: none;
}

.entry-card:hover {
  border-color: var(--accent);
  transform: translateY(-3px);
  box-shadow: var(--accent-glow);
}

.entry-card:hover::before,
.entry-card:hover::after {
  width: 20px;
  height: 20px;
  border-color: var(--accent);
}

/* 第二张卡用品红系，与青色形成撞色 */
.entry-card.accent {
  background: linear-gradient(135deg, rgba(255, 0, 255, 0.07), rgba(0, 245, 255, 0.05));
  border-color: var(--secondary-border);
}

.entry-card.accent::before,
.entry-card.accent::after {
  border-color: rgba(255, 0, 255, 0.55);
}

.entry-card.accent:hover {
  border-color: var(--secondary);
  box-shadow: 0 0 12px rgba(255, 0, 255, 0.35), 0 0 32px rgba(255, 0, 255, 0.12);
}

.entry-card.accent:hover::before,
.entry-card.accent:hover::after {
  border-color: var(--secondary);
}

.entry-icon {
  font-size: 30px;
  filter: drop-shadow(0 0 10px rgba(0, 245, 255, 0.5));
}

.entry-card.accent .entry-icon {
  filter: drop-shadow(0 0 10px rgba(255, 0, 255, 0.5));
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
  letter-spacing: 1px;
}

.section-name .bar {
  width: 4px;
  height: 16px;
  border-radius: 2px;
  background: linear-gradient(180deg, var(--accent), var(--secondary));
  box-shadow: 0 0 8px rgba(0, 245, 255, 0.6);
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
  transition: all var(--transition-fast);
}

.quick-item:hover {
  border-color: var(--accent);
  transform: translateY(-2px);
  box-shadow: var(--accent-glow);
}

.quick-icon {
  font-size: 20px;
  filter: drop-shadow(0 0 6px rgba(0, 245, 255, 0.4));
}

.quick-label {
  margin-top: 6px;
  font-size: 12px;
  color: var(--text-secondary);
}

/* 数据统计：霓虹发光数字 */
.stats-bar {
  display: flex;
  justify-content: space-around;
  margin-top: 20px;
  padding: 16px 0;
  background:
    linear-gradient(135deg, rgba(0, 245, 255, 0.04), rgba(255, 0, 255, 0.03)),
    var(--bg-card);
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

.stat-value.cyan {
  color: var(--accent);
  text-shadow: 0 0 12px rgba(0, 245, 255, 0.55);
}

.stat-value.green {
  color: var(--success, #34d399);
  text-shadow: 0 0 12px rgba(0, 255, 136, 0.4);
}

.stat-value.magenta {
  color: var(--secondary, #ff00ff);
  text-shadow: 0 0 12px rgba(255, 0, 255, 0.45);
}

.stat-label {
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-secondary);
}

/* 底部导航：深空玻璃 + 霓虹高亮（覆盖 van-tabbar 默认白底） */
.word-tabbar {
  --van-tabbar-background: rgba(10, 10, 15, 0.88);
  background: var(--van-tabbar-background);
  backdrop-filter: blur(12px);
  border-top: 1px solid var(--accent-border);
  box-shadow: 0 -4px 20px rgba(0, 245, 255, 0.06);
}

.word-tabbar :deep(.van-tabbar-item) {
  background: transparent;
  color: var(--text-muted);
}

.word-tabbar :deep(.van-tabbar-item--active) {
  color: var(--accent);
  text-shadow: 0 0 10px rgba(0, 245, 255, 0.55);
}

.word-tabbar :deep(.van-tabbar-item__icon) {
  font-size: 20px;
}
</style>
