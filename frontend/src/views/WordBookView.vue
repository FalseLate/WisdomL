<template>
  <div class="page-wrap">
    <van-nav-bar title="词书选择" left-arrow @click-left="router.back()" />

    <!-- 有进行中的计划：继续学习横幅 -->
    <div v-if="myPlan" class="continue-banner" @click="goPlan(myPlan.plan.level)">
      <div class="banner-info">
        <div class="banner-name">{{ myPlan.book?.name || '当前词书' }}</div>
        <div class="banner-progress">
          <van-progress :percentage="progressPct" stroke-width="6" :show-pivot="false" color="#4F7CFF" />
          <div class="banner-num">已背 {{ myPlan.learned }} / {{ myPlan.total }}</div>
        </div>
      </div>
      <van-button size="small" round type="primary">继续学习</van-button>
    </div>

    <!-- 搜索 -->
    <div class="search-wrap">
      <van-search v-model="keyword" placeholder="请输入词书名称搜索" shape="round" />
    </div>

    <!-- 分类胶囊 -->
    <div class="cate-row">
      <div
        v-for="c in categories"
        :key="c.key"
        class="cate-pill"
        :class="{ active: activeCate === c.key }"
        @click="activeCate = c.key"
      >{{ c.label }}</div>
    </div>

    <!-- 词书卡片列表 -->
    <div class="book-list">
      <div v-for="book in filteredBooks" :key="book.id" class="book-card">
        <div class="book-cover" :style="{ background: `linear-gradient(135deg, ${book.coverColor}, ${book.coverColor}AA)` }">
          <span class="cover-text">{{ book.name.slice(0, 2) }}<br>{{ book.name.slice(2) }}</span>
        </div>
        <div class="book-info">
          <div class="book-name">{{ book.name }}</div>
          <div class="book-desc">{{ book.description }}</div>
          <div class="book-meta">
            <span>{{ book.wordCount }}词</span>
            <span class="meta-divider">|</span>
            <span>核心词汇</span>
            <van-button size="small" round type="primary" class="learn-btn" @click="goPlan(book.level)">
              学这本
            </van-button>
          </div>
        </div>
      </div>
      <van-empty v-if="!loading && filteredBooks.length === 0" description="没有找到词书" />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { getBooks, getMyPlan } from '../api/study'

const router = useRouter()

const keyword = ref('')
const activeCate = ref('all')
const books = ref([])
const myPlan = ref(null)
const loading = ref(true)

const categories = [
  { key: 'all', label: '全部' },
  { key: 'cet4', label: '四级' },
  { key: 'cet6', label: '六级' },
  { key: 'kaoyan', label: '考研' }
]

const filteredBooks = computed(() =>
  books.value.filter(b => {
    const cateOk = activeCate.value === 'all' || b.category === activeCate.value
    const kw = keyword.value.trim()
    const kwOk = !kw || b.name.includes(kw)
    return cateOk && kwOk
  })
)

const progressPct = computed(() => {
  if (!myPlan.value || !myPlan.value.total) return 0
  return Math.min(100, Math.round((myPlan.value.learned / myPlan.value.total) * 100))
})

onMounted(async () => {
  try {
    const res = await getBooks()
    if (res.code === 200) books.value = res.data || []
    const planRes = await getMyPlan()
    if (planRes.code === 200) myPlan.value = planRes.data
  } finally {
    loading.value = false
  }
})

function goPlan(level) {
  router.push({ path: '/word/plan', query: { level } })
}
</script>

<style scoped>
.page-wrap {
  min-height: 100dvh;
  background: var(--bg-base);
  padding-bottom: 30px;
}

/* 手机宽度下给右下角的虚拟人物留出空间，避免盖住最后几张卡片 */
@media (max-width: 900px) {
  .page-wrap {
    padding-bottom: 400px;
  }
}

/* 内容压过全局粒子画布（tsParticles fullScreen 的 fixed canvas 在根层级），否则点击被吃掉 */
.continue-banner,
.search-wrap,
.cate-row,
.book-list {
  position: relative;
  z-index: 10;
}

/* 继续学习横幅 */
.continue-banner {
  margin: 12px 16px 0;
  padding: 14px 16px;
  background: var(--bg-card);
  border: 1px solid var(--accent-border);
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  cursor: pointer;
}

.banner-name {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 8px;
}

.banner-progress {
  width: 200px;
}

.banner-num {
  margin-top: 6px;
  font-size: 12px;
  color: var(--text-secondary);
}

/* 搜索 */
.search-wrap {
  margin-top: 8px;
}

.search-wrap :deep(.van-search) {
  background: transparent;
}

.search-wrap :deep(.van-search__content) {
  background: var(--bg-elevated);
}

/* 分类胶囊 */
.cate-row {
  display: flex;
  gap: 10px;
  padding: 4px 16px 8px;
  overflow-x: auto;
}

.cate-pill {
  flex-shrink: 0;
  padding: 8px 20px;
  border-radius: 999px;
  border: 1px solid var(--accent-border);
  background: var(--bg-elevated);
  color: var(--text-secondary);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.cate-pill.active {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
  font-weight: 700;
}

/* 词书卡片 */
.book-list {
  padding: 8px 16px;
}

.book-card {
  display: flex;
  gap: 14px;
  padding: 16px;
  margin-bottom: 14px;
  background: var(--bg-card);
  border: 1px solid var(--accent-border);
  border-radius: 16px;
}

.book-cover {
  width: 96px;
  height: 128px;
  border-radius: 12px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.cover-text {
  color: #fff;
  font-size: 18px;
  font-weight: 800;
  line-height: 1.4;
  text-align: left;
  text-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
}

.book-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.book-name {
  font-size: 17px;
  font-weight: 700;
  color: var(--text-primary);
}

.book-desc {
  margin-top: 6px;
  font-size: 13px;
  color: var(--text-secondary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.book-meta {
  margin-top: auto;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-secondary);
}

.meta-divider {
  color: var(--text-muted);
}

.learn-btn {
  margin-left: auto;
}
</style>
