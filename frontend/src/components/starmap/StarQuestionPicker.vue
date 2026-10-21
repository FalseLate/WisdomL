<template>
  <div class="wq-mask" @click.self="$emit('close')">
    <section class="wq-card" role="dialog" aria-modal="true" :aria-label="title">
      <header class="wq-head">
        <div>
          <h3>{{ title }}</h3>
          <p class="wq-sub">{{ hint }}</p>
        </div>
        <button class="wq-x" type="button" aria-label="关闭" @click="$emit('close')">×</button>
      </header>

      <div class="wq-tabs" role="tablist" aria-label="错题范围">
        <button type="button" role="tab" :aria-selected="tab === 'all'" :class="{ on: tab === 'all' }" @click="setTab('all')">
          全部错题（{{ allList.length }}）
        </button>
        <button v-if="showToday" type="button" role="tab" :aria-selected="tab === 'today'" :class="{ on: tab === 'today' }" @click="setTab('today')">
          今日复习（{{ todayList.length }}）
        </button>
      </div>

      <div class="wq-tools">
        <input ref="searchEl" v-model="q" class="wq-search" type="search" placeholder="搜题干关键词" aria-label="搜索错题">
        <button v-if="multiple" class="wq-mini" type="button" @click="togglePage">
          {{ pageAllSelected ? '取消本页' : '全选本页' }}
        </button>
      </div>

      <div class="wq-list" role="list">
        <label v-for="item in pageItems" :key="item.id" class="wq-row" :class="{ on: selected.has(item.id) }">
          <input :type="multiple ? 'checkbox' : 'radio'" :checked="selected.has(item.id)" @change="toggle(item)">
          <span class="wq-main">
            <span class="wq-txt">{{ item.txt }}</span>
            <span v-if="item.meta" class="wq-meta">{{ item.meta }}</span>
          </span>
        </label>
        <p v-if="!filtered.length" class="wq-empty">没有可选的错题</p>
      </div>

      <footer class="wq-foot">
        <span class="wq-count">
          {{ multiple ? `已选 ${selected.size} / ${max} 道` : selected.size ? '已选 1 道' : '请选择' }}
          <template v-if="error">{{ error }}</template>
        </span>
        <div class="wq-pager">
          <button type="button" :disabled="page <= 1" @click="page--">上一页</button>
          <span>{{ page }} / {{ pageCount }}</span>
          <button type="button" :disabled="page >= pageCount" @click="page++">下一页</button>
        </div>
        <div class="wq-actions">
          <button class="wq-btn" type="button" @click="$emit('close')">取消</button>
          <button class="wq-btn primary" type="button" :disabled="!selected.size" @click="confirm">{{ confirmLabel }}</button>
        </div>
      </footer>
    </section>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'

const props = defineProps({
  title: { type: String, default: '选择错题' },
  hint: { type: String, default: '' },
  questions: { type: Array, default: () => [] },
  todayQuestions: { type: Array, default: () => [] },
  showToday: { type: Boolean, default: true },
  multiple: { type: Boolean, default: false },
  max: { type: Number, default: 15 },
  confirmLabel: { type: String, default: '确定' }
})
const emit = defineEmits(['close', 'confirm'])

const PAGE_SIZE = 8
const tab = ref('all')
const q = ref('')
const page = ref(1)
const selected = ref(new Set())
const error = ref('')
const searchEl = ref(null)
const allList = computed(() => props.questions)
const todayList = computed(() => props.todayQuestions)

const base = computed(() => (tab.value === 'today' ? todayList.value : allList.value))
const filtered = computed(() => {
  const needle = q.value.trim().toLowerCase()
  return !needle ? base.value : base.value.filter(item => String(item.txt || '').toLowerCase().includes(needle))
})
const pageCount = computed(() => Math.max(1, Math.ceil(filtered.value.length / PAGE_SIZE)))
const pageItems = computed(() => filtered.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE))
const pageAllSelected = computed(() => pageItems.value.length > 0 && pageItems.value.every(item => selected.value.has(item.id)))

watch([tab, q], () => { page.value = 1; error.value = '' })
watch(pageCount, n => { if (page.value > n) page.value = n })

function setTab(next) {
  tab.value = next
  selected.value = new Set()
}

function toggle(item) {
  const next = new Set(selected.value)
  if (next.has(item.id)) {
    next.delete(item.id)
  } else {
    if (props.multiple && next.size >= props.max) {
      error.value = `最多选 ${props.max} 道`
      return
    }
    if (!props.multiple) next.clear()
    next.add(item.id)
  }
  error.value = ''
  selected.value = next
}

