/**
 * 无障碍答题运行时（懒人模式专用）：
 *  - 订阅 actionBus（替代旧 handleGesture 硬编码 switch），动作 -> handler 表由设置页映射决定
 *  - 步进选答：optNext 循环下一选项 / optPrev 循环上一选项（A 再退绕回 D）/ confirm 落子
 *  - 扫描模式：屏幕按钮或 S 键开关，游标扫选项+动作格，confirm 命中；顶部状态条显示游标位置
 *  - 键盘兜底：1-4/ABCD、←→、Enter、S、空格、U、Esc
 *  - ADHD 层：3s 撤销、离屏暂停计时（不惩罚不上报）、高亮 8s 空闲清空
 * 视图只需提供 callbacks（toggleOption/clearCurrent/prev/next/submit/...）。
 */
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { getRuntime } from '../a11y/runtime.js'
import { loadSettings } from '../a11y/settings.js'
import { createScanController, SCAN_NAV_ITEMS } from '../a11y/scanController.js'
import { cycleNext, cyclePrev } from '../a11y/cycle.js'

export function useA11yPractice(callbacks) {
  const { bus, manager } = getRuntime()
  const scanActive = ref(false)
  const cycleIdx = ref(-1)
  const scanCursor = ref({ index: -1, progress: 0 })
  const offscreenHold = ref(false)

  let lastCycleAt = 0
  let undoStack = []
  let unsub = null
  let rafId = null
  let pauseAt = 0

  const settings = () => loadSettings()

  function currentLetters() {
    return callbacks.letters()
  }

  function speak(text) {
    if (settings().feedback.tts && 'speechSynthesis' in window) {
      try {
        speechSynthesis.cancel()
        const u = new SpeechSynthesisUtterance(text)
        u.lang = 'zh-CN'
        speechSynthesis.speak(u)
      } catch { /* ignore */ }
    }
  }

  // ---------- 步进选答 ----------
  function cycleOption(delta) {
    if (callbacks.isDone()) return
    const letters = currentLetters()
    if (!letters.length) return
    cycleIdx.value = delta > 0
      ? cycleNext(cycleIdx.value, letters.length)
      : cyclePrev(cycleIdx.value, letters.length)
    lastCycleAt = performance.now()
    const l = letters[cycleIdx.value]
    speak(`当前 ${l}，${callbacks.optionText(l)}，张嘴确认`)
    callbacks.toast(`当前选项 ${l}，张嘴确认`)
  }

  function cycleConfirm() {
    if (scanActive.value) {
      scan.hit(settings().scan.dwell)
      return
    }
    const letters = currentLetters()
    if (cycleIdx.value >= 0 && letters[cycleIdx.value]) {
      const l = letters[cycleIdx.value]
      cycleIdx.value = -1
      callbacks.toggleOption(l)
      speak(`已选 ${l}`)
    } else {
      callbacks.toast('先点头切到目标选项，再张嘴/命中确认')
    }
  }

  // ---------- 撤销（ADHD 3s 窗口） ----------
  function pushUndo(label = '选择') {
    undoStack.push({ at: performance.now(), label, snapshot: callbacks.snapshot() })
    if (undoStack.length > 10) undoStack.shift()
  }

  function tryUndo() {
    const win = settings().adhd.undoWindow
    const last = undoStack.pop()
    if (!last || performance.now() - last.at > win) {
      callbacks.toast('没有可撤销的操作（超过 3 秒窗口）')
      return
    }
    callbacks.restore(last.snapshot)
    callbacks.toast('已撤销上一步')
  }

  // ---------- 扫描模式 ----------
  function scanItems() {
    if (callbacks.isDone()) return []
    const items = currentLetters().map(l => ({ id: `opt:${l}`, letter: l, label: `${l}. ${callbacks.optionText(l)}` }))
    return [...items, ...SCAN_NAV_ITEMS.map(n => ({ id: n.id, label: n.label }))]
  }

  const scan = createScanController({
    getItems: scanItems,
    onHit: (item) => {
      if (item.letter) { pushUndo(); callbacks.toggleOption(item.letter) }
      else if (item.id === 'prev') callbacks.prev()
      else if (item.id === 'next') callbacks.next()
      else if (item.id === 'clear') { pushUndo(); callbacks.clearCurrent() }
      else if (item.id === 'submit') callbacks.submit()
    }
  })

  function startScan() {
    if (scanActive.value) return
    scanActive.value = true
    scan.start()
    callbacks.toast('扫描模式：游标自动前进，做一个命中动作即选中')
  }

  function stopScan() {
    scanActive.value = false
    scan.stop()
    scanCursor.value = { index: -1, progress: 0 }
  }

  // ---------- 动作分发（替代旧 handleGesture switch） ----------
  const handlers = {
    selectA: () => { if (has('A')) { pushUndo(); callbacks.toggleOption('A') } },
    selectB: () => { if (has('B')) { pushUndo(); callbacks.toggleOption('B') } },
    selectC: () => { if (has('C')) { pushUndo(); callbacks.toggleOption('C') } },
    selectD: () => { if (has('D')) { pushUndo(); callbacks.toggleOption('D') } },
    clear: () => { pushUndo(); callbacks.clearCurrent() },
    prev: () => callbacks.prev(),
    next: () => callbacks.next(),
    submit: () => callbacks.submit(),
    'submit-arm': () => callbacks.armToast(),
    optNext: () => cycleOption(1),
    optPrev: () => cycleOption(-1),
    confirm: cycleConfirm,
    undo: tryUndo,
    cancel: () => { manager.resetHandArmer(); if (callbacks.isDone()) callbacks.unDone() }
  }

  function has(letter) {
    return !callbacks.isDone() && !callbacks.isSubjective() && currentLetters().includes(letter)
  }

  // ---------- 键盘 ----------
  let spaceTimer = null
  function onKeydown(e) {
    const el = e.target
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return
    if (!callbacks.runtimeOn()) return
    const k = e.key
    if (k === 's' || k === 'S') { e.preventDefault(); scanActive.value ? stopScan() : startScan(); return }
    if (k === 'Escape') { e.preventDefault(); if (scanActive.value) stopScan(); else handlers.cancel(); return }
    const map = {
      '1': 'selectA', '2': 'selectB', '3': 'selectC', '4': 'selectD',
      a: 'selectA', b: 'selectB', c: 'selectC', d: 'selectD',
      A: 'selectA', B: 'selectB', C: 'selectC', D: 'selectD',
      ArrowLeft: 'prev', ArrowRight: 'next', Enter: 'submit', u: 'undo', U: 'undo'
    }
    if (k === ' ') {
      e.preventDefault()
      if (e.repeat) return
      spaceTimer = setTimeout(() => handlers.confirm(), 350)
      return
    }
    const action = map[k]
    if (action) { e.preventDefault(); handlers[action]() }
  }
  function onKeyup(e) {
    if (e.key === ' ' && spaceTimer) {
      clearTimeout(spaceTimer)
      spaceTimer = null
      if (scanActive.value) handlers.confirm()   // 扫描中短按空格也算命中
    }
  }

  // ---------- 主循环：扫描游标 + 空闲清空 + 离屏暂停 ----------
  function loop() {
    const now = performance.now()
    if (scanActive.value) {
      const c = scan.tick(settings().scan.dwell, now)
      scanCursor.value = c
    }
    if (cycleIdx.value !== -1 && now - lastCycleAt > 8000) cycleIdx.value = -1

    const off = manager.state.head.on && manager.state.head.offscreen
    if (settings().adhd.enabled && settings().adhd.offscreenPause) {
      if (off && !offscreenHold.value) {
        offscreenHold.value = true
        pauseAt = now
        callbacks.pauseTimer()
      } else if (!off && offscreenHold.value) {
        offscreenHold.value = false
        callbacks.resumeTimer(now - pauseAt)
        callbacks.toast('回来啦，离屏时间没有计入作答')
      }
    } else if (offscreenHold.value && !off) {
      offscreenHold.value = false
      callbacks.resumeTimer(now - pauseAt)
    }
    rafId = requestAnimationFrame(loop)
  }

  // HUD/视图查询：当前步进高亮字母、扫描高亮项
  const cycleLetter = computed(() => currentLetters()[cycleIdx.value] || null)
  const scanCurrent = computed(() => {
    if (!scanActive.value) return null
    const items = scanItems()
    return items[scanCursor.value.index] || null
  })
  function scanHighlightOf(letter) {
    if (!scanActive.value) return false
    const items = scanItems()
    return scanCursor.value.index === items.findIndex(i => i.letter === letter)
  }
  function scanHighlightOfNav(id) {
    if (!scanActive.value) return false
    const items = scanItems()
    return scanCursor.value.index === items.findIndex(i => i.id === id)
  }

  onMounted(() => {
    unsub = bus.on((evt) => {
      const fn = handlers[evt.action]
      if (fn) fn(evt)
    })
    window.addEventListener('keydown', onKeydown)
    window.addEventListener('keyup', onKeyup)
    rafId = requestAnimationFrame(loop)
  })
  onUnmounted(() => {
    if (unsub) unsub()
    window.removeEventListener('keydown', onKeydown)
    window.removeEventListener('keyup', onKeyup)
    cancelAnimationFrame(rafId)
    if (offscreenHold.value) { callbacks.resumeTimer(performance.now() - pauseAt); offscreenHold.value = false }
  })

  return {
    scanActive, cycleIdx, scanCursor, offscreenHold,
    startScan, stopScan, cycleConfirm, cycleOption, pushUndo, tryUndo,
    cycleLetter, scanCurrent, scanHighlightOf, scanHighlightOfNav, speak, handlers
  }
}
