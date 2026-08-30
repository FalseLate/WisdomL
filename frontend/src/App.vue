<template>
  <router-view />

  <!-- 全局生成中浮动条 -->
  <div v-if="notifyStore.isGenerating" class="global-loading-bar">
    <div class="glb-loading-inner">
      <span class="glb-spinner">⏳</span>
      <span class="glb-text">{{ notifyStore.message }}</span>
      <span class="glb-sub">你可以去其他页面浏览</span>
    </div>
  </div>

  <!-- 生成完成弹窗 -->
  <van-dialog
    v-model:show="notifyStore.showCompleteDialog"
    title="✅ 出题完成！"
    :show-confirm-button="false"
  >
    <div style="padding: 0 20px 24px; text-align: center;">
      <div style="font-size: 48px; margin-bottom: 8px;">📝</div>
      <p style="font-size: 15px; color: #333; margin-bottom: 4px;">
        共 <b style="color: #667eea; font-size: 20px;">{{ notifyStore.result?.total }}</b> 道
      </p>
      <p style="font-size: 12px; color: #999; margin-bottom: 8px;">
        客观{{ notifyStore.result?.objectiveCount }} · 主观{{ notifyStore.result?.subjectiveCount }}
      </p>
      <p v-if="notifyStore.result?.missingCount > 0"
         style="font-size: 12px; color: #ee0a24; margin-bottom: 8px;">
        ⚠️ {{ notifyStore.result.missingCount }} 道题答案/解析缺失
      </p>
      <van-button
        round block type="primary"
        style="background: #667eea; margin-bottom: 8px;"
        @click="goPractice"
      >📚 立即刷题</van-button>
      <van-button round plain block @click="notifyStore.dismissResult()">留在当前页</van-button>
    </div>
  </van-dialog>
</template>

<script setup>
import { useRouter } from 'vue-router'
import { useNotificationStore } from './stores/notification'
import { useQuestionsStore } from './stores/questions'

const router = useRouter()
const notifyStore = useNotificationStore()
const qStore = useQuestionsStore()

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
.global-loading-bar {
  position: fixed;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 3000;
  animation: slideUp 0.3s ease;
}
.glb-loading-inner {
  background: rgba(255, 255, 255, 0.96);
  backdrop-filter: blur(12px);
  border-radius: 16px;
  padding: 14px 24px;
  box-shadow: 0 4px 24px rgba(102, 126, 234, 0.2);
  text-align: center;
  border: 1px solid rgba(102, 126, 234, 0.1);
  min-width: 220px;
}
.glb-spinner {
  font-size: 20px;
  animation: spin 1.5s linear infinite;
  display: inline-block;
  margin-right: 6px;
}
.glb-text {
  font-size: 14px;
  color: #333;
  font-weight: 500;
}
.glb-sub {
  display: block;
  font-size: 11px;
  color: #999;
  margin-top: 4px;
}
@keyframes slideUp {
  from { opacity: 0; transform: translateX(-50%) translateY(20px); }
  to { opacity: 1; transform: translateX(-50%) translateY(0); }
}
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
