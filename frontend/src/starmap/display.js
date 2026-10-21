import { DISPLAY_DEFAULTS } from './universe.js'

const KEY = 'starmap.display'

/** 读"记住过的"显示设置；坏数据或类型不对的项一律当没存过 */
export function loadDisplay() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null')
    const out = { ...DISPLAY_DEFAULTS }
    if (!raw || typeof raw !== 'object') return out
    for (const k of Object.keys(DISPLAY_DEFAULTS)) {
      if (typeof raw[k] === typeof DISPLAY_DEFAULTS[k]) out[k] = raw[k]
    }
    return out
  } catch {
    return { ...DISPLAY_DEFAULTS }
  }
}

export function saveDisplay(v) {
  const out = {}
  for (const k of Object.keys(DISPLAY_DEFAULTS)) out[k] = v[k]
  localStorage.setItem(KEY, JSON.stringify(out))
}
