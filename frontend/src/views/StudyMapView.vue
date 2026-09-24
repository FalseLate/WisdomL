<template>
  <div class="page-wrap">
    <van-nav-bar title="学习图谱" left-arrow @click-left="router.back()" />

    <div class="page-container">
      <!-- ===== 知识点思维导图：中心 → 词汇 / 笔记 / 错因 三条分支 ===== -->
      <div class="section-title">🧠 知识点总结</div>
      <div class="mind-map">
        <div class="mm-root">我的英语</div>

        <!-- 分支1：词汇掌握 -->
        <div class="mm-branch">
          <div class="mm-node"><span class="mm-dot"></span>词汇掌握 · 共 {{ vocab.total }} 词</div>
          <div class="mm-leaves">
            <span class="leaf" v-for="lv in vocab.levels" :key="lv.label" :class="'leaf-' + lv.key">
              {{ lv.label }} {{ lv.count }}
            </span>
            <span class="leaf leaf-due" v-if="vocab.due" @click="$router.push('/word/notebook')">
              待复习 {{ vocab.due }} →
            </span>
          </div>
        </div>

        <!-- 分支2：知识笔记 -->
        <div class="mm-branch">
          <div class="mm-node"><span class="mm-dot"></span>知识笔记 · 共 {{ notes.total }} 篇</div>
          <div class="mm-leaves">
            <span class="leaf" v-for="g in notes.groups" :key="g.label" :class="'leaf-nt-' + g.key">
              {{ g.label }} {{ g.count }}
            </span>
            <span class="leaf leaf-more" @click="$router.push('/wiki/mine')">查看全部 →</span>
          </div>
          <div class="mm-note-sample" v-if="notes.latest">
            最近：{{ notes.latest }}
          </div>
        </div>

        <!-- 分支3：错因分布 -->
        <div class="mm-branch">
          <div class="mm-node"><span class="mm-dot"></span>错因分布</div>
          <div class="mm-leaves" v-if="errorTypes.length">
            <span class="leaf" v-for="t in errorTypes" :key="t.id" :class="t.count >= 3 ? 'leaf-hot' : ''">
              {{ t.name }} × {{ t.count }}
            </span>
          </div>
          <div class="mm-note-sample" v-else>还没有错因记录，做完阅读题就有了</div>
        </div>
      </div>

      <!-- ===== 学习周报 ===== -->
      <div class="section-title">📈 本周学习周报</div>
      <div class="report-card" v-if="report">
        <div class="rp-grid">
          <div class="rp-cell">
            <div class="rp-num">{{ report.newWords }}</div>
            <div class="rp-label">新收生词</div>
          </div>
          <div class="rp-cell">
            <div class="rp-num">{{ report.reviewCount }}</div>
            <div class="rp-label">复习单词</div>
          </div>
          <div class="rp-cell">
            <div class="rp-num">{{ reviewRate }}%</div>
            <div class="rp-label">复习正确率</div>
          </div>
          <div class="rp-cell">
            <div class="rp-num">{{ report.redoCount }}</div>
            <div class="rp-label">错题重做</div>
          </div>
          <div class="rp-cell">
            <div class="rp-num">{{ report.conquered }}</div>
            <div class="rp-label">攻克错题</div>
          </div>
          <div class="rp-cell">
            <div class="rp-num">{{ report.newNotes }}</div>
            <div class="rp-label">沉淀笔记</div>
          </div>
        </div>
        <div class="rp-summary">💬 {{ report.summary }}</div>
        <div class="rp-foot">统计周期：本周一至今 · 每周一重新计数</div>
      </div>
      <div class="report-loading" v-else-if="loading">周报生成中…</div>

      <!-- 快捷入口 -->
      <div class="quick-row">
        <van-button size="small" round plain type="primary" @click="$router.push('/word/notebook')">去复习生词</van-button>
        <van-button size="small" round plain type="primary" @click="$router.push('/word/english-wrong')">去攻克错题</van-button>
        <van-button size="small" round plain type="primary" @click="$router.push('/reading/home')">去读文章</van-button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { getMyCollectList, getReviewDue } from '../api/word'
import { getMyWiki, getWeeklyReport } from '../api/englishAgent'
import { getEnglishWrongList } from '../api/englishWrong'
import request from '../utils/request'

const router = useRouter()
const loading = ref(true)
const report = ref(null)

// ===== 导图数据 =====
const vocab = ref({ total: 0, due: 0, levels: [] })
const notes = ref({ total: 0, groups: [], latest: '' })
const errorTypes = ref([])

const reviewRate = computed(() =>
  report.value && report.value.reviewCount > 0
    ? Math.round((report.value.reviewCorrect / report.value.reviewCount) * 100)
    : 0
)

onMounted(load)

