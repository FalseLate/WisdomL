<template>
  <div class="page-wrap">
    <van-nav-bar title="我的 Wiki" left-arrow @click-left="router.back()" />

    <div class="page-container">
      <div class="mine-tip">
        AI 从错题提炼的笔记 + 你手动记录的知识点都在这里，只有你能看；做阅读、出题、错因分析时会优先参考它们。
      </div>

      <div class="add-row">
        <van-button round type="primary" size="small" icon="plus" @click="openAdd">新增笔记</van-button>
      </div>

      <van-empty v-if="!loading && list.length === 0" description="还没有笔记，点上方「新增笔记」或去错题复习里「提炼笔记」">
        <van-button round type="primary" @click="router.push('/word/english-wrong')">去错题复习</van-button>
      </van-empty>

      <div v-for="k in list" :key="k.id" class="wiki-card">
        <div class="kw-head">
          <span v-if="k.noteType" class="kw-note">📝 {{ noteTypeName(k.noteType) }}</span>
          <span v-else class="kw-type" :class="'kt-' + k.knowledgeType">{{ typeName(k.knowledgeType) }}</span>
          <span class="kw-title">{{ k.title }}</span>
          <span v-if="k.noteType" class="kw-edit" @click="openEdit(k)">编辑</span>
          <span class="kw-del" @click="confirmRemove(k)">删除</span>
        </div>
        <div class="kw-content">{{ k.content }}</div>
        <div class="kw-example" v-if="k.exampleSentence" @click="speak(k.exampleSentence)">
          🔊 {{ k.exampleSentence }}
        </div>
        <div class="kw-tags" v-if="tagList(k).length">
          <span v-for="(t, i) in tagList(k)" :key="i" class="kw-tag">#{{ t }}</span>
        </div>
        <div class="kw-links" v-if="linkCount(k)" @click="openDetail(k)">🔗 {{ linkCount(k) }} 条关联 · 查看</div>
      </div>

      <div v-if="loading" class="loading-center">
        <div class="cyber-spinner"></div>
      </div>
    </div>

    <!-- 新增/编辑表单 -->
    <van-popup v-model:show="showForm" position="bottom" round :style="{ padding: '16px' }">
      <div class="form-title">{{ form.id ? '编辑笔记' : '新增笔记' }}</div>
      <div class="ntype-row">
        <span v-for="t in NOTE_TYPES" :key="t.v" class="ntype-pill" :class="{ active: form.noteType === t.v }"
              @click="form.noteType = t.v">{{ t.label }}</span>
      </div>
      <van-field v-model="form.title" label="标题" placeholder="给笔记起个名字" maxlength="40" show-word-limit />
      <van-field v-model="form.content" label="正文" type="textarea" rows="3" autosize
                 placeholder="知识点 / 错题模式 / 长难句拆解 / 个人批注…" maxlength="500" show-word-limit />
      <van-field v-model="form.exampleSentence" label="例句" placeholder="可选，英文例句" />
      <van-field v-model="form.tags" label="标签" placeholder="逗号分隔，如：语法,定语从句" />
      <div class="link-pick">
        <div class="link-pick-label">关联到我的其它笔记：</div>
        <van-checkbox-group v-model="form.links">
          <van-checkbox v-for="o in linkOptions" :key="o.id" :name="o.id" shape="square" icon-size="16px">
            {{ o.title }}
          </van-checkbox>
        </van-checkbox-group>
        <div v-if="!linkOptions.length" class="link-empty">（还没有其它笔记可关联）</div>
      </div>
      <div class="form-actions">
        <van-button block round type="primary" :loading="saving" @click="submitNote">保存</van-button>
      </div>
    </van-popup>

    <!-- 双向链接详情 -->
    <van-popup v-model:show="showDetail" position="bottom" round :style="{ padding: '16px' }">
      <div class="form-title">{{ detail.title }}</div>
      <div class="dt-section" v-if="detail.links && detail.links.length">
        <div class="dt-label">🔗 我链接到：</div>
        <div v-for="l in detail.links" :key="l.id" class="dt-link" @click="openDetailById(l.id)">{{ l.title }}</div>
      </div>
      <div class="dt-section" v-if="detail.backlinks && detail.backlinks.length">
        <div class="dt-label">↩ 被这些笔记引用：</div>
        <div v-for="l in detail.backlinks" :key="l.id" class="dt-link" @click="openDetailById(l.id)">{{ l.title }}</div>
      </div>
      <div v-if="!(detail.links && detail.links.length) && !(detail.backlinks && detail.backlinks.length)" class="link-empty">
        暂无双向链接
      </div>
    </van-popup>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { showSuccessToast, showConfirmDialog, showFailToast } from 'vant'
import { getMyWiki, removeMyWiki, saveNote, getNoteDetail } from '../api/englishAgent'

const router = useRouter()
const list = ref([])
const loading = ref(true)

const NOTE_TYPES = [
  { v: 1, label: '知识点' },
  { v: 2, label: '词汇' },
  { v: 3, label: '长难句' },
  { v: 4, label: '批注' }
]
const noteTypeName = v => (NOTE_TYPES.find(t => t.v === v) || {}).label || ''

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

