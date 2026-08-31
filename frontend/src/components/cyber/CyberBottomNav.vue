<template>
  <div class="cyber-bottom-nav">
    <div
      v-for="item in items"
      :key="item.path"
      class="nav-item"
      :class="{ active: isActive(item.path) }"
      @click="navigate(item.path)"
    >
      <span class="nav-icon">{{ item.icon }}</span>
      <span class="nav-label">{{ item.label }}</span>
    </div>
  </div>
</template>

<script setup>
import { useRoute, useRouter } from 'vue-router'

const props = defineProps({
  items: {
    type: Array,
    required: true,
    default: () => []
  }
})

const route = useRoute()
const router = useRouter()

function isActive(path) {
  return route.path === path
}

function navigate(path) {
  if (route.path !== path) {
    router.push(path)
  }
}
</script>

<style scoped>
.cyber-bottom-nav {
  position: fixed;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 100%;
  max-width: 480px;
  padding: 10px 16px calc(10px + env(safe-area-inset-bottom));
  background: rgba(10, 10, 15, 0.92);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-top: 1px solid rgba(0, 245, 255, 0.15);
  display: flex;
  justify-content: space-around;
  z-index: 50;
}

.nav-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 6px 14px;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  color: #555566;
}

.nav-item.active {
  color: #00f5ff;
  background: rgba(0, 245, 255, 0.1);
}

.nav-item.active .nav-icon {
  filter: drop-shadow(0 0 6px #00f5ff);
  transform: translateY(-1px);
}

.nav-icon {
  font-size: 18px;
  transition: all 0.2s;
}

.nav-label {
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.5px;
}
</style>
