<template>
  <div class="qb-view">
    <CyberNavbar :title="batchMode ? '已选' + selectedIds.length + '条' : '我的题库'" :show-back="true" @back="$router.back()">
      <template #right>
        <span v-if="!batchMode" class="nav-action" @click="batchMode=true">批量管理</span>
        <span v-else class="nav-action cancel" @click="batchMode=false;selectedIds=[]">取消</span>
      </template>
    </CyberNavbar>

    <div class="page-container">
      <!-- 空状态 -->
      <div v-if="!loading && list.length === 0" class="empty-state">
        <div class="empty-icon">📭</div>
        <div class="empty-title">题库还是空的</div>
        <div class="empty-desc">去首页生成题目，会自动保存到这里</div>
        <CyberButton variant="primary" @click="$router.push('/')">去首页出题</CyberButton>
      </div>

      <!-- 题库卡片列表 -->
      <div v-for="item in list" :key="item.id" class="qb-card">
        <div class="qb-top">
          <div class="qb-top-left">
            <label v-if="batchMode" class="cyber-checkbox">
              <input type="checkbox" :value="item.id" v-model="selectedIds" />
              <span class="checkmark"></span>
            </label>
            <CyberTag :type="item.sourceType">{{ item.sourceLabel }}</CyberTag>
            <span class="qb-date">{{ item.date }}</span>
          </div>
          <span v-if="!batchMode" class="del-btn" @click="deleteSingle(item.id)">🗑️</span>
        </div>

        <!-- 标题（可编辑） -->
        <div v-if="editingId !== item.id" class="qb-title-row" @click="startEditTitle(item)">
          <span class="qb-title-text">{{ item.title }}</span>
          <span class="qb-title-edit-hint">✏️</span>
        </div>
        <div v-else class="qb-title-editor">
          <input
            ref="titleInputRef"
            v-model="editTitleValue"
            class="qb-title-input"
            placeholder="输入新标题..."
            @keyup.enter="saveEditTitle(item)"
            @keyup.esc="cancelEditTitle"
            @blur="cancelEditTitle"
          />
          <div class="qb-title-actions">
            <button class="qb-title-btn save" @mousedown.prevent @click.stop="saveEditTitle(item)">✓</button>
            <button class="qb-title-btn cancel" @mousedown.prevent @click.stop="cancelEditTitle">✕</button>
          </div>
        </div>

        <div class="qb-meta">
          <span>📝 {{ item.total }}题</span>
          <span v-if="item.objCount">✅ 客观{{ item.objCount }}</span>
          <span v-if="item.subCount">✍️ 主观{{ item.subCount }}</span>
        </div>

        <div class="qb-progress">
          <CyberProgress :percentage="item.progress" :show-pivot="true" />
        </div>

        <div class="qb-actions">
          <CyberButton v-if="item.progress>=100" variant="success" size="small" disabled>✅ 已完成</CyberButton>
          <CyberButton v-else variant="primary" size="small" @click="goPractice(item)">试卷模式</CyberButton>
          <CyberButton variant="secondary" size="small" @click="goPracticeLazy(item)">懒人模式</CyberButton>
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
import { ref, onMounted, nextTick } from 'vue'
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
const editingId = ref(null)
const editTitleValue = ref('')
const titleInputRef = ref(null)

