<template>
  <div class="page-wrap">
    <van-nav-bar title="生词本" left-arrow @click-left="router.back()" />

    <!-- 复习模式：用生词本里的词做 4 选 1，只在本页统计，不上报学习进度 -->
    <div v-if="reviewing" class="page-container">
      <div class="review-head">
        <van-progress :percentage="reviewPct" stroke-width="8" :show-pivot="false" color="#4F7CFF" track-color="rgba(255,255,255,0.08)" />
        <div class="review-count">{{ reviewIndex + 1 }} / {{ reviewWords.length }} · 答对 {{ reviewCorrect }}</div>
      </div>

      <div class="word-card" v-if="currentReview && !reviewFinished">
        <div class="word-title">{{ currentReview.word }}</div>
        <div class="word-phonetic" @click="speak(currentReview.word)">{{ currentReview.phonetic || '点击发音' }}</div>
        <p class="question-text">请选择正确释义：</p>
        <button
          v-for="opt in reviewOptions"
          :key="opt"
          class="option-btn"
          :class="reviewBtnClass(opt)"
          :disabled="reviewed"
          @click="pickReview(opt)"
        >{{ opt }}</button>
        <div class="review-actions">
          <van-button plain round block :disabled="!reviewed" @click="nextReview">跳过</van-button>
          <van-button type="primary" round block :disabled="!reviewed" @click="nextReview">
            {{ reviewIndex >= reviewWords.length - 1 ? '完成' : '下一题' }}
          </van-button>
        </div>
      </div>

      <!-- 复习结果 -->
      <div class="review-done" v-if="reviewFinished">
        <div class="rd-emoji">🎉</div>
        <div class="rd-title">复习完成</div>
        <div class="rd-score">共 {{ reviewWords.length }} 词，答对 {{ reviewCorrect }} 词</div>
        <div class="rd-wrong" v-if="reviewWrongWords.length">
          <div class="rd-wrong-title">本次记错的词（可只刷错词）：</div>
          <div class="rd-wrong-list">
            <span class="rd-wrong-tag" v-for="w in reviewWrongWords" :key="w.id">{{ w.word }}</span>
          </div>
        </div>
        <div class="rd-actions">
          <van-button plain round block @click="exitReview">返回生词本</van-button>
          <van-button type="primary" round block @click="reviewWrongWords.length ? startReview(reviewWrongWords) : startReview(words)">
            {{ reviewWrongWords.length ? '只刷错词' : '再来一遍' }}
          </van-button>
        </div>
      </div>
    </div>

    <!-- 列表模式 -->
    <div v-else class="page-container">
      <!-- 顶部统计 + 复习入口 -->
      <div class="stats-card">
        <div class="sc-left">
          <div class="sc-num">{{ words.length }}</div>
          <div class="sc-label">收录生词</div>
        </div>
        <van-button type="primary" round icon="play-circle-o" :disabled="words.length < 4" @click="startReview(words)">
          复习生词（4选1）
        </van-button>
      </div>
      <div class="sc-tip" v-if="words.length > 0 && words.length < 4">生词满 4 个就可以开始复习啦</div>

      <!-- 搜索 + 词书筛选 -->
      <van-search v-model="keyword" placeholder="搜索单词或释义" shape="round" class="nb-search" />
      <div class="level-row">
        <div
          v-for="lv in levelTabs"
          :key="lv.key"
          class="level-pill"
          :class="{ active: activeLevel === lv.key }"
          @click="activeLevel = lv.key"
        >{{ lv.label }}</div>
      </div>

      <!-- 生词卡片列表 -->
      <div class="word-list">
        <div v-for="w in filteredWords" :key="w.id" class="word-item">
          <div class="wi-main" @click="w._open = !w._open">
            <div class="wi-left">
              <div class="wi-word">
                {{ w.word }}
                <span class="wi-phonetic" @click.stop="speak(w.word)">🔊 {{ w.phonetic }}</span>
              </div>
              <div class="wi-mean">{{ w.cnMean }}</div>
            </div>
            <div class="wi-right">
              <span class="wi-level" :class="'lv-' + w.level">{{ levelName(w.level) }}</span>
              <span class="wi-del" @click.stop="confirmRemove(w)">删除</span>
            </div>
          </div>
          <!-- 展开例句 -->
          <div class="wi-sentence" v-if="w._open && w.sentence">
            <div class="wi-s-en">{{ w.sentence }}</div>
          </div>
        </div>
        <van-empty v-if="!loading && filteredWords.length === 0" :description="words.length === 0 ? '生词本还是空的，去背单词收集生词吧' : '没有匹配的生词'">
          <van-button v-if="words.length === 0" round type="primary" @click="$router.push('/word/book')">去选词书</van-button>
        </van-empty>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { showSuccessToast, showFailToast, showConfirmDialog } from 'vant'
