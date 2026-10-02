<template>
  <div ref="containerRef" class="particle-container" :class="{ loaded: isLoaded }"></div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { onSettingsChange } from '../../a11y/settings.js'
import { motionMode } from '../../utils/theme.js'

const containerRef = ref(null)
const isLoaded = ref(false)
let particlesInstance = null
let loadRetries = []
let unsubSettings = null
/** 在飞的 load() 可能在 teardown() 之后才落地，用世代号丢弃过期容器 */
let generation = 0

/** 霓虹三色是给 #0a0a0f 底用的；浅色下换成与文字同源的中性灰阶，不然 multiply 一压就消失 */
const PALETTE = {
  neon: { colors: ['#00f5ff', '#ff00ff', '#00ff88'], line: '#00f5ff', opacity: 0.35, lineOpacity: 0.1 },
  calm: { colors: ['#171717', '#4d4d4d', '#6b6b6b'], line: '#6b6b6b', opacity: 0.18, lineOpacity: 0.06 }
}

function applyMode() {
  const mode = motionMode()          // 'off' | 'calm' | 'neon'
  if (mode === 'off') { teardown(); return }
  if (particlesInstance) { teardown(); }
  start(mode)
}

function start(mode) {
  if (window.tsParticles) { initParticles(mode); return }
  // CDN 脚本在 head 里同步加载，正常已就绪；兜底只等 3 次而不是空转 10 秒
  let tries = 0
  const timer = setInterval(() => {
    if (window.tsParticles) { clearInterval(timer); initParticles(mode) }
    else if (++tries >= 3) { clearInterval(timer); isLoaded.value = true }
  }, 300)
  loadRetries.push(timer)
}

function teardown() {
  generation++
  loadRetries.forEach(clearInterval)
  loadRetries = []
  pushTimers.forEach(clearTimeout)
  pushTimers.clear()
  if (clickBinding) {
    clickBinding.cv.removeEventListener('click', clickBinding.handler)
    clickBinding = null
  }
  document.removeEventListener('visibilitychange', onVisibility)
  if (particlesInstance) {
    try { particlesInstance.destroy() } catch { /* 已销毁 */ }
    particlesInstance = null
  }
  isLoaded.value = false
}

onMounted(() => {
  applyMode()
  unsubSettings = onSettingsChange(applyMode)
})

function initParticles(mode) {
  const pal = PALETTE[mode] || PALETTE.neon
  const gen = ++generation
  window.tsParticles.load(containerRef.value, {
    particles: {
      number: {
        value: 65,
        // 连线判定是 O(n²)，点击粒子又不会自己消失，必须有硬顶（实测默认 limit=0 即无上限）
        limit: 160,
        density: { enable: true, value_area: 800 }
      },
      color: {
        value: pal.colors
      },
      shape: {
        type: 'circle'
      },
      opacity: {
        value: pal.opacity,
        random: true,
        anim: {
          enable: true,
          speed: 0.8,
          opacity_min: 0.1,
          sync: false
        }
      },
      size: {
        value: 2,
        random: true
      },
      line_linked: {
        enable: true,
        distance: 120,
        color: pal.line,
        opacity: pal.lineOpacity,
        width: 1
      },
      move: {
        enable: true,
        speed: 0.9,
        direction: 'none',
        random: true,
        straight: false,
        out_mode: 'out',
        bounce: false,
        attract: {
          enable: false,
          rotateX: 600,
          rotateY: 1200
        }
      }
    },
    interactivity: {
      detect_on: 'canvas',
      events: {
        onhover: {
          enable: true,
          mode: 'grab'
        },
        // 点击粒子改由本组件自己生成（见 bindClickPush）：内置 push 出来的粒子没有寿命，
        // 会永久堆积——这里要的是"玩一下但会散场"
        onclick: {
          enable: false
        },
        resize: true
      },
      modes: {
        grab: {
          distance: 140,
          line_linked: {
            opacity: 0.3
          }
        }
      }
    },
    // retina_detect 只吃布尔（实测 v2.12 的 {enable,value:{max}} 对象形式被忽略，pixelRatio 仍等于设备 DPR）。
    // 3 倍屏手机开 retina = 9 倍像素填充，是移动端最大开销；DPR>2 的设备直接按 1x 画（2px 圆点+1px 连线看不出差别）
    retina_detect: (window.devicePixelRatio || 1) <= 2,
    // v1 的 fps_limit 也能被兼容层认出来，但按 v2 正名写；实测此前满帧跑是因为限帧窗口太宽
    fpsLimit: 60
  }).then(container => {
    // 期间可能已经切过档并 teardown()：丢弃这个过期容器，否则它会带着旧配色复活
    if (gen !== generation) {
      try { container.destroy() } catch { /* noop */ }
      return
    }
    particlesInstance = container
    bindClickPush(container)
    // 切后台/锁屏必须停掉 rAF，否则手机在后台仍持续绘制发热
    document.addEventListener('visibilitychange', onVisibility)
    // 等第一帧渲染完成后再淡入，避免初始化卡顿
    requestAnimationFrame(() => {
      setTimeout(() => {
        isLoaded.value = true
      }, 100)
    })
  }).catch(err => {
    console.warn('粒子初始化失败:', err)
    isLoaded.value = true
  })
}

// 点击加粒子：自己生成才能控制寿命。数量有硬顶、约 10 秒后淡出移除，
// 不然连线判定 O(n²) 会随点击次数一路涨上去（手机上就是持续掉帧）。
const PUSH_MAX = 160
const PUSH_TTL = 10000
const PUSH_FADE = 7000
let clickBinding = null
const pushTimers = new Set()

function bindClickPush(container) {
  const cv = container.canvas && container.canvas.element
  if (!cv) return
  const handler = (e) => {
    const P = container.particles
    if (!P || P.count >= PUSH_MAX) return
    const rect = cv.getBoundingClientRect()
    // 粒子坐标活在背衬像素上（实测位置区间是 backing 宽而非 CSS 宽），必须乘 pixelRatio
    const k = (container.retina && container.retina.pixelRatio) || 1
    const p = P.addParticle({ x: (e.clientX - rect.left) * k, y: (e.clientY - rect.top) * k })
    if (!p) return
    const fade = setTimeout(() => {
      if (p.opacity) p.opacity.value = Math.min(p.opacity.value, 0.08)
    }, PUSH_FADE)
    const kill = setTimeout(() => {
      P.remove(p)
      pushTimers.delete(fade)
      pushTimers.delete(kill)
    }, PUSH_TTL)
    pushTimers.add(fade)
    pushTimers.add(kill)
  }
  cv.addEventListener('click', handler)
  clickBinding = { cv, handler }
}

function onVisibility() {
  const c = particlesInstance
  if (!c) return
  try {
    if (document.hidden) c.pause()
    else c.play()
  } catch { /* 老版本容器没有 pause/play 就忽略 */ }
}

onUnmounted(() => {
  if (unsubSettings) unsubSettings()
  unsubSettings = null
  teardown()
})
</script>

<style scoped>
.particle-container {
  position: fixed;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.8s ease;
}

.particle-container.loaded {
  opacity: 1;
}

.particle-container :deep(canvas) {
  display: block;
}
</style>
