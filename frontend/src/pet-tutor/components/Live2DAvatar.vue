<template>
  <div class="l2d-stage" ref="hostRef">
    <canvas ref="canvasRef"></canvas>
    <div v-if="statusText" class="l2d-status">{{ statusText }}</div>
  </div>
</template>

<script setup>
// Live2D 2D 形象：PixiJS v7 + pixi-live2d-display(cubism4)。
// 对外暴露与 3D VirtualHuman 同名接口：attachLipSyncNode / silenceMouth，供聊天页统一接线。
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { Application, Ticker } from 'pixi.js'
import { Live2DModel } from 'pixi-live2d-display/cubism4'

Live2DModel.registerTicker(Ticker)   // cubism4 需要注册 pixi Ticker

const props = defineProps({
  modelUrl: { type: String, default: '/models2d/haru/haru_greeter_t03.model3.json' }
})
const emit = defineEmits(['ready'])

const hostRef = ref(null)
const canvasRef = ref(null)
const statusText = ref('加载 2D 模型中…')

let app = null, model = null, lipNode = null
let hasIdle = false                       // 模型是否自带 Idle 动作（有则交给 motion 驱动，不再手动摆头）
let mouth = 0, lastAt = 0, blinkAt = 1.5, blinkStart = -1
let idleGroup = null                      // 模型自带的待机动作组名
let motionPaused = false                  // 说话中：待机动作被掐掉
let voicedAt = 0                          // 最近一次检测到人声的时刻

// 口型手感与 3D VirtualHuman 对齐：gamma 提亮 + attack/release 平滑 + 静音门限
const VOWEL_KEYS = ['A', 'E', 'I', 'O', 'U', 'S']
const SILENCE_VOL = 0.04, ATTACK = 45, RELEASE = 25, CAP = 0.9
// 迟滞要明显大于「句与句之间的空白」：故事/口语是按句切片播报的，800ms 会在每句之间
// 反复「停动作→换一条随机 Idle→淡入」，看起来就是头和身体在猛晃
const SPEAK_HANG = 2500
const BLINK_DUR = 0.18, EYE_OPEN = 1      // 眨眼时长（秒）与睁眼基准值

function mouthTarget() {
  if (!lipNode) return 0
  const vol = lipNode.volume ?? 0
  if (vol < SILENCE_VOL) return 0
  const w = lipNode.weights || {}
  const maxW = Math.max(...VOWEL_KEYS.map(k => w[k] || 0))
  return Math.min(1, (Math.min(vol / CAP, 1) ** 0.7) * (0.35 + 0.65 * maxW))
}
function setParam(id, v) {
  try { model?.internalModel?.coreModel?.setParameterValueById(id, v) } catch { /* 模型无该参数则忽略 */ }
}
function getParam(id, dft) {
  try {
    const v = model.internalModel.coreModel.getParameterValueById(id)
    return typeof v === 'number' ? v : dft
  } catch { return dft }
}

const HEAD_PARAMS = ['ParamAngleX', 'ParamAngleY', 'ParamAngleZ']
let headHome = null                       // 掐动作瞬间的头姿快照，之后缓动回正

/** 讲话时把待机动作掐掉：身体静止，只有嘴和眼睛动，避免动作曲线和口型抢注意力 */
function syncMotionWithSpeech(now) {
  if ((lipNode?.volume ?? 0) >= SILENCE_VOL) voicedAt = now
  const speaking = now - voicedAt < SPEAK_HANG
  if (!idleGroup) return speaking
  if (speaking === motionPaused) return speaking
  motionPaused = !speaking
  try {
    const mm = model.internalModel.motionManager
    if (speaking) {
      headHome = HEAD_PARAMS.map(id => getParam(id, 0))   // 定格的可能正好是侧脸/抬头的姿势
      mm.stopAllMotions()
    } else {
      headHome = null
      model.motion(idleGroup, undefined, 1)               // 停话后随机续播一条 Idle（Loop 自带）
    }
  } catch { /* 动作接口异常时保持当前状态，不影响口型 */ }
  return speaking
}

/** 眨眼曲线：闭 63ms → 保持 27ms → 张 90ms，返回眼睛张开系数（1=睁，0.05=合） */
function blinkScale(t) {
  const p = (t - blinkStart) / BLINK_DUR
  if (p < 0 || p >= 1) return 1
  if (p < 0.35) return 1 - (p / 0.35) * 0.95
  if (p < 0.5) return 0.05
  return 0.05 + ((p - 0.5) / 0.5) * 0.95
}

/**
 * 参数必须写在这个回调里：它发生在 motionManager 写完动画曲线之后、coreModel.update() 之前。
 * 写在外部 rAF 会被 Idle 动作自带的 ParamMouthOpenY 关键帧整帧盖掉（嘴动但和声音无关）。
 */
