<template>
  <div class="avatar-stage" ref="stageRef">
    <canvas ref="canvasRef"></canvas>
    <div v-if="statusText" class="avatar-status">{{ statusText }}</div>
  </div>
</template>
<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm'
import { VRMAnimationLoaderPlugin, createVRMAnimationClip } from '@pixiv/three-vrm-animation'
const props = defineProps({
  //人物
  modelUrl: { type: String, default: '/models/jj3.vrm' },
  followMouse: { type: Boolean, default: true }
})
// ★ 动画分层架构：
//   底层 animations/：常驻 idle（优先文件名含 idle 者），加载后永不停止、权重不清零，
//         ——保证 mixer 始终有动画驱动骨骼，杜绝回落 T-pose（模型 bind pose 是 T）
//   上层 animations-gestures/：交互叠加动作（点头/招手等，LoopOnce），
//         fadeIn 叠加到底层之上，播完只淡出自身，底层全程在线
const baseAssets = import.meta.glob('../assets/animations/*.vrma', { eager: true, query: '?url', import: 'default' })
const gestureAssets = import.meta.glob('../assets/animations-gestures/*.vrma', { eager: true, query: '?url', import: 'default' })
const emit = defineEmits(['ready', 'clicked', 'drag-move'])
const stageRef = ref(null)
const canvasRef = ref(null)
const statusText = ref('加载角色中…')
const ready = ref(false)
let renderer = null, scene = null, camera = null, vrm = null
let clock = null, resizeObserver = null
let mixer = null, vrmAnimActive = false
// 分层动画运行时状态
let baseAction = null                          // 底层常驻 idle 的 action（永不 stop）
const gestures = new Map()                     // 上层交互动作：文件名 -> action（LoopOnce）
let activeGestures = 0                         // 正在播的交互动作数（决定底层让权程度）
// 待机轮播池：animations/ 里除底层外的其余常驻待机（作为 LoopRepeat 叠加层，8~16s 随机轮换）
let rotActions = []
        // [{ name, action }]
