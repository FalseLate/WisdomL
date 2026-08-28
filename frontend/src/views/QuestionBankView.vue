<template>
  <div class="qb-view">
    <van-nav-bar :title="batchMode ? '已选' + selectedIds.length + '条' : '📚 我的题库'" left-text="返回" left-arrow @click-left="$router.back()" fixed placeholder>
      <template #right>
        <van-button v-if="!batchMode" size="mini" plain type="primary" @click="batchMode=true">批量管理</van-button>
        <van-button v-else size="mini" plain type="default" @click="batchMode=false;selectedIds=[]">取消</van-button>
      </template>
    </van-nav-bar>
    <div class="page-container">
      <div v-if="!loading && list.length === 0" class="empty-state">
        <div class="empty-icon">📭</div>
        <div class="empty-title">题库还是空的</div>
        <div class="empty-desc">去首页生成题目，会自动保存到这里</div>
        <van-button round plain type="primary" @click="$router.push('/')">去首页出题</van-button>
      </div>

      <van-checkbox-group v-model="selectedIds">
      <div v-for="item in list" :key="item.id" class="qb-card">
        <div class="qb-top">
          <van-checkbox v-if="batchMode" :name="item.id" shape="square" style="margin-right:8px" />
          <van-tag :color="item.sourceColor" size="small">{{ item.sourceLabel }}</van-tag>
          <span class="qb-date">{{ item.date }}</span>
          <van-icon v-if="!batchMode" name="delete-o" size="18" color="#ee0a24" class="del-btn" @click="deleteSingle(item.id)" />
        </div>
        <div class="qb-title-row" v-if="editingId !== item.id" @click="startEditTitle(item)">
          <span class="qb-title-text">{{ item.title }}</span>
          <span class="qb-title-edit-hint">
            <van-icon name="edit" size="13" />
          </span>
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
          <span>{{ item.total }}题</span>
          <span v-if="item.objCount">客观{{ item.objCount }}</span>
          <span v-if="item.subCount">主观{{ item.subCount }}</span>
        </div>
        <div class="qb-progress">
          <van-progress :percentage="item.progress" :show-pivot="true" :color="item.progress>=100?'#07c160':'#667eea'" stroke-width="6" />
        </div>
        <div class="qb-actions">
          <van-button v-if="item.progress>=100" size="mini" round plain type="success">✅ 已完成</van-button>
          <van-button v-else size="mini" round type="primary" plain @click="goPractice(item)">继续刷题</van-button>
        </div>
      </div>
        </van-checkbox-group>
      <van-loading v-if="loading" style="display:block;margin:40px auto" />

    <div v-if="batchMode && selectedIds.length>0" class="batch-bar">
      <van-button round block type="danger" @click="batchDelete">删除选中 {{ selectedIds.length }} 条</van-button>
    </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useQuestionsStore } from '../stores/questions'
import { usePracticeStore } from '../stores/practice'
import { showFailToast, showSuccessToast, showConfirmDialog } from 'vant'
import request from '../utils/request.js'

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
    list.value = (res || []).map((item, i) => {
      const progress = pStore.getProgress(item.id?.toString())
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
      return {
        id: item.id || i,
        title: item.title || (item.sourceText ? item.sourceText.substring(0, 50) : '出题记录'),
        date: formatDate(item.createTime),
        total: item.questionCount || 0,
        objCount: objCount || item.questionCount,
        subCount,
        progress: Math.min(progress, 100),
        sourceLabel: item.sourceText?.length > 100 ? '📄 文件' : '✍️ 文本',
        sourceColor: item.sourceText?.length > 100 ? '#ff8c00' : '#667eea',
        sourceColor: item.sourceText?.length > 100 ? '#ff8c00' : '#667eea',
        questions: item.questionsJson
      }
    })
  } catch (e) { showFailToast('加载失败') }
  finally { loading.value = false }
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

function goPractice(item) {
  if (item.questions) {
    try {
      const parsed = JSON.parse(item.questions)
      const objArr = Array.isArray(parsed) ? parsed : (parsed.objectiveQuestions || [])
      const subArr = parsed.subjectiveQuestions || []
      const qs = [...objArr, ...subArr]
      qStore.setQuestions(qs)
      const secId = item.id?.toString() || Date.now().toString()
      pStore.currentSectionId = secId
      pStore.initSection(secId, qs.length, item.sourceText || '题目', 'text')
      router.push('/practice')
    } catch (e) { showFailToast('题目数据解析失败:' + e.message) }
  }
}
</script>

<style scoped>
.qb-view { min-height: 100vh; }
.page-container { padding: 16px; }
.empty-state { text-align: center; padding: 60px 0; }
.empty-icon { font-size: 64px; margin-bottom: 12px; }
.empty-title { font-size: 18px; font-weight: 600; color: #333; margin-bottom: 8px; }
.empty-desc { font-size: 14px; color: #999; margin-bottom: 20px; }
.qb-card { background: #fff; border-radius: 16px; padding: 16px; margin-bottom: 12px; box-shadow: 0 2px 12px rgba(0,0,0,0.06); }
.qb-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.qb-date { font-size: 12px; color: #999; }
.qb-title { font-size: 15px; font-weight: 500; color: #333; margin-bottom: 8px; line-height: 1.4; }
.qb-meta { display: flex; gap: 12px; font-size: 12px; color: #999; margin-bottom: 8px; }
.qb-progress { margin-bottom: 8px; }
.qb-actions { text-align: right; }
.del-btn { opacity:0.5; transition:all 0.2s; }
.del-btn:hover { opacity:1; transform:scale(1.15); }
.batch-bar { position:fixed; bottom:0; left:50%; transform:translateX(-50%); width:100%; max-width:480px; padding:12px 16px 20px; background:#fff; box-shadow:0 -2px 10px rgba(0,0,0,0.06); z-index:100; }
.qb-title-row { display:flex; align-items:center; gap:6px; margin-bottom:8px; cursor:pointer; padding:4px 8px; border-radius:8px; transition:background .15s; }
.qb-title-row:hover { background:#f5f5ff; }
.qb-title-text { font-size:15px; font-weight:500; color:#333; line-height:1.4; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.qb-title-edit-hint { color:#bbb; flex-shrink:0; opacity:0; transition:opacity .15s; }
.qb-title-row:hover .qb-title-edit-hint { opacity:1; }
.qb-title-editor { display:flex; gap:6px; align-items:center; margin-bottom:8px; background:#f8f8ff; border:1.5px solid #667eea; border-radius:10px; padding:6px 8px; }
.qb-title-input { flex:1; border:none; outline:none; background:transparent; font-size:14px; font-weight:500; color:#333; min-width:0; }
.qb-title-input::placeholder { color:#bbb; }
.qb-title-actions { display:flex; gap:4px; flex-shrink:0; }
.qb-title-btn { width:26px; height:26px; border-radius:50%; border:none; cursor:pointer; font-size:12px; font-weight:700; display:flex; align-items:center; justify-content:center; transition:all .15s; }
.qb-title-btn.save { background:#667eea; color:#fff; }
.qb-title-btn.save:hover { background:#5a6fd6; }
.qb-title-btn.cancel { background:#f0f0f0; color:#999; }
.qb-title-btn.cancel:hover { background:#e8e8e8; color:#666; }
</style>