function onBeforeModelUpdate() {
  if (!model) return
  const now = performance.now()
  const dt = Math.min((now - lastAt) / 1000 || 0.016, 0.05)
  lastAt = now

  const speaking = syncMotionWithSpeech(now)

  const target = mouthTarget()
  mouth += (target - mouth) * Math.min(1, (target > mouth ? ATTACK : RELEASE) * dt)
  setParam('ParamMouthOpenY', mouth)

  // 眨眼：我们是这两个参数的唯一写入者。库自带的 CubismEyeBlink 在动作停下时会接管
  // ParamEyeLOpen/ROpen（model3.json 的 Groups.EyeBlink 声明了它们），两套眨眼时钟不同步
  // 就会叠成"闭一半又闭一次"的重影，所以加载后把库的 eyeBlink 关掉，只留这一条曲线。
  const t = now / 1000
  if (t >= blinkAt) { blinkStart = t; blinkAt = t + 2.5 + Math.random() * 4 }
  const eye = blinkScale(t)
  setParam('ParamEyeLOpen', EYE_OPEN * eye)
  setParam('ParamEyeROpen', EYE_OPEN * eye)

  // 讲话中把头姿缓动回正并锁住：动作虽已停，但定格那一刻可能正好是侧脸/抬头的姿势
  if (headHome) {
    HEAD_PARAMS.forEach((id, i) => {
      headHome[i] -= headHome[i] * Math.min(1, 5 * dt)
      setParam(id, headHome[i])
    })
  }
  if (!hasIdle && !speaking) {                        // 无自带动作且不在讲话时才正弦摆头，幅度压到很小
    setParam('ParamAngleX', Math.sin(t * 0.5) * 3)
    setParam('ParamAngleY', Math.sin(t * 0.8) * 1.5)
  }
}

onMounted(async () => {
  try {
    if (!window.Live2DCubismCore) { statusText.value = 'Cubism 核心未加载'; return }
    const host = hostRef.value
    app = new Application({
      view: canvasRef.value, backgroundAlpha: 0, autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2), resizeTo: host
    })
    model = await Live2DModel.from(props.modelUrl, { autoInteract: false })
    app.stage.addChild(model)
    // 关掉 pixi 的事件系统：Live2DModel 继承的是顶层 @pixi/display@6 的 Container（0.4 版的 peer 依赖
    // 被 npm 当 peer 自动装了 v6），而 stage 属于 pixi 7；v7 的 EventBoundary 每次指针命中测试都会调
    // v6 对象上并不存在的 isInteractive()，于是每个 pointermove 抛一片 TypeError。
    // 本组件只需要渲染：拖动/缩放是外层 div 的 DOM 事件，模型也传了 autoInteract:false，关掉零损失。
    const ev = app.renderer.events
    if (ev?.features) Object.assign(ev.features, { move: false, globalMove: false, click: false, wheel: false })
    const s = Math.min(host.clientWidth / model.width, host.clientHeight / model.height) * 0.92
    model.scale.set(s)
    model.anchor.set(0.5, 0.5)
    model.x = host.clientWidth / 2
    model.y = host.clientHeight / 2
    statusText.value = ''
    // 眨眼统一由本组件驱动：把库自带的 CubismEyeBlink 摘掉，否则动作停下时它会接管眼睛参数，
    // 和我们这条眨眼曲线叠成重影
    if (model.internalModel) model.internalModel.eyeBlink = null
    // 有 Idle 动作组就随机播一条（Meta.Loop=true 会自己循环）；优先级必须是数字 MotionPriority.IDLE=1，
    // 传 { priority: 1 } 会被当成 index 去查 definitions，动作根本起不来，人物只剩头发裙子在飘
    try {
      const defs = model.internalModel?.motionManager?.definitions || {}
      idleGroup = Object.keys(defs).find(g => /idle/i.test(g)) || null
      if (idleGroup) hasIdle = !!(await model.motion(idleGroup, undefined, 1))
    } catch { /* 无 motion 或接口差异，退回正弦 */ }
    // 参数注入点：钩子在 pixi 每帧 coreModel.update() 前触发，不再需要自己的 rAF
    model.internalModel?.on?.('beforeModelUpdate', onBeforeModelUpdate)
    emit('ready')
  } catch (e) {
    console.error('[Live2D] 加载失败', e)
    statusText.value = '2D 模型加载失败：' + e.message
  }
})

onBeforeUnmount(() => {
  try { app?.destroy(true, { children: true }) } catch { /* noop */ }
  app = null; model = null
})

function attachLipSyncNode(node) { lipNode = node }
function silenceMouth() { mouth = 0; setParam('ParamMouthOpenY', 0) }
defineExpose({ attachLipSyncNode, silenceMouth })
</script>

<style scoped>
.l2d-stage { position: relative; width: 100%; height: 100%; background: transparent; }
.l2d-stage canvas { display: block; width: 100%; height: 100%; }
.l2d-status {
  position: absolute; bottom: 8px; left: 50%; transform: translateX(-50%);
  font-size: 12px; color: var(--text-muted); white-space: nowrap;
}
</style>