let rotCurrent = null                          // 当前在播的轮播 action
let rotNextAt = 0                              // 下次轮换时刻（clock.elapsedTime）
// 视线锚点：必须是 Object3D！three-vrm 的 VRMLookAt 内部会调 target.getWorldPosition()，
// 给它 Vector3 会让 vrm.update() 每帧抛 TypeError（曾经的报错根因）
let gazeAnchor = null
// ================================================================
// 口型：wlipsync 实时音频分析路线（移植自 AIRI stage-ui-three useVRMLipSync）
// 不再消费后端 viseme 假时间轴 —— 嘴型直接从播放中的 PCM 音频算出来
// ================================================================
const RAW_KEYS = ['A', 'E', 'I', 'O', 'U', 'S']
const LIP_KEYS = ['A', 'E', 'I', 'O', 'U']
const BLENDSHAPE_MAP = { A: 'aa', E: 'ee', I: 'ih', O: 'oh', U: 'ou' }
const RAW_TO_LIP = { A: 'A', E: 'E', I: 'I', O: 'O', U: 'U', S: 'I' }  // S(嘶音)归并到 I
const ATTACK = 50, RELEASE = 30, CAP = 0.7
const SILENCE_VOL = 0.04, SILENCE_GAIN = 0.05, IDLE_MS = 160
const smoothState = { A: 0, E: 0, I: 0, O: 0, U: 0 }
let lastActiveAt = 0
let lipNode = null
function trySet(name, w) {
  try { vrm?.expressionManager?.setValue(name, w) } catch { /* 模型缺该预设时忽略 */ }
}
function closeMouth() {
  for (const k of LIP_KEYS) trySet(BLENDSHAPE_MAP[k], 0)
}
/** App 创建好 WLipSyncAudioNode 后注入（音频源会同时接 destination 和这个节点） */
function attachLipSyncNode(node) { lipNode = node }
/** 新一轮开始前复位 */
function silenceMouth() {
  for (const k of LIP_KEYS) smoothState[k] = 0
  closeMouth()
}
function updateLipSync(delta) {
  if (!vrm?.expressionManager || !lipNode) return
  const vol = lipNode.volume ?? 0
  const amp = Math.min(vol * 0.9, 1) ** 0.7
  // AEIOUS → AEIOU 重映射
  const projected = { A: 0, E: 0, I: 0, O: 0, U: 0 }
  for (const raw of RAW_KEYS) {
    const lip = RAW_TO_LIP[raw]
    projected[lip] = Math.max(projected[lip], (lipNode.weights[raw] ?? 0) * amp)
  }
  // AIRI 改良：只混合权重最大的 winner + runner 两个嘴型（全混会被 A 主导）
  let winner = 'I', runner = 'E', winnerVal = -Infinity, runnerVal = -Infinity
  for (const key of LIP_KEYS) {
    const val = projected[key]
    if (val > winnerVal) { runnerVal = winnerVal; runner = winner; winnerVal = val; winner = key }
    else if (val > runnerVal) { runnerVal = val; runner = key }
  }
  // 静音检测（低于阈值或 160ms 没动静 → 闭嘴）
  const now = performance.now()
  let silent = amp < SILENCE_VOL || winnerVal < SILENCE_GAIN
  if (!silent) lastActiveAt = now
  if (now - lastActiveAt > IDLE_MS) silent = true
  const target = { A: 0, E: 0, I: 0, O: 0, U: 0 }
  if (!silent) {
    target[winner] = Math.min(CAP, winnerVal)
    target[runner] = Math.min(CAP * 0.5, runnerVal * 0.6)
  }
  // 平滑（开口快、闭口慢的 attack/release 插值）
  for (const key of LIP_KEYS) {
    const from = smoothState[key], to = target[key]
    const rate = 1 - Math.exp(-(to > from ? ATTACK : RELEASE) * delta)
    smoothState[key] = from + (to - from) * rate
    const weight = (smoothState[key] <= 0.01 ? 0 : smoothState[key]) * 0.8
    trySet(BLENDSHAPE_MAP[key], weight)
  }
}
// ========== 待机：随机眨眼（VRMA 缺席时才叠加程序化呼吸） ==========
let nextBlinkAt = 1.5
function blinkWeight(now) {
  const CLOSE = 0.07, HOLD = 0.06, OPEN = 0.13
  if (now >= nextBlinkAt && now < nextBlinkAt + CLOSE + HOLD + OPEN) {
    const p = now - nextBlinkAt
    return p < CLOSE ? p / CLOSE : p < CLOSE + HOLD ? 1 : 1 - (p - CLOSE - HOLD) / OPEN
  }
  if (now >= nextBlinkAt + CLOSE + HOLD + OPEN) nextBlinkAt = now + 2 + Math.random() * 4
  return 0
}
// ========== 点击反馈：happy 表情 + 渐弱小跳 ==========
let reactionUntil = 0
function startReaction() { reactionUntil = clock.elapsedTime + 1.0 }
// ========== 指针：按住拖动 → 发 drag-move 给父层移动挂件；轻点且命中模型 → clicked ==========
let pointerDownPos = null, pointerPrev = null, dragging = false
function onPointerDown(e) {
  pointerDownPos = { x: e.clientX, y: e.clientY }
  pointerPrev = { x: e.clientX, y: e.clientY }
  dragging = false
}
function onPointerMove(e) {
  if (!pointerDownPos) return
  const dx = e.clientX - pointerPrev.x, dy = e.clientY - pointerPrev.y
  if (!dragging && Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y) > 6) dragging = true
  if (dragging) emit('drag-move', { dx, dy })
  pointerPrev = { x: e.clientX, y: e.clientY }
}
function onPointerUp(e) {
  if (!pointerDownPos) return
  const wasDragging = dragging
  pointerDownPos = pointerPrev = null; dragging = false
  if (wasDragging || !vrm) return
  const rect = canvasRef.value.getBoundingClientRect()
  const ndc = new THREE.Vector2(
    ((e.clientX - rect.left) / rect.width) * 2 - 1,
    -((e.clientY - rect.top) / rect.height) * 2 + 1
  )
  const ray = new THREE.Raycaster()
  ray.setFromCamera(ndc, camera)
 if (ray.intersectObject(vrm.scene, true).length > 0) {
    // ✅ 修改：点击角色播放 thinking
    const played = playGesture('thinking')
    if (!played) startReaction()
    emit('clicked', { clientX: e.clientX, clientY: e.clientY })
  }
}
// ========== 视线跟随鼠标（AIRI eye-tracking 的轻量替代） ==========
function onWindowMouseMove(e) {
  // 模型加载完成前一律不动（ready 在 vrm 挂载与 lookAt 绑定后才置 true）
  if (!ready.value || !props.followMouse || !vrm?.lookAt || !gazeAnchor) return
  const rect = canvasRef.value.getBoundingClientRect()
  const nx = THREE.MathUtils.clamp(((e.clientX - rect.left) / rect.width) * 2 - 1, -1.4, 1.4)
  const ny = THREE.MathUtils.clamp(-((e.clientY - rect.top) / rect.height) * 2 + 1, -1.0, 1.0)
  gazeAnchor.position.set(nx * 1.4, 1.15 + ny * 0.7, 2.0)
}
function loop() {
  if (!vrm || !renderer || !scene || !camera) return
  const delta = Math.min(clock.getDelta(), 0.5)
  const now = clock.elapsedTime
  const overlayActive = activeGestures > 0 || rotCurrent !== null

  // ✅底层idle永远保持权重1，永远不会归零，杜绝Tpose
  if (baseAction) {
    baseAction.setEffectiveWeight(1.0)
  }

  maybeRotateIdle(now)
  if (mixer) mixer.update(delta)
  updateLipSync(delta)
  trySet('blink', blinkWeight(now))
  if (!vrmAnimActive) {
    const neck = vrm?.humanoid?.getNormalizedBoneNode('neck')
    const head = vrm?.humanoid?.getNormalizedBoneNode('head')
    if (neck) neck.rotation.x = Math.sin(now * 1.1) * 0.022
    if (head) head.rotation.z = Math.sin(now * 0.5) * 0.025
  }
  if (vrm) {
    if (now < reactionUntil) {
      const p = (reactionUntil - now) / 1.0
      trySet('happy', Math.min(1, p * 1.2) * 0.6)
      vrm.scene.position.y = Math.abs(Math.sin((1 - p) * Math.PI * 2.5)) * 0.035 * p
    } else {
      if (vrm.scene.position.y !== 0) vrm.scene.position.y = 0
      trySet('happy', 0)
    }
  }
  vrm?.update(delta)
  renderer.render(scene, camera)
}

