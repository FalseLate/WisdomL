<template>
  <div class="cyber-card" :class="{ hoverable: hoverable }" :style="cardStyle">
    <div v-if="accentLine" class="card-accent-line" :style="{ background: accentColor }"></div>
    <slot></slot>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  hoverable: { type: Boolean, default: true },
  accentColor: { type: String, default: '#00f5ff' },
  accentLine: { type: Boolean, default: false },
  padding: { type: String, default: '20px' }
})

const cardStyle = computed(() => ({
  padding: props.padding
}))
</script>

<style scoped>
.cyber-card {
  position: relative;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(0, 245, 255, 0.15);
  border-radius: 16px;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  overflow: hidden;
  transition: all 0.35s cubic-bezier(0.16, 1, 0.3, 1);
}

.cyber-card.hoverable:hover {
  transform: translateY(-3px);
  border-color: rgba(0, 245, 255, 0.4);
  background: rgba(0, 245, 255, 0.04);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.3), 0 0 24px rgba(0, 245, 255, 0.1);
}

.card-accent-line {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  opacity: 0;
  transition: opacity 0.3s;
}

.cyber-card.hoverable:hover .card-accent-line {
  opacity: 1;
}
</style>
