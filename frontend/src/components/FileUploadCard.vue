<template>
  <div class="card file-card">
    <div class="input-guide">📄 上传学习资料（PDF/Word/TXT，可多选）</div>
    <van-uploader v-model="fileList" accept=".pdf,.docx,.txt" :max-count="10" multiple :after-read="onRead" />
    <div class="file-count" v-if="uploadedFiles.length>0">已选 {{ uploadedFiles.length }} 个文件</div>
    <div class="type-selector">
      <span class="type-label">出题类型：</span>
      <van-radio-group v-model="questionType" direction="horizontal">
        <van-radio name="all" shape="square">📝 全部</van-radio>
        <van-radio name="objective" shape="square">📖 客观</van-radio>
        <van-radio name="subjective" shape="square">✍️ 主观</van-radio>
      </van-radio-group>
    </div>
    <van-button :loading="loading" loading-text="正在上传解析..."
      block round class="gradient-btn" @click="doUpload">
      📤 上传并解析
    </van-button>
    <div v-if="loading" class="upload-loading"><van-loading size="24" /> 正在解析文件...</div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { showFailToast } from 'vant'

defineProps({ loading: { type: Boolean, default: false } })
const emit = defineEmits(['upload'])

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
    const f = item.file || item  // item.file 是原生 File，兜底 item 本身
    if (f && f instanceof File) {
      uploadedFiles.value.push(f)
    }
  })
}

function doUpload() {
  if (uploadedFiles.value.length === 0) { showFailToast('请先选择文件'); return }
  // 过滤掉无效文件，拷贝一份发出
  const valid = uploadedFiles.value.filter(f => f instanceof File)
  if (valid.length === 0) { showFailToast('文件无效，请重新选择'); return }
  emit('upload', { files: [...valid], questionType: questionType.value })
  uploadedFiles.value = []
  fileList.value = []
}
</script>

<style scoped>
.file-card { padding: 20px; }
.input-guide { font-size: 15px; font-weight: 500; color: #333; margin-bottom: 12px; }
.type-selector { display: flex; align-items: center; gap: 8px; margin: 12px 0; font-size: 14px; }
.type-label { color: #666; white-space: nowrap; }
.upload-loading { margin-top: 16px; display: flex; align-items: center; justify-content: center; gap: 8px; color: #999; }
</style>
