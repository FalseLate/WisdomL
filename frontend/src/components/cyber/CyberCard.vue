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
  accentColor: { type: String, default: 'var(--accent)' },
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
  background: var(--bg-card);
  border: 1px solid var(--hairline);
  border-radius: 16px;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  overflow: hidden;
  transition: all 0.35s cubic-bezier(0.16, 1, 0.3, 1);
}

.cyber-card.hoverable:hover {
  transform: translateY(-3px);
  border-color: var(--accent-border);
  background: var(--bg-card);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.12), 0 0 0 1px var(--hairline);
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
