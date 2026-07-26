<template>
  <div class="profile-view">
    <van-nav-bar title="个人中心" left-text="返回" left-arrow @click-left="$router.back()" fixed placeholder />

    <div class="page-container">
      <!-- 错误提示 + 重试 -->
      <div v-if="loadError" class="error-box card" @click="loadProfile">
        <div>⚠️ 加载失败，点击重试</div>
      </div>

      <!-- 用户信息卡片 -->
      <div class="user-card card">
        <van-image round width="64" height="64" :src="avatarUrl" class="avatar" />
        <div class="user-name">{{ userInfo?.nickname || userInfo?.username || '加载中...' }}</div>
        <div class="user-id" v-if="userInfo">@{{ userInfo.username }}</div>
      </div>

      <!-- 数据统计 -->
      <div class="stats-row">
        <div class="stat-item card" @click="$router.push('/history')">
          <div class="stat-num">{{ stats?.totalRecords || 0 }}</div>
          <div class="stat-label">出题次数</div>
        </div>
        <div class="stat-item card">
          <div class="stat-num">{{ stats?.totalAnswers || 0 }}</div>
          <div class="stat-label">做题数</div>
        </div>
        <div class="stat-item card">
          <div class="stat-num correct">{{ stats?.accuracy || 0 }}%</div>
          <div class="stat-label">正确率</div>
        </div>
      </div>

      <!-- 功能菜单 -->
      <div class="menu-list card">
        <van-cell title="📚 我的题库" is-link to="/question-bank" value="查看进度" />
        <van-cell title="📋 历史记录" is-link to="/history" />
        <van-cell title="❌ 错题分析" is-link to="/wrong-questions" />
        <van-cell title="⭐ 我的收藏" is-link to="/favorites" :value="stats?.favCount ? stats.favCount + '道' : '0道'" />
      </div>

      <!-- 退出登录 -->
      <div class="logout-area">
        <van-button block round class="logout-btn" @click="handleLogout">退出登录</van-button>
      </div>

      <van-loading v-if="loading" class="center-loading" />
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { logout } from '../utils/auth.js'
import request from '../utils/request.js'

const router = useRouter()
const userInfo = ref(null)
const stats = ref(null)
const loading = ref(true)
const loadError = ref(false)

const avatarUrl = computed(() =>
  userInfo.value?.avatar || '/images/1203220_236.jpg'
)

onMounted(() => {
  loadProfile()
})

async function loadProfile() {
  loading.value = true
  loadError.value = false
  try {
    const res = await request.get('/user/profile')
    userInfo.value = res.user || null
    stats.value = res.stats || null
  } catch (err) {
    loadError.value = true
    console.error('Profile load failed:', err)
  } finally {
    loading.value = false
  }
}

function handleLogout() {
  logout()
  router.push('/login')
}
</script>

<style scoped>
.profile-view { min-height: 100vh; }

.error-box {
  text-align: center;
  color: #ee0a24;
  font-size: 14px;
  cursor: pointer;
  padding: 12px;
}

.user-card {
  text-align: center;
  padding: 30px 20px;
}

.avatar {
  border: 3px solid #667eea;
  padding: 2px;
}

.user-name {
  font-size: 20px;
  font-weight: 600;
  color: #333;
  margin-top: 12px;
}

.user-id {
  font-size: 13px;
  color: #999;
  margin-top: 4px;
}

.stats-row {
  display: flex;
  gap: 10px;
  margin-bottom: 16px;
}

.stat-item {
  flex: 1;
  text-align: center;
  padding: 16px 8px;
  cursor: pointer;
}

.stat-num {
  font-size: 22px;
  font-weight: 700;
  color: #667eea;
}

.stat-num.correct {
  color: #07c160;
}

.stat-label {
  font-size: 12px;
  color: #999;
  margin-top: 4px;
}

.menu-list {
  padding: 0;
}

.logout-area {
  margin-top: 30px;
  padding: 0 16px 40px;
}

.logout-btn {
  background: #f5f5f5 !important;
  color: #999 !important;
  border: none !important;
  height: 44px;
  font-size: 14px;
}

.center-loading {
  display: block;
  margin: 40px auto;
}
</style>
