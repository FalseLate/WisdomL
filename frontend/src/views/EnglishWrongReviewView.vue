<template>
  <div class="page-wrap">
    <van-nav-bar title="英语错题复习" left-arrow @click-left="router.back()" />

    <div class="page-container">
      <!-- 筛选 -->
      <div class="filter-row">
        <div
          v-for="f in filters"
          :key="f.key"
          class="filter-pill"
          :class="{ active: activeFilter === f.key }"
          @click="activeFilter = f.key"
        >{{ f.label }}</div>
      </div>

      <!-- 空状态 -->
      <van-empty
        v-if="!loading && filteredList.length === 0"
        :description="list.length === 0 ? '还没有英语错题，去阅读页做完题看看' : '这个分类下没有错题'"
      >
        <van-button v-if="list.length === 0" round type="primary" @click="router.push('/reading/home')">去读文章</van-button>
      </van-empty>

      <!-- 错题卡片 -->
      <div v-for="item in filteredList" :key="item.questionId" class="wrong-card" :class="{ mastered: item.backflowFlag === 0 }">
        <div class="wc-head">
          <span class="wc-tag wrong">错 {{ item.wrongCount }} 次</span>
          <span v-if="item.redoCount" class="wc-tag">已重做 {{ item.redoCount }} 次</span>
          <span v-if="item.backflowFlag === 0" class="wc-tag mastered-tag">✓ 已攻克</span>
        </div>

        <div class="wc-question" v-if="question(item)">{{ question(item).question }}</div>
        <div class="wc-opts">
          <div
            v-for="(v, k) in (question(item)?.options || {})"
            :key="k"
            class="wc-opt"
            :class="optClass(item, k)"
            @click="pickRedo(item, k)"
          >{{ k }}. {{ v }}</div>
        </div>

        <!-- 重做结果 -->
        <div class="wc-redo-result" v-if="item._redoPicked">
          <template v-if="item._redoPicked === item.correctAnswer">🎉 重做正确，本题已攻克，退出回流！</template>
          <template v-else>❌ 重做错误，正确答案 {{ item.correctAnswer }}，留在复习池下轮再来</template>
        </div>

        <div class="wc-answers" v-if="!item._redoMode">
          你的答案：<span class="red">{{ item.userAnswer }}</span>
          <span class="ans-divider">|</span>
          正确答案：<span class="green">{{ item.correctAnswer }}</span>
        </div>
        <div class="wc-explain" v-if="item.explanation">{{ item.explanation }}</div>

        <!-- 错因标记 -->
        <div class="etype-row">
          <span class="etype-label">错因：</span>
          <span
            v-for="t in ERROR_TYPES"
            :key="t.id"
            class="etype-pill"
            :class="{ active: hasErrorType(item, t.id) }"
            @click="toggleErrorType(item, t.id)"
          >{{ t.name }}</span>
        </div>

        <!-- 操作 -->
        <div class="wc-actions" v-if="item.backflowFlag !== 0 && !item._redoMode">
          <van-button size="small" round plain type="primary" @click="startRedo(item)">重做此题</van-button>
        </div>
      </div>

      <div v-if="loading" class="loading-center">
        <div class="cyber-spinner"></div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { showSuccessToast, showFailToast } from 'vant'
import { getEnglishWrongList, saveErrorTypes, submitRedo } from '../api/englishWrong'

const router = useRouter()
const list = ref([])
const loading = ref(true)
const activeFilter = ref('all')

const filters = [
  { key: 'all', label: '全部' },
  { key: 'open', label: '未攻克' },
  { key: 'mastered', label: '已攻克' }
]

// 五大错因（与后端 dict_error_type 一致）
const ERROR_TYPES = [
  { id: 1, name: '审题' },
  { id: 2, name: '知识' },
  { id: 3, name: '策略' },
  { id: 4, name: '逻辑' },
  { id: 5, name: '习惯' }
]

const filteredList = computed(() =>
  list.value.filter(i => {
    if (activeFilter.value === 'open') return i.backflowFlag === 1
    if (activeFilter.value === 'mastered') return i.backflowFlag === 0
    return true
  })
)

function question(item) {
  return item._q
}

function hasErrorType(item, tid) {
  return (item.errorTypeIds || '').split(',').map(Number).includes(tid)
}

onMounted(load)

async function load() {
  loading.value = true
  try {
    const res = await getEnglishWrongList()
    if (res.code === 200) {
      list.value = (res.data || []).map(item => {
        let q = null
        try { q = JSON.parse(item.questionContent) } catch (e) { /* 内容解析失败按无题处理 */ }
        return { ...item, _q: q, _redoMode: false, _redoPicked: null }
      })
    } else {
      showFailToast(res.msg || '加载失败')
    }
  } catch (e) {
    showFailToast(e.message || '网络异常')
  } finally {
    loading.value = false
  }
}

