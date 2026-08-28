<template>
  <div class="landing">
    <!-- Hero -->
    <div class="hero">
      <div class="hero-icon">📚</div>
      <h1 class="hero-title">智复习</h1>
      <p class="hero-desc">AI 智能出题 · 拍照识别 · 刷题复习</p>
      <div class="hero-actions">
        <van-button round type="primary" class="gradient-btn" size="large" @click="$router.push('/login')">登录使用</van-button>
        <van-button round plain size="large" style="margin-top:10px;color:rgba(255,255,255,0.9);border-color:rgba(255,255,255,0.4)" @click="$router.push('/register')">注册账号</van-button>
      </div>
    </div>

    <!-- 功能介绍 -->
    <div class="features">
      <div class="feature-card" v-for="f in features" :key="f.title">
        <div class="f-icon">{{ f.icon }}</div>
        <div class="f-title">{{ f.title }}</div>
        <div class="f-desc">{{ f.desc }}</div>
      </div>
    </div>

    <!-- 底部 -->
    <div class="footer">
      <div class="footer-btn" @click="$router.push('/login')">已有账号？去登录</div>
    </div>
  </div>
</template>

<script setup>
const features = [
  { icon: '✍️', title: '文本出题', desc: '粘贴复习资料，AI 自动生成客观题+主观题' },
  { icon: '📷', title: '拍照识题', desc: '拍试卷/笔记，OCR + YOLO 版面分析' },
  { icon: '📄', title: '上传文档', desc: 'PDF、Word、TXT 智能分段出题' },
  { icon: '📚', title: '我的题库', desc: '所有出题记录，进度跟踪，继续刷题' },
  { icon: '❌', title: '错题本', desc: '自动记录错题，针对性复习' },
  { icon: '⭐', title: '收藏夹', desc: '收藏好题，随时查看' }
]
</script>

<style scoped>
.landing { min-height:100vh; }
.hero { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); text-align: center; padding: 80px 30px 50px; color: #fff; }
.hero-icon { font-size: 64px; margin-bottom: 10px; }
.hero-title { font-size: 32px; font-weight: 700; margin-bottom: 8px; }
.hero-desc { font-size: 15px; opacity: 0.85; margin-bottom: 30px; }
.hero-actions { max-width: 280px; margin: 0 auto; }
.features { padding: 30px 20px; display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.feature-card { background: #fff; border-radius: 14px; padding: 20px 16px; text-align: center; box-shadow: 0 2px 12px rgba(0,0,0,0.04); }
.f-icon { font-size: 32px; margin-bottom: 6px; }
.f-title { font-size: 15px; font-weight: 600; color: #333; margin-bottom: 4px; }
.f-desc { font-size: 12px; color: #999; line-height: 1.4; }
.footer { text-align: center; padding: 20px 0 40px; }
.footer-btn { color: #667eea; font-size: 14px; cursor: pointer; }
</style>
