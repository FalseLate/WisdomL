<template>
  <div class="wrong-view">
    <van-nav-bar title="❌ 错题本" left-text="返回" left-arrow @click-left="$router.back()" fixed placeholder />
    <div class="page-container">
      <van-empty v-if="!loading && list.length===0" description="太棒了，暂无错题！" />
      <div v-for="item in list" :key="item.id" class="card wrong-card">
        <div class="wrong-header">
          <van-tag type="danger" size="small">错{{ item.wrongCount }}次</van-tag>
          <van-tag v-if="item.question" :type="item.questionType==='single'?'primary':item.questionType==='subjective'?'success':'warning'" size="small">{{ item.questionType==='single'?'单选':item.questionType==='subjective'?'主观':'多选' }}</van-tag>
          <van-tag v-if="item.score" type="warning" size="small">⭐ {{ item.score }}/5分</van-tag>
          <van-button size="mini" plain type="danger" @click="removeWrong(item.id)">移除</van-button>
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
      <van-loading v-if="loading" style="display:block;margin:40px auto" />
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { showSuccessToast, showFailToast } from 'vant'
import request from '../utils/request.js'
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
.wrong-view { min-height:100vh; }
.page-container { padding:16px; }
.wrong-card { padding:16px; }
.wrong-header { display:flex; align-items:center; gap:8px; margin-bottom:10px; }
.wrong-question { font-size:15px; font-weight:500; color:#333; line-height:1.6; margin-bottom:8px; }
.wrong-answer { font-size:13px; color:#666; margin-bottom:4px; }
.red { color:#ee0a24; font-weight:500; }
.green { color:#07c160; font-weight:500; }
.wrong-explain { font-size:13px; color:#555; background:#fff8f8; padding:10px; border-radius:8px; margin-top:8px; line-height:1.5; }
.wrong-opts { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:8px; }
.wrong-opt { font-size:12px; padding:4px 10px; border-radius:12px; background:#f5f5f5; color:#666; }
.wrong-opt.correct { background:#e8f5e9; color:#2e7d32; font-weight:600; }
</style>