async function load() {
  loading.value = true
  // 登录态下拿 userId（老会话兜底查 profile）
  let userId = JSON.parse(localStorage.getItem('user') || 'null')?.id || null
  if (!userId) {
    try { userId = (await request.get('/user/profile')).user?.id || null } catch (e) { /* 未登录 */ }
  }

  // 并行拉四类数据，各自失败互不影响（对应分支显示空态）
  const [vocabR, dueR, wikiR, wrongR, reportR] = await Promise.allSettled([
    userId ? getMyCollectList(userId) : Promise.reject(new Error('no uid')),
    userId ? getReviewDue(userId) : Promise.reject(new Error('no uid')),
    getMyWiki(),
    getEnglishWrongList(),
    getWeeklyReport()
  ])

  // 词汇分支
  if (vocabR.status === 'fulfilled' && vocabR.value?.code === 200) {
    const words = vocabR.value.data || []
    const cnt = k => words.filter(w => w.level === k).length
    vocab.value = {
      total: words.length,
      due: dueR.status === 'fulfilled' && dueR.value?.code === 200 ? (dueR.value.data || []).length : 0,
      levels: [
        { key: '4', label: '四级', count: cnt('4') },
        { key: '6', label: '六级', count: cnt('6') },
        { key: 'ky', label: '考研', count: cnt('ky') }
      ]
    }
  }

  // 笔记分支
  if (wikiR.status === 'fulfilled' && wikiR.value?.code === 200) {
    const list = wikiR.value.data || []
    const cnt = k => list.filter(n => n.knowledgeType === k).length
    notes.value = {
      total: list.length,
      latest: list[0]?.title || '',
      groups: [
        { key: '2', label: '词块', count: cnt(2) },
        { key: '3', label: '语法', count: cnt(3) },
        { key: '4', label: '策略', count: cnt(4) }
      ]
    }
  }

  // 错因分支：聚合所有错题的 errorTypeIds
  if (wrongR.status === 'fulfilled' && wrongR.value?.code === 200) {
    const names = { 1: '审题', 2: '知识', 3: '策略', 4: '逻辑', 5: '习惯' }
    const map = {}
    for (const item of wrongR.value.data || []) {
      for (const t of (item.errorTypeIds || '').split(',').filter(Boolean)) {
        map[t] = (map[t] || 0) + 1
      }
    }
    errorTypes.value = Object.entries(map)
      .map(([id, count]) => ({ id: Number(id), name: names[id] || '其他', count }))
      .sort((a, b) => b.count - a.count)
  }

  // 周报
  if (reportR.status === 'fulfilled' && reportR.value?.code === 200) {
    report.value = reportR.value.data
  }

  loading.value = false
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

.section-title {
  margin: 6px 0 12px;
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
}

/* ===== 思维导图 ===== */
.mind-map {
  margin-bottom: 24px;
  padding: 18px 14px;
  background: var(--bg-card);
  border: 1px solid var(--accent-border);
  border-radius: 16px;
}

.mm-root {
  width: fit-content;
  margin: 0 auto 4px;
  padding: 10px 26px;
  background: linear-gradient(135deg, rgba(79, 124, 255, 0.3), rgba(124, 58, 237, 0.25));
  border: 1px solid rgba(79, 124, 255, 0.6);
  border-radius: 999px;
  font-size: 16px;
  font-weight: 800;
  color: var(--text-primary);
  font-family: var(--font-display);
}

/* 中心到分支的主干线 */
.mm-branch {
  position: relative;
  margin-top: 16px;
  padding-left: 18px;
}

.mm-branch::before {
  content: '';
  position: absolute;
  left: 6px;
  top: -10px;
  width: 1px;
  height: 24px;
  background: var(--accent-border);
}

.mm-node {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
}

.mm-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 6px rgba(79, 124, 255, 0.8);
}

.mm-leaves {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 10px 0 0 6px;
  padding-left: 10px;
  border-left: 1px dashed var(--accent-border);
}

.leaf {
  padding: 4px 12px;
  border-radius: 999px;
  font-size: 12px;
  background: var(--bg-elevated);
  border: 1px solid var(--accent-border);
  color: var(--text-secondary);
}

.leaf-4 { background: rgba(56, 189, 248, 0.12); border-color: rgba(56, 189, 248, 0.5); color: #38bdf8; }
.leaf-6 { background: rgba(249, 115, 22, 0.12); border-color: rgba(249, 115, 22, 0.5); color: #f97316; }
.leaf-ky { background: rgba(139, 92, 246, 0.12); border-color: rgba(139, 92, 246, 0.5); color: #a78bfa; }
.leaf-due { background: rgba(52, 211, 153, 0.12); border-color: rgba(52, 211, 153, 0.6); color: #34d399; cursor: pointer; }
.leaf-nt-2 { background: rgba(52, 211, 153, 0.12); border-color: rgba(52, 211, 153, 0.5); color: #34d399; }
.leaf-nt-3 { background: rgba(139, 92, 246, 0.12); border-color: rgba(139, 92, 246, 0.5); color: #a78bfa; }
.leaf-nt-4 { background: rgba(249, 115, 22, 0.12); border-color: rgba(249, 115, 22, 0.5); color: #f97316; }
.leaf-more { cursor: pointer; }
.leaf-hot { background: rgba(248, 113, 113, 0.12); border-color: rgba(248, 113, 113, 0.6); color: #f87171; }

.mm-note-sample {
  margin: 10px 0 0 16px;
  font-size: 12px;
  color: var(--text-muted);
}

/* ===== 周报 ===== */
.report-card {
  padding: 16px;
  background: var(--bg-card);
  border: 1px solid var(--accent-border);
  border-radius: 16px;
}

.rp-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}

.rp-cell {
  padding: 12px 0;
  text-align: center;
  background: var(--bg-elevated);
  border-radius: 12px;
}

.rp-num {
  font-size: 20px;
  font-weight: 800;
  color: var(--text-primary);
  font-family: var(--font-display);
}

.rp-label {
  margin-top: 3px;
  font-size: 11px;
  color: var(--text-secondary);
}

.rp-summary {
  margin-top: 14px;
  padding: 12px 14px;
  background: rgba(124, 58, 237, 0.1);
  border-left: 3px solid #a78bfa;
  border-radius: 8px;
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-primary);
}

.rp-foot {
  margin-top: 10px;
  font-size: 11px;
  color: var(--text-muted);
  text-align: center;
}

.report-loading {
  padding: 40px 0;
  text-align: center;
  font-size: 13px;
  color: var(--text-secondary);
}

/* 快捷入口 */
.quick-row {
  display: flex;
  gap: 10px;
  margin-top: 16px;
}

.quick-row .van-button {
  flex: 1;
}
</style>
