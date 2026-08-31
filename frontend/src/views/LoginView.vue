<template>
  <div class="login-view">
    <div class="page-container">
      <!-- Logo 区域 -->
      <div class="logo-area">
        <div class="logo-icon">📚</div>
        <div class="logo-title">
          <span class="zhi">智</span><span class="xi">复习</span>
        </div>
        <div class="logo-desc">AI LEARNING SYSTEM</div>
      </div>

      <!-- 登录表单 -->
      <div class="form-card">
        <div class="form-title">登 录</div>

        <div class="form-group">
          <label class="form-label">用户名</label>
          <div class="input-wrap" :class="{ error: usernameError }">
            <span class="input-icon">👤</span>
            <input
              v-model="username"
              class="form-input"
              placeholder="请输入用户名"
              @focus="usernameError = ''"
            />
          </div>
          <span v-if="usernameError" class="error-text">{{ usernameError }}</span>
        </div>

        <div class="form-group">
          <label class="form-label">密码</label>
          <div class="input-wrap" :class="{ error: passwordError }">
            <span class="input-icon">🔒</span>
            <input
              v-model="password"
              type="password"
              class="form-input"
              placeholder="请输入密码"
              @keyup.enter="handleLogin"
              @focus="passwordError = ''"
            />
          </div>
          <span v-if="passwordError" class="error-text">{{ passwordError }}</span>
        </div>

        <CyberButton
          variant="primary"
          block
          :loading="loading"
          class="login-btn"
          @click="handleLogin"
        >
          登 录
        </CyberButton>

        <div class="switch-link">
          还没有账号？<span @click="$router.push('/register')">立即注册</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { showSuccessToast, showFailToast } from 'vant'
import { useRouter } from 'vue-router'
import { login } from '../utils/auth.js'
import { CyberButton } from '../components/cyber'

const router = useRouter()
const username = ref('')
const password = ref('')
const usernameError = ref('')
const passwordError = ref('')
const loading = ref(false)

async function handleLogin() {
  usernameError.value = ''
  passwordError.value = ''
  if (!username.value.trim()) { usernameError.value = '请输入用户名'; return }
  if (!password.value) { passwordError.value = '请输入密码'; return }

  loading.value = true
  try {
    await login(username.value.trim(), password.value)
    showSuccessToast('登录成功')
    const redirect = sessionStorage.getItem('redirect')
    sessionStorage.removeItem('redirect')
    router.push(redirect || '/')
  } catch (err) {
    showFailToast(err.message || '登录失败')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-view {
  min-height: 100dvh;
  background: var(--bg-base);
  position: relative;
}

.page-container {
  padding: 16px;
  position: relative;
  z-index: 10;
}

/* Logo 区域 */
.logo-area {
  text-align: center;
  padding: 60px 0 30px;
}

.logo-icon {
  font-size: 64px;
  margin-bottom: 12px;
  filter: drop-shadow(0 0 20px var(--accent-soft));
}

.logo-title {
  font-family: var(--font-display);
  font-size: 32px;
  font-weight: 900;
  letter-spacing: 6px;
}

.logo-title .zhi {
  color: var(--accent);
  text-shadow: 0 0 20px var(--accent-soft), 0 0 40px var(--accent-soft);
}

.logo-title .xi {
  color: var(--secondary);
  text-shadow: 0 0 20px var(--secondary-soft), 0 0 40px var(--secondary-soft);
}

.logo-desc {
  font-family: var(--font-display);
  font-size: 11px;
  letter-spacing: 4px;
  color: var(--text-muted);
  margin-top: 10px;
}

/* 表单卡片 */
.form-card {
  background: var(--bg-card);
  border: 1px solid var(--accent-border);
  border-radius: var(--radius-card);
  backdrop-filter: blur(12px);
  padding: 28px 24px;
  position: relative;
  overflow: hidden;
}

.form-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: linear-gradient(90deg, var(--accent), var(--secondary));
}

.form-title {
  font-family: var(--font-display);
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 24px;
  text-align: center;
  letter-spacing: 4px;
}

/* 表单组 */
.form-group {
  margin-bottom: 18px;
}

.form-label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 8px;
  letter-spacing: 0.5px;
}

.input-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--bg-elevated);
  border: 1px solid var(--accent-border);
  border-radius: 12px;
  padding: 0 14px;
  height: 48px;
  transition: all 0.25s var(--ease-out);
}

.input-wrap:focus-within {
  border-color: var(--accent);
  background: var(--accent-soft);
  box-shadow: 0 0 0 3px rgba(0, 245, 255, 0.1), 0 0 16px var(--accent-soft);
}

.input-wrap.error {
  border-color: var(--danger);
}

.input-icon {
  font-size: 16px;
  opacity: 0.6;
  flex-shrink: 0;
}

.form-input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  font-size: 15px;
  color: var(--text-primary);
  font-family: var(--font-body);
  min-width: 0;
}

.form-input::placeholder {
  color: var(--text-muted);
}

.error-text {
  display: block;
  font-size: 12px;
  color: var(--danger);
  margin-top: 6px;
}

/* 登录按钮 */
.login-btn {
  margin-top: 24px;
  height: 50px;
  font-size: 16px;
  letter-spacing: 4px;
}

/* 切换链接 */
.switch-link {
  text-align: center;
  margin-top: 18px;
  font-size: 14px;
  color: var(--text-secondary);
}

.switch-link span {
  color: var(--accent);
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.switch-link span:hover {
  text-shadow: 0 0 8px var(--accent);
}
</style>
