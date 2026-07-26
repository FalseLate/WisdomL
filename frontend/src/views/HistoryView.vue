<template>
  <div class="history-view">
    <van-nav-bar :title="batchMode ? '已选' + selectedIds.length + '条' : '📋 历史记录'" left-text="返回" left-arrow @click-left="$router.back()" fixed placeholder>
      <template #right>
        <van-button v-if="!batchMode" size="mini" plain type="primary" @click="batchMode=true">批量管理</van-button>
        <van-button v-else size="mini" plain type="default" @click="batchMode=false;selectedIds=[]">取消</van-button>
      </template>
    </van-nav-bar>
    <div class="page-container">

      <!-- 空状态 -->
      <div v-if="!loading && list.length === 0" class="empty-state">
        <div class="empty-icon">📚</div>
        <div class="empty-title">还没有出过题哦</div>
        <div class="empty-desc">去首页输入资料，AI帮你生成题目吧</div>
        <van-button round plain type="primary" @click="$router.push('/')">去首页出题</van-button>
      </div>

      <!-- 统计概览 -->
      <div v-if="list.length > 0" class="stats-overview">
        <div class="so-item"><span class="so-num">{{ list.length }}</span>总记录</div>
        <div class="so-item"><span class="so-num">{{ completedCount }}</span>已完成</div>
        <div class="so-item"><span class="so-num">{{ totalQ }}</span>总题数</div>
      </div>

      <!-- 历史卡片列表 -->
      <van-checkbox-group v-model="selectedIds">
      <div v-for="(item, idx) in list" :key="item.id || idx" class="history-card">
        <div class="hc-top">
          <van-checkbox v-if="batchMode" :name="item.id" shape="square" style="margin-right:8px" />
          <van-tag :color="item.source === 'file' ? '#ff8c00' : '#667eea'" size="small">
            {{ item.sourceLabel }}
          </van-tag>
          <span class="hc-date">{{ formatDate(item.createTime) }}</span>
          <van-icon v-if="!batchMode" name="delete-o" size="18" color="#ee0a24" class="del-btn" @click="deleteSingle(item.id)" />
        </div>

        <div class="hc-preview">{{ item.sourceText }}</div>

        <div class="hc-meta">
          <span>{{ item.questionCount || 0 }}题</span>
          <span>{{ item.wordCount || 0 }}字</span>
          <span v-if="item.objCount !== undefined">客观{{ item.objCount }}</span>
          <span v-if="item.subCount !== undefined">主观{{ item.subCount }}</span>
        </div>

        <!-- 完成状态 -->
        <div v-if="item.progress !== undefined" class="hc-progress">
          <van-progress :percentage="item.progress" :show-pivot="false" :color="item.progress >= 100 ? '#07c160' : '#667eea'" stroke-width="4" />
          <span class="hc-progress-text">{{ item.progress >= 100 ? '✅ 已完成复习' : item.progress + '%' }}</span>
        </div>

        <div class="hc-actions">
          <van-button v-if="item.progress !== 100" size="mini" round type="primary" plain @click="practiceItem(item)">继续刷题</van-button>
          <van-button size="mini" round plain @click="showDetail(item)">查看详情</van-button>
        </div>
      </div>

        </van-checkbox-group>
      <van-loading v-if="loading" class="center-loading" />

    <div v-if="batchMode && selectedIds.length>0" class="batch-bar">
      <van-button round block type="danger" @click="batchDelete">删除选中 {{ selectedIds.length }} 条</van-button>
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
    list.value = (res || []).map(item => {
      const progress = pStore.getProgress(item.id?.toString())
      return {
        ...item,
        progress,
        objCount: item.questionCount,
        subCount: 0,
        wordCount: item.sourceText?.length || 0,
        sourceLabel: item.sourceText?.length > 40 ? (item.sourceText?.length > 200 ? '📄 文件资料' : '✍️ 文本生成') : '✍️ 文本生成', sourceColor: item.sourceText?.length > 200 ? '#ff8c00' : '#667eea'
      }
    })
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

function practiceItem(item) {
  try {
    const parsed = JSON.parse(item.questionsJson || '[]')
    const objArr = parsed.objectiveQuestions || []
    const subArr = parsed.subjectiveQuestions || []
    const arr = [...objArr, ...subArr]
    if (arr.length === 0) { showFailToast('题目数据异常'); return }
    qStore.setQuestions(arr)
    // 记录当前刷题的 recordId
    pStore.currentSectionId = item.id?.toString() || Date.now().toString()
    pStore.initSection(pStore.currentSectionId, arr.length, item.sourceText, 'text')
    router.push('/practice')
  } catch(e) { showFailToast('题目加载失败') }
}

function showDetail(item) {
  if (item.questionsJson) {
    try {
      const parsed = JSON.parse(item.questionsJson)
      const objArr = Array.isArray(parsed) ? parsed : (parsed.objectiveQuestions || [])
      const subArr = parsed.subjectiveQuestions || []
      const arr = [...objArr, ...subArr]
      if (arr.length === 0) return
      qStore.setQuestions(arr)
      pStore.currentSectionId = item.id?.toString() || Date.now().toString()
      pStore.initSection(pStore.currentSectionId, arr.length, item.sourceText, 'text')
      router.push('/practice')
    } catch (e) {}
  }
}
</script>

<style scoped>
.history-view { min-height: 100vh; }
.page-container { padding: 16px; }
.empty-state { text-align: center; padding: 60px 0; }
.empty-icon { font-size: 64px; margin-bottom: 12px; }
.empty-title { font-size: 18px; font-weight: 600; color: #333; margin-bottom: 8px; }
.empty-desc { font-size: 14px; color: #999; margin-bottom: 20px; }

.stats-overview { display: flex; gap: 10px; margin-bottom: 16px; }
.so-item { flex:1; background:#fff; border-radius:12px; padding:14px; text-align:center; box-shadow:0 2px 8px rgba(0,0,0,0.04); }
.so-num { display:block; font-size:22px; font-weight:700; color:#667eea; margin-bottom:2px; }

.history-card { background:#fff; border-radius:16px; padding:16px; margin-bottom:12px; box-shadow:0 2px 12px rgba(0,0,0,0.06); }
.hc-top { display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; }
.hc-date { font-size:12px; color:#999; }
.hc-preview { font-size:14px; color:#666; line-height:1.5; margin-bottom:8px; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
.hc-meta { display:flex; gap:12px; font-size:12px; color:#999; margin-bottom:8px; }
.hc-progress { display:flex; align-items:center; gap:8px; margin-bottom:8px; }
.hc-progress :deep(.van-progress) { flex:1; }
.hc-progress-text { font-size:12px; color:#999; white-space:nowrap; }
.hc-actions { display:flex; gap:8px; justify-content:flex-end; }
.center-loading { display:block; margin:40px auto; }
.del-btn { opacity:0.5; transition:all 0.2s; }
.del-btn:hover { opacity:1; transform:scale(1.15); }
.batch-bar { position:fixed; bottom:0; left:50%; transform:translateX(-50%); width:100%; max-width:480px; padding:12px 16px 20px; background:#fff; box-shadow:0 -2px 10px rgba(0,0,0,0.06); z-index:100; }
</style>
