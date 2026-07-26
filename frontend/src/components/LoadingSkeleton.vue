<template>
  <div class="skeleton-list">
    <div v-for="i in 3" :key="i" class="skeleton-card">
      <div class="sk-line w-30"></div>
      <div class="sk-line w-80"></div>
      <div class="sk-line w-60"></div>
      <div class="sk-options">
        <div class="sk-line w-40" v-for="j in 4" :key="j"></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.skeleton-list { padding: 0; }
.skeleton-card { background: #fff; border-radius: 16px; padding: 20px; margin-bottom: 12px; box-shadow: 0 2px 12px rgba(0,0,0,0.04); }
.sk-line { height: 14px; border-radius: 7px; background: linear-gradient(90deg, #eee 25%, #f5f5f5 50%, #eee 75%); background-size: 200% 100%; animation: shimmer 1.5s infinite; margin-bottom: 10px; }
.sk-options { margin-top: 14px; }
.sk-options .sk-line { height: 12px; }
.w-30 { width: 30%; }
.w-40 { width: 40%; }
.w-60 { width: 60%; }
.w-80 { width: 80%; }
@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
</style>
