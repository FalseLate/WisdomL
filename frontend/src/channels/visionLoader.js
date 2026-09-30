/**
 * MediaPipe tasks-vision 运行时加载（wasm 本地 vendored 于 public/mediapipe/wasm）
 * 三通道共享同一 wasm 运行时；模型文件按通道懒加载。
 */
import { FilesetResolver } from '@mediapipe/tasks-vision'

let visionPromise = null

export function getVision() {
  if (!visionPromise) {
    visionPromise = FilesetResolver.forVisionTasks('/mediapipe/tasks/wasm')
  }
  return visionPromise
}

export { FilesetResolver }
