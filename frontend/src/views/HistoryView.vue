<template>
  <div class="history-view">
    <CyberNavbar :title="batchMode ? '已选' + selectedIds.length + '条' : '历史记录'" :show-back="true" @back="$router.back()">
      <template #right>
        <span v-if="!batchMode" class="nav-action" @click="batchMode=true">批量管理</span>
        <span v-else class="nav-action cancel" @click="batchMode=false;selectedIds=[]">取消</span>
      </template>
    </CyberNavbar>

    <div class="page-container">
      <!-- 空状态 -->
      <div v-if="!loading && list.length === 0" class="empty-state">
        <div class="empty-icon">📚</div>
        <div class="empty-title">还没有出过题哦</div>
        <div class="empty-desc">去首页输入资料，AI帮你生成题目吧</div>
        <CyberButton variant="primary" @click="$router.push('/')">去首页出题</CyberButton>
      </div>

      <!-- 统计概览 -->
      <div v-if="list.length > 0" class="stats-overview">
        <div class="so-item">
          <span class="so-num">{{ list.length }}</span>
          <span class="so-label">总记录</span>
        </div>
        <div class="so-item">
          <span class="so-num success">{{ completedCount }}</span>
          <span class="so-label">已完成</span>
        </div>
        <div class="so-item">
          <span class="so-num magenta">{{ totalQ }}</span>
          <span class="so-label">总题数</span>
        </div>
      </div>

      <!-- 历史卡片列表 -->
      <div v-for="(item, idx) in list" :key="item.id || idx" class="history-card">
        <div class="hc-top">
          <div class="hc-top-left">
            <label v-if="batchMode" class="cyber-checkbox">
              <input type="checkbox" :value="item.id" v-model="selectedIds" />
              <span class="checkmark"></span>
            </label>
            <CyberTag :type="item.source === 'file' ? 'warning' : 'primary'">{{ item.sourceLabel }}</CyberTag>
            <span class="hc-date">{{ formatDate(item.createTime) }}</span>
          </div>
          <span v-if="!batchMode" class="del-btn" @click="deleteSingle(item.id)">🗑️</span>
        </div>

        <div class="hc-preview">{{ item.sourceText }}</div>

        <div class="hc-meta">
          <span>📝 {{ item.questionCount || 0 }}题</span>
          <span>📄 {{ item.wordCount || 0 }}字</span>
          <span v-if="item.objCount !== undefined">✅ 客观{{ item.objCount }}</span>
          <span v-if="item.subCount !== undefined">✍️ 主观{{ item.subCount }}</span>
        </div>

        <!-- 进度 -->
        <div v-if="item.progress !== undefined" class="hc-progress">
          <CyberProgress :percentage="item.progress" :show-pivot="false" />
          <span class="hc-progress-text">
            {{ item.progress >= 100 ? '✅ 已完成' : item.progress + '%' }}
          </span>
        </div>

        <div class="hc-actions">
          <CyberButton v-if="item.progress !== 100" variant="primary" size="small" @click="practiceItem(item)">继续刷题</CyberButton>
          <CyberButton variant="ghost" size="small" @click="showDetail(item)">查看详情</CyberButton>
        </div>
      </div>

      <!-- 加载中 -->
      <div v-if="loading" class="loading-center">
        <div class="cyber-spinner"></div>
      </div>

      <!-- 批量删除栏 -->
      <div v-if="batchMode && selectedIds.length>0" class="batch-bar">
        <CyberButton variant="danger" block @click="batchDelete">删除选中 {{ selectedIds.length }} 条</CyberButton>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useQuestionsStore } from '../stores/questions'
import { usePracticeStore } from '../stores/practice'
import { showFailToast, showSuccessToast, showConfirmDialog } from 'vant'
import request from '../utils/request.js'
import { getProgressBatch } from '../api/progress'
import { CyberNavbar, CyberButton, CyberProgress, CyberTag } from '../components/cyber'

const router = useRouter()
const qStore = useQuestionsStore()
const pStore = usePracticeStore()
const list = ref([])
const loading = ref(true)
const batchMode = ref(false)
const selectedIds = ref([])
const completedCount = ref(0)
const totalQ = ref(0)

