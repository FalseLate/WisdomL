/**
 * 主题/外观状态的单一来源：写 <html data-theme> 并广播给所有入口图标与背景组件。
 * 色板在 style.css 的 :root[data-theme="light"]，硬编码补丁在 styles/theme-light.css。
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

function write() {
  document.documentElement.dataset.theme = appearance.theme
}

/** 背景动效实际生效档位：auto 时浅色走中性灰、深色走霓虹 */
export function motionMode() {
  if (appearance.motion !== 'auto') return appearance.motion
  return appearance.theme === 'light' ? 'calm' : 'neon'
}

function syncFromSettings() {
  const f = loadSettings().feedback
  appearance.theme = f.theme === 'light' ? 'light' : 'dark'
  appearance.motion = f.motion || 'auto'
  write()
}

export function initTheme() {
  write()
  onSettingsChange(syncFromSettings)
}

function patchFeedback(patch) {
  saveSettings({ feedback: { ...loadSettings().feedback, ...patch } })
}

/** 一键切换并持久化，返回切换后的主题 */
export function toggleTheme() {
  setTheme(appearance.theme === 'light' ? 'dark' : 'light')
  return appearance.theme
}

export function setTheme(t) {
  patchFeedback({ theme: t === 'light' ? 'light' : 'dark' })
}

export function setMotion(m) {
  const allowed = ['auto', 'off', 'calm', 'neon']
  patchFeedback({ motion: allowed.includes(m) ? m : 'auto' })
}

export function themeIsLight() {
  return appearance.theme === 'light'
}
