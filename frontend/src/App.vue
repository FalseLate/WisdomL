<template>
  <!-- 粒子背景（全局） -->
  <ParticleBackground />

  <!-- 开局加载动画 -->
  <SplashScreen v-if="showSplash" @complete="showSplash = false" />

  <!-- 主内容 -->
  <div class="page-wrapper">
    <router-view v-show="!showSplash" />
  </div>

  <!-- 记单词（/word/*）/阅读（/reading/*）/我的Wiki（/wiki/*）页面常驻的 AI 口语陪练虚拟人（pet-tutor 模块）：
       挂在 App 层按路由显隐，页面切换时不会重新加载模型 -->
  <PetTutor v-if="showPetTutor" :api-base="petApiBase" session-id="word-quiz-user" />

  <!-- 无障碍与手势设置面板：全站只挂这一份，设置页与懒人模式都通过 a11yPanelOpen 打开 -->
  <A11ySettingsDrawer :visible="a11yPanelOpen" @close="a11yPanelOpen = false" />

  <!-- 全局生成中浮动条 -->
  <div v-if="notifyStore.isGenerating" class="global-loading-bar">
    <div class="glb-loading-inner">
      <span class="glb-spinner"></span>
      <span class="glb-text">{{ notifyStore.message }}</span>
      <span class="glb-sub">你可以去其他页面浏览</span>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRoute } from 'vue-router'
import { useNotificationStore } from './stores/notification'
import { ParticleBackground, SplashScreen } from './components/cyber'
import A11ySettingsDrawer from './components/cyber/A11ySettingsDrawer.vue'
import { a11yPanelOpen } from './a11y/settingsPanel.js'
import PetTutor from './pet-tutor/PetTutor.vue'

const route = useRoute()
const notifyStore = useNotificationStore()

// 记单词流程（/word/*）显示虚拟人陪练
// 虚拟人出现在 记单词 与 分层阅读 两个英语模块（阅读页用它的查词/解句/朗读入口）
const showPetTutor = computed(() => route.path.startsWith('/word/') || route.path.startsWith('/reading/') || route.path.startsWith('/wiki/'))

// 虚拟人接口地址：部署到服务器（生产构建）走同源（Nginx 反代 /unity 和 /api），
// 本地开发仍直连本机 8080 后端，两边行为都不变
const petApiBase = import.meta.env.PROD ? '' : 'http://127.0.0.1:8080'

// 开局动画只在首次进入时展示
const showSplash = ref(true)
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
  background: var(--surface-bar);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-radius: 16px;
  padding: 14px 24px;
  border: 1px solid var(--edge-accent);
  box-shadow: var(--bar-shadow);
  text-align: center;
  min-width: 220px;
}

.glb-spinner {
  display: inline-block;
  width: 16px;
  height: 16px;
  border: 2px solid var(--track-accent);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-right: 8px;
  vertical-align: middle;
}

.glb-text {
  font-size: 14px;
  color: var(--text-primary);
  font-weight: 500;
}

.glb-sub {
  display: block;
  font-size: 11px;
  color: var(--text-secondary);
  margin-top: 4px;
}

@keyframes slideUp {
  from { opacity: 0; transform: translateX(-50%) translateY(20px); }
  to { opacity: 1; transform: translateX(-50%) translateY(0); }
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
