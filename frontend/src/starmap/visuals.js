/**
 * 星图的程序化贴图：不引入任何图片资源，所有观感都由 canvas 现画。
 * 这里只生产“中性灰阶/白色遮罩”，颜色一律由材质乘主题 token —— 切深浅不用换贴图。
 */
import * as THREE from 'three'

function canvas(size) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  return c
}

function finish(c, { clamp = true } = {}) {
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping
  tex.wrapT = clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping
  return tex
}

/** 柔光晕：星球背后的大面积外溢光 */
export function haloTexture(size = 128) {
  const c = canvas(size)
  const g = c.getContext('2d')
  const half = size / 2
  const grad = g.createRadialGradient(half, half, 0, half, half, half)
  grad.addColorStop(0, 'rgba(255,255,255,0.9)')
  grad.addColorStop(0.18, 'rgba(255,255,255,0.55)')
  grad.addColorStop(0.42, 'rgba(255,255,255,0.18)')
  grad.addColorStop(0.72, 'rgba(255,255,255,0.04)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, size, size)
  return finish(c)
}

/** 星点耀斑：小亮核 + 四芒 + 很淡的柔晕，一颗星只占一个 sprite */
export function flareTexture(size = 256) {
  const c = canvas(size)
  const g = c.getContext('2d')
  const h = size / 2

  // 亮核只占 15%：大核 + bloom 会把星点糊成一团白光
  const core = g.createRadialGradient(h, h, 0, h, h, h * 0.16)
  core.addColorStop(0, 'rgba(255,255,255,1)')
  core.addColorStop(0.18, 'rgba(255,255,255,0.95)')
  core.addColorStop(0.46, 'rgba(255,255,255,0.3)')
  core.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = core
  g.fillRect(0, 0, size, size)

  g.globalCompositeOperation = 'lighter'
  const spike = (angle, length, width, alpha) => {
    g.save()
    g.translate(h, h)
    g.rotate(angle)
    const grad = g.createLinearGradient(0, 0, length, 0)
    grad.addColorStop(0, `rgba(255,255,255,${alpha})`)
    grad.addColorStop(0.18, `rgba(255,255,255,${alpha * 0.55})`)
    grad.addColorStop(0.55, `rgba(255,255,255,${alpha * 0.12})`)
    grad.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = grad
    g.beginPath()
    g.moveTo(0, -width)
    g.lineTo(length, 0)
    g.lineTo(0, width)
    g.closePath()
    g.fill()
    g.restore()
  }
  for (const a of [0, Math.PI / 2]) spike(a, h * 0.96, 8, 0.95)
  for (const a of [Math.PI / 4, -Math.PI / 4]) spike(a, h * 0.46, 4.4, 0.32)

  const soft = g.createRadialGradient(h, h, h * 0.06, h, h, h * 0.52)
  soft.addColorStop(0, 'rgba(255,255,255,0.14)')
  soft.addColorStop(0.45, 'rgba(255,255,255,0.04)')
  soft.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = soft
  g.fillRect(0, 0, size, size)

  return finish(c)
}

/** 值噪声：确定性哈希，不依赖 Math.random，保证每次打开星云一样 */
function hash2(x, y) {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
  return n - Math.floor(n)
}
function smooth(t) {
  return t * t * (3 - 2 * t)
}
function noise2(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y)
  const fx = smooth(x - ix), fy = smooth(y - iy)
  const a = hash2(ix, iy), b = hash2(ix + 1, iy), c = hash2(ix, iy + 1), d = hash2(ix + 1, iy + 1)
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy
}

/**
 * 星云：分形噪声 + 几团亮核，白色遮罩。三种 seed 各生成一张，
 * 叠在星系背后做冷色/紫色/绿色的深空底纹。
 */
