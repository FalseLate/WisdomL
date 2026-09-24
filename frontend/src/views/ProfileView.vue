<template>
  <div class="profile-view">
    <CyberNavbar title="个人中心" :show-back="true" @back="$router.back()" />

    <div class="page-container">
      <!-- 错误提示 + 重试 -->
      <div v-if="loadError" class="error-box" @click="loadProfile">
        ⚠️ 加载失败，点击重试
      </div>

      <!-- 用户信息卡片 -->
      <div class="user-card">
        <div class="avatar-wrap" @click="changeAvatar">
          <img :src="avatarUrl" class="avatar" />
          <div class="avatar-overlay">更换</div>
        </div>
        <div class="user-name">{{ userInfo?.nickname || userInfo?.username || '加载中...' }}</div>
        <div class="user-id" v-if="userInfo">@{{ userInfo.username }}</div>
      </div>

      <!-- 数据统计 -->
      <div class="stats-row">
        <div class="stat-item" @click="$router.push('/history')">
          <div class="stat-num">{{ stats?.totalRecords || 0 }}</div>
          <div class="stat-label">出题次数</div>
        </div>
        <div class="stat-item">
          <div class="stat-num cyan">{{ stats?.totalAnswers || 0 }}</div>
          <div class="stat-label">做题数</div>
        </div>
        <div class="stat-item">
          <div class="stat-num correct">{{ stats?.accuracy || 0 }}%</div>
          <div class="stat-label">正确率</div>
        </div>
      </div>

      <!-- 功能菜单 -->
      <div class="menu-list">
        <div class="menu-item" @click="$router.push('/question-bank')">
          <span class="menu-icon">📚</span>
          <span class="menu-title">我的题库</span>
          <span class="menu-value">查看进度</span>
          <span class="menu-arrow">›</span>
        </div>
        <div class="menu-item" @click="$router.push('/history')">
          <span class="menu-icon">📋</span>
          <span class="menu-title">历史记录</span>
          <span class="menu-arrow">›</span>
        </div>
        <div class="menu-item" @click="$router.push('/wrong-questions')">
          <span class="menu-icon">❌</span>
          <span class="menu-title">错题分析</span>
          <span class="menu-arrow">›</span>
        </div>
        <div class="menu-item" @click="$router.push('/review-today')">
          <span class="menu-icon">🔁</span>
          <span class="menu-title">今日复习</span>
          <span class="menu-value" :class="{ 'review-badge': reviewDue > 0 }">
            {{ reviewDue > 0 ? reviewDue + ' 题待复习' : '已完成' }}
          </span>
          <span class="menu-arrow">›</span>
        </div>
        <div class="menu-item" @click="$router.push('/error-stats')">
          <span class="menu-icon">📊</span>
          <span class="menu-title">错因统计</span>
          <span class="menu-arrow">›</span>
        </div>
        <div class="menu-item" @click="$router.push('/collections')">
          <span class="menu-icon">⭐</span>
          <span class="menu-title">我的收藏</span>
          <span class="menu-value">{{ stats?.favCount ? stats.favCount + '道' : '0道' }}</span>
          <span class="menu-arrow">›</span>
        </div>
      </div>

      <!-- 退出登录 -->
      <div class="logout-area">
        <CyberButton variant="ghost" block class="logout-btn" @click="handleLogout">退出登录</CyberButton>
      </div>

      <!-- 加载中 -->
      <div v-if="loading" class="loading-center">
        <div class="cyber-spinner"></div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { logout } from '../utils/auth.js'
import request from '../utils/request.js'
import { CyberNavbar, CyberButton } from '../components/cyber'
import { showFailToast, showSuccessToast } from 'vant'

const router = useRouter()
const userInfo = ref(null)
const stats = ref(null)
const loading = ref(true)
const loadError = ref(false)
const reviewDue = ref(0)

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
    loadReviewDue()
  } catch (err) {
    loadError.value = true
    console.error('Profile load failed:', err)
  } finally {
    loading.value = false
  }
}

async function loadReviewDue() {
  try {
    const r = await request.get('/wrong-questions/review-today')
    reviewDue.value = r?.count || 0
  } catch (e) {
    reviewDue.value = 0
  }
}

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
        if (r.url && userInfo.value) {
          userInfo.value.avatar = r.url
          showSuccessToast('头像已更新')
        }
      })
      .catch(() => showFailToast('上传失败'))
  }
  input.click()
}

