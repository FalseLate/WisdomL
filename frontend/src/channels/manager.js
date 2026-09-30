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
    window.__a11yManager = manager
  }
  return manager
}