onMounted(async () => {
  try {
    const res = await request.get('/user/history')
    const rawList = (res || []).map(item => {
      // 解析 questionsJson 计算客观/主观题数
      let subCount = 0, objCount = 0
      try {
        const parsed = JSON.parse(item.questionsJson || '[]')
        if (Array.isArray(parsed)) {
          subCount = parsed.filter(q => q.type === 'subjective').length
          objCount = parsed.length - subCount
        } else {
          const obj = parsed.objectiveQuestions || []
          const sub = parsed.subjectiveQuestions || []
          objCount = obj.length
          subCount = sub.length
        }
      } catch(e) {}
      const isFile = item.sourceText?.length > 200
      return {
        ...item,
        progress: 0, // 先占位，后面从后端拉取
        objCount: objCount || item.questionCount,
        subCount,
        wordCount: item.sourceText?.length || 0,
        sourceLabel: isFile ? '📄 文件资料' : '✍️ 文本生成',
        source: isFile ? 'file' : 'text'
      }
    })
    list.value = rawList

    // 从后端批量拉取真实进度（修复：不再只依赖 localStorage）
    if (rawList.length > 0) {
      try {
        const ids = rawList.map(item => item.id)
        const progressMap = await getProgressBatch(ids)
        pStore.setServerProgressBatch(progressMap)
        // 更新列表中的进度
        list.value = list.value.map(item => ({
          ...item,
          progress: pStore.getProgress(item.id?.toString())
        }))
      } catch (e) {
        console.warn('后端进度拉取失败，使用本地进度:', e)
        // 回退到本地进度
        list.value = list.value.map(item => ({
          ...item,
          progress: pStore.getProgress(item.id?.toString())
        }))
      }
    }

    completedCount.value = list.value.filter(i => i.progress >= 100).length
    totalQ.value = list.value.reduce((s, i) => s + (i.questionCount || 0), 0)
  } catch (err) {
    showFailToast('加载失败')
  } finally {
    loading.value = false
  }
})

async function deleteSingle(id) {
  try {
    await showConfirmDialog({ message: '确定删除这条记录吗？' })
    await request.delete('/user/history/' + id)
    list.value = list.value.filter(i => i.id !== id)
    showSuccessToast('已删除')
  } catch(e) {}
}

async function batchDelete() {
  if (selectedIds.value.length === 0) return
  try {
    await showConfirmDialog({ message: '确定删除选中的' + selectedIds.value.length + '条记录吗？' })
    await request.post('/user/history/batch-delete', { ids: selectedIds.value })
    list.value = list.value.filter(i => !selectedIds.value.includes(i.id))
    selectedIds.value = []
    batchMode.value = false
    showSuccessToast('已删除')
  } catch(e) {}
}

function formatDate(d) {
  if (!d) return ''
  const dt = new Date(d)
  return dt.toLocaleDateString('zh-CN') + ' ' + dt.toLocaleTimeString('zh-CN', {hour:'2-digit',minute:'2-digit'})
}

// 修复：进入刷题时必须传 recordId，打通后端进度链路
function practiceItem(item) {
  try {
    const parsed = JSON.parse(item.questionsJson || '[]')
    const objArr = parsed.objectiveQuestions || []
    const subArr = parsed.subjectiveQuestions || []
    const arr = [...objArr, ...subArr]
    if (arr.length === 0) { showFailToast('题目数据异常'); return }
    // 关键修复：setQuestions 第二个参数传 recordId
    qStore.setQuestions(arr, item.id)
    pStore.currentSectionId = item.id?.toString() || Date.now().toString()
    pStore.initSection(pStore.currentSectionId, arr.length, item.sourceText, 'text')
    router.push('/practice')
  } catch(e) {
    showFailToast('题目加载失败')
  }
}

