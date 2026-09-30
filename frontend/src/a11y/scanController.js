/**
 * 扫描模式状态机（纯逻辑，零 DOM，可 Node 自测 / Playwright fake timers）
 *
 * 用户只需一个二值命中信号（confirm：点头/握拳/挥肘/长按空格任选，设置页重映射）。
 * 游标按 dwell 自动前进循环；命中即选中当前项。
 * items 由视图提供：[...选项, 上一题, 下一题, 清空, 提交, 取消]
 */

export const SCAN_NAV_ITEMS = [
  { id: 'prev', label: '上一题' },
  { id: 'next', label: '下一题' },
  { id: 'clear', label: '清空' },
  { id: 'submit', label: '提交' }
]

/**
 * @param {Object} opts
 * @param {() => Array} opts.getItems 当前扫描格列表（含选项+动作格）
 * @param {(item, index) => void} opts.onHit 命中回调
 * @param {() => number} [opts.now]
 */
export function createScanController({ getItems, onHit, now = () => performance.now() }) {
  let active = false
  let idx = 0
  let t0 = 0
  let graceUntil = 0        // 刚开启/刚命中后的宽限期，防止同一信号连发

  function start(graceMs = 600) {
    active = true
    idx = 0
    t0 = now()
    graceUntil = t0 + graceMs
  }

  function stop() { active = false }

  function isActive() { return active }

  /** 每帧调用：dwell 走满自动前进。返回当前游标供渲染 */
  function tick(dwellMs, nowMs = now()) {
    if (!active) return { index: -1, progress: 0 }
    const n = getItems().length
    if (!n) return { index: -1, progress: 0 }
    let elapsed = nowMs - t0
    while (elapsed >= dwellMs) {
      elapsed -= dwellMs
      idx = (idx + 1) % n
      t0 += dwellMs
    }
    return { index: idx, progress: Math.min(1, elapsed / dwellMs) }
  }

  /** 命中信号（confirm 动作）进入此处 */
  function hit(dwellMs, nowMs = now()) {
    if (!active) return false
    if (nowMs < graceUntil) return true    // 宽限期内的信号丢弃
    const items = getItems()
    const item = items[idx]
    if (item) {
      // 命中后游标停在该项，稍作宽限再恢复扫描
      graceUntil = nowMs + 400
      t0 = nowMs - 0
      onHit(item, idx)
    }
    return true
  }

  /** 离屏/取消等外部事件可强制重置游标位置 */
  function resetCursor() { idx = 0; t0 = now() }

  return {
    start, stop, tick, hit, isActive, resetCursor,
    get index() { return idx }
  }
}
