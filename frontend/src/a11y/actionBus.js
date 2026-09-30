/**
 * 动作总线：所有输入通道（hand/head/arm/keyboard）归一为统一动作词表后在此分发。
 * per-action 冷却防连发；瞬时峰值类事件（nod/shake/sweep）跳过投票直接进总线。
 * 提供 window.__a11yBus 注入点：Playwright/调试面板无需摄像头即可发信号。
 */

import { loadSettings } from './settings.js'

const COOLDOWNS = {
  selectA: 600, selectB: 600, selectC: 600, selectD: 600,
  prev: 800, next: 800, clear: 1000,
  confirm: 450, cancel: 450, submit: 1500, undo: 500,
  optNext: 500, optPrev: 500
}

export function createActionBus() {
  const subs = new Set()
  const lastAt = {}

  function emit(action, payload = {}) {
    const now = performance.now()
    const cd = COOLDOWNS[action] ?? 0
    if (now - (lastAt[action] || -Infinity) < cd) return false
    lastAt[action] = now
    const evt = { action, source: payload.source || 'unknown', at: now }
    for (const fn of subs) {
      try { fn(evt) } catch (e) { console.error('[bus] listener error', e) }
    }
    return true
  }

  function on(fn) {
    subs.add(fn)
    return () => subs.delete(fn)
  }

  /** 通道候选 -> 动作（经设置页重映射表） */
  function routeChannelCandidate(channel, candidate) {
    if (!candidate) return
    const map = loadSettings().mappings[channel]
    const action = map ? map[candidate] : undefined
    if (action) emit(action, { source: channel })
  }

  if (typeof window !== 'undefined') {
    window.__a11yBus = { emit, route: routeChannelCandidate }
  }
  return { emit, on, routeChannelCandidate }
}