onMounted(async () => {
  try {
    const res = await request.get('/user/history')
    const rawList = (res || []).map((item, i) => {
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
      const isFile = item.sourceText?.length > 100
      return {
        id: item.id || i,
        title: item.title || (item.sourceText ? item.sourceText.substring(0, 50) : '出题记录'),
        date: formatDate(item.createTime),
        total: item.questionCount || 0,
        objCount: objCount || item.questionCount,
        subCount,
        progress: 0, // 先占位，后面从后端拉取
        sourceLabel: isFile ? '📄 文件' : '✍️ 文本',
        sourceType: isFile ? 'warning' : 'primary',
        questions: item.questionsJson
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
  } catch (e) {
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

function startEditTitle(item) {
  editingId.value = item.id
  editTitleValue.value = item.title || ''
  nextTick(() => { titleInputRef.value?.focus() })
}

async function saveEditTitle(item) {
  if (!editTitleValue.value.trim()) { showFailToast('标题不能为空'); return }
  try {
    await request.put('/user/history/' + item.id + '/title', { title: editTitleValue.value.trim() })
    item.title = editTitleValue.value.trim()
    editingId.value = null
    showSuccessToast('标题已更新')
  } catch (e) {
    showFailToast(e.message || '保存失败')
  }
}

function cancelEditTitle() {
  editingId.value = null
}

function formatDate(d) {
  if (!d) return ''
  const dt = new Date(d)
  return dt.toLocaleDateString('zh-CN')
}

// 修复：进入刷题时必须传 recordId，打通后端进度链路
function goPractice(item) {
  if (item.questions) {
    try {
      const parsed = JSON.parse(item.questions)
      const objArr = Array.isArray(parsed) ? parsed : (parsed.objectiveQuestions || [])
      const subArr = parsed.subjectiveQuestions || []
      const qs = [...objArr, ...subArr]
      // 关键修复：setQuestions 第二个参数传 recordId
      qStore.setQuestions(qs, item.id)
      const secId = item.id?.toString() || Date.now().toString()
      pStore.currentSectionId = secId
      pStore.initSection(secId, qs.length, item.sourceText || '题目', 'text')
      router.push('/practice')
    } catch (e) {
      showFailToast('题目数据解析失败:' + e.message)
    }
  }
}

// 懒人模式（手势刷题）入口
function goPracticeLazy(item) {
  if (item.questions) {
    try {
      const parsed = JSON.parse(item.questions)
      const objArr = Array.isArray(parsed) ? parsed : (parsed.objectiveQuestions || [])
      const subArr = parsed.subjectiveQuestions || []
      const qs = [...objArr, ...subArr]
      qStore.setQuestions(qs, item.id)
      const secId = item.id?.toString() || Date.now().toString()
      pStore.currentSectionId = secId
      pStore.initSection(secId, qs.length, item.sourceText || '题目', 'text')
      router.push('/lazy-practice')
    } catch (e) {
      showFailToast('题目数据解析失败:' + e.message)
    }
  }
}

</script>

<style scoped>
.qb-view {
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

/* 题库卡片 */
.qb-card {
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

.qb-card:hover {
  border-color: var(--accent);
  background: var(--bg-hover);
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3), 0 0 20px var(--accent-soft);
}

.qb-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.qb-top-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.qb-date {
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

/* 标题行 */
.qb-title-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 10px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 8px;
  transition: background 0.15s;
}

.qb-title-row:hover {
  background: var(--accent-soft);
}

.qb-title-text {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.4;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.qb-title-edit-hint {
  font-size: 12px;
  opacity: 0;
  transition: opacity 0.15s;
}

.qb-title-row:hover .qb-title-edit-hint {
  opacity: 1;
}

/* 标题编辑器 */
.qb-title-editor {
  display: flex;
  gap: 6px;
  align-items: center;
  margin-bottom: 10px;
  background: var(--bg-elevated);
  border: 1.5px solid var(--accent);
  border-radius: 10px;
  padding: 6px 8px;
}

.qb-title-input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  min-width: 0;
}

.qb-title-input::placeholder {
  color: var(--text-muted);
}

.qb-title-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.qb-title-btn {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: none;
  cursor: pointer;
  font-size: 12px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}

.qb-title-btn.save {
  background: var(--accent);
  color: #000;
}

.qb-title-btn.save:hover {
  box-shadow: 0 0 10px var(--accent);
}

.qb-title-btn.cancel {
  background: var(--bg-elevated);
  color: var(--text-secondary);
}

.qb-title-btn.cancel:hover {
  background: var(--danger-soft);
  color: var(--danger);
}

/* 元信息 */
.qb-meta {
  display: flex;
  gap: 12px;
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 10px;
}

.qb-progress {
  margin-bottom: 12px;
}

.qb-actions {
  text-align: right;
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