function togglePage() {
  const next = new Set(selected.value)
  if (pageAllSelected.value) {
    for (const item of pageItems.value) next.delete(item.id)
  } else {
    for (const item of pageItems.value) {
      if (!props.multiple && next.size >= 1) break
      if (next.size >= props.max) break
      next.add(item.id)
    }
  }
  selected.value = next
  error.value = ''
}

function confirm() {
  const ids = [...selected.value]
  if (!ids.length) return
  emit('confirm', ids)
}

function onKey(ev) {
  if (ev.key === 'Escape') emit('close')
}
onMounted(async () => {
  window.addEventListener('keydown', onKey)
  await nextTick()
  searchEl.value?.focus()
})
onUnmounted(() => window.removeEventListener('keydown', onKey))
</script>

<style scoped>
.wq-mask {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 18px;
  background: var(--scrim);
  backdrop-filter: blur(3px);
}
.wq-card {
  display: flex;
  flex-direction: column;
  width: min(600px, 94vw);
  max-height: 80vh;
  padding: 16px;
  background: var(--surface-solid);
  border: 1px solid var(--accent-border);
  border-radius: var(--radius-card);
  box-shadow: var(--hud-shadow);
}
.wq-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.wq-head h3 { margin: 0; font-family: var(--font-display); font-size: 15px; color: var(--text-primary); }
.wq-sub { margin: 5px 0 0; font-size: 11px; line-height: 1.5; color: var(--text-muted); }
.wq-x { border: 0; background: none; color: var(--text-muted); font-size: 22px; line-height: 1; cursor: pointer; }
.wq-x:hover { color: var(--accent); }
.wq-tabs { display: flex; gap: 5px; margin-top: 12px; padding: 3px; border-radius: var(--radius-pill); background: var(--bg-card); border: 1px solid var(--hairline); }
.wq-tabs button { flex: 1; height: 28px; border: 0; border-radius: var(--radius-pill); background: transparent; color: var(--text-secondary); font: inherit; font-size: 12px; cursor: pointer; }
.wq-tabs button.on { color: var(--accent); background: var(--accent-soft); }
.wq-tools { display: flex; gap: 8px; margin-top: 10px; }
.wq-search { flex: 1; height: 32px; padding: 0 10px; border-radius: var(--radius-sm); border: 1px solid var(--accent-border); background: var(--bg-elevated); color: var(--text-primary); font: inherit; font-size: 12px; }
.wq-mini { height: 32px; padding: 0 10px; border-radius: var(--radius-pill); border: 1px solid var(--accent-border); background: var(--bg-card); color: var(--text-secondary); font: inherit; font-size: 11px; white-space: nowrap; cursor: pointer; }
.wq-list { flex: 1; min-height: 120px; margin-top: 8px; overflow: auto; border-top: 1px solid var(--hairline); }
.wq-row { display: flex; align-items: flex-start; gap: 9px; padding: 9px 3px; border-bottom: 1px solid var(--hairline); cursor: pointer; }
.wq-row:hover { background: var(--bg-hover); }
.wq-row input { margin-top: 3px; accent-color: var(--accent); }
.wq-main { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.wq-txt { font-size: 12px; line-height: 1.5; color: var(--text-primary); word-break: break-word; }
.wq-row.on .wq-txt { color: var(--accent); }
.wq-meta { font-size: 10px; color: var(--text-muted); }
.wq-empty { margin: 24px 0; text-align: center; color: var(--text-muted); font-size: 12px; }
.wq-foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; padding-top: 10px; }
.wq-count { font-size: 11px; color: var(--text-muted); }
.wq-pager { display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--text-muted); }
.wq-pager button { border: 1px solid var(--accent-border); background: var(--bg-card); color: var(--text-secondary); border-radius: var(--radius-pill); height: 26px; padding: 0 8px; font: inherit; font-size: 10px; cursor: pointer; }
.wq-pager button:disabled { opacity: .4; cursor: default; }
.wq-actions { display: flex; gap: 6px; }
.wq-btn { height: 30px; padding: 0 12px; border-radius: var(--radius-pill); border: 1px solid var(--accent-border); background: var(--bg-card); color: var(--text-secondary); font: inherit; font-size: 12px; cursor: pointer; }
.wq-btn.primary { color: var(--accent-contrast); background: linear-gradient(135deg, var(--accent), var(--accent-deep)); border-color: transparent; }
.wq-btn:disabled { opacity: .45; cursor: default; }
@media (max-width: 560px) {
  .wq-card { max-height: 86vh; }
  .wq-foot { align-items: flex-start; flex-direction: column; }
  .wq-actions { width: 100%; justify-content: flex-end; }
}
</style>
