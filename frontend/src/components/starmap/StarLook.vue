<template>
  <div class="block">
    <div class="block-title">外观 · 大小与发光</div>
    <div class="block-title mt">大小 {{ sizeNow.toFixed(2) }}× <span class="look-range">0.30–3.00</span></div>
    <input type="range" class="range" min="0.3" max="3" step="0.05" :value="sizeNow"
           aria-label="节点大小"
           @input="preview({ size: Number($event.target.value) })"
           @change="commit({ size: Number($event.target.value) })">
    <div class="block-title mt">发光 {{ glowNow.toFixed(2) }}×</div>
    <input type="range" class="range" min="0" max="1.8" step="0.05" :value="glowNow"
           aria-label="节点发光"
           @input="preview({ glow: Number($event.target.value) })"
           @change="commit({ glow: Number($event.target.value) })">
    <template v-if="node.kind === 'topic'">
      <div class="block-title mt">表面纹理</div>
      <div class="btns">
        <button v-for="p in PATTERNS" :key="p.key" class="btn" :class="{ on: patternNow === p.key }"
                type="button" @click="commit({ pattern: p.key })">{{ p.label }}</button>
      </div>
    </template>
    <div class="btns">
      <button class="btn" type="button" @click="$emit('reset')">恢复默认外观</button>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'

const props = defineProps({ node: { type: Object, required: true } })
const emit = defineEmits(['preview', 'commit', 'reset'])

const PATTERNS = [
  { key: 'banded', label: '条纹' },
  { key: 'smooth', label: '纯色' },
  { key: 'cloudy', label: '云雾' }
]

const sizeNow = ref(1)
const glowNow = ref(1)
const patternNow = ref('banded')

watch(() => props.node, n => {
  sizeNow.value = n?.size ?? 1
  glowNow.value = n?.glow ?? 1
  patternNow.value = n?.pattern || 'banded'
}, { immediate: true })

function preview(patch) {
  if ('size' in patch) sizeNow.value = patch.size
  if ('glow' in patch) glowNow.value = patch.glow
  emit('preview', patch)
}
function commit(patch) {
  if ('pattern' in patch) patternNow.value = patch.pattern
  emit('commit', patch)
}
</script>

<style scoped>
.look-range {
  float: right;
  font-size: 10px;
  font-weight: 400;
  letter-spacing: 0;
  color: var(--text-muted);
}
</style>
