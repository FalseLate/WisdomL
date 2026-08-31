<template>
  <div class="register-view">
    <div class="page-container">
      <!-- Logo 区域 -->
      <div class="logo-area">
        <div class="logo-icon">📚</div>
        <div class="logo-title">
          <span class="zhi">智</span><span class="xi">复习</span>
        </div>
        <div class="logo-desc">CREATE YOUR ACCOUNT</div>
      </div>

      <!-- 注册表单 -->
      <div class="form-card">
        <div class="form-title">注 册</div>

        <div class="form-group">
          <label class="form-label">用户名</label>
          <div class="input-wrap" :class="{ error: usernameError }">
            <span class="input-icon">👤</span>
            <input
              v-model="username"
              class="form-input"
              placeholder="请设置用户名（至少3位）"
              @focus="usernameError = ''"
            />
          </div>
          <span v-if="usernameError" class="error-text">{{ usernameError }}</span>
        </div>

        <div class="form-group">
          <label class="form-label">昵称（可选）</label>
          <div class="input-wrap">
            <span class="input-icon">😊</span>
            <input
              v-model="nickname"
              class="form-input"
              placeholder="给自己起个名字"
            />
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">密码</label>
          <div class="input-wrap" :class="{ error: passwordError }">
            <span class="input-icon">🔒</span>
            <input
              v-model="password"
              type="password"
              class="form-input"
              placeholder="请设置密码（至少6位）"
              @focus="passwordError = ''"
            />
          </div>
          <span v-if="passwordError" class="error-text">{{ passwordError }}</span>
        </div>

        <div class="form-group">
          <label class="form-label">确认密码</label>
          <div class="input-wrap" :class="{ error: confirmError }">
            <span class="input-icon">🔒</span>
            <input
              v-model="confirmPassword"
              type="password"
              class="form-input"
              placeholder="再次输入密码"
              @keyup.enter="handleRegister"
              @focus="confirmError = ''"
            />
          </div>
          <span v-if="confirmError" class="error-text">{{ confirmError }}</span>
        </div>

        <CyberButton
          variant="primary"
          block
          :loading="loading"
          class="register-btn"
          @click="handleRegister"
        >
          注 册
        </CyberButton>

        <div class="switch-link">
          已有账号？<span @click="$router.push('/login')">去登录</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { showSuccessToast, showFailToast } from 'vant'
import { useRouter } from 'vue-router'
import request from '../utils/request.js'
import { CyberButton } from '../components/cyber'

const router = useRouter()
const username = ref('')
const nickname = ref('')
const password = ref('')
const confirmPassword = ref('')
const usernameError = ref('')
const passwordError = ref('')
const confirmError = ref('')
const loading = ref(false)

async function handleRegister() {
  usernameError.value = ''
  passwordError.value = ''
  confirmError.value = ''

  if (!username.value.trim()) { usernameError.value = '请输入用户名'; return }
  if (username.value.trim().length < 3) { usernameError.value = '用户名至少3个字符'; return }
  if (!password.value) { passwordError.value = '请输入密码'; return }
  if (password.value.length < 6) { passwordError.value = '密码至少6位'; return }
  if (password.value !== confirmPassword.value) { confirmError.value = '两次密码不一致'; return }

  loading.value = true
  try {
    const res = await request.post('/auth/register', {
      username: username.value.trim(),
      password: password.value,
      nickname: nickname.value.trim() || username.value.trim()
    })

    if (res.error) {
      showFailToast(res.error)
      return
    }

    showSuccessToast('注册成功，请登录')
    router.push('/login')
  } catch (err) {
    showFailToast(err.message || '注册失败')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.register-view {
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
  padding: 40px 0 24px;
}

.logo-icon {
  font-size: 56px;
  margin-bottom: 8px;
  filter: drop-shadow(0 0 20px var(--accent-soft));
}

.logo-title {
  font-family: var(--font-display);
  font-size: 28px;
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
  font-size: 10px;
  letter-spacing: 3px;
  color: var(--text-muted);
  margin-top: 8px;
}

/* 表单卡片 */
.form-card {
  background: var(--bg-card);
  border: 1px solid var(--accent-border);
  border-radius: var(--radius-card);
  backdrop-filter: blur(12px);
  padding: 24px 20px;
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
  margin-bottom: 20px;
  text-align: center;
  letter-spacing: 4px;
}

/* 表单组 */
.form-group {
  margin-bottom: 16px;
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
  height: 46px;
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
  font-size: 14px;
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

/* 注册按钮 */
.register-btn {
  margin-top: 20px;
  height: 48px;
  font-size: 16px;
  letter-spacing: 4px;
}

/* 切换链接 */
.switch-link {
  text-align: center;
  margin-top: 16px;
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