import { removeWordCollect, getMyCollectList } from '../api/word'
import { authState } from '../utils/auth.js'
import request from '../utils/request'

const router = useRouter()
// 生词本接口按 userId 查询，取当前登录用户；老会话可能只有 token，兜底再查一次 profile
let userId = authState.user?.id || null

async function ensureUserId() {
  if (userId) return userId
  try {
    const res = await request.get('/user/profile')
    userId = res.user?.id || null
  } catch (e) { /* 未登录时保持 null */ }
  return userId
}

const words = ref([])
const loading = ref(true)
const keyword = ref('')
const activeLevel = ref('all')

const levelTabs = [
  { key: 'all', label: '全部' },
  { key: '4', label: '四级' },
  { key: '6', label: '六级' },
  { key: 'ky', label: '考研' }
]

function levelName(lv) {
  return { '4': '四级', '6': '六级', ky: '考研' }[lv] || '词汇'
}

const filteredWords = computed(() =>
  words.value.filter(w => {
    const lvOk = activeLevel.value === 'all' || w.level === activeLevel.value
    const kw = keyword.value.trim().toLowerCase()
    const kwOk = !kw || w.word?.toLowerCase().includes(kw) || w.cnMean?.includes(kw)
    return lvOk && kwOk
  })
)

onMounted(load)

async function load() {
  loading.value = true
  try {
    await ensureUserId()
    const res = await getMyCollectList(userId)
    if (res.code === 200) {
      words.value = (res.data || []).map(w => ({ ...w, _open: false }))
    } else {
      showFailToast(res.msg || '加载生词本失败')
    }
  } catch (err) {
    showFailToast(err.message || '网络异常')
  } finally {
    loading.value = false
  }
}

async function confirmRemove(w) {
  try {
    await showConfirmDialog({ title: '删除生词', message: `确定把「${w.word}」移出生词本吗？` })
  } catch { return }
  try {
    const res = await removeWordCollect(userId, w.id)
    if (res.code === 200) {
      words.value = words.value.filter(x => x.id !== w.id)
      showSuccessToast('已移出生词本')
    } else {
      showFailToast(res.msg || '删除失败')
    }
  } catch (err) {
    showFailToast(err.message || '网络异常')
  }
}

// 浏览器本地发音，不发请求
function speak(text) {
  try {
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'en-US'
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(u)
  } catch (e) { /* 无发音能力时静默 */ }
}

// ===== 复习模式（本地 4 选 1） =====
const reviewing = ref(false)
const reviewWords = ref([])
const reviewIndex = ref(0)
const reviewCorrect = ref(0)
const reviewed = ref(false)
const pickedMean = ref('')
const reviewFinished = ref(false)
const reviewWrongWords = ref([])

const currentReview = computed(() => reviewWords.value[reviewIndex.value] || null)
const reviewPct = computed(() =>
  reviewWords.value.length ? Math.round((reviewIndex.value / reviewWords.value.length) * 100) : 0
)

// 干扰项从其他生词的释义里抽，词少时用兜底释义补齐
const fallbackMeans = ['苹果', '放弃', '思考', '学习', '城市', '河流', '电脑', '书籍', '音乐', '森林', '勇气', '机会']
const reviewOptions = ref([])

