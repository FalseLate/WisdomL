<template>
  <div class="wrong-view">
    <CyberNavbar title="错题本" :show-back="true" @back="$router.back()" />

    <div class="page-container">
      <!-- 空状态 -->
      <div v-if="!loading && list.length===0" class="empty-state">
        <div class="empty-icon">🎉</div>
        <div class="empty-title">太棒了</div>
        <div class="empty-desc">暂无错题，继续保持！</div>
      </div>

      <!-- 错题卡片 -->
      <div v-for="item in list" :key="item.id" class="wrong-card">
        <div class="wrong-header">
          <CyberTag type="danger">错{{ item.wrongCount }}次</CyberTag>
          <CyberTag v-if="item.question" :type="item.questionType==='single'?'primary':item.questionType==='subjective'?'success':'warning'">
            {{ item.questionType==='single'?'单选':item.questionType==='subjective'?'主观':'多选' }}
          </CyberTag>
          <CyberTag v-if="item.score" type="warning">⭐ {{ item.score }}/5分</CyberTag>
          <span class="remove-btn" @click="removeWrong(item.id)">移除</span>
        </div>
        <div v-if="item.question">
          <div class="wrong-question">{{ item.question.question }}</div>
          <div class="wrong-opts" v-if="item.question.options">
            <span v-for="(v,k) in item.question.options" :key="k" class="wrong-opt" :class="{ correct: k === item.correctAnswer }">{{ k }}. {{ v }}</span>
          </div>
          <div class="wrong-answer">你的答案：<span class="red">{{ item.userAnswer }}</span></div>
          <div class="wrong-answer">正确答案：<span class="green">{{ item.correctAnswer }}</span></div>
          <div class="wrong-explain" v-if="item.explanation">{{ item.explanation }}</div>
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
import { showSuccessToast, showFailToast } from 'vant'
import request from '../utils/request.js'
import { CyberNavbar, CyberTag } from '../components/cyber'

const list = ref([])
const loading = ref(true)

onMounted(async () => {
  try {
    const res = await request.get('/wrong-questions')
    list.value = (res||[]).map(item => {
      let q = null
      try { q = JSON.parse(item.questionContent) } catch(e) {}
      return { ...item, question: q }
    })
  } catch(e) { showFailToast('加载失败') }
  finally { loading.value = false }
})

async function removeWrong(id) {
  await request.delete('/wrong-questions/' + id)
  list.value = list.value.filter(i => i.id !== id)
  showSuccessToast('已移除')
}
</script>

<style scoped>
.wrong-view {
  min-height: 100dvh;
  background: var(--bg-base);
  position: relative;
}

.page-container {
  padding: 16px 16px 40px;
  position: relative;
  z-index: 10;
}

/* 错题卡片 */
.wrong-card {
  background: var(--bg-card);
  border: 1px solid rgba(255, 68, 68, 0.2);
  border-radius: var(--radius-card);
  backdrop-filter: blur(12px);
  padding: 16px;
  margin-bottom: 12px;
  transition: all 0.3s var(--ease-out);
}

.wrong-card:hover {
  border-color: var(--danger);
  box-shadow: 0 4px 20px var(--danger-soft);
  transform: translateY(-2px);
}

.wrong-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.remove-btn {
  margin-left: auto;
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

.wrong-question {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.6;
  margin-bottom: 10px;
}

.wrong-opts {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
}

.wrong-opt {
  font-size: 12px;
  padding: 5px 12px;
  border-radius: var(--radius-pill);
  background: var(--bg-elevated);
  color: var(--text-secondary);
  border: 1px solid var(--accent-border);
}

.wrong-opt.correct {
  background: var(--success-soft);
  color: var(--success);
  border-color: var(--success);
  font-weight: 600;
}

.wrong-answer {
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

.red {
  color: var(--danger);
  font-weight: 600;
}

.green {
  color: var(--success);
  font-weight: 600;
}

.wrong-explain {
  font-size: 13px;
  color: var(--text-secondary);
  background: var(--bg-elevated);
  padding: 12px;
  border-radius: 8px;
  margin-top: 10px;
  line-height: 1.6;
  border-left: 3px solid var(--accent);
}

/* 加载中 */
.loading-center {
  display: flex;
  justify-content: center;
  padding: 40px 0;
}
</style>
