<template>
  <!-- 粒子背景（全局） -->
  <ParticleBackground />

  <!-- 开局加载动画 -->
  <SplashScreen v-if="showSplash" @complete="showSplash = false" />

  <!-- 主内容 -->
  <div class="page-wrapper">
    <router-view v-show="!showSplash" />
  </div>

  <!-- 全局生成中浮动条 -->
  <div v-if="notifyStore.isGenerating" class="global-loading-bar">
    <div class="glb-loading-inner">
      <span class="glb-spinner"></span>
      <span class="glb-text">{{ notifyStore.message }}</span>
      <span class="glb-sub">你可以去其他页面浏览</span>
    </div>
  </div>

  <!-- 生成完成弹窗 -->
  <div v-if="notifyStore.showCompleteDialog" class="complete-dialog-overlay" @click.self="notifyStore.dismissResult()">
    <div class="complete-dialog">
      <div class="dialog-accent-line"></div>
      <div class="dialog-icon">📝</div>
      <div class="dialog-title">出题完成</div>
      <div class="dialog-stats">
        <div class="ds-item">
          <span class="ds-num">{{ notifyStore.result?.total || 0 }}</span>
          <span class="ds-label">总题数</span>
        </div>
        <div class="ds-item">
          <span class="ds-num cyan">{{ notifyStore.result?.objectiveCount || 0 }}</span>
          <span class="ds-label">客观题</span>
        </div>
        <div class="ds-item">
          <span class="ds-num magenta">{{ notifyStore.result?.subjectiveCount || 0 }}</span>
          <span class="ds-label">主观题</span>
        </div>
      </div>
      <p v-if="notifyStore.result?.missingCount > 0" class="dialog-warning">
        ⚠️ {{ notifyStore.result.missingCount }} 道题答案/解析缺失，可进入刷题后手动重试生成
      </p>
      <div class="dialog-actions">
        <button class="cyber-btn primary" @click="goPractice">📚 立即刷题</button>
        <button class="cyber-btn ghost" @click="notifyStore.dismissResult()">留在当前页</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useNotificationStore } from './stores/notification'
import { useQuestionsStore } from './stores/questions'
import { ParticleBackground, SplashScreen } from './components/cyber'

const router = useRouter()
const notifyStore = useNotificationStore()
const qStore = useQuestionsStore()

// 开局动画只在首次进入时展示
const showSplash = ref(true)

function goPractice() {
  notifyStore.dismissResult()
  if (qStore.questions.length > 0) {
    router.push('/question-bank')
  } else {
    router.push('/')
  }
}
</script>

<style>
/* 页面切换入场动画 */
.page-wrapper > * {
  animation: pageEnter 0.35s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes pageEnter {
  from {
    opacity: 0;
    transform: translateY(14px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* 全局生成中浮动条 - 赛博风 */
.global-loading-bar {
  position: fixed;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 3000;
  animation: slideUp 0.3s ease;
}

.glb-loading-inner {
  background: rgba(10, 10, 15, 0.96);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-radius: 16px;
  padding: 14px 24px;
  border: 1px solid rgba(0, 245, 255, 0.3);
  box-shadow: 0 4px 24px rgba(0, 245, 255, 0.2);
  text-align: center;
  min-width: 220px;
}

.glb-spinner {
  display: inline-block;
  width: 16px;
  height: 16px;
  border: 2px solid rgba(0, 245, 255, 0.2);
  border-top-color: #00f5ff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-right: 8px;
  vertical-align: middle;
}

.glb-text {
  font-size: 14px;
  color: #e8e8f0;
  font-weight: 500;
}

.glb-sub {
  display: block;
  font-size: 11px;
  color: #555566;
  margin-top: 4px;
}

@keyframes slideUp {
  from { opacity: 0; transform: translateX(-50%) translateY(20px); }
  to { opacity: 1; transform: translateX(-50%) translateY(0); }
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* 生成完成弹窗 - 赛博风 */
.complete-dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  z-index: 4000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.complete-dialog {
  position: relative;
  background: rgba(10, 10, 15, 0.98);
  border: 1px solid rgba(0, 245, 255, 0.3);
  border-radius: 20px;
  padding: 32px 24px 24px;
  max-width: 360px;
  width: 100%;
  box-shadow: 0 0 40px rgba(0, 245, 255, 0.2), 0 20px 60px rgba(0, 0, 0, 0.5);
  animation: dialogPop 0.4s cubic-bezier(0.16, 1, 0.3, 1);
  overflow: hidden;
}

@keyframes dialogPop {
  from { opacity: 0; transform: scale(0.9) translateY(20px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}

.dialog-accent-line {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: linear-gradient(90deg, #00f5ff, #ff00ff);
}

.dialog-icon {
  font-size: 48px;
  text-align: center;
  margin-bottom: 12px;
  filter: drop-shadow(0 0 12px rgba(0, 245, 255, 0.5));
}

.dialog-title {
  font-family: 'Orbitron', 'Courier New', monospace;
  font-size: 20px;
  font-weight: 700;
  color: #e8e8f0;
  text-align: center;
  margin-bottom: 20px;
  letter-spacing: 2px;
}

.dialog-stats {
  display: flex;
  justify-content: space-around;
  margin-bottom: 16px;
  padding: 16px 0;
  border-top: 1px solid rgba(0, 245, 255, 0.1);
  border-bottom: 1px solid rgba(0, 245, 255, 0.1);
}

.ds-item {
  text-align: center;
}

.ds-num {
  display: block;
  font-family: 'Orbitron', 'Courier New', monospace;
  font-size: 24px;
  font-weight: 700;
  color: #e8e8f0;
  margin-bottom: 4px;
}

.ds-num.cyan {
  color: #00f5ff;
  text-shadow: 0 0 10px rgba(0, 245, 255, 0.5);
}

.ds-num.magenta {
  color: #ff00ff;
  text-shadow: 0 0 10px rgba(255, 0, 255, 0.5);
}

.ds-label {
  font-size: 11px;
  color: #555566;
}

.dialog-warning {
  font-size: 12px;
  color: #f9f002;
  text-align: center;
  margin-bottom: 16px;
  line-height: 1.5;
}

.dialog-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.cyber-btn {
  width: 100%;
  height: 44px;
  border: none;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  font-family: 'Noto Sans SC', sans-serif;
}

.cyber-btn.primary {
  background: linear-gradient(135deg, #00f5ff, #00c8d4);
  color: #000;
  box-shadow: 0 4px 16px rgba(0, 245, 255, 0.3);
}

.cyber-btn.primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 28px rgba(0, 245, 255, 0.5);
}

.cyber-btn.ghost {
  background: transparent;
  color: #00f5ff;
  border: 1px solid rgba(0, 245, 255, 0.4);
}

.cyber-btn.ghost:hover {
  background: rgba(0, 245, 255, 0.1);
  border-color: #00f5ff;
}
</style>
