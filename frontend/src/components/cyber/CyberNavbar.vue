<template>
  <div class="cyber-navbar">
    <div class="navbar-left" @click="$emit('back')">
      <svg v-if="showBack" class="back-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M15 18l-6-6 6-6"/>
      </svg>
      <slot name="left"></slot>
    </div>
    <div class="navbar-title">{{ title }}</div>
    <div class="navbar-right">
      <slot name="right"></slot>
    </div>
  </div>
</template>

<script setup>
defineProps({
  title: { type: String, default: '' },
  showBack: { type: Boolean, default: false }
})
defineEmits(['back'])
</script>

<style scoped>
.cyber-navbar {
  position: sticky;
  top: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 56px;
  padding: 0 16px;
  background: rgba(10, 10, 15, 0.92);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-bottom: 1px solid rgba(0, 245, 255, 0.15);
}

.navbar-left {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 60px;
  color: #00f5ff;
  cursor: pointer;
  transition: all 0.2s;
}

.navbar-left:hover {
  color: #fff;
  text-shadow: 0 0 8px rgba(0, 245, 255, 0.6);
}

.back-icon {
  width: 20px;
  height: 20px;
}

.navbar-title {
  flex: 1;
  text-align: center;
  font-family: 'Orbitron', 'Courier New', monospace;
  font-size: 15px;
  font-weight: 700;
  color: #e8e8f0;
  letter-spacing: 1px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.navbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 60px;
  justify-content: flex-end;
}
</style>