function startReview(list) {
  const pool = [...list]
  // 洗牌
  pool.sort(() => Math.random() - 0.5)
  reviewWords.value = pool
  reviewIndex.value = 0
  reviewCorrect.value = 0
  reviewed.value = false
  pickedMean.value = ''
  reviewFinished.value = false
  reviewWrongWords.value = []
  reviewing.value = true
  genReviewOptions()
}

function genReviewOptions() {
  const cur = currentReview.value
  if (!cur) return
  const others = reviewWords.value
    .filter(w => w.id !== cur.id && w.cnMean && w.cnMean !== cur.cnMean)
    .map(w => w.cnMean)
  const picks = []
  while (picks.length < 3 && others.length) {
    picks.push(others.splice(Math.floor(Math.random() * others.length), 1)[0])
  }
  const fb = fallbackMeans.filter(m => m !== cur.cnMean && !picks.includes(m))
  while (picks.length < 3 && fb.length) {
    picks.push(fb.splice(Math.floor(Math.random() * fb.length), 1)[0])
  }
  reviewOptions.value = [cur.cnMean, ...picks].sort(() => Math.random() - 0.5)
}

function pickReview(opt) {
  if (reviewed.value) return
  reviewed.value = true
  pickedMean.value = opt
  if (opt === currentReview.value.cnMean) {
    reviewCorrect.value += 1
  } else if (!reviewWrongWords.value.some(w => w.id === currentReview.value.id)) {
    reviewWrongWords.value.push(currentReview.value)
  }
}

function reviewBtnClass(opt) {
  if (!reviewed.value) return ''
  const right = currentReview.value?.cnMean
  if (opt === right) return 'correct'
  if (opt === pickedMean.value) return 'wrong'
  return ''
}

function nextReview() {
  if (reviewIndex.value >= reviewWords.value.length - 1) {
    // 只标记完成，保持 reviewing=true 让结果块在复习容器内显示
    reviewFinished.value = true
    return
  }
  reviewIndex.value += 1
  reviewed.value = false
  pickedMean.value = ''
  genReviewOptions()
}

function exitReview() {
  reviewing.value = false
  reviewFinished.value = false
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
  padding: 12px 16px 40px;
}

/* 手机宽度下给右下角的虚拟人物留出空间 */
@media (max-width: 900px) {
  .page-container {
    padding-bottom: 400px;
  }
}

/* 顶部统计卡 */
.stats-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  background: linear-gradient(135deg, rgba(79, 124, 255, 0.16), rgba(124, 58, 237, 0.1));
  border: 1px solid rgba(79, 124, 255, 0.45);
  border-radius: 16px;
}

.sc-num {
  font-size: 28px;
  font-weight: 800;
  color: var(--text-primary);
  font-family: var(--font-display);
}

.sc-label {
  margin-top: 2px;
  font-size: 12px;
  color: var(--text-secondary);
}

.sc-tip {
  margin-top: 8px;
  font-size: 12px;
  color: var(--text-secondary);
  text-align: center;
}

/* 搜索 + 筛选 */
.nb-search {
  margin-top: 12px;
  padding: 0;
  background: transparent;
}

.nb-search :deep(.van-search__content) {
  background: var(--bg-elevated);
}

.level-row {
  display: flex;
  gap: 10px;
  padding: 4px 0 12px;
}

.level-pill {
  padding: 6px 18px;
  border-radius: 999px;
  border: 1px solid var(--accent-border);
  background: var(--bg-elevated);
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.level-pill.active {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
  font-weight: 700;
}

/* 生词卡片 */
.word-item {
  margin-bottom: 12px;
  background: var(--bg-card);
  border: 1px solid var(--accent-border);
  border-radius: 14px;
  overflow: hidden;
}

.wi-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 14px 16px;
  cursor: pointer;
}

