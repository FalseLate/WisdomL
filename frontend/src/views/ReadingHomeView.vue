<template>
  <div class="page-wrap">
    <van-nav-bar title="分层阅读练习" left-arrow @click-left="router.back()" />

    <!-- 内容压过全局粒子画布，否则点击被吃掉 -->
    <div class="page-container">
      <!-- AI 个性化阅读（阶段2）：用我的薄弱生词定制一篇短文+理解题，做完进既有错题本链路 -->
      <div class="ai-gen-card" @click="genArticle">
        <div class="ag-left">
          <div class="ag-title">✨ AI 定制阅读</div>
          <div class="ag-sub">用你的薄弱生词现场生成一篇短文 + 3 道理解题</div>
        </div>
        <span class="ag-go" v-if="!generating">生成</span>
        <span class="ag-go loading" v-else>生成中…</span>
      </div>

      <!-- 难度筛选 -->
      <div class="level-row">
        <div
          v-for="lv in levelTabs"
          :key="lv.key"
          class="level-pill"
          :class="{ active: activeLevel === lv.key }"
          @click="switchLevel(lv.key)"
        >{{ lv.label }}</div>
      </div>
      <div class="level-desc">{{ currentDesc }}</div>

      <!-- 文章列表 -->
      <div class="article-list">
        <div v-for="a in articles" :key="a.id" class="article-card" @click="$router.push({ path: '/reading/article', query: { id: a.id } })">
          <div class="ac-title">{{ a.title }}</div>
          <div class="ac-meta">
            <span class="ac-genre">{{ genreName(a.genre) }}</span>
            <span class="ac-level" :class="'lv-' + a.level">{{ levelName(a.level) }}</span>
            <span class="ac-arrow">›</span>
          </div>
        </div>
        <van-empty v-if="!loading && articles.length === 0" description="这个难度下暂时还没有文章" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { showFailToast, showLoadingToast, closeToast } from 'vant'
import { getReadingArticles } from '../api/reading'
import { generateReading } from '../api/englishAgent'

const router = useRouter()

const activeLevel = ref('4')
const articles = ref([])
const loading = ref(true)

const levelTabs = [
  { key: '4', label: '简单', desc: '小故事 / 小新闻 · 初中~四级词汇' },
  { key: '6', label: '中等', desc: '科普短文 / 叙事文 · 六级词汇' },
  { key: 'ky', label: '高阶', desc: '议论文 · 考研词汇与长难句' }
]

const currentDesc = computed(() => levelTabs.find(t => t.key === activeLevel.value)?.desc || '')

function levelName(lv) {
  return { '4': '简单', '6': '中等', ky: '高阶' }[lv] || lv
}

function genreName(g) {
  return { story: '故事', news: '新闻', science: '科普', essay: '议论文', ai: 'AI 定制' }[g] || '阅读'
}

// AI 个性化阅读生成：后端用我的到期生词现场写一篇并入库，成功后直接跳去做题
const generating = ref(false)

async function genArticle() {
  if (generating.value) return
  generating.value = true
  showLoadingToast({ message: 'AI 正在为你写文章…', duration: 0, forbidClick: true })
  try {
    const res = await generateReading()
    closeToast()
    if (res.code === 200 && res.id) {
      router.push({ path: '/reading/article', query: { id: res.id } })
    } else {
      showFailToast(res.msg || '生成失败，请稍后再试')
    }
  } catch (e) {
    closeToast()
    showFailToast('生成失败，请稍后再试')
  } finally {
    generating.value = false
  }
}

async function load() {
  loading.value = true
  try {
    const res = await getReadingArticles(activeLevel.value)
    if (res.code === 200) articles.value = res.data || []
  } finally {
    loading.value = false
  }
}

function switchLevel(key) {
  if (activeLevel.value === key) return
  activeLevel.value = key
  load()
}

onMounted(load)
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
  padding: 12px 16px 40px;
}

/* 手机宽度下给右下角的虚拟人物留出空间 */
@media (max-width: 900px) {
  .page-container {
    padding-bottom: 400px;
  }
}

/* 难度筛选 */
.level-row {
  display: flex;
  gap: 10px;
  padding: 4px 0;
}

.level-pill {
  flex: 1;
  text-align: center;
  padding: 10px 0;
  border-radius: 999px;
  border: 1px solid var(--accent-border);
  background: var(--bg-elevated);
  color: var(--text-secondary);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.level-pill.active {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
  font-weight: 700;
}

.level-desc {
  margin: 10px 0 4px;
  font-size: 12px;
  color: var(--text-secondary);
}

/* AI 定制阅读入口卡 */
.ai-gen-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
  padding: 14px 16px;
  background: linear-gradient(135deg, rgba(124, 58, 237, 0.18), rgba(79, 124, 255, 0.12));
  border: 1px solid rgba(167, 139, 250, 0.55);
  border-radius: 16px;
  cursor: pointer;
}

.ag-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
}

.ag-sub {
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-secondary);
}

.ag-go {
  flex-shrink: 0;
  padding: 6px 16px;
  border-radius: 999px;
  background: rgba(167, 139, 250, 0.2);
  border: 1px solid rgba(167, 139, 250, 0.6);
  color: #c4b5fd;
  font-size: 13px;
  font-weight: 700;
}

.ag-go.loading {
  opacity: 0.7;
  cursor: default;
}

/* 文章卡片 */
.article-list {
  margin-top: 10px;
}

.article-card {
  padding: 16px;
  margin-bottom: 12px;
  background: var(--bg-card);
  border: 1px solid var(--accent-border);
  border-radius: 14px;
  cursor: pointer;
  transition: border-color 0.2s;
}

.article-card:hover {
  border-color: var(--accent);
}

.ac-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
  font-family: var(--font-display);
}

.ac-meta {
  margin-top: 10px;
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
}

.ac-genre {
  color: var(--text-secondary);
}

.ac-level {
  padding: 3px 10px;
  border-radius: 999px;
}

.lv-4 { background: rgba(56, 189, 248, 0.15); color: #38bdf8; }
.lv-6 { background: rgba(249, 115, 22, 0.15); color: #f97316; }
.lv-ky { background: rgba(139, 92, 246, 0.15); color: #a78bfa; }

.ac-arrow {
  margin-left: auto;
  color: var(--text-muted);
  font-size: 18px;
}
</style>