// ========== 分层动画系统 ==========
async function loadOneClip(url, vrmObj) {
  const loader = new GLTFLoader()
  loader.register((parser) => new VRMAnimationLoaderPlugin(parser))
  const gltf = await loader.loadAsync(url)
  const [anim] = gltf.userData.vrmAnimations || []
  if (!anim) throw new Error('文件里没有 vrmAnimation')
  const clip = createVRMAnimationClip(anim, vrmObj)
  reAnchorRootPositionTrack(clip, vrmObj)   // 防根位移把人物拖走
  return clip
}
const nameOnly = (p) => p.split(/[\\/]/).pop().replace(/\.vrma$/i, '')
async function loadAnimationLayers(vrmObj) {
  // ---- 底层：常驻 idle（优先文件名含 idle；找不到就用第一个）----
  const baseKeys = Object.keys(baseAssets)
  const baseKey = baseKeys.find(k => /idle/i.test(k)) || baseKeys[0]
  if (!baseKey) {
    console.warn('[VirtualHuman] animations/ 为空：没有底层常驻动画，模型将保持 bind(T) 姿态！')
    return
  }
  try {
    const clip = await loadOneClip(baseAssets[baseKey], vrmObj)
    mixer = new THREE.AnimationMixer(vrmObj.scene)
    baseAction = mixer.clipAction(clip)
    baseAction.play()                      // 永不 stop、权重不清零（让权只是降到 0.15）
    vrmAnimActive = true
    console.log('[VirtualHuman] 底层常驻:', nameOnly(baseKey))
  } catch (e) {
    console.error('[VirtualHuman] 底层动画加载失败（将露出 T-pose，请检查文件）:', baseKey, e)
    return
  }
  // animations/ 里其余待机 → 进轮播池（叠加层播放，底层常驻不动）
  for (const key of baseKeys.filter(k => k !== baseKey)) {
    try {
      const clip = await loadOneClip(baseAssets[key], vrmObj)
      const act = mixer.clipAction(clip)
      act.stop()                                        // 未轮到前完全离线
      rotActions.push({ name: nameOnly(key), action: act })
    } catch (e) {
      console.warn('[VirtualHuman] 轮播动画加载失败:', nameOnly(key), e)
    }
  }
  if (rotActions.length) {
    rotCurrent = null // ✅ 初始置空，不要提前绑定action
    rotNextAt = 10 + Math.random() * 8
    console.log('[VirtualHuman] 待机轮播池:', rotActions.map(a => a.name).join(', '))
  }
  // ---- 上层：交互叠加动作（LoopOnce，创建即停置，playGesture 时才淡入）----
  for (const [key, url] of Object.entries(gestureAssets)) {
    try {
      const clip = await loadOneClip(url, vrmObj)
      const act = mixer.clipAction(clip)
      act.stop()                                       // 未激活时完全离线（此时底层 weight=1 独占，无空隙）
      gestures.set(nameOnly(key), act)
    } catch (e) {
      console.warn('[VirtualHuman] 交互动画加载失败:', nameOnly(key), e)
    }
  }
  console.log('[VirtualHuman] 上层动作库:', gestures.size ? [...gestures.keys()].join(', ') : '（空，把 .vrma 放进 animations-gestures/ 即入库）')
}
/**
 * 播放上层交互动作：fadeIn 叠加到底层之上 → 播完仅自身 fadeOut → 底层无缝接管。
 * 底层 idle 全程不停止；交互期间底层权重平滑降到 0.15（保留骨骼驱动、防 T-pose），
 * 交互结束后平滑回到 1。名字大小写不敏感、支持模糊包含（playGesture('nod') 匹配 nod.vrma）。
 * @returns {boolean} 是否找到并触发
 */