.wi-word {
  font-size: 17px;
  font-weight: 700;
  color: var(--text-primary);
  font-family: var(--font-display);
}

.wi-phonetic {
  margin-left: 10px;
  font-size: 12px;
  font-weight: 400;
  color: var(--accent);
  cursor: pointer;
}

.wi-mean {
  margin-top: 4px;
  font-size: 13px;
  color: var(--text-secondary);
}

.wi-right {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.wi-level {
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 11px;
}

.lv-4 { background: rgba(56, 189, 248, 0.15); color: #38bdf8; }
.lv-6 { background: rgba(249, 115, 22, 0.15); color: #f97316; }
.lv-ky { background: rgba(139, 92, 246, 0.15); color: #a78bfa; }

.wi-del {
  font-size: 12px;
  color: var(--text-muted);
  padding: 4px 8px;
  border: 1px solid var(--accent-border);
  border-radius: 8px;
  transition: all 0.2s;
}

.wi-del:hover {
  color: var(--danger, #f87171);
  border-color: var(--danger, #f87171);
}

/* 展开例句 */
.wi-sentence {
  padding: 0 16px 14px;
  border-top: 1px dashed var(--accent-border);
}

.wi-s-en {
  padding-top: 10px;
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.6;
}

/* ===== 复习模式 ===== */
.review-head {
  margin-bottom: 14px;
}

.review-count {
  margin-top: 8px;
  font-size: 13px;
  color: var(--text-secondary);
  text-align: center;
}

.word-card {
  background: var(--bg-card);
  border: 1px solid var(--accent-border);
  border-radius: 16px;
  padding: 24px;
}

.word-title {
  font-size: 26px;
  font-weight: 700;
  color: var(--text-primary);
  font-family: var(--font-display);
  text-align: center;
}

.word-phonetic {
  margin-top: 8px;
  font-size: 15px;
  color: var(--accent);
  text-align: center;
  cursor: pointer;
}

.question-text {
  font-size: 14px;
  color: var(--text-secondary);
  margin: 18px 0 10px;
  text-align: center;
}

.option-btn {
  display: block;
  width: 100%;
  padding: 14px 16px;
  margin: 8px 0;
  background: var(--bg-elevated);
  border: 1px solid var(--accent-border);
  border-radius: 12px;
  font-size: 15px;
  color: var(--text-primary);
  cursor: pointer;
  transition: all 0.2s;
  text-align: left;
}

.option-btn:disabled {
  cursor: default;
}

.option-btn.correct {
  background: var(--success-soft, rgba(52, 211, 153, 0.12));
  border-color: var(--success, #34d399);
  color: var(--success, #34d399);
  font-weight: 700;
}

.option-btn.wrong {
  background: var(--danger-soft, rgba(248, 113, 113, 0.12));
  border-color: var(--danger, #f87171);
  color: var(--danger, #f87171);
}

.review-actions {
  display: flex;
  gap: 12px;
  margin-top: 18px;
}

/* 复习结果 */
.review-done {
  background: var(--bg-card);
  border: 1px solid var(--accent-border);
  border-radius: 16px;
  padding: 28px 20px;
  text-align: center;
}

.rd-emoji { font-size: 44px; }

.rd-title {
  margin-top: 10px;
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary);
  font-family: var(--font-display);
}

.rd-score {
  margin-top: 8px;
  font-size: 14px;
  color: var(--text-secondary);
}

.rd-wrong {
  margin-top: 16px;
  text-align: left;
}

.rd-wrong-title {
  font-size: 13px;
  color: var(--text-secondary);
}

.rd-wrong-list {
  margin-top: 8px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.rd-wrong-tag {
  padding: 4px 12px;
  border-radius: 999px;
  background: var(--danger-soft, rgba(248, 113, 113, 0.12));
  border: 1px solid var(--danger, #f87171);
  color: var(--danger, #f87171);
  font-size: 13px;
}

.rd-actions {
  margin-top: 22px;
  display: flex;
  gap: 12px;
}
</style>
