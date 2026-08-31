<template>
  <div class="uc-view">
    <CyberNavbar title="个人中心" :show-back="true" @back="$router.back()" />

    <div class="page-container">
      <!-- 用户卡片 -->
      <div class="user-card">
        <div class="avatar-wrap" @click="changeAvatar">
          <img v-if="isLoggedIn() && avatarUrl" :src="avatarUrl" class="avatar" />
          <div v-else class="default-avatar">?</div>
          <div class="avatar-overlay" v-if="isLoggedIn()">更换</div>
        </div>
        <div class="user-name">{{ authState.user?.nickname || '未登录' }}</div>
        <div class="user-id">{{ authState.user?.username ? '@'+authState.user.username : '请先登录' }}</div>
      </div>

      <!-- 统计数据 -->
      <div class="stats-row" v-if="stats">
        <div class="stat-item">
          <div class="stat-num">{{ stats.thisMonthPractices||0 }}</div>
          <div class="stat-label">本月练习</div>
        </div>
        <div class="stat-item">
          <div class="stat-num cyan">{{ stats.totalQuestions||0 }}</div>
          <div class="stat-label">累计做题</div>
        </div>
        <div class="stat-item">
          <div class="stat-num danger">{{ stats.wrongCount||0 }}</div>
          <div class="stat-label">错题数</div>
        </div>
      </div>

      <!-- 菜单列表 -->
      <div class="menu-list">
        <div class="menu-item" @click="$router.push('/wrong-questions')">
          <span class="menu-icon">❌</span>
          <span class="menu-title">我的错题</span>
          <span class="menu-value">{{ (stats?.wrongCount||0) }}道</span>
          <span class="menu-arrow">›</span>
        </div>
        <div class="menu-item" @click="$router.push('/collections')">
          <span class="menu-icon">⭐</span>
          <span class="menu-title">我的收藏</span>
          <span class="menu-value">{{ (stats?.collectionCount||0) }}道</span>
          <span class="menu-arrow">›</span>
        </div>
        <div class="menu-item" @click="$router.push('/history')">
          <span class="menu-icon">📚</span>
          <span class="menu-title">学习记录</span>
          <span class="menu-arrow">›</span>
        </div>
        <div class="menu-item" @click="$router.push('/question-bank')">
          <span class="menu-icon">📋</span>
          <span class="menu-title">我的题库</span>
          <span class="menu-arrow">›</span>
        </div>
      </div>

      <!-- 退出登录 -->
      <div class="logout-area">
        <CyberButton variant="ghost" block class="logout-btn" @click="handleLogout">退出登录</CyberButton>
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
import { CyberNavbar, CyberButton } from '../components/cyber'

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
.uc-view {
  min-height: 100dvh;
  background: var(--bg-base);
  position: relative;
}

.page-container {
  padding: 16px;
  position: relative;
  z-index: 10;
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

.avatar-wrap {
  position: relative;
  display: inline-block;
  cursor: pointer;
}

.avatar {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  border: 3px solid var(--accent);
  padding: 2px;
  object-fit: cover;
  box-shadow: 0 0 20px var(--accent-soft);
}

.default-avatar {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: var(--bg-elevated);
  border: 3px solid var(--accent-border);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 32px;
  color: var(--text-muted);
  margin: 0 auto;
}

.avatar-overlay {
  position: absolute;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  font-size: 11px;
  padding: 2px 12px;
  border-radius: 0 0 36px 36px;
  width: 100%;
  text-align: center;
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

.stat-num.danger {
  color: var(--danger);
  text-shadow: 0 0 8px var(--danger-soft);
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
</style>