function handleLogout() {
  logout()
  router.push('/login')
}
</script>

<style scoped>
.profile-view {
  min-height: 100dvh;
  background: var(--bg-base);
  position: relative;
}

.page-container {
  padding: 16px;
  position: relative;
  z-index: 10;
}

.error-box {
  text-align: center;
  color: var(--danger);
  font-size: 14px;
  cursor: pointer;
  padding: 12px;
  background: var(--danger-soft);
  border: 1px solid var(--danger);
  border-radius: 12px;
  margin-bottom: 16px;
}

/* 用户卡片 */
.user-card {
  text-align: center;
  padding: 30px 20px;
  background: var(--bg-card);
  border: 1px solid var(--accent-border);
  border-radius: var(--radius-card);
  backdrop-filter: blur(12px);
  margin-bottom: 16px;
  position: relative;
  overflow: hidden;
}

.user-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: linear-gradient(90deg, var(--accent), var(--secondary));
}

.avatar {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  border: 3px solid var(--accent);
  padding: 2px;
  object-fit: cover;
  box-shadow: 0 0 20px var(--accent-soft);
}

.avatar-wrap {
  position: relative;
  display: inline-block;
  cursor: pointer;
}

.avatar-overlay {
  position: absolute;
  bottom: 2px;
  left: 50%;
  transform: translateX(-50%);
  width: 100%;
  box-sizing: border-box;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  font-size: 10px;
  padding: 1px 10px;
  text-align: center;
  border-radius: 0 0 36px 36px;
}

.user-name {
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary);
  margin-top: 12px;
  font-family: var(--font-display);
  letter-spacing: 1px;
}

.user-id {
  font-size: 13px;
  color: var(--text-secondary);
  margin-top: 4px;
}

/* 统计数据 */
.stats-row {
  display: flex;
  gap: 10px;
  margin-bottom: 16px;
}

.stat-item {
  flex: 1;
  text-align: center;
  padding: 16px 8px;
  background: var(--bg-card);
  border: 1px solid var(--accent-border);
  border-radius: 12px;
  backdrop-filter: blur(12px);
  cursor: pointer;
  transition: all 0.3s var(--ease-out);
}

.stat-item:hover {
  border-color: var(--accent);
  transform: translateY(-2px);
  box-shadow: 0 4px 16px var(--accent-soft);
}

.stat-num {
  font-size: 22px;
  font-weight: 700;
  color: var(--text-primary);
  font-family: var(--font-display);
}

.stat-num.cyan {
  color: var(--accent);
  text-shadow: 0 0 8px var(--accent-soft);
}

.stat-num.correct {
  color: var(--success);
  text-shadow: 0 0 8px var(--success-soft);
}

.stat-label {
  font-size: 11px;
  color: var(--text-secondary);
  margin-top: 4px;
}

/* 菜单列表 */
.menu-list {
  background: var(--bg-card);
  border: 1px solid var(--accent-border);
  border-radius: var(--radius-card);
  backdrop-filter: blur(12px);
  overflow: hidden;
  margin-bottom: 16px;
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  cursor: pointer;
  border-bottom: 1px solid rgba(0, 245, 255, 0.06);
  transition: all 0.2s;
}

.menu-item:last-child {
  border-bottom: none;
}

.menu-item:hover {
  background: var(--accent-soft);
}

.menu-icon {
  font-size: 18px;
  flex-shrink: 0;
}

.menu-title {
  flex: 1;
  font-size: 14px;
  color: var(--text-primary);
  font-weight: 500;
}

.menu-value {
  font-size: 12px;
  color: var(--text-secondary);
}

.menu-value.review-badge {
  font-size: 12px;
  color: var(--accent);
  font-weight: 700;
}

.menu-arrow {
  font-size: 18px;
  color: var(--text-muted);
  flex-shrink: 0;
}

/* 退出登录 */
.logout-area {
  margin-top: 20px;
  padding: 0 0 40px;
}

.logout-btn {
  border-color: var(--danger) !important;
  color: var(--danger) !important;
}

.logout-btn:hover {
  background: var(--danger-soft) !important;
}

.loading-center {
  display: flex;
  justify-content: center;
  padding: 40px 0;
}
</style>
