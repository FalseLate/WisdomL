/**
 * ChannelManager 全局单例：video 元素离屏自建，HUD 只负责展示，
 * 组件热替换/卸载不销毁识别链路。
 */
import { ChannelManager } from './ChannelManager.js'

let manager = null

export function getManager() {
  if (!manager) {
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    manager = new ChannelManager(video)
    // 手机浏览器 WebGL 上下文配额很小（3 个 detector + three.js 头像 + 粒子背景），
    // 一旦丢失就是白屏/空骨架，必须留个可数的痕迹才能证实这个怀疑
    document.addEventListener('webglcontextlost', () => { manager.perf.glLost++ }, true)
    window.__a11yManager = manager
  }
  return manager
}
