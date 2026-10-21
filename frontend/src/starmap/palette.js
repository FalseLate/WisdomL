/**
 * 星图取色：three.js 要 0..1 的分量，而 CSS 变量只活在样式里，
 * 所以这里把 token 文本解析成数值。颜色真相仍然只有 tokens-*.css 一份，
 * 本文件不出现任何色值字面量（唯一的白色是光晕贴图的中性遮罩，颜色由材质乘上去）。
 */
import { cssToken } from '../utils/themeAssets.js'
import { appearance } from '../utils/theme.js'

const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i
const cache = new Map()
let cachedTheme = null

/** token 文本 → {r,g,b,a}，支持 #hex / rgb() / rgba() / "r g b" 三元组 */
export function parseColor(text) {
  const s = String(text || '').trim()
  if (!s) return { r: 0, g: 0, b: 0, a: 1 }
  if (HEX.test(s)) {
    const h = s.slice(1)
    const at = (i, n = 2) => parseInt(h.slice(i, i + n), 16) / 255
    if (h.length === 3 || h.length === 4) {
      return { r: at(0, 1), g: at(1, 1), b: at(2, 1), a: h.length === 4 ? at(3, 1) : 1 }
    }
    return { r: at(0), g: at(2), b: at(4), a: h.length === 8 ? at(6) : 1 }
  }
  const nums = s
    .replace(/^rgba?\(/i, '')
    .replace(/[(),]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(Number)
  if (nums.length >= 3 && nums.every(n => !Number.isNaN(n))) {
    return { r: nums[0] / 255, g: nums[1] / 255, b: nums[2] / 255, a: nums.length >= 4 ? nums[3] : 1 }
  }
  return { r: 0, g: 0, b: 0, a: 1 }
}

export function tokenRGBA(name) {
  if (cachedTheme !== appearance.theme) {
    cachedTheme = appearance.theme
    cache.clear()
  }
  if (!cache.has(name)) cache.set(name, parseColor(cssToken(name)))
  return cache.get(name)
}

/** 用户存的是 token 名；空值或解析不出时回落到默认色 */
export function rgbaOf(tokenName, fallback) {
  if (!tokenName) return fallback
  const c = tokenRGBA(tokenName)
  return c.r + c.g + c.b > 0 ? c : fallback
}

export function mix(a, b, t) {
  return {
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
    a: a.a + (b.a - a.a) * t
  }
}
