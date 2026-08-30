<template>
  <div class="fav-view">
    <van-nav-bar title="⭐ 我的收藏" left-text="返回" left-arrow @click-left="$router.back()" fixed placeholder />

    <div class="page-container">
      <van-empty v-if="!loading && list.length === 0" description="还没有收藏题目哦" />

      <div v-for="item in list" :key="item.id" class="card fav-card">
        <div v-if="item.question">
          <div class="fav-q">{{ item.question.question }}</div>
          <div class="fav-opts">
            <span v-for="(val, key) in item.question.options" :key="key" class="fav-opt">
              <b>{{ key }}.</b> {{ val }}
            </span>
          </div>
          <div class="fav-footer">
            <van-tag type="success" size="small">答案: {{ item.question.answer }}</van-tag>
            <van-button size="mini" plain type="danger" @click="removeFav(item.id)">取消收藏</van-button>
          </div>
        </div>
      </div>

      <van-loading v-if="loading" class="center-loading" />
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
  await loadFavorites()
})

async function loadFavorites() {
  loading.value = true
  try {
    const res = await request.get('/user/favorites')
    list.value = (res || []).map(item => {
      let question = null
      try { question = JSON.parse(item.questionJson) } catch (e) {}
      return { ...item, question }
    })
  } catch (err) {
    showFailToast('加载失败')
  } finally {
    loading.value = false
  }
}

async function removeFav(id) {
  try {
    await request.delete('/user/favorites/' + id)
    showSuccessToast('已取消收藏')
    list.value = list.value.filter(item => item.id !== id)
  } catch (err) {
    showFailToast('操作失败')
  }
}
</script>

<style scoped>
.fav-view { min-height: 100vh; }
.fav-card { padding: 16px; }
.fav-q { font-size: 15px; font-weight: 500; color: #333; line-height: 1.6; margin-bottom: 10px; }
.fav-opts { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
.fav-opt { font-size: 13px; color: #666; background: #f5f5f5; padding: 4px 10px; border-radius: 6px; }
.fav-opt b { color: #667eea; }
.fav-footer { display: flex; justify-content: space-between; align-items: center; padding-top: 8px; border-top: 1px solid #f5f5f5; }
.center-loading { display: block; margin: 40px auto; }
</style>
