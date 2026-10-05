/**
 * 主题/外观状态的单一来源：写 <html data-theme> 并广播给所有入口图标与背景组件。
 * 色板在 styles/tokens-dark.css 与 styles/tokens-light.css；
 * 浅色"换手法不换结构"的规则在 styles/effects-light.css；
 * canvas/echarts 取色走 utils/themeAssets.js。
 */
import { reactive } from 'vue'
import { loadSettings, saveSettings, onSettingsChange } from '../a11y/settings.js'

function current() {
  return loadSettings().feedback.theme === 'light' ? 'light' : 'dark'
}

/** 全站共享的外观状态；入口按钮、粒子组件都读这一份，避免各页自留局部 ref 变脏 */
export const appearance = reactive({
  theme: current(),
  motion: loadSettings().feedback.motion || 'auto'
})

function prefersReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

function writeTheme(t) {
  document.documentElement.dataset.theme = t
}

/**
 * 主题切换的唯一入口。传 origin（点击处坐标）且浏览器支持 View Transition 时，
 * 从该点做一次圆形扩散 —— 深浅是两套视觉语言（发光 ↔ 描边），硬切会闪眼。
 * 关键：改 DOM 必须发生在 startViewTransition 的回调里；若在之前改，
 * 旧快照拿到的已经是新主题，动画就"什么都看不到"。
 */
function switchTheme(next, origin) {
  const root = document.documentElement
  if (!origin || !root.startViewTransition || prefersReducedMotion()) {
    patchFeedback({ theme: next })
    return next
  }
  const box = root.getBoundingClientRect()
  const x = origin.x ?? box.width
  const y = origin.y ?? 0
  root.style.setProperty('--vt-x', `${Math.round(x)}px`)
  root.style.setProperty('--vt-y', `${Math.round(y)}px`)
  // 半径取"到最远角落"的距离，保证扩散一定铺满全屏
  root.style.setProperty('--vt-r', `${Math.round(Math.hypot(Math.max(x, box.width - x), Math.max(y, box.height - y)))}px`)
  root.startViewTransition(() => patchFeedback({ theme: next }))
  return next
}

/** 从点击事件取扩散原点；键盘触发时 clientX/Y 为 0，退回按钮中心 */
export function originFromEvent(e) {
  if (e?.clientX && e?.clientY) return { x: e.clientX, y: e.clientY }
  const el = e?.currentTarget || e?.target
  const r = el?.getBoundingClientRect?.()
  if (r && r.width) return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  return { x: window.innerWidth, y: 0 }
}

/** 背景动效实际生效档位：auto 时浅色直接关（中性灰粒子在白底上几乎看不见，还费电），深色走霓虹 */
export function motionMode() {
  if (appearance.motion !== 'auto') return appearance.motion
  return appearance.theme === 'light' ? 'off' : 'neon'
}

function syncFromSettings() {
  const f = loadSettings().feedback
  appearance.theme = f.theme === 'light' ? 'light' : 'dark'
  appearance.motion = f.motion || 'auto'
  writeTheme(appearance.theme)
}

export function initTheme() {
  writeTheme(current())
  onSettingsChange(syncFromSettings)
}

function patchFeedback(patch) {
  saveSettings({ feedback: { ...loadSettings().feedback, ...patch } })
}

/** 一键切换并持久化，返回切换后的主题；传 origin 时带扩散动画 */
export function toggleTheme(origin = null) {
  return setTheme(appearance.theme === 'light' ? 'dark' : 'light', origin)
}

export function setTheme(t, origin = null) {
  return switchTheme(t === 'light' ? 'light' : 'dark', origin)
}

export function setMotion(m) {
  const allowed = ['auto', 'off', 'calm', 'neon']
  patchFeedback({ motion: allowed.includes(m) ? m : 'auto' })
}

export function themeIsLight() {
  return appearance.theme === 'light'
}
