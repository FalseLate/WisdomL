<template>
  <div class="card photo-card">
    <div class="input-guide">📷 拍摄试卷或学习资料（可拍照或从相册选择）</div>
    <van-uploader v-model="fileList" accept="image/*" :max-count="5" multiple :after-read="onRead" />
    <div class="file-count" v-if="uploadedFiles.length>0">已选 {{ uploadedFiles.length }} 张图片</div>
    <div class="type-selector">
      <span class="type-label">出题类型：</span>
      <van-radio-group v-model="questionType" direction="horizontal">
        <van-radio name="all" shape="square">📝 全部</van-radio>
        <van-radio name="objective" shape="square">📖 客观</van-radio>
        <van-radio name="subjective" shape="square">✍️ 主观</van-radio>
      </van-radio-group>
    </div>
    <van-button :loading="loading" loading-text="AI正在分析版面..." block round class="gradient-btn" @click="doGenerate">✨ 生成题目</van-button>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { showFailToast } from 'vant'

defineProps({ loading: { type: Boolean, default: false } })
const emit = defineEmits(['generate'])

const fileList = ref([])
const uploadedFiles = ref([])
const questionType = ref('all')

/**
 * Vant 4 van-uploader 的 after-read 回调：
 * - 单选时：obj = { file: File, ... }
 * - 多选时：obj = [{ file: File, ... }, ...]  数组！
 * 这里统一处理两种情况。
 */
function onRead(obj) {
  const items = Array.isArray(obj) ? obj : [obj]
  items.forEach(item => {
    const f = item.file || item
    if (f && f instanceof File) {
      uploadedFiles.value.push(f)
    }
  })
}

function doGenerate() {
  if (uploadedFiles.value.length === 0) { showFailToast('请先拍照或选择图片'); return }
  const valid = uploadedFiles.value.filter(f => f instanceof File)
  if (valid.length === 0) { showFailToast('图片无效，请重新选择'); return }
  emit('generate', { files: [...valid], questionType: questionType.value })
  uploadedFiles.value = []
  fileList.value = []
}
</script>

<style scoped>
.photo-card { padding: 20px; }
.input-guide { font-size: 15px; font-weight: 500; color: #333; margin-bottom: 12px; }
.file-count { font-size: 13px; color: #667eea; margin: 6px 0; }
.type-selector { display: flex; align-items: center; gap: 8px; margin: 12px 0; font-size: 14px; }
.type-label { color: #666; white-space: nowrap; }
</style>
