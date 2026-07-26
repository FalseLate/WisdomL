<template>
  <div class="login-view">
    <div class="page-container">
      <!-- Logo 区域 -->
      <div class="logo-area">
        <div class="logo-icon">📚</div>
        <div class="logo-title">智复习</div>
        <div class="logo-desc">AI智能出题助手</div>
      </div>

      <!-- 登录表单 -->
      <div class="card form-card">
        <div class="form-title">登录</div>

        <van-field
          v-model="username"
          label="用户名"
          placeholder="请输入用户名"
          left-icon="contact"
          :error-message="usernameError"
          @focus="usernameError = ''"
        />
        <van-field
          v-model="password"
          type="password"
          label="密码"
          placeholder="请输入密码"
          left-icon="lock"
          :error-message="passwordError"
          @focus="passwordError = ''"
        />

        <van-button
          :loading="loading"
          block
          round
          class="gradient-btn login-btn"
          @click="handleLogin"
        >
          登 录
        </van-button>

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

const router = useRouter()
const username = ref('')
const password = ref('')
const usernameError = ref('')
const passwordError = ref('')
const loading = ref(false)

async function handleLogin() {
  // 校验
  usernameError.value = ''
  passwordError.value = ''
  if (!username.value.trim()) { usernameError.value = '请输入用户名'; return }
  if (!password.value) { passwordError.value = '请输入密码'; return }

  loading.value = true
  try {
    await login(username.value.trim(), password.value)
    showSuccessToast('登录成功')
    router.push('/')
  } catch (err) {
    showFailToast(err.message || '登录失败')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-view {
  min-height: 100vh;
}

.logo-area {
  text-align: center;
  padding: 60px 0 30px;
}

.logo-icon {
  font-size: 64px;
  margin-bottom: 12px;
}

.logo-title {
  font-size: 28px;
  font-weight: 700;
  color: #fff;
  letter-spacing: 4px;
}

.logo-desc {
  font-size: 14px;
  color: rgba(255,255,255,0.75);
  margin-top: 8px;
}

.form-card {
  padding: 24px 20px;
}

.form-title {
  font-size: 20px;
  font-weight: 600;
  color: #333;
  margin-bottom: 20px;
  text-align: center;
}

.login-btn {
  margin-top: 20px;
}

.switch-link {
  text-align: center;
  margin-top: 16px;
  font-size: 14px;
  color: #999;
}

.switch-link span {
  color: #667eea;
  font-weight: 500;
  cursor: pointer;
}
</style>
