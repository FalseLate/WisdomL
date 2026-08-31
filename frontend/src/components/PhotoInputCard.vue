<template>
  <div class="photo-card">
    <div class="input-guide">📷 拍摄试卷或学习资料（可拍照或从相册选择）</div>

    <!-- 自定义上传区域 -->
    <div class="upload-area" @click="triggerUpload">
      <div class="upload-icon">📸</div>
      <div class="upload-text">点击拍照或选择图片</div>
      <div class="upload-hint">最多5张，支持多选</div>
      <input
        ref="fileInput"
        type="file"
        accept="image/*"
        multiple
        class="hidden-input"
        @change="onFileChange"
      />
    </div>

    <!-- 已选图片预览 -->
    <div v-if="uploadedFiles.length > 0" class="preview-list">
      <div v-for="(file, idx) in uploadedFiles" :key="idx" class="preview-item">
        <img :src="getPreviewUrl(file)" class="preview-img" />
        <span class="preview-name">{{ file.name }}</span>
        <span class="preview-remove" @click="removeFile(idx)">✕</span>
      </div>
    </div>

    <div class="file-count" v-if="uploadedFiles.length>0">已选 {{ uploadedFiles.length }} 张图片</div>

    <div class="type-selector">
      <span class="type-label">出题类型：</span>
      <div class="radio-group">
        <label class="radio-item" :class="{ checked: questionType === 'all' }" @click="questionType='all'">
          <span class="radio-dot"></span>📝 全部
        </label>
        <label class="radio-item" :class="{ checked: questionType === 'objective' }" @click="questionType='objective'">
          <span class="radio-dot"></span>📖 客观
        </label>
        <label class="radio-item" :class="{ checked: questionType === 'subjective' }" @click="questionType='subjective'">
          <span class="radio-dot"></span>✍️ 主观
        </label>
      </div>
    </div>

    <CyberButton
      variant="primary"
      block
      :loading="loading"
      class="generate-btn"
      @click="doGenerate"
    >
      ✨ 生成题目
    </CyberButton>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { showFailToast } from 'vant'
import { CyberButton } from './cyber'

defineProps({ loading: { type: Boolean, default: false } })
const emit = defineEmits(['generate'])

const fileInput = ref(null)
const uploadedFiles = ref([])
const questionType = ref('all')

function triggerUpload() {
  fileInput.value?.click()
}

function onFileChange(e) {
  const files = Array.from(e.target.files || [])
  files.forEach(f => {
    if (uploadedFiles.value.length < 5) {
      uploadedFiles.value.push(f)
    }
  })
  e.target.value = ''
}

function removeFile(idx) {
  uploadedFiles.value.splice(idx, 1)
}

function getPreviewUrl(file) {
  return URL.createObjectURL(file)
}

function doGenerate() {
  if (uploadedFiles.value.length === 0) { showFailToast('请先拍照或选择图片'); return }
  const valid = uploadedFiles.value.filter(f => f instanceof File)
  if (valid.length === 0) { showFailToast('图片无效，请重新选择'); return }
  emit('generate', { files: [...valid], questionType: questionType.value })
  uploadedFiles.value = []
}
</script>

<style scoped>
.photo-card {
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

/* 预览列表 */
.preview-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

.preview-item {
  position: relative;
  width: 80px;
  height: 80px;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid var(--accent-border);
}

.preview-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.preview-name {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: rgba(0, 0, 0, 0.7);
  color: #fff;
  font-size: 10px;
  padding: 2px 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preview-remove {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 18px;
  height: 18px;
  background: rgba(255, 68, 68, 0.9);
  color: #fff;
  border-radius: 50%;
  font-size: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.file-count {
  font-size: 13px;
  color: var(--accent);
  margin: 8px 0;
  font-weight: 600;
}

/* 题型选择 */
.type-selector {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 12px 0;
  flex-wrap: wrap;
}

.type-label {
  color: var(--text-secondary);
  white-space: nowrap;
  font-size: 13px;
  font-weight: 600;
}

.radio-group {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.radio-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: var(--bg-elevated);
  border: 1px solid var(--accent-border);
  border-radius: 8px;
  font-size: 12px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s;
}

.radio-item.checked {
  border-color: var(--accent);
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 600;
}

.radio-dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid var(--accent-border);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.radio-item.checked .radio-dot {
  border-color: var(--accent);
}

.radio-item.checked .radio-dot::after {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent);
}

.generate-btn {
  margin-top: 8px;
}
</style>
