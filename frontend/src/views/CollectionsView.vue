<template>
  <div class="collections-view">
    <van-nav-bar title="⭐ 我的收藏" left-text="返回" left-arrow @click-left="$router.back()" fixed placeholder />
    <div class="page-container">
      <van-empty v-if="!loading && list.length===0" description="还没有收藏题目" />
      <div v-for="item in list" :key="item.id" class="card fav-card">
        <div v-if="item.question">
          <div class="fav-header">
            <van-tag :type="item.question.type==='single'?'primary':'warning'" size="small">{{ item.question.type==='single'?'单选':'多选' }}</van-tag>
          </div>
          <div class="fav-q">{{ item.question.question }}</div>
          <div class="fav-opts"><span v-for="(v,k) in item.question.options" :key="k" class="fav-opt"><b>{{ k }}.</b> {{ v }}</span></div>
          <div class="fav-footer">
            <van-tag type="success" size="small">答案: {{ item.question.answer }}</van-tag>
            <van-button size="mini" plain type="danger" @click="remove(item.id)">取消收藏</van-button>
          </div>
        </div>
      </div>
      <van-loading v-if="loading" style="display:block;margin:40px auto" />
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { showFailToast, showSuccessToast } from 'vant'
import request from '../utils/request.js'
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
.collections-view { min-height:100vh; }
.page-container { padding:16px; }
.fav-card { padding:16px; }
.fav-header { margin-bottom:8px; }
.fav-q { font-size:15px; font-weight:500; color:#333; line-height:1.6; margin-bottom:10px; }
.fav-opts { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:10px; }
.fav-opt { font-size:12px; color:#666; background:#f5f5f5; padding:3px 8px; border-radius:4px; }
.fav-opt b { color:#667eea; }
.fav-footer { display:flex; justify-content:space-between; align-items:center; padding-top:8px; border-top:1px solid #f5f5f5; }
</style>