function playGesture(name) {
  if (!mixer || !baseAction || !name) return false
  const lower = String(name).toLowerCase()
  let act = gestures.get(lower) || [...gestures.entries()].find(([k]) => k.toLowerCase().includes(lower))?.[1]
  if (!act) return false
  if (act.isRunning()) return true
  const onFinished = (e) => {
    if (e.action !== act) return
    mixer.removeEventListener('finished', onFinished)
    // 开始淡出手势，底层idle持续1权重运行
    act.fadeOut(0.4)
    // 等待手势权重完全消失，再减少计数
    const waitFadeEnd = () => {
      const w = act.getEffectiveWeight()
      if (w > 0.01) {
        requestAnimationFrame(waitFadeEnd)
      } else {
        activeGestures = Math.max(0, activeGestures - 1)
        // ✅ 新增：手势动作彻底结束后，重置待机轮换计时器
        rotNextAt = clock.getElapsedTime() + 12 + Math.random() * 10
      }
    }
    requestAnimationFrame(waitFadeEnd)
  }
  mixer.addEventListener('finished', onFinished)
  act.reset()
  act.loop = THREE.LoopOnce
  act.clampWhenFinished = true
  act.fadeIn(0.35)
  act.play()
  activeGestures++
  return true
}


/**
 * 待机轮播调度：从轮播池随机挑一个≠当前的，fadeIn(1s) 叠加播放，旧的 fadeOut(1s)。
 * 底层 idle 全程不停止、不清零（让权仅通过 loop 里的 overlayActive 机制）。
 * 交互动作（playGesture）播放期间暂停轮播，避免三层叠加互相稀释。
 */