function showDetail(item) {
  if (item.questionsJson) {
    try {
      const parsed = JSON.parse(item.questionsJson)
      const objArr = Array.isArray(parsed) ? parsed : (parsed.objectiveQuestions || [])
      const subArr = parsed.subjectiveQuestions || []
      const arr = [...objArr, ...subArr]
      if (arr.length === 0) return
      qStore.setQuestions(arr, item.id)
      pStore.currentSectionId = item.id?.toString() || Date.now().toString()
      pStore.initSection(pStore.currentSectionId, arr.length, item.sourceText, 'text')
      router.push('/practice')
    } catch (e) {}
  }
}
</script>

<style scoped>
.history-view {
  min-height: 100dvh;
  background: var(--bg-base);
  position: relative;
}

.page-container {
  padding: 16px 16px 100px;
  position: relative;
  z-index: 10;
}

/* 导航栏操作按钮 */
.nav-action {
  font-size: 13px;
  color: var(--accent);
  cursor: pointer;
  font-weight: 600;
  transition: all 0.2s;
}

.nav-action:hover {
  text-shadow: 0 0 8px var(--accent);
}

.nav-action.cancel {
  color: var(--text-secondary);
}

/* 统计概览 */
.stats-overview {
  display: flex;
  gap: 10px;
  margin-bottom: 16px;
}

.so-item {
  flex: 1;
  background: var(--bg-card);
  border: 1px solid var(--accent-border);
  border-radius: 12px;
  padding: 14px 8px;
  text-align: center;
  backdrop-filter: blur(12px);
  transition: all 0.3s var(--ease-out);
}

.so-item:hover {
  border-color: var(--accent);
  transform: translateY(-2px);
  box-shadow: 0 4px 16px var(--accent-soft);
}

.so-num {
  display: block;
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 700;
  color: var(--accent);
  margin-bottom: 2px;
  text-shadow: 0 0 8px var(--accent-soft);
}

.so-num.success {
  color: var(--success);
  text-shadow: 0 0 8px var(--success-soft);
}

.so-num.magenta {
  color: var(--secondary);
  text-shadow: 0 0 8px var(--secondary-soft);
}

.so-label {
  font-size: 11px;
  color: var(--text-secondary);
}

/* 历史卡片 */
.history-card {
  background: var(--bg-card);
  border: 1px solid var(--accent-border);
  border-radius: var(--radius-card);
  backdrop-filter: blur(12px);
  padding: 16px;
  margin-bottom: 12px;
  transition: all 0.3s var(--ease-out);
  position: relative;
  overflow: hidden;
}

.history-card:hover {
  border-color: var(--accent);
  background: var(--bg-hover);
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3), 0 0 20px var(--accent-soft);
}

.hc-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.hc-top-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.hc-date {
  font-size: 11px;
  color: var(--text-muted);
}

.del-btn {
  font-size: 16px;
  opacity: 0.5;
  cursor: pointer;
  transition: all 0.2s;
}

.del-btn:hover {
  opacity: 1;
  transform: scale(1.15);
}

.hc-preview {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.5;
  margin-bottom: 10px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.hc-meta {
  display: flex;
  gap: 12px;
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 10px;
  flex-wrap: wrap;
}

.hc-progress {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}

.hc-progress :deep(.cyber-progress) {
  flex: 1;
}

.hc-progress-text {
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
  min-width: 60px;
  text-align: right;
}

.hc-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

/* 复选框 */
.cyber-checkbox {
  display: flex;
  align-items: center;
  cursor: pointer;
}

.cyber-checkbox input {
  display: none;
}

.checkmark {
  width: 18px;
  height: 18px;
  border: 2px solid var(--accent-border);
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.cyber-checkbox input:checked + .checkmark {
  background: var(--accent);
  border-color: var(--accent);
}

.cyber-checkbox input:checked + .checkmark::after {
  content: '✓';
  color: #000;
  font-size: 12px;
  font-weight: 700;
}

/* 批量删除栏 */
.batch-bar {
  position: fixed;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 100%;
  max-width: 480px;
  padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
  background: rgba(10, 10, 15, 0.95);
  backdrop-filter: blur(20px);
  border-top: 1px solid var(--danger);
  z-index: 100;
}

/* 加载中 */
.loading-center {
  display: flex;
  justify-content: center;
  padding: 40px 0;
}
</style>
