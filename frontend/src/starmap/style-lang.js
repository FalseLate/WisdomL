/**
 * 线的可调项与默认值。
 * 默认值只是"第一次见到这条线时长什么样"，不构成语义约束——用户可以把任意一条线改成任意线型。
 * 颜色一律是主题 token 名，切深浅时自己跟。
 */

export const PALETTE = [
  { token: '--accent', name: '青' },
  { token: '--violet', name: '紫' },
  { token: '--sky-text', name: '天蓝' },
  { token: '--emerald-text', name: '翠绿' },
  { token: '--orange', name: '橙' },
  { token: '--coral-text', name: '珊瑚' },
  { token: '--indigo', name: '靛' },
  { token: '--secondary', name: '品红' },
  { token: '--success', name: '绿' },
  { token: '--warning', name: '黄' }
]

export const LINE_STYLES = [
  { key: 'solid', label: '实线' },
  { key: 'dashed', label: '虚线' },
  { key: 'dotted', label: '点线' }
]

export const WIDTH_RANGE = { min: 0.5, max: 3, step: 0.25 }
export const OPACITY_RANGE = { min: 0.2, max: 1, step: 0.05 }

/** 层级=归属这件事已经发生；共现=错题真的同时考到；两者都是事实 → 实线。语义=谁先谁后的主张 → 虚线带方向。 */
const EDGE_DEFAULTS = {
  hier: { lineStyle: 'solid', arrow: false },
  cooc: { lineStyle: 'solid', arrow: false },
  ai: { lineStyle: 'dashed', arrow: true }
}

export function defaultEdgeStyle(type) {
  const d = EDGE_DEFAULTS[type] || EDGE_DEFAULTS.ai
  // flowDir：光点沿线移动的方向。1 正向（from→to），-1 反向，0 关闭
  return { lineStyle: d.lineStyle, arrow: d.arrow, color: null, width: 1, opacity: null, hidden: false, flowDir: 1 }
}

/** 覆盖层与默认值合并；hidden 单独判，因为 false 也是有效覆盖 */
export function resolveStyle(type, override) {
  return { ...defaultEdgeStyle(type), ...(override || {}) }
}

export const REL_OPTIONS = [
  { key: '先修', label: '先修（学它得先学另一个）' },
  { key: '依赖', label: '依赖（要用到另一个的结论）' },
  { key: '关联', label: '关联（只是我总觉得有关系）' }
]