function maybeRotateIdle(now) {
  if (rotActions.length === 0 || activeGestures > 0) return
  if (now < rotNextAt) return
  const validList = rotActions.filter(item => item && item.action)
  if (validList.length === 0) return
  let pickItem
  const candidates = validList.filter(x => x.action !== rotCurrent)
  if (candidates.length > 0) {
    pickItem = candidates[Math.floor(Math.random() * candidates.length)]
  } else {
    pickItem = validList[0]
  }
  const newAction = pickItem.action
  if (!newAction) return
  if (rotCurrent && rotCurrent !== newAction) {
    rotCurrent.fadeOut(1.0)
  }
  rotCurrent = newAction
  rotCurrent.reset()
  rotCurrent.loop = THREE.LoopRepeat
  rotCurrent.setEffectiveWeight(0.75)
  rotCurrent.fadeIn(1.0)
  rotCurrent.play()
  rotNextAt = now + 12 + Math.random() * 10
  console.log(`[IdleRotate] 切换待机动画: ${pickItem.name}`)
}


function reAnchorRootPositionTrack(clip, vrmObj) {
  const hipNode = vrmObj.humanoid?.getNormalizedBoneNode('hips')
  if (!hipNode) return
  hipNode.updateMatrixWorld(true)
  const defaultHipPos = new THREE.Vector3()
  hipNode.getWorldPosition(defaultHipPos)
  const hipsTrack = clip.tracks.find(t => t instanceof THREE.VectorKeyframeTrack && t.name === `${hipNode.name}.position`)
  if (!(hipsTrack instanceof THREE.VectorKeyframeTrack)) return
  const animeDelta = new THREE.Vector3(hipsTrack.values[0], hipsTrack.values[1], hipsTrack.values[2]).sub(defaultHipPos)
  clip.tracks.forEach((track) => {
    if (track.name.endsWith('.position') && track instanceof THREE.VectorKeyframeTrack) {
      for (let i = 0; i < track.values.length; i += 3) {
        track.values[i] -= animeDelta.x
        track.values[i + 1] -= animeDelta.y
        track.values[i + 2] -= animeDelta.z
      }
    }
  })
}
onMounted(async () => {
  try {
    // ---------- three 场景（透明背景桌宠） ----------
    const canvas = canvasRef.value
    const stage = stageRef.value
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setClearColor(0x000000, 0)
    scene = new THREE.Scene()
    camera = new THREE.PerspectiveCamera(42, stage.clientWidth / stage.clientHeight, 0.1, 10)
    camera.position.set(0, 0.85, 3.6)
    camera.lookAt(0, 0.9, 0)
    // 环境半球光：暗部改成暖灰，不要冷蓝
     scene.add(new THREE.HemisphereLight(0xffffff, 0x998877, 0.6))
    // 主光，降低强度
     const dir = new THREE.DirectionalLight(0xfffdf7, 0.9)
     dir.position.set(0.4, 2.2, 2.0)
     scene.add(dir)
     // 新增弱补光，照亮暗侧，消除死黑
     const fillLight = new THREE.DirectionalLight(0xffffff, 0.35)
     fillLight.position.set(-2, 1.5, 1.5)
     scene.add(fillLight)
     clock = new THREE.Clock()
    canvas.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('mousemove', onWindowMouseMove)
    resizeObserver = new ResizeObserver(() => {
      const w = stage.clientWidth, h = stage.clientHeight
      renderer.setSize(w, h)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    })
    resizeObserver.observe(stage)
    // ---------- 加载 VRM ----------
    const loader = new GLTFLoader()
    loader.register((parser) => new VRMLoaderPlugin(parser))
    const gltf = await loader.loadAsync(props.modelUrl, (e) => {
      if (e.total) statusText.value = `加载角色中… ${(e.loaded / e.total * 100) | 0}%`
    })
    vrm = gltf.userData.vrm
    if (!vrm) throw new Error('文件里没有 VRM 数据')
    try { VRMUtils.removeUnnecessaryVertices(gltf.scene) } catch { /* 可选优化 */ }
    try { VRMUtils.removeUnnecessaryJoints(gltf.scene) } catch { /* 可选优化 */ }
    if (vrm.meta?.metaVersion?.startsWith('0')) {
      if (typeof VRMUtils.rotateVRM0 === 'function') {
        try { VRMUtils.rotateVRM0(vrm) } catch { vrm.scene.rotation.y = Math.PI }
      } else {
        vrm.scene.rotation.y = Math.PI
      }
    }
    vrm.scene.traverse((o) => { o.frustumCulled = false })
    scene.add(vrm.scene)
    // 视线锚点：Object3D（不是 Vector3！），初始注视角色正前方
    gazeAnchor = new THREE.Object3D()
    gazeAnchor.position.set(0, 1.15, 2.0)
    if (vrm.lookAt) vrm.lookAt.target = gazeAnchor
    await loadAnimationLayers(vrm)
    // —— 模型加载完成：状态复位 + 就绪标记 ——
    if (mixer) mixer.setTime(0)
    closeMouth()
    statusText.value = ''
    ready.value = true
    emit('ready')
    // F12 控制台调试入口：
    //   __pet.playGesture('nod')   点名播交互动作
    //   __pet.listGestures()      手势库清单
    //   __pet.listRotation()      轮播池清单
    //   __pet.rotateNow()         立刻触发一次待机轮换（测试用）
    window.__pet = {
      playGesture,
      listGestures: () => [...gestures.keys()],
      listRotation: () => rotActions.map(a => a.name),
      rotateNow: () => {
        rotNextAt = 0
        maybeRotateIdle(clock.elapsedTime)
      },
      forceRotate: () => {
        rotNextAt = 0
        console.log('[__pet] 已强制重置 rotNextAt=0')
        maybeRotateIdle(clock.elapsedTime)
      },
      getState: () => ({
        activeGestures,
        rotNextAt,
        rotCurrentName: rotCurrent ? rotCurrent.getClip().name : null,
        rotCurrentWeight: rotCurrent ? rotCurrent.getEffectiveWeight() : 0
      })
    }
    renderer.setAnimationLoop(loop)
  } catch (e) {
    console.error('[VirtualHuman] 加载失败:', e)
    statusText.value = '角色加载失败：' + e.message
  }
})
onBeforeUnmount(() => {
  canvasRef.value?.removeEventListener('pointerdown', onPointerDown)
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
  window.removeEventListener('mousemove', onWindowMouseMove)
  if (window.__pet) delete window.__pet
  renderer?.setAnimationLoop(null)
  resizeObserver?.disconnect()   // ResizeObserver 的清理 API 是 disconnect()，没有 dispose()
  renderer?.dispose()
})
defineExpose({ attachLipSyncNode, silenceMouth, playGesture })
</script>
<style scoped>
/* 桌宠：无背景板，画布透明 */
.avatar-stage {
  position: relative;
  width: 100%;
  height: 100%;
  background: transparent;
}
.avatar-stage canvas { display: block; width: 100%; height: 100%; cursor: grab; }
.avatar-status {
  position: absolute; bottom: 12px; left: 50%; transform: translateX(-50%);
  padding: 4px 12px; border-radius: 999px;
  background: rgba(255, 255, 255, 0.75); color: #667;
  font-size: 13px; pointer-events: none; white-space: nowrap;
}
</style>