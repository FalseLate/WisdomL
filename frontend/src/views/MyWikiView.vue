<template>
  <div class="page-wrap">
    <van-nav-bar title="我的 Wiki" left-arrow @click-left="router.back()" />

    <div class="page-container">
      <div class="mine-tip">
        这些是 AI 从你的错题里提炼的知识笔记，只有你自己能看；做阅读、识别错因时会优先参考它们。
      </div>

      <van-empty v-if="!loading && list.length === 0" description="还没有沉淀笔记，去错题复习里点「提炼笔记」试试">
        <van-button round type="primary" @click="router.push('/word/english-wrong')">去错题复习</van-button>
      </van-empty>

      <div v-for="k in list" :key="k.id" class="wiki-card">
        <div class="kw-head">
          <span class="kw-type" :class="'kt-' + k.knowledgeType">{{ typeName(k.knowledgeType) }}</span>
          <span class="kw-title">{{ k.title }}</span>
          <span class="kw-del" @click="confirmRemove(k)">删除</span>
        </div>
        <div class="kw-content">{{ k.content }}</div>
        <div class="kw-example" v-if="k.exampleSentence" @click="speak(k.exampleSentence)">
          🔊 {{ k.exampleSentence }}
        </div>
      </div>

      <div v-if="loading" class="loading-center">
        <div class="cyber-spinner"></div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { showSuccessToast, showConfirmDialog, showFailToast } from 'vant'
import { getMyWiki, removeMyWiki } from '../api/englishAgent'

const router = useRouter()
const list = ref([])
const loading = ref(true)

function typeName(t) {
  return { 1: '单词', 2: '词块', 3: '语法', 4: '策略' }[t] || '知识'
}

onMounted(load)

async function load() {
  loading.value = true
  try {
    const res = await getMyWiki()
    if (res.code === 200) {
      list.value = res.data || []
    } else {
      showFailToast(res.msg || '加载失败')
    }
  } catch (e) {
    showFailToast(e.message || '网络异常')
  } finally {
    loading.value = false
  }
}

async function confirmRemove(k) {
  try {
    await showConfirmDialog({ title: '删除笔记', message: `确定删除「${k.title}」吗？` })
  } catch { return }
  try {
    const res = await removeMyWiki(k.id)
    if (res.code === 200) {
      list.value = list.value.filter(x => x.id !== k.id)
      showSuccessToast('已删除')
    } else {
      showFailToast(res.msg || '删除失败')
    }
  } catch (e) {
    showFailToast('网络异常')
  }
}

// 浏览器本地朗读例句
function speak(text) {
  try {
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'en-US'
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(u)
  } catch (e) { /* 无发音能力时静默 */ }
}
</script>

<style scoped>
.page-wrap {
  min-height: 100dvh;
  background: var(--bg-base);
}

.page-container {
  position: relative;
  z-index: 10;
  padding: 12px 16px 40px;
}

@media (max-width: 900px) {
  .page-container {
    padding-bottom: 400px;
  }
}

.mine-tip {
  margin-bottom: 14px;
  padding: 10px 14px;
  border: 1px dashed var(--accent-border);
  border-radius: 12px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-secondary);
}

.wiki-card {
  margin-bottom: 12px;
  padding: 14px 16px;
  background: var(--bg-card);
  border: 1px solid rgba(124, 58, 237, 0.4);
  border-radius: 14px;
}

.kw-head {
  display: flex;
  align-items: center;
  gap: 10px;
}

.kw-type {
  flex-shrink: 0;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 11px;
}

.kt-1 { background: rgba(56, 189, 248, 0.15); color: #38bdf8; }
.kt-2 { background: rgba(52, 211, 153, 0.15); color: #34d399; }
.kt-3 { background: rgba(139, 92, 246, 0.15); color: #a78bfa; }
.kt-4 { background: rgba(249, 115, 22, 0.15); color: #f97316; }

.kw-title {
  flex: 1;
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
}

.kw-del {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--text-muted);
  padding: 4px 8px;
  border: 1px solid var(--accent-border);
  border-radius: 8px;
  cursor: pointer;
}

.kw-del:hover {
  color: var(--danger, #f87171);
  border-color: var(--danger, #f87171);
}

.kw-content {
  margin-top: 10px;
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-secondary);
}

.kw-example {
  margin-top: 10px;
  padding: 10px 12px;
  background: var(--bg-elevated);
  border-radius: 10px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-primary);
  cursor: pointer;
}

.loading-center {
  display: flex;
  justify-content: center;
  padding: 40px 0;
}
</style>
