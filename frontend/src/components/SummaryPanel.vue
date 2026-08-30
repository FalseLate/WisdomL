<template>
  <div class="summary card" v-if="total > 0">
    <div class="sum-row">
      <div class="sum-item"><span class="sum-num">{{ total }}</span>总题数</div>
      <div class="sum-item"><span class="sum-num obj">{{ objCount }}</span>客观题</div>
      <div class="sum-item"><span class="sum-num sub">{{ subCount }}</span>主观题</div>
      <div class="sum-item"><span class="sum-num">{{ textLen }}</span>原文·字</div>
    </div>
    <div class="progress-bar" v-if="total > 0">
      <div class="progress-obj" :style="{ width: objPct + '%' }"></div>
      <div class="progress-sub" :style="{ width: subPct + '%' }"></div>
    </div>
    <div class="progress-label"><span class="dot obj"></span>客观题 {{ objPct }}% <span class="dot sub"></span>主观题 {{ subPct }}%</div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  total: { type: Number, default: 0 },
  objCount: { type: Number, default: 0 },
  subCount: { type: Number, default: 0 },
  textLen: { type: Number, default: 0 }
})

const objPct = computed(() => props.total > 0 ? Math.round(props.objCount / props.total * 100) : 0)
const subPct = computed(() => props.total > 0 ? Math.round(props.subCount / props.total * 100) : 0)
</script>

<style scoped>
.summary { padding: 16px; margin-bottom: 12px; }
.sum-row { display: flex; justify-content: space-around; text-align: center; font-size: 12px; color: #999; margin-bottom: 12px; }
.sum-num { display: block; font-size: 24px; font-weight: 700; color: #2563eb; margin-bottom: 2px; }
.sum-num.obj { color: #2563eb; }
.sum-num.sub { color: #f59e0b; }
.progress-bar { display: flex; height: 8px; border-radius: 4px; overflow: hidden; background: #f0f0f0; }
.progress-obj { background: linear-gradient(90deg, #2563eb, #1e40af); transition: width .3s; }
.progress-sub { background: linear-gradient(90deg, #f59e0b, #ff6b6b); transition: width .3s; }
.progress-label { font-size: 11px; color: #999; margin-top: 4px; text-align: center; }
.dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin: 0 4px 0 8px; vertical-align: middle; }
.dot.obj { background: #2563eb; }
.dot.sub { background: #f59e0b; }
</style>
