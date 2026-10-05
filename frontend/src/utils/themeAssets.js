/**
 * 画布/图表取色：canvas 与 echarts 不解析 CSS 变量，
 * 但主题的真相只有一份（tokens-*.css），所以这里把 :root 上的 token 读出来喂给它们，
 * 避免"改一处配色要改两个地方"。
 *
 * 缓存按主题失效：切主题后 CSS 变量本身已经变了，旧值必须作废。
 */
import { appearance } from './theme.js'

let cachedTheme = null
const readCache = new Map()

export function cssToken(name) {
  if (cachedTheme !== appearance.theme) {
    cachedTheme = appearance.theme
    readCache.clear()
  }
  if (!readCache.has(name)) {
    readCache.set(name, getComputedStyle(document.documentElement).getPropertyValue(name).trim())
  }
  return readCache.get(name)
}

/** 直接可用的颜色（token 值本身就是 #rrggbb / rgb(...) 形式） */
export function canvasColor(tokenName) {
  return cssToken(tokenName) || '#000'
}

/**
 * 三元组 token（形如 "0 245 255"）→ canvas 能吃的 rgba 字符串。
 * 三元组是给"同一色相不同强度"用的一个 token 覆盖多个 alpha 的写法。
 */
export function canvasAlpha(tokenName, alpha) {
  const parts = cssToken(tokenName).split(/[\s,]+/).map(Number)
  if (parts.length < 3 || parts.some(Number.isNaN)) return `rgba(0, 0, 0, ${alpha})`
  return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${alpha})`
}
