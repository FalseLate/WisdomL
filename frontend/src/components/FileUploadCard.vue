<template>
  <div class="file-card">
    <div class="input-guide">📄 上传学习资料（PDF/Word/TXT，可多选）</div>

    <!-- 自定义上传区域 -->
    <div class="upload-area" @click="triggerUpload">
      <div class="upload-icon">📁</div>
      <div class="upload-text">点击选择文件</div>
      <div class="upload-hint">最多10个，支持 PDF/Word/TXT</div>
      <input
        ref="fileInput"
        type="file"
        accept=".pdf,.docx,.txt"
        multiple
        class="hidden-input"
        @change="onFileChange"
      />
    </div>

    <!-- 已选文件列表 -->
    <div v-if="uploadedFiles.length > 0" class="file-list">
      <div v-for="(file, idx) in uploadedFiles" :key="idx" class="file-item">
        <span class="file-icon">📄</span>
        <span class="file-name">{{ file.name }}</span>
        <span class="file-size">{{ formatSize(file.size) }}</span>
        <span class="file-remove" @click="removeFile(idx)">✕</span>
      </div>
    </div>

    <div class="file-count" v-if="uploadedFiles.length>0">已选 {{ uploadedFiles.length }} 个文件</div>

    <CyberButton
      variant="primary"
      block
      :loading="loading"
      class="upload-btn"
      @click="doUpload"
    >
      📤 上传并解析
    </CyberButton>

    <div v-if="loading" class="upload-loading">
      <div class="cyber-spinner"></div>
      <span>正在解析文件...</span>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { showFailToast } from 'vant'
import { CyberButton } from './cyber'

defineProps({ loading: { type: Boolean, default: false } })
const emit = defineEmits(['upload'])

const fileInput = ref(null)
const uploadedFiles = ref([])
// 出题类型由外层统一控制（fileQT），卡内不再提供重复单选；固定 all 以保持 emit 结构不变
const questionType = ref('all')

function triggerUpload() {
  fileInput.value?.click()
}

function onFileChange(e) {
  const files = Array.from(e.target.files || [])
  files.forEach(f => {
    if (uploadedFiles.value.length < 10) {
      uploadedFiles.value.push(f)
    }
  })
  e.target.value = ''
}

function removeFile(idx) {
  uploadedFiles.value.splice(idx, 1)
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + 'B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + 'KB'
  return (bytes / (1024 * 1024)).toFixed(1) + 'MB'
}

function doUpload() {
  if (uploadedFiles.value.length === 0) { showFailToast('请先选择文件'); return }
  const valid = uploadedFiles.value.filter(f => f instanceof File)
  if (valid.length === 0) { showFailToast('文件无效，请重新选择'); return }
  emit('upload', { files: [...valid], questionType: questionType.value })
  uploadedFiles.value = []
}
</script>

<style scoped>
.file-card {
  background: var(--bg-card);
  border: 1px solid var(--accent-border);
  border-radius: var(--radius-card);
  backdrop-filter: blur(12px);
  padding: 20px;
  margin-bottom: 16px;
}

.input-guide {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 12px;
  font-family: var(--font-display);
  letter-spacing: 0.5px;
}

/* 上传区域 */
.upload-area {
  border: 2px dashed var(--accent-border);
  border-radius: 12px;
  padding: 30px 20px;
  text-align: center;
  cursor: pointer;
  transition: all 0.25s var(--ease-out);
  background: var(--bg-elevated);
}

.upload-area:hover {
  border-color: var(--accent);
  background: var(--accent-soft);
}

.upload-icon {
  font-size: 36px;
  margin-bottom: 8px;
}

.upload-text {
  font-size: 14px;
  color: var(--text-primary);
  font-weight: 600;
  margin-bottom: 4px;
}

.upload-hint {
  font-size: 12px;
  color: var(--text-muted);
}

.hidden-input {
  display: none;
}

/* 文件列表 */
.file-list {
  margin-top: 12px;
}

.file-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: var(--bg-elevated);
  border: 1px solid var(--accent-border);
  border-radius: 8px;
  margin-bottom: 6px;
}

.file-icon {
  font-size: 18px;
  flex-shrink: 0;
}

.file-name {
  flex: 1;
  font-size: 13px;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-size {
  font-size: 11px;
  color: var(--text-muted);
  flex-shrink: 0;
}

.file-remove {
  width: 20px;
  height: 20px;
  background: var(--danger-soft);
  color: var(--danger);
  border-radius: 50%;
  font-size: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.2s;
}

.file-remove:hover {
  background: var(--danger);
  color: #fff;
}

.file-count {
  font-size: 13px;
  color: var(--accent);
  margin: 8px 0;
  font-weight: 600;
}

.upload-btn {
  margin-top: 8px;
}

.upload-loading {
  margin-top: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--text-secondary);
  font-size: 13px;
}
</style>
