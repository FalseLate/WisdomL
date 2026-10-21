<template>
  <div class="sm-pop" role="dialog" aria-label="显示设置">
    <div class="sm-pop-head">
      <span>显示</span>
      <button class="sm-x" type="button" aria-label="关闭" @click="$emit('close')">×</button>
    </div>
    <label class="sm-row">
      <span>亮度 / 辉光</span>
      <input type="range" min="0" max="1.6" step="0.05" :value="v.glow" aria-label="亮度" @input="set('glow', $event)">
      <em>{{ Math.round(v.glow * 100) }}%</em>
    </label>
    <label class="sm-row">
      <span>节点大小</span>
      <input type="range" min="0.5" max="1.8" step="0.05" :value="v.nodeSize" aria-label="节点大小" @input="set('nodeSize', $event)">
      <em>{{ v.nodeSize.toFixed(2) }}×</em>
    </label>
    <label class="sm-row">
      <span>线的粗细</span>
      <!-- 线粗要重建几何，松手才算 -->
      <input type="range" min="0.4" max="2.4" step="0.05" :value="v.linkWidth" aria-label="线的粗细" @change="set('linkWidth', $event)">
      <em>{{ v.linkWidth.toFixed(2) }}×</em>
    </label>
    <div class="sm-row">
      <span>名字</span>
      <div class="sm-seg">
        <button type="button" :class="{ on: v.labels === 'auto' }" @click="patch({ labels: 'auto' })">按远近渐显</button>
        <button type="button" :class="{ on: v.labels === 'all' }" @click="patch({ labels: 'all' })">全部显示</button>
      </div>
    </div>
    <div class="sm-row">
      <span>动效</span>
      <div class="sm-seg">
        <button type="button" :class="{ on: v.flows }" @click="patch({ flows: !v.flows })">沿线光点</button>
        <button type="button" :class="{ on: v.dust }" @click="patch({ dust: !v.dust })">深空星尘</button>
      </div>
    </div>
    <div class="sm-row">
      <span>画质</span>
      <div class="sm-seg">
        <button type="button" :class="{ on: v.quality === 'auto' }" @click="patch({ quality: 'auto' })">自动</button>
        <button type="button" :class="{ on: v.quality === 'high' }" @click="patch({ quality: 'high' })">精细</button>
        <button type="button" :class="{ on: v.quality === 'low' }" @click="patch({ quality: 'low' })">流畅</button>
      </div>
    </div>
    <p class="sm-note">{{ dirty ? '这些改动现在只在这一次打开里生效。' : '当前就是已记住的设置。' }}</p>
    <div class="sm-btns">
      <button class="sm-btn primary" type="button" :disabled="!dirty" @click="remember">记住这套设置</button>
      <button class="sm-btn" type="button" @click="reset">恢复默认</button>
    </div>
  </div>
</template>

<script setup>
import { computed, reactive } from 'vue'
import { DISPLAY_DEFAULTS } from '../../starmap/universe.js'
import { loadDisplay, saveDisplay } from '../../starmap/display.js'

const props = defineProps({ value: { type: Object, required: true } })
const emit = defineEmits(['change', 'close'])

const v = reactive({ ...props.value })
const saved = reactive(loadDisplay())

const dirty = computed(() => Object.keys(DISPLAY_DEFAULTS).some(k => v[k] !== saved[k]))

function patch(p) {
  Object.assign(v, p)
  emit('change', p)
}
function set(key, ev) { patch({ [key]: Number(ev.target.value) }) }
function remember() {
  saveDisplay(v)
  Object.assign(saved, v)
}
function reset() { patch({ ...DISPLAY_DEFAULTS }) }
</script>

<style>
.sm-pop {
  position: absolute;
  top: 62px;
  left: 14px;
  width: 340px;
  padding: 12px 14px;
  background: var(--surface-solid);
  border: 1px solid var(--accent-border);
  border-radius: var(--radius-card);
  box-shadow: var(--hud-shadow);
  z-index: 30;
  font-size: 12px;
  color: var(--text-secondary);
}
.sm-pop-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; font-size: 13px; color: var(--text-primary); font-weight: 600; }
.sm-x { border: 0; background: none; color: var(--text-muted); font-size: 18px; cursor: pointer; line-height: 1; }
.sm-x:hover { color: var(--accent); }
.sm-row { display: grid; grid-template-columns: 76px 1fr 44px; align-items: center; gap: 8px; min-height: 34px; }
.sm-row input[type="range"] { width: 100%; accent-color: var(--accent); cursor: pointer; }
.sm-row em { font-style: normal; color: var(--text-muted); text-align: right; font-variant-numeric: tabular-nums; }
.sm-seg { grid-column: 2 / 4; display: flex; gap: 6px; flex-wrap: wrap; }
.sm-seg button, .sm-btn {
  height: 28px;
  padding: 0 10px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--accent-border);
  background: var(--bg-card);
  color: var(--text-secondary);
  font: inherit;
  cursor: pointer;
}
.sm-seg button.on { color: var(--accent); border-color: var(--accent); background: var(--accent-soft); }
.sm-note { margin: 8px 0 0; color: var(--text-muted); font-size: 11px; }
.sm-btns { display: flex; gap: 6px; margin-top: 8px; }
.sm-btn.primary { color: var(--accent-contrast); background: linear-gradient(135deg, var(--accent), var(--accent-deep)); border-color: transparent; }
.sm-btn[disabled] { opacity: 0.45; cursor: default; }
</style>
