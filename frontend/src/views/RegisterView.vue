<template>
  <div class="register-view">
    <div class="page-container">
      <div class="logo-area">
        <div class="logo-icon">📚</div>
        <div class="logo-title">智复习</div>
        <div class="logo-desc">创建你的账号</div>
      </div>

      <div class="card form-card">
        <div class="form-title">注册</div>

        <van-field
          v-model="username"
          label="用户名"
          placeholder="请设置用户名"
          left-icon="contact"
          :error-message="usernameError"
          @focus="usernameError = ''"
        />
        <van-field
          v-model="nickname"
          label="昵称"
          placeholder="给自己起个名字（可选）"
          left-icon="smile"
        />
        <van-field
          v-model="password"
          type="password"
          label="密码"
          placeholder="请设置密码（至少6位）"
          left-icon="lock"
          :error-message="passwordError"
          @focus="passwordError = ''"
        />
        <van-field
          v-model="confirmPassword"
          type="password"
          label="确认密码"
          placeholder="再次输入密码"
          left-icon="lock"
          :error-message="confirmError"
          @focus="confirmError = ''"
        />

        <van-button
          :loading="loading"
          block
          round
          class="gradient-btn register-btn"
          @click="handleRegister"
        >
          注 册
        </van-button>

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
    // 注册（不自动登录，只调用注册API）
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
  min-height: 100vh;
}

.logo-area {
  text-align: center;
  padding: 40px 0 24px;
}

.logo-icon {
  font-size: 56px;
  margin-bottom: 8px;
}

.logo-title {
  font-size: 26px;
  font-weight: 700;
  color: #fff;
  letter-spacing: 4px;
}

.logo-desc {
  font-size: 14px;
  color: rgba(255,255,255,0.75);
  margin-top: 6px;
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

.register-btn {
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
