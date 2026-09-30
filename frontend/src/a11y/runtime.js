/**
 * 无障碍运行时单例：动作总线 + 通道管理器（手/头/臂，tasks-vision）。
 * 主项目内唯一入口——LazyPracticeView 订阅 bus 分发动作，GestureHUD 读 manager 状态渲染。
 *
 * 注意：这里走 @mediapipe/tasks-vision 单运行时；
 * utils/gestureRecognizer.js（legacy @mediapipe/hands）已停用，两套 wasm 运行时不可同页共存。
 */
import { getManager } from '../channels/manager.js'
import { createActionBus } from './actionBus.js'

let runtime = null

export function getRuntime() {
  if (!runtime) {
    const bus = createActionBus()
    const manager = getManager()
    manager.attachBus(bus)
    runtime = { bus, manager }
    window.__zhifuxiA11y = runtime
  }
  return runtime
}