// ===== 新增/编辑表单 =====
const showForm = ref(false)
const saving = ref(false)
const form = reactive({ id: null, noteType: 1, title: '', content: '', exampleSentence: '', tags: '', links: [] })
const linkOptions = computed(() => list.value.filter(k => k.id !== form.id))

function openAdd() {
  Object.assign(form, { id: null, noteType: 1, title: '', content: '', exampleSentence: '', tags: '', links: [] })
  showForm.value = true
}

function openEdit(k) {
  Object.assign(form, {
    id: k.id,
    noteType: k.noteType || 1,
    title: k.title || '',
    content: k.content || '',
    exampleSentence: k.exampleSentence || '',
    tags: k.tags || '',
    links: parseIds(k.links)
  })
  showForm.value = true
}

async function submitNote() {
  if (!form.title.trim()) { showFailToast('请填写标题'); return }
  saving.value = true
  try {
    const payload = {
      noteType: form.noteType,
      title: form.title.trim(),
      content: form.content,
      exampleSentence: form.exampleSentence,
      tags: form.tags,
      links: form.links
    }
    if (form.id) payload.id = form.id
    const res = await saveNote(payload)
    if (res.code === 200) {
      showSuccessToast(form.id ? '已更新' : '已保存')
      showForm.value = false
      await load()
    } else {
      showFailToast(res.msg || '保存失败')
    }
  } catch (e) {
    showFailToast('网络异常')
  } finally {
    saving.value = false
  }
}

// ===== 双向链接详情 =====
const showDetail = ref(false)
const detail = ref({})

function parseIds(s) {
  try { const a = JSON.parse(s); return Array.isArray(a) ? a.map(Number) : [] } catch (e) { return [] }
}
function linkCount(k) { return parseIds(k.links).length }
function tagList(k) { return (k.tags || '').split(',').map(t => t.trim()).filter(Boolean) }

async function openDetail(k) {
  try {
    const res = await getNoteDetail(k.id)
    if (res.code === 200) { detail.value = res.data; showDetail.value = true }
    else showFailToast(res.msg || '加载失败')
  } catch (e) { showFailToast('网络异常') }
}
async function openDetailById(id) {
  const k = list.value.find(x => x.id === id)
  if (k) await openDetail(k)
}

// ===== 删除 =====
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
  margin-bottom: 10px;
  padding: 10px 14px;
  border: 1px dashed var(--accent-border);
  border-radius: 12px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-secondary);
}

.add-row {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 12px;
}

.wiki-card {
  margin-bottom: 12px;
  padding: 14px 16px;
  background: var(--bg-card);
  border: 1px solid rgb(var(--purple-deep-rgb) / 0.4);
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

.kw-note {
  flex-shrink: 0;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 11px;
  background: rgb(var(--indigo-rgb) / 0.18);
  color: var(--accent);
}

.kt-1 { background: rgb(var(--sky-rgb) / 0.15); color: var(--sky-text); }
.kt-2 { background: rgb(var(--emerald-rgb) / 0.15); color: var(--emerald-text); }
.kt-3 { background: rgb(var(--purple-rgb) / 0.15); color: var(--violet-text); }
.kt-4 { background: rgb(var(--orange-rgb) / 0.15); color: var(--orange-text); }

.kw-title {
  flex: 1;
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
}

.kw-edit,
.kw-del {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--text-muted);
  padding: 4px 8px;
  border: 1px solid var(--accent-border);
  border-radius: 8px;
  cursor: pointer;
}

.kw-edit:hover { color: var(--accent); border-color: var(--accent); }
.kw-del:hover { color: var(--danger, #f87171); border-color: var(--danger, #f87171); }

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

.kw-tags {
  margin-top: 10px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.kw-tag {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 6px;
  background: var(--bg-elevated);
  color: var(--text-secondary);
}

.kw-links {
  margin-top: 10px;
  font-size: 12px;
  color: var(--violet-text);
  cursor: pointer;
}

/* 表单弹层 */
.form-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 12px;
}

.ntype-row {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.ntype-pill {
  padding: 5px 14px;
  border-radius: 999px;
  font-size: 13px;
  border: 1px solid var(--accent-border);
  background: var(--bg-elevated);
  color: var(--text-secondary);
  cursor: pointer;
}

.ntype-pill.active {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-contrast);
  font-weight: 700;
}

.link-pick {
  margin: 12px 0;
  padding: 10px 12px;
  border: 1px dashed var(--accent-border);
  border-radius: 10px;
}

.link-pick-label {
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.link-empty {
  font-size: 12px;
  color: var(--text-muted);
}

.form-actions {
  margin-top: 8px;
}

/* 详情弹层 */
.dt-section { margin-bottom: 14px; }
.dt-label { font-size: 12px; color: var(--text-secondary); margin-bottom: 6px; }
.dt-link {
  font-size: 14px;
  color: var(--violet-text);
  padding: 6px 0;
  cursor: pointer;
  border-bottom: 1px solid var(--accent-border);
}

.loading-center {
  display: flex;
  justify-content: center;
  padding: 40px 0;
}
</style>