export function nebulaTexture(seed = 1, size = 384) {
  const c = canvas(size)
  const g = c.getContext('2d')
  const img = g.createImageData(size, size)
  const half = size / 2
  const s = seed * 7.13
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = (x - half) / half
      const ny = (y - half) / half
      const radial = Math.max(0, 1 - Math.sqrt(nx * nx + ny * ny))
      const n1 = noise2(nx * 3.4 + s, ny * 3.4 - s)
      const n2 = noise2(nx * 8.2 - s * 0.6, ny * 8.2 + s * 0.4)
      const n3 = noise2(nx * 18.1 + s * 0.2, ny * 18.1 - s * 0.8)
      let v = n1 * 0.58 + n2 * 0.28 + n3 * 0.14
      v = Math.pow(Math.max(0, v - 0.28) * 1.55, 1.7)
      const alpha = Math.min(1, v * radial * 1.55)
      const i = (y * size + x) * 4
      img.data[i] = 255
      img.data[i + 1] = 255
      img.data[i + 2] = 255
      img.data[i + 3] = Math.round(alpha * 255)
    }
  }
  g.putImageData(img, 0, 0)

  // 几颗亮核：让星云不是一块均匀的雾
  g.globalCompositeOperation = 'lighter'
  for (let i = 0; i < 5; i++) {
    const a = hash2(i + seed, seed * 2.3) * Math.PI * 2
    const r = (0.12 + hash2(seed, i + 3) * 0.3) * half
    const x = half + Math.cos(a) * r
    const y = half + Math.sin(a) * r
    const rad = (0.05 + hash2(i + 8, seed) * 0.12) * size
    const grad = g.createRadialGradient(x, y, 0, x, y, rad)
    grad.addColorStop(0, 'rgba(255,255,255,0.18)')
    grad.addColorStop(0.5, 'rgba(255,255,255,0.05)')
    grad.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, size, size)
  }
  return finish(c)
}

/** 行星环：径向条带遮罩，贴在 RingGeometry 上 */
export function ringTexture(size = 256) {
  const c = canvas(size)
  const g = c.getContext('2d')
  const h = size / 2
  g.clearRect(0, 0, size, size)
  for (let r = h * 0.54; r < h * 0.98; r += 1) {
    const band = 0.35 + 0.65 * Math.abs(Math.sin(r * 0.42) * Math.sin(r * 0.13 + 1.2))
    const fade = Math.min(1, (r - h * 0.54) / (h * 0.1)) * Math.min(1, (h * 0.98 - r) / (h * 0.08))
    const a = Math.max(0, band * fade * 0.55)
    if (a < 0.02) continue
    g.beginPath()
    g.arc(h, h, r, 0, Math.PI * 2)
    g.strokeStyle = `rgba(255,255,255,${a.toFixed(3)})`
    g.lineWidth = 1.15
    g.stroke()
  }
  return finish(c)
}

/** 背景远星：一张小点，PointsMaterial 共用 */
export function dotTexture(size = 32) {
  const c = canvas(size)
  const g = c.getContext('2d')
  const h = size / 2
  const grad = g.createRadialGradient(h, h, 0, h, h, h)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.3, 'rgba(255,255,255,0.8)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, size, size)
  return finish(c)
}

/** 星系盘的螺旋尘埃点云（位置），确定性 */
export function galaxyDustPositions(count, radius, seed = 1) {
  const arr = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count
    const arm = i % 2
    const angle = arm * Math.PI + Math.sqrt(t) * 4.2 + hash2(i + seed, seed) * 0.6
    const r = radius * (0.16 + Math.sqrt(t) * 0.82) * (0.86 + hash2(seed, i + 5) * 0.22)
    arr[i * 3] = Math.cos(angle) * r
    arr[i * 3 + 1] = (hash2(i + 2, seed + 9) - 0.5) * radius * 0.08
    arr[i * 3 + 2] = Math.sin(angle) * r
  }
  return arr
}

/** 宇宙背景星场：球壳分布，三层大小 */
export function starfieldGeometry(count = 2200, inner = 900, outer = 2200, seed = 3) {
  const arr = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    const t = hash2(i + seed, seed * 1.7)
    const u = hash2(i + seed * 2, seed + 3)
    const y = 1 - 2 * t
    const r = Math.sqrt(Math.max(0, 1 - y * y))
    const phi = 2 * Math.PI * u
    const dist = inner + hash2(i + 7, seed + 11) * (outer - inner)
    arr[i * 3] = Math.cos(phi) * r * dist
    arr[i * 3 + 1] = y * dist
    arr[i * 3 + 2] = Math.sin(phi) * r * dist
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(arr, 3))
  return geo
}
