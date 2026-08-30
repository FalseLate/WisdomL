<template>
  <div class="uc-view">
    <van-nav-bar title="个人中心" left-text="返回" left-arrow @click-left="$router.back()" fixed placeholder />
    <div class="page-container">
      <div class="user-card card">
        <div class="avatar-wrap" @click="changeAvatar">
          <van-image v-if="isLoggedIn() && avatarUrl" round width="72" height="72" :src="avatarUrl" class="avatar" />
          <div v-else class="default-avatar">?</div>
          <div class="avatar-overlay" v-if="isLoggedIn()">更换</div>
        </div>
        <div class="user-name">{{ authState.user?.nickname || '未登录' }}</div>
        <div class="user-id">{{ authState.user?.username ? '@'+authState.user.username : '请先登录' }}</div>
      </div>

      <div class="stats-row" v-if="stats">
        <div class="stat-item card"><div class="stat-num">{{ stats.thisMonthPractices||0 }}</div><div class="stat-label">本月练习</div></div>
        <div class="stat-item card"><div class="stat-num">{{ stats.totalQuestions||0 }}</div><div class="stat-label">累计做题</div></div>
        <div class="stat-item card"><div class="stat-num danger">{{ stats.wrongCount||0 }}</div><div class="stat-label">错题数</div></div>
      </div>

      <div class="menu-list card">
        <van-cell title="❌ 我的错题" is-link to="/wrong-questions" :value="(stats?.wrongCount||0)+'道'" />
        <van-cell title="⭐ 我的收藏" is-link to="/collections" :value="(stats?.collectionCount||0)+'道'" />
        <van-cell title="📚 学习记录" is-link to="/history" />
        <van-cell title="📚 我的题库" is-link to="/question-bank" />
      </div>

      <div class="logout-area">
        <van-button block round class="logout-btn" @click="handleLogout">退出登录</van-button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { logout, authState, isLoggedIn } from '../utils/auth.js'
import request from '../utils/request.js'
import { showFailToast, showDialog, showSuccessToast } from 'vant'

const router = useRouter()
const stats = ref(null)
const avatarUrl = computed(() => {
    if (!isLoggedIn()) return ''
    return authState.user?.avatar || 'https://img.yzcdn.cn/vant/cat.jpeg'
  })

onMounted(async () => {
  if (!isLoggedIn()) {
    showDialog({ message: '请先登录查看个人中心', confirmButtonText: '去登录' }).then(() => {
      router.push('/login')
    })
    return
  }
  try { stats.value = await request.get('/user-stats') }
  catch(e) { showFailToast('加载失败') }
})

function changeAvatar() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/*'
  input.onchange = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const fd = new FormData()
    fd.append('file', file)
    request.post('/user/avatar', fd)
      .then(r => {
        if (r.url) {
          authState.user.avatar = r.url
          showSuccessToast('头像已更新')
        }
      })
      .catch(() => showFailToast('上传失败'))
  }
  input.click()
}

async function handleLogout() {
  logout()
  router.push('/login')
}
</script>

<style scoped>
.uc-view { min-height:100vh; }
.page-container { padding:16px; }
.user-card { text-align:center; padding:30px 20px; }
.avatar { border:3px solid #667eea; padding:2px; }
.user-name { font-size:20px; font-weight:600; color:#333; margin-top:12px; }
.user-id { font-size:13px; color:#999; margin-top:4px; }
.stats-row { display:flex; gap:10px; margin-bottom:16px; }
.stat-item { flex:1; text-align:center; padding:14px 8px; }
.stat-num { font-size:22px; font-weight:700; color:#667eea; }
.stat-num.danger { color:#ee0a24; }
.stat-label { font-size:12px; color:#999; margin-top:4px; }
.menu-list { padding:0; }
.logout-area { margin-top:30px; padding:0 16px 40px; }
.logout-btn { background:#f5f5f5!important; color:#999!important; border:none!important; height:44px; }
.default-avatar { width:72px; height:72px; border-radius:50%; background:#e0e0e0; display:flex; align-items:center; justify-content:center; font-size:32px; color:#999; margin:0 auto; }
.avatar-wrap { position:relative; display:inline-block; cursor:pointer; margin:0 auto; }
.avatar-overlay { position:absolute; bottom:0; left:50%; transform:translateX(-50%); background:rgba(0,0,0,0.5); color:#fff; font-size:12px; padding:2px 12px; border-radius:0 0 36px 36px; width:100%; text-align:center; }
</style>
