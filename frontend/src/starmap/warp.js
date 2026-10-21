import { ref } from 'vue'

/** 全局入场覆盖层：首页触发，星图首帧就绪后才淡出；这样不会出现第二块黑屏 */
const active = ref(false)
const leaving = ref(false)

const MIN_MS = 1100
const FADE_MS = 520
const SAFETY_MS = 15000

let startedAt = 0
let minTimer = 0
let hideTimer = 0
let safetyTimer = 0

function reducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

function clearTimers() {
  clearTimeout(minTimer); minTimer = 0
  clearTimeout(hideTimer); hideTimer = 0
  clearTimeout(safetyTimer); safetyTimer = 0
}

export function beginWarp() {
  if (reducedMotion()) return false
  if (active.value && !leaving.value) return true
  clearTimers()
  active.value = true
  leaving.value = false
  startedAt = performance.now()
  // 万一路由/初始化异常，不能让覆盖层永远盖住页面
  safetyTimer = setTimeout(cancelWarp, SAFETY_MS)
  return true
}

export function finishWarp() {
  if (!active.value) return
  const wait = Math.max(0, MIN_MS - (performance.now() - startedAt))
  clearTimeout(minTimer)
  minTimer = setTimeout(() => {
    leaving.value = true
    clearTimeout(hideTimer)
    hideTimer = setTimeout(() => {
      active.value = false
      leaving.value = false
      clearTimers()
    }, FADE_MS)
  }, wait)
}

export function cancelWarp() {
  clearTimers()
  active.value = false
  leaving.value = false
}

export { active, leaving }
