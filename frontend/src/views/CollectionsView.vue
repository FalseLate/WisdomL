<template>
  <div class="collections-view">
    <CyberNavbar title="我的收藏" :show-back="true" @back="$router.back()" />

    <div class="page-container">
      <!-- 空状态 -->
      <div v-if="!loading && list.length===0" class="empty-state">
        <div class="empty-icon">⭐</div>
        <div class="empty-title">还没有收藏</div>
        <div class="empty-desc">在刷题时点击收藏按钮，题目会出现在这里</div>
      </div>

      <!-- 收藏卡片 -->
      <div v-for="item in list" :key="item.id" class="fav-card">
        <div v-if="item.question">
          <div class="fav-header">
            <CyberTag :type="item.question.type==='single'?'primary':'warning'">
              {{ item.question.type==='single'?'单选':'多选' }}
            </CyberTag>
          </div>
          <div class="fav-q">{{ item.question.question }}</div>
          <div class="fav-opts">
            <span v-for="(v,k) in item.question.options" :key="k" class="fav-opt">
              <b>{{ k }}.</b> {{ v }}
            </span>
          </div>
          <div class="fav-footer">
            <CyberTag type="success">答案: {{ item.question.answer }}</CyberTag>
            <span class="remove-btn" @click="remove(item.id)">取消收藏</span>
          </div>
        </div>
      </div>

      <!-- 加载中 -->
      <div v-if="loading" class="loading-center">
        <div class="cyber-spinner"></div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { showFailToast, showSuccessToast } from 'vant'
import request from '../utils/request.js'
import { CyberNavbar, CyberTag } from '../components/cyber'

const list = ref([])
const loading = ref(true)

onMounted(async () => {
  try {
    const res = await request.get('/collection')
    list.value = (res||[]).map(item => {
      let q = null
      try { q = JSON.parse(item.questionJson) } catch(e) {}
      return { ...item, question: q }
    })
  } catch(e) { showFailToast('加载失败') }
  finally { loading.value = false }
})

async function remove(id) {
  await request.delete('/collection/' + id)
  list.value = list.value.filter(i => i.id !== id)
  showSuccessToast('已取消')
}
</script>

<style scoped>
.collections-view {
  min-height: 100dvh;
  background: var(--bg-base);
  position: relative;
}

.page-container {
  padding: 16px 16px 40px;
  position: relative;
  z-index: 10;
}

.fav-card {
  background: var(--bg-card);
  border: 1px solid rgba(249, 240, 2, 0.2);
  border-radius: var(--radius-card);
  backdrop-filter: blur(12px);
  padding: 16px;
  margin-bottom: 12px;
  transition: all 0.3s var(--ease-out);
}

.fav-card:hover {
  border-color: var(--warning);
  box-shadow: 0 4px 20px var(--warning-soft);
  transform: translateY(-2px);
}

.fav-header {
  margin-bottom: 10px;
}

.fav-q {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.6;
  margin-bottom: 10px;
}

.fav-opts {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 12px;
}

.fav-opt {
  font-size: 12px;
  color: var(--text-secondary);
  background: var(--bg-elevated);
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid var(--accent-border);
}

.fav-opt b {
  color: var(--accent);
}

.fav-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 10px;
  border-top: 1px solid var(--accent-border);
}

.remove-btn {
  font-size: 12px;
  color: var(--danger);
  cursor: pointer;
  padding: 4px 10px;
  border: 1px solid var(--danger);
  border-radius: 6px;
  transition: all 0.2s;
}

.remove-btn:hover {
  background: var(--danger-soft);
}

.loading-center {
  display: flex;
  justify-content: center;
  padding: 40px 0;
}
</style>