// ===== 错因标记 =====
async function toggleErrorType(item, tid) {
  const cur = new Set((item.errorTypeIds || '').split(',').filter(Boolean).map(Number))
  cur.has(tid) ? cur.delete(tid) : cur.add(tid)
  const val = [...cur].join(',')
  try {
    const res = await saveErrorTypes(item.questionId, val)
    if (res.code === 200) {
      item.errorTypeIds = val
    } else {
      showFailToast(res.msg || '保存失败')
    }
  } catch (e) {
    showFailToast('网络异常')
  }
}

// ===== 重做 =====
function startRedo(item) {
  item._redoMode = true
  item._redoPicked = null
}

function optClass(item, k) {
  return {
    pickable: item._redoMode && !item._redoPicked,
    correct: item._redoPicked !== null && k === item.correctAnswer,
    wrong: item._redoPicked === k && k !== item.correctAnswer
  }
}

async function pickRedo(item, k) {
  if (!item._redoMode || item._redoPicked) return
  item._redoPicked = k
  const correct = k === item.correctAnswer
  try {
    const res = await submitRedo(item.questionId, correct)
    if (res.code === 200) {
      item.redoCount = res.redoCount
      item.backflowFlag = res.backflowFlag
      if (correct) showSuccessToast('已攻克，退出回流 🎉')
    } else {
      showFailToast(res.msg || '回写失败')
    }
  } catch (e) {
    showFailToast('网络异常')
  }
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

/* 筛选 */
.filter-row {
  display: flex;
  gap: 10px;
  padding: 4px 0 12px;
}

.filter-pill {
  padding: 6px 18px;
  border-radius: 999px;
  border: 1px solid var(--accent-border);
  background: var(--bg-elevated);
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.filter-pill.active {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
  font-weight: 700;
}

/* 错题卡片 */
.wrong-card {
  margin-bottom: 12px;
  padding: 14px 16px;
  background: var(--bg-card);
  border: 1px solid rgba(255, 68, 68, 0.25);
  border-radius: 14px;
}

.wrong-card.mastered {
  border-color: rgba(52, 211, 153, 0.4);
}

.wc-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 10px;
}

.wc-tag {
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 11px;
  background: var(--bg-elevated);
  border: 1px solid var(--accent-border);
  color: var(--text-secondary);
}

.wc-tag.wrong {
  background: rgba(248, 113, 113, 0.12);
  border-color: rgba(248, 113, 113, 0.6);
  color: var(--danger, #f87171);
}

.mastered-tag {
  background: rgba(52, 211, 153, 0.12);
  border-color: rgba(52, 211, 153, 0.6);
  color: var(--success, #34d399);
}

.wc-question {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.6;
  margin-bottom: 10px;
}

.wc-opts {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 10px;
}

.wc-opt {
  font-size: 13px;
  padding: 8px 12px;
  border-radius: 10px;
  background: var(--bg-elevated);
  color: var(--text-secondary);
  border: 1px solid var(--accent-border);
  transition: all 0.2s;
}

.wc-opt.pickable {
  cursor: pointer;
}

.wc-opt.pickable:hover {
  border-color: var(--accent);
}

.wc-opt.correct {
  background: var(--success-soft, rgba(52, 211, 153, 0.12));
  color: var(--success, #34d399);
  border-color: var(--success, #34d399);
  font-weight: 600;
}

.wc-opt.wrong {
  background: var(--danger-soft, rgba(248, 113, 113, 0.12));
  color: var(--danger, #f87171);
  border-color: var(--danger, #f87171);
}

.wc-redo-result {
  font-size: 13px;
  margin-bottom: 8px;
  color: var(--text-primary);
}

.wc-answers {
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

.ans-divider {
  margin: 0 8px;
  color: var(--text-muted);
}

.red { color: var(--danger, #f87171); font-weight: 600; }
.green { color: var(--success, #34d399); font-weight: 600; }

.wc-explain {
  font-size: 13px;
  color: var(--text-secondary);
  background: var(--bg-elevated);
  padding: 10px 12px;
  border-radius: 8px;
  margin-bottom: 10px;
  line-height: 1.6;
  border-left: 3px solid var(--accent);
}

/* 错因标记 */
.etype-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  padding-top: 4px;
  border-top: 1px dashed var(--accent-border);
}

.etype-label {
  font-size: 12px;
  color: var(--text-secondary);
}

.etype-pill {
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 12px;
  border: 1px solid var(--accent-border);
  background: var(--bg-elevated);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s;
}

.etype-pill.active {
  background: rgba(79, 124, 255, 0.18);
  border-color: var(--accent);
  color: var(--accent);
  font-weight: 600;
}

.wc-actions {
  margin-top: 10px;
  display: flex;
  justify-content: flex-end;
}

.loading-center {
  display: flex;
  justify-content: center;
  padding: 40px 0;
}
</style>
