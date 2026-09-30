/**
 * 无障碍设置层：全部持久化在 localStorage，不上后端。
 * 残障是个体化的：通道开关、灵敏度、动作重映射必须都能改，且可一键恢复默认。
 */

const KEY = 'zhifuxi_a11y_v1'  // 智复习主项目无障碍设置；默认映射变更必须升 key（防旧存档遮蔽新默认值）

export const ACTION_WORDS = [
  'selectA', 'selectB', 'selectC', 'selectD',
  'prev', 'next', 'clear', 'confirm', 'cancel', 'submit', 'undo',
  'optNext', 'optPrev'
]

// 各通道可重映射的候选 -> 默认动作（null 表示不映射）
export const DEFAULT_MAPPINGS = {
  hand: {
    'select:A': 'selectA',
    'select:B': 'selectB',
    'select:C': 'selectC',
    'select:D': 'selectD',
    prev: 'prev',
    next: 'next',
    clear: 'clear',
    submit: 'submit'        // 两阶段握拳状态机产出的最终事件
  },
  head: {
    turnLeft: 'prev',
    turnRight: 'next',
    nod: 'optNext',         // 点头=下一个选项（小幅快速"嗑"头，速度门控）
    smile: 'optPrev',       // 微笑=上一个选项（接替抬头，零颈部负担）
    mouthOpen: 'confirm',   // 张嘴=确认当前循环到的选项
    lookUp: null,           // 抬头已弃用（不再参与选答；如需可自行重映射）
    shake: 'undo'           // 摇头 = 撤销刚才的误触（ADHD 层）
  },
  arm: {
    'elbowUp:left': 'confirm',
    'elbowUp:right': 'confirm',
    handsUp: 'submit',      // 双手举过头合拢（倒V拱形）= 提交整卷
    sweep: 'next'
  }
}

export function defaultSettings() {
  return {
    channels: { hand: false, head: false, arm: false },
    sensitivity: { hand: 'normal', head: 'normal', arm: 'normal' },
    mappings: structuredClone(DEFAULT_MAPPINGS),
    scan: { enabled: false, dwell: 1200 },
    feedback: { theme: 'dark', fontSize: 'normal', reduceMotion: true, tts: false, debug: false },
    adhd: { enabled: true, offscreenPause: true, undoWindow: 3000, rhythmEvery: 5 }
  }
}

function mergeDeep(base, patch) {
  if (patch === null || typeof patch !== 'object') return patch === undefined ? base : patch
  const out = Array.isArray(base) ? [...base] : { ...base }
  for (const k of Object.keys(patch)) {
    out[k] = k in base ? mergeDeep(base[k], patch[k]) : patch[k]
  }
  return out
}

let cache = null

export function loadSettings() {
  if (cache) return cache
  try {
    const raw = localStorage.getItem(KEY)
    cache = raw ? mergeDeep(defaultSettings(), JSON.parse(raw)) : defaultSettings()
  } catch {
    cache = defaultSettings()
  }
  return cache
}

const listeners = new Set()

export function saveSettings(patch) {
  cache = mergeDeep(loadSettings(), patch)
  try { localStorage.setItem(KEY, JSON.stringify(cache)) } catch { /* 隐私模式忽略 */ }
  for (const fn of listeners) fn(cache)
  return cache
}

export function resetSettings() {
  cache = defaultSettings()
  try { localStorage.removeItem(KEY) } catch { /* noop */ }
  for (const fn of listeners) fn(cache)
  return cache
}

export function onSettingsChange(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
