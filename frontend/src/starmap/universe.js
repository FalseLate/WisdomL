/**
 * Three.js 星图渲染层。
 *
 * 视觉结构从大到小：深空底（星场 + 星云）→ 星系云团/轨道环 → 星球（实体表面 + 大气层 + 行星环）
 * → 球壳上的知识点星点（耀斑 + 掌握度颜色）→ 连线与流动光点。
 *
 * 深浅两套共用同一份布局，只换手法：
 *   深色 = 自发光、叠加混合、耀斑、沿线光点、星云、bloom；
 *   浅色 = 哑光星球、描边、实心选中环、细轨道线，无粒子无辉光。
 *
 * 颜色真相只在 tokens-*.css：这里不出现第二个色值来源（中性白遮罩贴图除外）。
 */
import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { tokenRGBA, rgbaOf, mix } from './palette.js'
import { starRadius } from './layout.js'
import {
  haloTexture, flareTexture, nebulaTexture, ringTexture, dotTexture,
  galaxyDustPositions, starfieldGeometry
} from './visuals.js'

const SPHERE_HI = new THREE.SphereGeometry(1, 40, 28)
const SPHERE_LO = new THREE.SphereGeometry(1, 14, 10)
const RING = new THREE.RingGeometry(0.94, 1, 96)
// 星球成员边界环用更细的带宽：推近看时不会变成一圈厚厚的光墙
const BOUNDARY_RING = new THREE.RingGeometry(0.996, 1, 160)
const PLANET_RING_GEO = new THREE.RingGeometry(1.26, 1.72, 128)
const ORBIT_RING_GEO = new THREE.RingGeometry(0.996, 1, 128)
const HOME_PHI = 1.04
const BLOOM = { strength: 0.55, radius: 0.66, threshold: 0.29 }
/** 线拾取：屏幕空间容差 + 曲线分段数。分段距离而不是只比采样点，长线中间才不会有点不到的空隙 */
const EDGE_PICK_PX = 10
const EDGE_PICK_SEGMENTS = 24

/** 显示档：只影响观感，不碰布局。quality 是新增的降级档，auto 会看帧率自己降。 */
export const DISPLAY_DEFAULTS = Object.freeze({
  glow: 0.78,
  nodeSize: 1.08,
  linkWidth: 1,
  labels: 'auto',
  flows: true,
  dust: true,
  quality: 'auto'
})

const PLANET_VERT = `
varying vec3 vN;
varying vec3 vP;
varying vec3 vV;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vP = normalize(position);
  vN = normalize(mat3(modelMatrix) * normal);
  // 相机正好落在球面上时视线长度为 0，normalize 会得到 NaN
  vec3 toCam = cameraPosition - wp.xyz;
  float camLen = length(toCam);
  vV = camLen > 1e-5 ? toCam / camLen : vec3(0.0, 0.0, 1.0);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`

const PLANET_FRAG = `
uniform vec3 uColor;
uniform vec3 uPaper;
uniform vec3 uInk;
uniform float uLight;
uniform float uTime;
uniform float uSeed;
uniform float uOpacity;
uniform float uDim;
uniform float uSelected;
uniform float uHot;
uniform float uPattern;
varying vec3 vN;
varying vec3 vP;
varying vec3 vV;

void main() {
  vec3 n = normalize(vN);
  float lat = n.y;
  float bands = sin(lat * 15.0 + sin(n.x * 3.1 + uSeed) * 1.6 + sin(n.z * 4.3 - uSeed) * 1.1);
  bands = smoothstep(-0.55, 0.92, bands);
  float mottle = 0.5 + 0.5 * sin(n.x * 10.0 + n.z * 8.0 + uSeed * 2.0 + uTime * 0.035);
  if (uPattern > 1.5) {
    // 云雾：把条纹和噪声揉在一起，没有明显的纬线
    bands = smoothstep(-0.3, 0.9, bands * 0.45 + mottle * 0.75) * 0.7;
  } else if (uPattern > 0.5) {
    // 纯色：只留光照与边缘光
    bands = 0.5;
  }
  vec3 vDir = length(vV) > 1e-5 ? normalize(vV) : vec3(0.0, 0.0, 1.0);
  float light = clamp(dot(n, normalize(vec3(0.55, 0.82, 0.35))), 0.0, 1.0);
  float rim = pow(1.0 - clamp(dot(n, vDir), 0.0, 1.0), 2.7);
  vec3 col;
  if (uLight > 0.5) {
    // 浅色是哑光星球：以 token 原色为主，只加一点纸白提亮；线性空间里大比例混白会灰掉
    col = uColor * (0.95 + light * 0.5);
    col += uPaper * (0.025 + bands * 0.045);
    col = mix(col, uInk, rim * 0.18);
  } else {
    vec3 deep = mix(uColor * 0.14, uColor, 0.28 + bands * 0.5 + mottle * 0.1);
    col = deep * (0.2 + light * 0.78);
    col += uColor * rim * (0.26 + uSelected * 0.7 + uHot * 0.5);
    col += uColor * mottle * 0.03;
    col += uPaper * pow(light, 10.0) * 0.06;
  }
  float alpha = uOpacity * (1.0 - uDim * 0.6);
  gl_FragColor = vec4(col, alpha);
}`

const SHELL_VERT = `
varying vec3 vN;
varying vec3 vV;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vN = normalize(mat3(modelMatrix) * normal);
  vec3 toCam = cameraPosition - wp.xyz;
  float camLen = length(toCam);
  vV = camLen > 1e-5 ? toCam / camLen : vec3(0.0, 0.0, 1.0);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`

const SHELL_FRAG = `
uniform vec3 uColor;
uniform float uRim;
uniform float uPower;
uniform float uFill;
uniform float uOpacity;
varying vec3 vN;
varying vec3 vV;
void main() {
  vec3 vDir = length(vV) > 1e-5 ? normalize(vV) : vec3(0.0, 0.0, 1.0);
  // dot 的浮点误差会略大于 1，pow(负数, 小数) 是 NaN；泛光会把它扩散到整屏
  float f = pow(clamp(1.0 - abs(dot(normalize(vN), vDir)), 0.0, 1.0), uPower);
  gl_FragColor = vec4(uColor, (f * uRim + uFill) * uOpacity);
}`

function planetMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color() },
      uPaper: { value: new THREE.Color() },
      uInk: { value: new THREE.Color() },
      uLight: { value: 0 },
      uTime: { value: 0 },
      uSeed: { value: 0 },
      uOpacity: { value: 1 },
      uDim: { value: 0 },
      uSelected: { value: 0 },
      uHot: { value: 0 },
      uPattern: { value: 0 }
    },
    vertexShader: PLANET_VERT,
    fragmentShader: PLANET_FRAG,
    transparent: true,
    depthWrite: true
  })
}

function shellMaterial(light) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color() },
      uRim: { value: 1 },
      uPower: { value: light ? 3.4 : 3 },
      uFill: { value: light ? 0.01 : 0.014 },
      uOpacity: { value: 1 }
    },
    vertexShader: SHELL_VERT,
    fragmentShader: SHELL_FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: light ? THREE.NormalBlending : THREE.AdditiveBlending
  })
}

function readPalette() {
  const light = document.documentElement.dataset.theme === 'light'
  const bg = tokenRGBA('--bg-base')
  return {
    light,
    bg,
    accent: tokenRGBA('--accent'),
    secondary: tokenRGBA('--secondary'),
    emerald: tokenRGBA('--emerald-rgb'),
    success: tokenRGBA('--success'),
    warning: tokenRGBA('--warning'),
    danger: tokenRGBA('--danger'),
    muted: tokenRGBA('--text-muted'),
    ink: tokenRGBA('--text-primary'),
    paper: tokenRGBA('--bg-elevated'),
    dust: tokenRGBA('--accent-dim'),
    violet: tokenRGBA('--violet'),
    sky: tokenRGBA('--sky-text'),
    orange: tokenRGBA('--orange'),
    coral: tokenRGBA('--coral-text'),
    indigo: tokenRGBA('--indigo')
  }
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
const hash = s => {
  let h = 2166136261 >>> 0
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}

export function createUniverse({
  canvas, labelHost, sideInset = 0,
  onPick, onPickEdge, onPickGalaxy, onEnterTopic, onHover, onHoverEdge, onPlaceNode, onPlaceGalaxy, onLinkDrop, onDropStarOnTopic, onContext
}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(50, 1, 0.5, 6000)
  const group = new THREE.Group()
  const backdrop = new THREE.Group()
  scene.add(group, backdrop)
  backdrop.renderOrder = -100

  const hemi = new THREE.HemisphereLight(0xffffff, 0xffffff, 1.05)
  const dirLight = new THREE.DirectionalLight(0xffffff, 1.15)
  dirLight.position.set(0.6, 1, 0.8)
  scene.add(hemi, dirLight)

  const composer = new EffectComposer(renderer)
  composer.addPass(new RenderPass(scene, camera))
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), BLOOM.strength, BLOOM.radius, BLOOM.threshold)
  bloom.enabled = true
  composer.addPass(bloom)
  composer.addPass(new OutputPass())

  const tex = {
    halo: haloTexture(),
    flare: flareTexture(),
    dots: dotTexture(),
    rings: ringTexture(),
    nebula: [nebulaTexture(1), nebulaTexture(2), nebulaTexture(3)]
  }

  const objects = new Map()
  const edgeObjs = new Map()
  const galaxyObjs = new Map()
  const flowPool = []
  let starfieldFar = null
  let starfieldNear = null
  let nebulas = []
  let belt = null
  let beltLabel = null
  let selEdgeMesh = null
  let dustVisible = true

  const display = { ...DISPLAY_DEFAULTS }
  let linkMode = false
  let inset = sideInset

  const state = {
    graph: null,
    layout: null,
    palette: readPalette(),
    selected: null,
    selectedEdge: null,
    focus: null,
    isolate: null,
    scope: null,
    hover: null,
    hoverEdge: null,
    dropTopic: null,
    dragGalaxy: null,
    visualBounds: null
  }

  const HOME = { target: new THREE.Vector3(), radius: 380, theta: 0.92, phi: HOME_PHI }
  const view = { target: new THREE.Vector3(), theta: HOME.theta, phi: HOME.phi, radius: HOME.radius }
  const goal = { target: view.target.clone(), theta: view.theta, phi: view.phi, radius: view.radius }
  let tween = null
  let autoRotate = false
  let galaxyMode = false
  let autoTier = 0
  let firstGraph = true
  let spinTheta = 0
  let spinPhi = 0
  let dragActive = false
  let elapsed = 0
  let lastFrame = performance.now()
  let fpsAcc = 0
  let fpsFrames = 0
  let lastQualityCheck = 0

  const setCol = (colorObj, rgba) => colorObj.setRGB(rgba.r, rgba.g, rgba.b, THREE.SRGBColorSpace)
  const colOf = rgba => new THREE.Color().setRGB(rgba.r, rgba.g, rgba.b, THREE.SRGBColorSpace)

  function nodeColor(node, pal) {
    if (node.kind === 'topic') return rgbaOf(node.color, pal.accent)
    if (node.color) return rgbaOf(node.color, pal.muted)
    if (node.mastery == null) return pal.muted
    const m = node.mastery
    if (m >= 0.75) return mix(pal.warning, pal.success, Math.min(1, (m - 0.75) / 0.25))
    if (m >= 0.45) return mix(pal.danger, pal.warning, (m - 0.45) / 0.3)
    return pal.danger
  }

  function topicColorOf(key, pal) {
    const node = state.graph?.byKey.get(key)
    return rgbaOf(node?.color, pal.accent)
  }

  function edgeBaseColor(e, pal) {
    if (e.type === 'hier') return topicColorOf(e.a, pal)
    if (e.type === 'cooc') return pal.emerald
    // 语义线按“关系类型”默认分色：先修=琥珀、依赖=天蓝、关联=品红
    if (e.rel === '先修') return pal.warning
    if (e.rel === '依赖') return pal.sky
    return pal.secondary
  }

  // ===== 背景 =====
  function buildBackdrop() {
    const far = new THREE.Points(
      starfieldGeometry(3000, 1000, 2600, 3),
      new THREE.PointsMaterial({
        size: 1.6, map: tex.dots, transparent: true, opacity: 0.62, depthWrite: false,
        blending: THREE.AdditiveBlending, sizeAttenuation: false, fog: false,
        color: colOf(state.palette.dust)
      })
    )
    const near = new THREE.Points(
      starfieldGeometry(650, 620, 1500, 11),
      new THREE.PointsMaterial({
        size: 3.2, map: tex.dots, transparent: true, opacity: 0.72, depthWrite: false,
        blending: THREE.AdditiveBlending, sizeAttenuation: false, fog: false,
        color: colOf(state.palette.ink)
      })
    )
    far.renderOrder = -30
    near.renderOrder = -29
    backdrop.add(far, near)
    starfieldFar = far
    starfieldNear = near

    nebulas = []
    for (let i = 0; i < 4; i++) {
      const mat = new THREE.SpriteMaterial({
        map: tex.nebula[i % tex.nebula.length],
        color: colOf([state.palette.accent, state.palette.violet, state.palette.sky, state.palette.emerald][i]),
        transparent: true,
        opacity: 0.075,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
        fog: false
      })
      const sprite = new THREE.Sprite(mat)
      sprite.renderOrder = -40
      sprite.scale.setScalar(1200 + i * 260)
      backdrop.add(sprite)
      nebulas.push(sprite)
    }
  }

  function placeBackdrop() {
    if (!state.layout || !nebulas.length) return
    const b = state.layout.bounds
    const c = b ? b.center : { x: 0, y: 0, z: 0 }
    const r = b ? b.radius : 300
    const spots = [
      [-0.82, 0.34, -0.6, 0.95],
      [0.86, -0.26, -0.42, 0.82],
      [0.08, 0.16, 0.95, 1.05],
      [-0.18, -0.62, 0.32, 0.72]
    ]
    nebulas.forEach((sprite, i) => {
      const s = spots[i]
      sprite.position.set(c.x + s[0] * r, c.y + s[1] * r, c.z + s[2] * r)
      sprite.scale.setScalar(Math.max(380, r * s[3]))
    })
  }

  function paintBackdrop(pal) {
    if (!starfieldFar) return
    starfieldFar.material.color = colOf(pal.light ? pal.muted : pal.dust)
    starfieldFar.material.opacity = pal.light ? 0.32 : 0.62
    starfieldFar.material.blending = pal.light ? THREE.NormalBlending : THREE.AdditiveBlending
    starfieldFar.visible = display.dust
    starfieldNear.material.color = colOf(pal.light ? pal.muted : pal.ink)
    starfieldNear.material.opacity = pal.light ? 0.28 : 0.72
    starfieldNear.material.blending = pal.light ? THREE.NormalBlending : THREE.AdditiveBlending
    starfieldNear.visible = display.dust
    for (const sprite of nebulas) {
      sprite.material.blending = pal.light ? THREE.NormalBlending : THREE.AdditiveBlending
      sprite.material.opacity = pal.light ? 0.02 : 0.085 * Math.min(1.3, display.glow)
      sprite.visible = display.dust
    }
  }

  // ===== 节点 =====
  function makeLabel(kind, key) {
    const el = document.createElement('div')
    el.className = kind === 'topic' ? 'star-label topic' : 'star-label'
    el.dataset.key = key
    if (kind === 'topic') {
      const title = document.createElement('span')
      title.className = 't'
      const meta = document.createElement('span')
      meta.className = 'meta'
      el.append(title, meta)
    }
    labelHost.appendChild(el)
    return el
  }

  function ensureNode(key, kind) {
    let obj = objects.get(key)
    if (obj) return obj
    const label = makeLabel(kind, key)
    if (kind === 'topic') {
      const core = new THREE.Mesh(SPHERE_HI, planetMaterial())
      core.userData.key = key
      const shell = new THREE.Mesh(SPHERE_HI, shellMaterial(state.palette.light))
      shell.userData.key = key
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({
        map: tex.halo, transparent: true, depthWrite: false, depthTest: false
      }))
      halo.renderOrder = 2
      const ring = new THREE.Mesh(BOUNDARY_RING, new THREE.MeshBasicMaterial({
        transparent: true, side: THREE.DoubleSide, depthWrite: false, depthTest: false
      }))
      ring.renderOrder = 5
      ring.visible = false
      const planetRing = new THREE.Mesh(PLANET_RING_GEO, new THREE.MeshBasicMaterial({
        map: tex.rings, transparent: true, side: THREE.DoubleSide, depthWrite: false, opacity: 0.4
      }))
      planetRing.visible = false
      // 球内轨道环：让“知识点绕着星球”的层级在静止画面里也读得出来
      const orbitRing = new THREE.Mesh(ORBIT_RING_GEO, new THREE.MeshBasicMaterial({
        transparent: true, side: THREE.DoubleSide, depthWrite: false, opacity: 0.22
      }))
      orbitRing.rotation.x = 1.16
      orbitRing.rotation.z = (hash(key + 'orbit') % 100) / 100 * 0.9
      orbitRing.visible = false
      const seed = (hash(key) % 1000) / 127
      group.add(core, shell, halo, ring, planetRing, orbitRing)
      obj = {
        key, kind, core, shell, halo, ring, planetRing, orbitRing, label,
        spin: 0.018 + (hash(key) % 17) / 1400,
        seed,
        hasRing: hash(key + 'ring') % 100 > 38,
        baseR: 24, shellR: 24, haloBase: 0,
        labelState: ''
      }
    } else {
      // 星点永远浮在星球前面：知识点不该被星球核心挡住，否则看得见球、看不见星
      const basic = new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false })
      const lambert = new THREE.MeshLambertMaterial({ transparent: true, depthTest: false, depthWrite: false })
      const core = new THREE.Mesh(SPHERE_LO, basic)
      core.renderOrder = 2
      core.userData.key = key
      const outline = new THREE.Mesh(SPHERE_LO, new THREE.MeshBasicMaterial({
        transparent: true, side: THREE.BackSide, depthWrite: false, depthTest: false
      }))
      outline.renderOrder = 2
      const flare = new THREE.Sprite(new THREE.SpriteMaterial({
        map: tex.flare, transparent: true, depthWrite: false, depthTest: false
      }))
      flare.renderOrder = 3
      const ring = new THREE.Mesh(RING, new THREE.MeshBasicMaterial({
        transparent: true, side: THREE.DoubleSide, depthWrite: false, depthTest: false
      }))
      ring.visible = false
      ring.renderOrder = 4
      group.add(core, outline, flare, ring)
      obj = {
        key, kind, core, basic, lambert, outline, halo: flare, ring, label,
        spin: 0.02 + (hash(key) % 13) / 900,
        baseR: 2, haloBase: 0, dim: 0, starGlow: 1,
        labelState: ''
      }
    }
    obj.core.userData.node = obj
    if (obj.shell) obj.shell.userData.node = obj
    objects.set(key, obj)
    return obj
  }

  function disposeObject(obj) {
    for (const part of [obj.core, obj.shell, obj.outline, obj.halo, obj.ring, obj.planetRing, obj.orbitRing]) {
      if (!part) continue
      group.remove(part)
      if (part.material) part.material.dispose()
    }
    // 星点的基础/受光材质只挂一个，另一个也要释放，否则反复加载会漏材质
    if (obj.basic && obj.basic !== obj.core.material) obj.basic.dispose()
    if (obj.lambert && obj.lambert !== obj.core.material) obj.lambert.dispose()
    obj.label?.remove()
    objects.delete(obj.key)
  }

  function disposeNodes(keep) {
    for (const [key, obj] of [...objects]) if (!keep.has(key)) disposeObject(obj)
  }

  // ===== 星系云团 =====
  function syncGalaxies() {
    const pal = state.palette
    const list = state.graph?.galaxies || []
    const keep = new Set(list.map(g => g.key))
    for (const [key, obj] of [...galaxyObjs]) {
      if (keep.has(key)) continue
      group.remove(obj.cloud, ...obj.rings, obj.dust, obj.boundary)
      obj.cloud.material.dispose()
      for (const r of obj.rings) { r.geometry.dispose(); r.material.dispose() }
      obj.dust.geometry.dispose(); obj.dust.material.dispose()
      obj.boundary.geometry.dispose(); obj.boundary.material.dispose()
      obj.label.remove()
      galaxyObjs.delete(key)
    }
    list.forEach((g, i) => {
      const center = state.layout?.galaxies.get(g.key)?.center
      if (!center) return
      let obj = galaxyObjs.get(g.key)
      if (!obj) {
        const cloud = new THREE.Sprite(new THREE.SpriteMaterial({
          map: tex.nebula[i % tex.nebula.length], transparent: true, depthWrite: false, depthTest: false
        }))
        cloud.renderOrder = -8
        const rings = [0.58, 0.86].map(k => {
          const mesh = new THREE.Mesh(new THREE.RingGeometry(k - 0.0018, k + 0.0018, 160), new THREE.MeshBasicMaterial({
            transparent: true, side: THREE.DoubleSide, depthWrite: false
          }))
          mesh.rotation.x = 1.08
          mesh.rotation.z = (hash(g.key + k) % 100) / 100 * 0.5
          mesh.renderOrder = -6
          return mesh
        })
        const dust = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({
          size: 2.3, map: tex.dots, transparent: true, depthWrite: false,
          blending: THREE.AdditiveBlending, sizeAttenuation: true, opacity: 0.62
        }))
        dust.renderOrder = -7
        // 星系的外边界：让“这一团属于同一个星系”一眼可见
        const boundary = new THREE.Mesh(new THREE.RingGeometry(0.992, 1, 160), new THREE.MeshBasicMaterial({
          transparent: true, side: THREE.DoubleSide, depthWrite: false, depthTest: false
        }))
        boundary.renderOrder = -5
        const label = document.createElement('div')
        label.className = 'galaxy-label'
        labelHost.appendChild(label)
        group.add(cloud, ...rings, dust, boundary)
        obj = { key: g.key, cloud, rings, dust, boundary, label, dustCount: 0 }
        galaxyObjs.set(g.key, obj)
      }
      const info = state.layout.galaxies.get(g.key)
      const members = g.topics.map(k => state.layout.pos.get(k)).filter(Boolean)
      const centerNow = members.length
        ? members.reduce((a, p) => ({ x: a.x + p.x / members.length, y: a.y + p.y / members.length, z: a.z + p.z / members.length }), { x: 0, y: 0, z: 0 })
        : info.center
      const spread = members.reduce((max, p) => Math.max(max, Math.hypot(p.x - centerNow.x, p.y - centerNow.y, p.z - centerNow.z)), 0)
      const maxShell = g.topics.length ? Math.max(...g.topics.map(k => state.layout.shell.get(k) || 22)) : 0
      // 空的手建星系也保留一团雾；有成员后半径由成员分布和星球壳自适应
      const radius = members.length
        ? Math.min(360, spread + maxShell + 34)
        : Math.max(92, info.radius || 0)
      info.center = centerNow
      info.radius = radius
      state.layout.galaxies.set(g.key, info)
      const color = rgbaOf(g.color, [pal.accent, pal.violet, pal.sky, pal.emerald][i % 4])
      obj.cloud.position.set(centerNow.x, centerNow.y, centerNow.z)
      obj.cloud.scale.setScalar(radius * 2.7)
      obj.cloud.material.color = colOf(color)
      obj.cloud.material.blending = pal.light ? THREE.NormalBlending : THREE.AdditiveBlending
      const baseCloud = pal.light ? 0.25 : 0.55 * Math.min(1.4, display.glow)
      obj.cloudBaseOpacity = baseCloud + (galaxyMode ? 0.1 : 0)
      obj.cloud.material.opacity = obj.cloudBaseOpacity
      obj.cloud.visible = !state.scope && display.dust
      obj.rings.forEach((ring, ri) => {
        ring.position.set(centerNow.x, centerNow.y, centerNow.z)
        ring.scale.setScalar(radius * (ri === 0 ? 1 : 1.28))
        ring.material.color = colToColor(color, pal, 0.6)
        ring.material.blending = pal.light ? THREE.NormalBlending : THREE.AdditiveBlending
        ring.material.opacity = pal.light ? 0.55 : 0.65
        ring.visible = !state.scope
      })
      obj.boundary.position.set(centerNow.x, centerNow.y, centerNow.z)
      obj.boundary.scale.setScalar(radius * 1.12)
      obj.boundary.material.color = colToColor(color, pal, 0.35)
      obj.boundary.material.blending = pal.light ? THREE.NormalBlending : THREE.AdditiveBlending
      obj.boundary.material.opacity = pal.light ? 0.3 : (galaxyMode ? 0.34 : 0.24)
      obj.boundary.visible = !state.scope
      if (!obj.dustCount || Math.abs((obj.dustRadius || 0) - radius) > 1) {
        const count = Math.min(220, 90 + g.topics.length * 40)
        obj.dust.geometry.setAttribute('position', new THREE.BufferAttribute(galaxyDustPositions(count, radius, i + 1), 3))
        obj.dustCount = count
        obj.dustRadius = radius
      }
      obj.dust.position.set(centerNow.x, centerNow.y, centerNow.z)
      obj.dust.material.color = colOf(color)
      obj.dust.material.opacity = pal.light ? 0 : 0.62
      obj.dust.visible = !state.scope && !pal.light && display.dust
      obj.label.textContent = `${g.title} · ${g.topics.length} 星球`
      obj.info = info
    })
  }

  function colToColor(rgba, pal, dim) {
    const c = mix(rgba, pal.bg, dim)
    return colOf(c)
  }

  // ===== 星尘带 =====
  function syncBelt() {
    const info = state.layout?.belt
    const pal = state.palette
    if (!info || !info.count) {
      if (belt) belt.visible = false
      if (beltLabel) beltLabel.style.display = 'none'
      return
    }
    if (!belt) {
      belt = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({
        size: 1.4, map: tex.dots, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        sizeAttenuation: true, opacity: 0.4
      }))
      belt.renderOrder = -4
      group.add(belt)
      beltLabel = document.createElement('div')
      beltLabel.className = 'stardust-label'
      labelHost.appendChild(beltLabel)
    }
    const count = 460
    const arr = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count
      const a = i * Math.PI * (3 - Math.sqrt(5))
      const r = info.inner + (info.radius - info.inner) * t
      arr[i * 3] = Math.cos(a) * r
      arr[i * 3 + 1] = Math.sin(a * 1.7) * 7
      arr[i * 3 + 2] = Math.sin(a) * r
    }
    belt.geometry.dispose()
    belt.geometry = new THREE.BufferGeometry()
    belt.geometry.setAttribute('position', new THREE.BufferAttribute(arr, 3))
    belt.material.color = colOf(pal.light ? pal.muted : pal.dust)
    belt.material.opacity = pal.light ? 0.12 : 0.36
    belt.material.blending = pal.light ? THREE.NormalBlending : THREE.AdditiveBlending
    belt.visible = !state.scope && display.dust
    beltLabel.style.display = state.scope ? 'none' : ''
    beltLabel.textContent = `未归类星尘 · ${info.count}`
    const freeStars = state.graph?.stars.filter(s => !s.topicKey) || []
    const anchor = freeStars.filter(s => !s.pin).map(s => state.layout.pos.get(s.key)).find(Boolean)
    beltLabel.dataset.x = String(anchor?.x ?? 0)
    beltLabel.dataset.y = String((anchor?.y ?? 0) + 10)
    beltLabel.dataset.z = String(anchor?.z ?? 0)
  }

  // ===== 连线 =====
  function makeCurve(pa, pb, bend, side = 1) {
    const a = new THREE.Vector3(pa.x, pa.y, pa.z)
    const b = new THREE.Vector3(pb.x, pb.y, pb.z)
    const mid = a.clone().add(b).multiplyScalar(0.5)
    const seg = b.clone().sub(a)
    const len = seg.length() || 1
    const dir = seg.clone().normalize()
    let away = mid.clone().negate()
    if (away.lengthSq() < 1e-6) away = new THREE.Vector3(0, 1, 0)
    away.normalize().sub(dir.clone().multiplyScalar(away.dot(dir)))
    if (away.lengthSq() < 1e-6) away.set(dir.y, -dir.x, 0).normalize()
    else away.normalize()
    return new THREE.QuadraticBezierCurve3(a, mid.clone().add(away.multiplyScalar(len * bend * side)), b)
  }

  function edgeRadius(e) {
    const base = e.type === 'hier' ? 0.18 : e.type === 'cooc' ? 0.08 * (1 + Math.min(3, e.weight || 1) * 0.5) : 0.07
    return base * (e.width || 1) * display.linkWidth
  }

  const dashTemplates = {}
  function dashTemplate(style) {
    if (!dashTemplates[style]) {
      const cv = document.createElement('canvas')
      cv.width = 8
      cv.height = 2
      const g = cv.getContext('2d')
      g.fillStyle = '#000'
      g.fillRect(0, 0, 8, 2)
      g.fillStyle = '#fff'
      g.fillRect(0, 0, style === 'dotted' ? 2 : 5, 2)
      const t = new THREE.CanvasTexture(cv)
      t.wrapS = THREE.RepeatWrapping
      t.wrapT = THREE.ClampToEdgeWrapping
      t.magFilter = THREE.NearestFilter
      t.minFilter = THREE.NearestFilter
      dashTemplates[style] = t
    }
    return dashTemplates[style]
  }

  function dropEdge(styleKey) {
    const obj = edgeObjs.get(styleKey)
    if (!obj) return
    group.remove(obj.mesh)
    if (obj.arrow) {
      group.remove(obj.arrow)
      obj.arrow.geometry.dispose()
      obj.arrow.material.dispose()
    }
    if (obj.mesh.material.alphaMap) obj.mesh.material.alphaMap.dispose()
    obj.mesh.geometry.dispose()
    obj.mesh.material.dispose()
    edgeObjs.delete(styleKey)
  }

  function buildEdge(e) {
    dropEdge(e.styleKey)
    const pa = state.layout?.pos.get(e.a)
    const pb = state.layout?.pos.get(e.b)
    if (!pa || !pb) return
    const na = state.graph?.byKey.get(e.a)
    const nb = state.graph?.byKey.get(e.b)
    // 同一颗星球内部的线弯小一点：否则两点隔得远时会弯成一个“假光环”
    const sameTopic = !!(na?.topicKey && nb?.topicKey && na.topicKey === nb.topicKey)
      || (na?.kind === 'topic' && nb?.topicKey === na.key)
      || (nb?.kind === 'topic' && na?.topicKey === nb.key)
    // 同一对端点可能有多条线（反向语义、共现+语义）：按稳定顺序分到不同侧，
    // 两条反向线形成透镜形而不是完全重叠。
    const pair = [e.a, e.b].sort().join('|')
    const siblings = state.graph.edges
      .filter(x => [x.a, x.b].sort().join('|') === pair)
      .sort((x, y) => (x.styleKey < y.styleKey ? -1 : 1))
    const slot = Math.max(0, siblings.findIndex(x => x.styleKey === e.styleKey))
    const side = slot % 2 ? -1 : 1
    const baseBend = e.type === 'hier' ? 0.08 : sameTopic ? 0.12 : e.type === 'cooc' ? 0.22 : 0.28
    const bend = baseBend * (siblings.length > 1 ? 1.35 : 1)
    const curve = makeCurve(pa, pb, bend, side)
    const len = new THREE.Vector3(pa.x - pb.x, pa.y - pb.y, pa.z - pb.z).length()
    const dashed = e.lineStyle !== 'solid'
    const mesh = new THREE.Mesh(
      new THREE.TubeGeometry(curve, len < 25 ? 12 : 28, edgeRadius(e), 6, false),
      // 线浮在星球前面：球内连线是知识结构的一部分，不该被星球实体吃掉
      new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, depthTest: false })
    )
    if (dashed) {
      const t = dashTemplate(e.lineStyle).clone()
      const period = (e.lineStyle === 'dotted' ? 1.1 : 2.6) * (e.width || 1)
      t.repeat.set(Math.max(2, Math.round(curve.getLength() / period)), 1)
      t.needsUpdate = true
      mesh.material.alphaMap = t
    }
    mesh.renderOrder = dashed ? 1 : 0
    group.add(mesh)
    const obj = { e, curve, mesh, dashed, arrow: null }
    if (e.arrow) attachArrow(obj, e)
    edgeObjs.set(e.styleKey, obj)
    paintEdge(obj)
  }

  function attachArrow(obj, e) {
    if (obj.arrow) {
      group.remove(obj.arrow)
      obj.arrow.geometry.dispose()
      obj.arrow.material.dispose()
      obj.arrow = null
    }
    if (!e.arrow) return
    const mesh = new THREE.Mesh(new THREE.ConeGeometry(edgeRadius(e) * 2.7, edgeRadius(e) * 7.5, 7), new THREE.MeshBasicMaterial({
      transparent: true, depthWrite: false, depthTest: false
    }))
    mesh.renderOrder = 1
    const pos = obj.curve.getPoint(0.86)
    const dir = obj.curve.getTangent(0.86).normalize()
    mesh.position.copy(pos)
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)
    group.add(mesh)
    obj.arrow = mesh
  }

  function paintEdge(obj) {
    const pal = state.palette
    const e = obj.e
    const aVisible = lastVisible.has(e.a)
    const bVisible = lastVisible.has(e.b)
    // 进到球内时，跨球共现线保留为很淡的“外部关联”，另一端虽然被 scope 隐藏，
    // 但线还在；点它就能看到关系并跳过去。
    const external = aVisible !== bVisible
    const shown = aVisible || bVisible
    obj.mesh.visible = shown
    if (obj.arrow) obj.arrow.visible = shown
    if (!shown) { obj.flow = false; obj.external = false; return }
    const dim = Math.max(dimOf(e.a), dimOf(e.b))
    const picked = state.selectedEdge === e.styleKey
    const base = e.color ? rgbaOf(e.color, edgeBaseColor(e, pal)) : edgeBaseColor(e, pal)
    const col = applyColor({ r: 0, g: 0, b: 0, a: 1 }, base, pal, dim)
    setCol(obj.mesh.material.color, col)
    obj.mesh.material.blending = pal.light ? THREE.NormalBlending : THREE.AdditiveBlending
    const want = e.opacity == null
      ? (e.type === 'hier' ? (pal.light ? 0.6 : 0.6)
        : e.type === 'cooc' ? (pal.light ? 0.5 : 0.42)
          : (pal.light ? 0.5 : 0.46))
      : e.opacity
    const normal = dim ? want * 0.18 : picked ? Math.min(1, want + 0.25) : want
    obj.mesh.material.opacity = external
      ? normal * (pal.light ? 0.22 : 0.2) * (picked ? 1.7 : 1)
      : normal
    if (obj.arrow) {
      setCol(obj.arrow.material.color, col)
      obj.arrow.material.opacity = obj.mesh.material.opacity
    }
    obj.external = external
    obj.flow = display.flows && !pal.light && !dim && !external && e.flowDir !== 0 && (e.type === 'cooc' || e.type === 'ai')
  }

  function rebuildEdges() {
    for (const key of [...edgeObjs.keys()]) dropEdge(key)
    if (!state.graph || !state.layout) return
    for (const e of state.graph.edges) buildEdge(e)
  }

  function rebuildEdgesTouching(keys) {
    if (!state.graph) return
    for (const e of state.graph.edges) if (keys.has(e.a) || keys.has(e.b)) buildEdge(e)
  }

  // ===== 光点 =====
  function ensureFlow() {
    if (flowPool.length) return
    for (let i = 0; i < 150; i++) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: tex.dots, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false
      }))
      sprite.renderOrder = 6
      sprite.visible = false
      group.add(sprite)
      flowPool.push(sprite)
    }
  }

  const dimOf = key => (state.focus ? (state.focus.has(key) ? 0 : 1) : 0)

  function applyColor(target, base, pal, dim, alphaScale = 1) {
    const c = dim ? mix(base, pal.bg, 0.82) : base
    target.r = c.r; target.g = c.g; target.b = c.b
    target.a = (base.a ?? 1) * alphaScale * (dim ? (pal.light ? 0.3 : 0.16) : 1)
    return target
  }

  let lastVisible = new Set()
  let syncQueued = false

  /** 星点当前的视觉半径（含用户改的大小）；光环包络以它为准，而不是只看球心 */
  function starVisualR(star) {
    return starRadius(star) * display.nodeSize * (star.size || 1)
  }

  /**
   * 星球边界 = 星球实体表面、默认星点轨道、最远星点（含钉住/拖出去的）三者取最大。
   * 这样光环/边界环一定包住所有知识点，用户一眼能看出“这些点属于这颗球”。
   */
  function topicEnvelope(node, baseR) {
    const center = state.layout?.pos.get(node.key)
    const surfaceR = baseR * (node.size || 1) * 0.46
    let envelope = Math.max(baseR * 1.06, surfaceR * 1.22)
    if (!center) return envelope
    for (const key of node.children) {
      const p = state.layout.pos.get(key)
      const star = state.graph.byKey.get(key)
      if (!p || !star) continue
      const d = Math.hypot(p.x - center.x, p.y - center.y, p.z - center.z)
      // 多留一圈呼吸位：星点光晕和标签不至于贴着边界
      envelope = Math.max(envelope, d + starVisualR(star) + Math.max(10, baseR * 0.16))
    }
    return envelope
  }

  function rebuildVisualBounds() {
    if (!state.graph || !state.layout) return
    let minX = Infinity, minY = Infinity, minZ = Infinity
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
    const include = (p, r) => {
      minX = Math.min(minX, p.x - r); minY = Math.min(minY, p.y - r); minZ = Math.min(minZ, p.z - r)
      maxX = Math.max(maxX, p.x + r); maxY = Math.max(maxY, p.y + r); maxZ = Math.max(maxZ, p.z + r)
    }
    for (const t of state.graph.topics) {
      const p = state.layout.pos.get(t.key)
      const o = objects.get(t.key)
      if (p) include(p, o?.shellR || state.layout.shell.get(t.key) || 22)
    }
    for (const s of state.graph.stars) {
      // 未归类星尘在外缘，不参与全景取景：否则它会把主图挤小、把左侧星球顶出屏幕
      if (!s.topicKey) continue
      const p = state.layout.pos.get(s.key)
      if (p) include(p, starVisualR(s) + 4)
    }
    for (const g of state.graph.galaxies || []) {
      if (!g.manual || g.topics.length) continue
      const info = state.layout.galaxies.get(g.key)
      if (info) include(info.center, info.radius)
    }
    if (minX === Infinity) {
      state.visualBounds = state.layout.bounds
      return
    }
    state.visualBounds = {
      center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2, z: (minZ + maxZ) / 2 },
      radius: Math.max(70, Math.hypot(maxX - minX, maxY - minY, maxZ - minZ) / 2)
    }
  }
  function scheduleSync() {
    if (syncQueued) return
    syncQueued = true
    requestAnimationFrame(() => {
      syncQueued = false
      sync()
    })
  }

  function visibleSet() {
    const ids = new Set()
    if (state.scope) {
      ids.add(state.scope)
      for (const k of state.graph.byKey.get(state.scope)?.children || []) ids.add(k)
    } else {
      for (const n of state.graph.nodes) ids.add(n.key)
    }
    if (state.isolate) for (const k of [...ids]) if (!state.isolate.has(k)) ids.delete(k)
    return ids
  }

  // ===== 同步 =====
  function sync() {
    const { graph, layout } = state
    if (!graph || !layout) return
    const pal = state.palette = readPalette()
    const bg = colOf(pal.bg)
    scene.background = bg
    scene.fog = new THREE.FogExp2(bg.clone(), pal.light ? 0.0008 : 0.00105)
    hemi.intensity = pal.light ? 1.2 : 0.3
    dirLight.intensity = pal.light ? 1.05 : 0.16
    setCol(hemi.color, pal.paper)
    setCol(dirLight.color, pal.paper)
    setCol(hemi.groundColor, pal.bg)
    paintBackdrop(pal)

    lastVisible = visibleSet()
    const keep = new Set()
    for (const node of graph.nodes) {
      keep.add(node.key)
      const obj = ensureNode(node.key, node.kind)
      const p = layout.pos.get(node.key)
      if (!p) continue
      const dim = dimOf(node.key)
      const shown = lastVisible.has(node.key)
      const isTopic = node.kind === 'topic'
      const picked = state.selected === node.key
      const inside = state.scope === node.key
      const planet = isTopic ? layout.planet.get(node.key) : null
      const sizeMul = node.size || 1
      const glowMul = node.glow ?? 1
      const surfaceR = isTopic
        ? (planet?.baseR || layout.shell.get(node.key) || 22) * sizeMul * 0.46
        : starVisualR(node)
      const haloR = isTopic ? topicEnvelope(node, planet?.baseR || layout.shell.get(node.key) || 22) : 0
      const base = nodeColor(node, pal)

      obj.core.position.set(p.x, p.y, p.z)
      obj.halo.position.set(p.x, p.y, p.z)
      obj.ring.position.set(p.x, p.y, p.z)
      obj.core.visible = shown
      obj.halo.visible = shown && !(isTopic && inside)
      // 星球的边界环常驻（进到球内也保留）：它圈住的才是这颗球的知识点
      obj.ring.visible = shown && (isTopic || picked)
      obj.baseR = surfaceR
      obj.shellR = haloR || surfaceR
      obj.dim = dim

      if (isTopic) {
        // 进入球内后把实体星球缩小、压暗：它是定位锚点，不该像一面墙挡住星点
        obj.core.scale.setScalar(inside ? surfaceR * 0.45 : surfaceR)
        obj.shell.position.set(p.x, p.y, p.z)
        obj.shell.scale.setScalar(haloR)
        obj.shell.visible = shown && !inside
        obj.haloBase = surfaceR * 3.3 * glowMul * (picked ? 1.15 : 1)
        obj.halo.scale.setScalar(obj.haloBase)
        obj.ring.scale.setScalar(haloR * 1.02)
        obj.planetRing.position.set(p.x, p.y, p.z)
        obj.planetRing.scale.setScalar(Math.min(surfaceR * 1.02, haloR * 0.52))
        obj.planetRing.rotation.x = 1.14
        obj.planetRing.rotation.z = (hash(node.key) % 100) / 100 * 0.6
        // 装饰性的土星环会让人误以为它是“成员边界”，这里只保留明确的光环边界环
        obj.planetRing.visible = false
        // 不再画内圈轨道：会和“成员边界环”抢语义；只保留一个明确的光环
        obj.orbitRing.position.set(p.x, p.y, p.z)
        obj.orbitRing.scale.setScalar(haloR * 0.55)
        obj.orbitRing.visible = false
        obj.orbitRing.material.color = colOf(mix(base, pal.paper, pal.light ? 0.3 : 0.1))
        obj.orbitRing.material.blending = pal.light ? THREE.NormalBlending : THREE.AdditiveBlending
        obj.orbitRing.material.opacity = dim ? 0.05 : pal.light ? 0.24 : 0.16
        const m = obj.core.material
        setCol(m.uniforms.uColor.value, pal.light ? base : mix(base, pal.bg, 0.16))
        setCol(m.uniforms.uPaper.value, pal.paper)
        setCol(m.uniforms.uInk.value, pal.ink)
        m.uniforms.uLight.value = pal.light ? 1 : 0
        m.uniforms.uSeed.value = obj.seed
        m.uniforms.uOpacity.value = inside ? 0.58 : 1
        m.uniforms.uDim.value = dim ? 1 : 0
        m.uniforms.uSelected.value = picked ? 1 : 0
        m.uniforms.uHot.value = state.dropTopic === node.key ? 1 : 0
        m.uniforms.uPattern.value = node.pattern === 'smooth' ? 1 : node.pattern === 'cloudy' ? 2 : 0
        const sm = obj.shell.material
        sm.blending = pal.light ? THREE.NormalBlending : THREE.AdditiveBlending
        setCol(sm.uniforms.uColor.value, rgbaOf(node.color, pal.accent))
        sm.uniforms.uRim.value = (dim ? 0.1 : pal.light ? 0.34 : 1.05 * (0.5 + 0.5 * Math.min(1.4, display.glow))) * Math.min(1.8, glowMul)
        sm.uniforms.uPower.value = pal.light ? 3.2 : 2.8
        sm.uniforms.uFill.value = dim ? 0 : pal.light ? 0.012 : 0.018
        sm.uniforms.uOpacity.value = 1
        obj.halo.material.color = colOf(applyColor({ r: 0, g: 0, b: 0, a: 1 }, base, pal, dim))
        obj.halo.material.opacity = (pal.light ? 0.14 : 0.3) * Math.min(1.4, display.glow) * Math.min(1.6, glowMul) * (dim ? 0.2 : 1) * (picked ? 1.25 : 1)
        obj.halo.material.blending = pal.light ? THREE.NormalBlending : THREE.AdditiveBlending
        obj.ring.material.color = colOf(rgbaOf(node.color, pal.accent))
        obj.ring.material.blending = pal.light ? THREE.NormalBlending : THREE.AdditiveBlending
        obj.planetRing.material.color = colOf(mix(base, pal.paper, pal.light ? 0.35 : 0.15))
        obj.planetRing.material.opacity = pal.light ? 0.34 : 0.4
        state.layout.shell.set(node.key, haloR)
      } else {
        // 星点的“实体”要小：它是光点，不是小行星；耀斑贴图负责亮度，球体只负责遮挡与拾取
        const coreR = surfaceR * 0.48
        const glow = node.mastery == null ? 0.55 : 0.36 + node.mastery * 0.64
        obj.starGlow = glow
        obj.core.scale.setScalar(coreR)
        const basic = obj.basic
        setCol(basic.color, applyColor({ r: 0, g: 0, b: 0, a: 1 }, pal.light ? base : mix(base, pal.paper, 0.22), pal, dim))
        basic.opacity = pal.light ? 1 : dim ? 0.4 : Math.max(0.45, 0.7 + glow * 0.3)
        setCol(obj.lambert.color, applyColor({ r: 0, g: 0, b: 0, a: 1 }, base, pal, dim))
        obj.lambert.opacity = dim ? 0.35 : 1
        obj.core.material = pal.light ? obj.lambert : basic
        obj.outline.visible = shown
        obj.outline.position.copy(obj.core.position)
        obj.outline.scale.setScalar(coreR * 1.16)
        setCol(obj.outline.material.color, colOf(pal.light ? pal.ink : base))
        obj.outline.material.opacity = dim ? 0.08 : pal.light ? 0.42 : 0.34
        obj.haloBase = coreR * (22 + glow * 6) * Math.min(1.6, glowMul) * (picked ? 1.3 : 1)
        obj.halo.scale.setScalar(obj.haloBase)
        setCol(obj.halo.material.color, applyColor({ r: 0, g: 0, b: 0, a: 1 }, base, pal, dim))
        obj.halo.material.blending = pal.light ? THREE.NormalBlending : THREE.AdditiveBlending
        obj.halo.material.opacity = (pal.light ? 0.32 : 0.85) * (0.55 + glow * 0.6) * (dim ? 0.15 : 1) * (picked ? 1.2 : 1)
        obj.ring.scale.setScalar(coreR * 2.6)
        obj.ring.material.color = colOf(base)
        obj.ring.material.blending = pal.light ? THREE.NormalBlending : THREE.AdditiveBlending
      }
    }
    disposeNodes(keep)
    rebuildVisualBounds()

    for (const [, obj] of edgeObjs) paintEdge(obj)
    paintSelectedEdge(pal)
    syncGalaxies()
    syncBelt()
    ensureFlow()
    if (pal.light || !display.flows) for (const s of flowPool) s.visible = false
    updateLabels()
    applyQuality()
  }

  function paintSelectedEdge(pal) {
    const obj = state.selectedEdge ? edgeObjs.get(state.selectedEdge) : null
    if (!obj) {
      if (selEdgeMesh) {
        group.remove(selEdgeMesh)
        selEdgeMesh.geometry.dispose()
        selEdgeMesh.material.dispose()
        selEdgeMesh = null
      }
      return
    }
    if (!selEdgeMesh) {
      selEdgeMesh = new THREE.Mesh(new THREE.TubeGeometry(obj.curve, 28, edgeRadius(obj.e) * 3.1, 6, false), new THREE.MeshBasicMaterial({
        transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending
      }))
      selEdgeMesh.renderOrder = 1
      group.add(selEdgeMesh)
    } else {
      selEdgeMesh.geometry.dispose()
      selEdgeMesh.geometry = new THREE.TubeGeometry(obj.curve, 28, edgeRadius(obj.e) * 3.1, 6, false)
    }
    setCol(selEdgeMesh.material.color, obj.e.color ? rgbaOf(obj.e.color, edgeBaseColor(obj.e, pal)) : edgeBaseColor(obj.e, pal))
    selEdgeMesh.material.blending = pal.light ? THREE.NormalBlending : THREE.AdditiveBlending
    selEdgeMesh.material.opacity = pal.light ? 0.28 : 0.5
  }

  // ===== 名字 =====
  const LABEL_MIN_PX = 26

  function updateLabels() {
    if (!state.graph || !state.layout) return
    const rect = canvas.getBoundingClientRect()
    if (!rect.width) return
    const v = new THREE.Vector3()
    const maxX = Math.max(100, rect.width - inset - 86)
    const near = state.focus || (state.selected ? new Set([state.selected]) : null)
    const placed = []

    const hits = (l, t, r, b) => placed.some(p => !(r < p.l || l > p.r || b < p.t || t > p.b))
    const tryPlace = (el, cx, cy, halfW, halfH, tries) => {
      for (const yOff of tries) {
        const x = clamp(cx, halfW + 8, Math.min(maxX, rect.width - inset - halfW - 8))
        const y = clamp(cy + yOff, 64, rect.height - 54)
        if (!hits(x - halfW, y - halfH, x + halfW, y + halfH)) {
          el.style.transform = `translate(-50%,-50%) translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`
          placed.push({ l: x - halfW, r: x + halfW, t: y - halfH, b: y + halfH })
          return true
        }
      }
      return false
    }

    const candidates = []
    for (const [key, obj] of objects) {
      const hot = state.selected === key || state.hover === key
      const pxOf = obj.kind === 'topic'
        ? (obj.shellR * 2 / (2 * camera.position.distanceTo(obj.core.position) * Math.tan((camera.fov * Math.PI) / 360))) * rect.height
        : (obj.baseR * 2 / (2 * camera.position.distanceTo(obj.core.position) * Math.tan((camera.fov * Math.PI) / 360))) * rect.height
      const show = obj.core.visible && (
        hot || obj.kind === 'topic' || state.scope || display.labels === 'all' || (near && near.has(key)) || pxOf >= LABEL_MIN_PX
      )
      if (!show) continue
      const p = state.layout.pos.get(key)
      if (!p) continue
      v.set(p.x, p.y, p.z).project(camera)
      if (v.z > 1) continue
      candidates.push({
        key, obj, hot,
        x: (v.x * 0.5 + 0.5) * rect.width,
        y: (-v.y * 0.5 + 0.5) * rect.height,
        offset: obj.kind === 'topic' ? Math.max(16, pxOf / 2 + 12) : Math.max(10, pxOf / 2 + 8),
        priority: (hot ? 10000 : 0) + (obj.kind === 'topic' ? 500 : 100)
      })
    }
    // 这一帧不该出现的标签先收掉，避免上一帧的残留
    const candidateKeys = new Set(candidates.map(c => c.key))
    for (const [key, obj] of objects) if (!candidateKeys.has(key)) obj.label.classList.remove('show')
    // 选中的、悬停的、星球的标签优先占位；重叠时下面的标签自动收起
    candidates.sort((a, b) => b.priority - a.priority)
    for (const c of candidates) {
      const { obj, key, hot } = c
      const node = state.graph.byKey.get(key)
      const showMeta = hot || state.scope || display.labels === 'all'
      if (obj.kind === 'topic') {
        const titleEl = obj.label.firstElementChild
        const metaEl = obj.label.lastElementChild
        if (titleEl && titleEl.textContent !== node.title) titleEl.textContent = node.title
        const meta = `${node.children.length} 星点${node.mastery == null ? '' : ` · 掌握 ${Math.round(node.mastery * 100)}%`}`
        if (metaEl) {
          metaEl.style.display = showMeta ? '' : 'none'
          if (showMeta && metaEl.textContent !== meta) metaEl.textContent = meta
        }
      } else if (obj.label.textContent !== (node?.title || '')) {
        obj.label.textContent = node?.title || ''
      }
      const halfW = Math.max(30, (obj.label.offsetWidth || 100) / 2)
      const halfH = Math.max(9, (obj.label.offsetHeight || 20) / 2)
      const h = halfH * 2
      const tries = [-c.offset, -c.offset - h - 4, c.offset, c.offset + h + 4, -c.offset - (h + 4) * 2]
      let ok = false
      if (hot) {
        // 选中的标签必须出现，允许压住别人
        ok = tryPlace(obj.label, c.x, c.y, halfW, halfH, tries)
        if (!ok) {
          const x = clamp(c.x, halfW + 8, Math.min(maxX, rect.width - inset - halfW - 8))
          const y = clamp(c.y - c.offset, 64, rect.height - 54)
          obj.label.style.transform = `translate(-50%,-50%) translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`
          placed.push({ l: x - halfW, r: x + halfW, t: y - halfH, b: y + halfH })
        }
      } else {
        ok = tryPlace(obj.label, c.x, c.y, halfW, halfH, tries)
      }
      obj.label.classList.toggle('pick', hot)
      obj.label.classList.toggle('show', ok)
    }

    // 星系标签：全景时贴在云团上方；和节点标签冲突就收起，避免糊成一团
    for (const [, obj] of galaxyObjs) {
      const info = obj.info
      if (!info || state.scope) { obj.label.classList.remove('show'); continue }
      v.set(info.center.x, info.center.y + info.radius * 0.72, info.center.z).project(camera)
      if (v.z > 1) { obj.label.classList.remove('show'); continue }
      const halfW = Math.max(42, (obj.label.offsetWidth || 120) / 2)
      const halfH = 9
      const ok = tryPlace(obj.label, (v.x * 0.5 + 0.5) * rect.width, (-v.y * 0.5 + 0.5) * rect.height, halfW, halfH,
        [0, -24, 24, -48, 48])
      obj.label.classList.toggle('show', ok)
    }

    if (beltLabel && belt?.visible) {
      v.set(Number(beltLabel.dataset.x) || 0, Number(beltLabel.dataset.y) || 0, Number(beltLabel.dataset.z) || 0).project(camera)
      if (v.z <= 1) {
        const halfW = Math.max(42, (beltLabel.offsetWidth || 110) / 2)
        const ok = tryPlace(beltLabel, (v.x * 0.5 + 0.5) * rect.width, (-v.y * 0.5 + 0.5) * rect.height, halfW, 9,
          [0, -22, 22])
        beltLabel.classList.toggle('show', ok)
      } else beltLabel.classList.remove('show')
    }
  }

  // ===== 相机 =====
  function applyCamera() {
    const sinPhi = Math.sin(view.phi)
    camera.position.set(
      view.target.x + view.radius * sinPhi * Math.cos(view.theta),
      view.target.y + view.radius * Math.cos(view.phi),
      view.target.z + view.radius * sinPhi * Math.sin(view.theta)
    )
    camera.lookAt(view.target)
  }

  const snapshotView = () => ({ target: view.target.clone(), theta: view.theta, phi: view.phi, radius: view.radius })
  const snapshotGoal = () => ({ target: goal.target.clone(), theta: goal.theta, phi: goal.phi, radius: goal.radius })

  function startTween(ms = 820) {
    if (ms <= 0) {
      Object.assign(view, { theta: goal.theta, phi: goal.phi, radius: goal.radius })
      view.target.copy(goal.target)
      tween = null
      return
    }
    tween = { t0: performance.now(), dur: ms, from: snapshotView(), to: snapshotGoal() }
  }

  function stepTween(now) {
    if (!tween) return
    const k = Math.min(1, (now - tween.t0) / tween.dur)
    const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2
    view.target.lerpVectors(tween.from.target, tween.to.target, e)
    view.radius = tween.from.radius + (tween.to.radius - tween.from.radius) * e
    view.phi = tween.from.phi + (tween.to.phi - tween.from.phi) * e
    let dTheta = tween.to.theta - tween.from.theta
    if (dTheta > Math.PI) dTheta -= Math.PI * 2
    if (dTheta < -Math.PI) dTheta += Math.PI * 2
    view.theta = tween.from.theta + dTheta * e
    if (k >= 1) tween = null
  }

  function nodeWorld(key) {
    const p = state.layout?.pos.get(key)
    return p ? new THREE.Vector3(p.x, p.y, p.z) : null
  }

  function fitHome() {
    const b = state.visualBounds || state.layout?.bounds
    if (!b) { HOME.radius = 380; HOME.target.set(0, 0, 0); return }
    HOME.target.set(b.center.x, b.center.y, b.center.z)
    const vertical = b.radius / Math.sin((camera.fov * Math.PI) / 360) * 1.02
    const panel = 1 + Math.min(0.4, inset / Math.max(900, window.innerWidth) * 0.9)
    HOME.radius = clamp(vertical * panel, 220, 1900)
  }

  function flyTo(key, radiusScale, instant = false) {
    const node = state.graph?.byKey.get(key)
    const p = nodeWorld(key)
    if (!node || !p) return
    const isTopic = node.kind === 'topic'
    const planet = isTopic ? state.layout.planet.get(key) : null
    const parent = !isTopic && node.topicKey ? state.layout.planet.get(node.topicKey) : null
    const topicHalo = isTopic
      ? (objects.get(key)?.shellR || (planet?.baseR || 24) * (node.size || 1))
      : (objects.get(node.topicKey)?.shellR || (parent?.baseR || 24) * (node.size || 1))
    const r = isTopic ? topicHalo : starRadius(node) * (node.size || 1)
    // 选球内的星点时留出看整颗星球的距离，否则镜头会怼到星球核心上
    const floor = isTopic ? 30 : Math.max(34, topicHalo * 1.55)
    goal.target.copy(p)
    goal.radius = Math.min(1600, Math.max(floor, r * (radiusScale || (isTopic ? 2.6 : 11))))
    goal.phi = isTopic ? HOME_PHI : clamp(view.phi, 0.4, Math.PI - 0.4)
    if (instant) {
      view.target.copy(goal.target)
      view.radius = goal.radius
      view.phi = goal.phi
      tween = null
    } else startTween()
  }

  function resetView(animate = true) {
    fitHome()
    goal.target.copy(HOME.target)
    goal.radius = HOME.radius
    goal.phi = HOME.phi
    goal.theta = HOME.theta
    if (animate) startTween()
    else {
      view.target.copy(goal.target)
      view.radius = goal.radius
      view.phi = goal.phi
      view.theta = goal.theta
      tween = null
    }
  }

  /** 搜索结果定位到星系雾团：保留当前方向，只换目标与距离 */
  function flyToGalaxy(key) {
    const info = state.layout?.galaxies.get(key)
    if (!info) return
    goal.target.set(info.center.x, info.center.y, info.center.z)
    goal.radius = Math.max(140, info.radius * 2.6)
    goal.theta = view.theta
    goal.phi = HOME_PHI
    startTween(800)
  }

  /** 进/出球时的目标取景：进到球内看整团，出来回到全景 */
  function focusTopic(key) {
    const p = nodeWorld(key)
    if (!p) return
    const planet = state.layout.planet.get(key)
    const node = state.graph?.byKey.get(key)
    const haloR = objects.get(key)?.shellR || (planet?.baseR || 24) * (node?.size || 1)
    goal.target.copy(p)
    // 2.6 倍动态边界：光环保留完整，球内星点和连线都看得清
    goal.radius = Math.max(40, haloR * 2.6)
    goal.phi = HOME_PHI
    startTween(900)
  }

  // ===== 交互 =====
  const pointers = new Map()
  let last = null
  let pinchStart = 0
  let dragMoved = 0
  let dragNode = null
  let pendingEdgeKeys = null
  let spaceDown = false
  let galaxyDrag = null
  const panDrag = { active: false, x: 0, y: 0 }
  const plane = new THREE.Plane()
  const grab = new THREE.Vector3()
  const ray = new THREE.Raycaster()
  const ndc = new THREE.Vector2()
  const sp = new THREE.Vector3()
  const edgeMid = new THREE.Vector3()

  function clusterKeys(key) {
    const set = new Set([key])
    for (const c of state.graph.byKey.get(key)?.children || []) set.add(c)
    return set
  }

  function galaxyOfNode(key) {
    const node = state.graph?.byKey.get(key)
    if (!node) return null
    if (node.kind === 'topic') return node.galaxyKey || null
    return node.topicKey ? (state.graph.byKey.get(node.topicKey)?.galaxyKey || null) : null
  }

  function galaxyAtScreen(clientX, clientY) {
    if (!state.graph || !state.layout) return null
    const rect = canvas.getBoundingClientRect()
    if (!rect.width) return null
    const tan = Math.tan((camera.fov * Math.PI) / 360)
    let best = null
    let bestRatio = 1
    for (const g of state.graph.galaxies || []) {
      const info = state.layout.galaxies.get(g.key)
      if (!info) continue
      sp.set(info.center.x, info.center.y, info.center.z).project(camera)
      if (sp.z > 1) continue
      const x = (sp.x * 0.5 + 0.5) * rect.width
      const y = (-sp.y * 0.5 + 0.5) * rect.height
      const dist = Math.hypot(x - (clientX - rect.left), y - (clientY - rect.top))
      const camDist = camera.position.distanceTo(new THREE.Vector3(info.center.x, info.center.y, info.center.z))
      const screenR = Math.max(48, info.radius * 1.25 / (camDist * tan) * (rect.height / 2))
      const ratio = dist / screenR
      if (ratio < bestRatio) { bestRatio = ratio; best = g.key }
    }
    return best
  }

  function galaxyMemberKeys(galaxyKey) {
    const g = state.graph?.galaxies.find(x => x.key === galaxyKey)
    const keys = new Set()
    for (const tkey of g?.topics || []) {
      keys.add(tkey)
      for (const c of state.graph.byKey.get(tkey)?.children || []) keys.add(c)
    }
    return keys
  }

  function planePoint(clientX, clientY) {
    const rect = canvas.getBoundingClientRect()
    ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1)
    ray.setFromCamera(ndc, camera)
    const out = new THREE.Vector3()
    return ray.ray.intersectPlane(plane, out) ? out : null
  }

  function nodeAt(clientX, clientY) {
    return pick(clientX, clientY, { ignoreEdges: true }).node
  }

  function refitShell(topicKey) {
    const t = state.graph?.byKey.get(topicKey)
    const c = state.layout?.pos.get(topicKey)
    if (!t || !c) return
    const base = state.layout.planet?.get(topicKey)?.baseR || 24
    let max = base
    for (const k of t.children) {
      const p = state.layout.pos.get(k)
      const n = state.graph.byKey.get(k)
      if (p && n) max = Math.max(max, Math.hypot(p.x - c.x, p.y - c.y, p.z - c.z) + starRadius(n))
    }
    state.layout.shell.set(topicKey, clamp(max + 3.4, base, base * 1.65))
  }

  let linkDrag = null
  let rubber = null
  function drawRubber(from, to) {
    if (!rubber) {
      rubber = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineDashedMaterial({
        transparent: true, opacity: 0.95, dashSize: 1.6, gapSize: 1, depthTest: false
      }))
      rubber.renderOrder = 8
      group.add(rubber)
    }
    rubber.geometry.dispose()
    rubber.geometry = new THREE.BufferGeometry().setFromPoints([from, to])
    rubber.computeLineDistances()
    setCol(rubber.material.color, state.palette.accent)
    rubber.visible = true
  }
  function clearRubber() {
    if (rubber) rubber.visible = false
    linkDrag = null
  }

  function snapNode(clientX, clientY, except) {
    const direct = nodeAt(clientX, clientY)
    if (direct && direct !== except) return direct
    const rect = canvas.getBoundingClientRect()
    let best = null
    let bestD = 58
    for (const [key, obj] of objects) {
      if (key === except || !obj.core.visible) continue
      sp.copy(obj.core.position).project(camera)
      if (sp.z > 1) continue
      const d = Math.hypot((sp.x * 0.5 + 0.5) * rect.width - (clientX - rect.left), (-sp.y * 0.5 + 0.5) * rect.height - (clientY - rect.top))
      if (d < bestD) { bestD = d; best = key }
    }
    return best
  }

  function setDropTopic(key) {
    if (state.dropTopic === key) return
    state.dropTopic = key
    sync()
  }

  function editableTarget(target) {
    const tag = target?.tagName?.toLowerCase()
    return tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable
  }
  function onSpaceDown(ev) {
    if (ev.code !== 'Space' || editableTarget(ev.target)) return
    spaceDown = true
    ev.preventDefault()
  }
  function onSpaceUp(ev) {
    if (ev.code === 'Space') spaceDown = false
  }

  canvas.addEventListener('mousedown', ev => {
    // 中键默认会触发浏览器自动滚动，必须拦掉
    if (ev.button === 1) ev.preventDefault()
  })
  canvas.addEventListener('auxclick', ev => {
    if (ev.button === 1) ev.preventDefault()
  })

  canvas.addEventListener('pointerdown', ev => {
    canvas.setPointerCapture(ev.pointerId)
    canvas.classList.remove('pickable')
    onHoverEdge?.(null)
    pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY })
    dragMoved = 0
    spinTheta = 0
    spinPhi = 0
    panDrag.active = false
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()]
      pinchStart = Math.hypot(a.x - b.x, a.y - b.y)
      dragNode = null
      clearRubber()
    }
    last = { x: ev.clientX, y: ev.clientY }
    tween = null
    dragNode = null
    dragActive = ev.button === 0 && pointers.size === 1
    // 中键 = 平移；空格+左键 = 给没有中键的笔记本
    if ((ev.button === 1 || (ev.button === 0 && spaceDown)) && pointers.size === 1) {
      ev.preventDefault()
      panDrag.active = true
      panDrag.x = ev.clientX
      panDrag.y = ev.clientY
      canvas.classList.add('grabbing')
      return
    }
    if (ev.button !== 0 || pointers.size > 1) return
    const hit = nodeAt(ev.clientX, ev.clientY)
    // 星系模式：按住星系内任意节点，或按住雾团空白处，都变成“整团拖”
    if (galaxyMode && !ev.shiftKey && !linkMode) {
      const g = hit ? galaxyOfNode(hit) : galaxyAtScreen(ev.clientX, ev.clientY)
      const info = g ? state.layout.galaxies.get(g) : null
      if (g && info) {
        const center = new THREE.Vector3(info.center.x, info.center.y, info.center.z)
        grab.copy(center)
        plane.setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()).negate(), center)
        galaxyDrag = { key: g, node: hit || null }
        state.dragGalaxy = g
        dragNode = null
        canvas.classList.add('grabbing')
        refreshTransforms()
        return
      }
    }
    if (!hit) return
    const p = state.layout.pos.get(hit)
    grab.set(p.x, p.y, p.z)
    plane.setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()).negate(), grab)
    if (ev.shiftKey || linkMode) linkDrag = { from: hit, target: null }
    else {
      dragNode = hit
      dragActive = true
    }
  })

  canvas.addEventListener('pointermove', ev => {
    if (pointers.has(ev.pointerId)) pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY })
    if (pointers.size === 2 && pinchStart) {
      const [a, b] = [...pointers.values()]
      const d = Math.hypot(a.x - b.x, a.y - b.y)
      goal.radius = view.radius = clamp(view.radius * (pinchStart / Math.max(d, 1)), 16, 2400)
      return
    }
    if (panDrag.active && pointers.size === 1) {
      const dx = ev.clientX - panDrag.x
      const dy = ev.clientY - panDrag.y
      const rect = canvas.getBoundingClientRect()
      const k = 2 * view.radius * Math.tan((camera.fov * Math.PI) / 360) / Math.max(1, rect.height)
      const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0)
      const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1)
      view.target.addScaledVector(right, -dx * k).addScaledVector(up, dy * k)
      goal.target.copy(view.target)
      panDrag.x = ev.clientX
      panDrag.y = ev.clientY
      dragMoved += Math.abs(dx) + Math.abs(dy)
      canvas.classList.add('grabbing')
      updateLabels()
      return
    }
    if (galaxyDrag && pointers.size === 1) {
      const hit = planePoint(ev.clientX, ev.clientY)
      if (hit) {
        const dx = hit.x - grab.x, dy = hit.y - grab.y, dz = hit.z - grab.z
        const keys = galaxyMemberKeys(galaxyDrag.key)
        for (const k of keys) {
          const p = state.layout.pos.get(k)
          if (!p) continue
          p.x += dx; p.y += dy; p.z += dz
        }
        const g = state.graph?.galaxies.find(x => x.key === galaxyDrag.key)
        for (const tkey of g?.topics || []) {
          const c = state.layout.pos.get(tkey)
          const info = state.layout.planet.get(tkey)
          if (info && c) info.center = c
          refitShell(tkey)
        }
        // 空星系没有成员可挪，直接挪雾团中心
        if (g && !g.topics.length) {
          const info = state.layout.galaxies.get(galaxyDrag.key)
          if (info) info.center = { x: info.center.x + dx, y: info.center.y + dy, z: info.center.z + dz }
        }
        grab.copy(hit)
        dragMoved += Math.abs(dx) + Math.abs(dy) + Math.abs(dz)
        pendingEdgeKeys = pendingEdgeKeys || new Set()
        for (const k of keys) pendingEdgeKeys.add(k)
        refreshTransforms()
        updateLabels()
        canvas.classList.add('grabbing')
      }
      return
    }
    if (linkDrag && pointers.size === 1) {
      const target = snapNode(ev.clientX, ev.clientY, linkDrag.from)
      linkDrag.target = target
      const from = nodeWorld(linkDrag.from)
      const to = target ? nodeWorld(target) : planePoint(ev.clientX, ev.clientY)
      if (from && to) drawRubber(from, to)
      dragMoved += 7
      if (target !== state.hover) { state.hover = target; updateLabels() }
      return
    }
    if (dragNode && pointers.size === 1) {
      const hit = planePoint(ev.clientX, ev.clientY)
      if (hit) {
        const dx = hit.x - grab.x, dy = hit.y - grab.y, dz = hit.z - grab.z
        const node = state.graph.byKey.get(dragNode)
        const keys = node.kind === 'topic' ? clusterKeys(dragNode) : new Set([dragNode])
        for (const k of keys) {
          const p = state.layout.pos.get(k)
          if (!p) continue
          p.x += dx; p.y += dy; p.z += dz
        }
        if (node.kind === 'topic') {
          const c = state.layout.pos.get(dragNode)
          const info = state.layout.planet.get(dragNode)
          if (info && c) info.center = c
        }
        if (node.kind === 'star' && node.topicKey) refitShell(node.topicKey)
        grab.copy(hit)
        dragMoved += Math.abs(dx) + Math.abs(dy) + Math.abs(dz)
        // 一帧只重建一次受影响连线：指针事件可能一帧来好几次
        pendingEdgeKeys = pendingEdgeKeys || new Set()
        for (const k of keys) pendingEdgeKeys.add(k)
        refreshTransforms()
        updateLabels()
        if (node.kind === 'star' && !node.topicKey) {
          const target = snapNode(ev.clientX, ev.clientY)
          setDropTopic(target && state.graph.byKey.get(target)?.kind === 'topic' ? target : null)
        }
        canvas.classList.add('grabbing')
      }
      return
    }
    if (last && pointers.size === 1) {
      const dx = ev.clientX - last.x
      const dy = ev.clientY - last.y
      dragMoved += Math.abs(dx) + Math.abs(dy)
      view.theta -= dx * 0.005
      view.phi = clamp(view.phi - dy * 0.005, 0.16, Math.PI - 0.16)
      goal.theta = view.theta
      goal.phi = view.phi
      spinTheta = -dx * 0.0042
      spinPhi = -dy * 0.003
      last = { x: ev.clientX, y: ev.clientY }
      canvas.classList.add('grabbing')
    }
    if (!pointers.size) {
      const { node, edge } = pick(ev.clientX, ev.clientY)
      if (node !== state.hover || edge !== state.hoverEdge) {
        const edgeChanged = edge !== state.hoverEdge
        state.hover = node
        state.hoverEdge = edge
        canvas.classList.toggle('pickable', !!(node || edge))
        onHover?.(node)
        if (edgeChanged) onHoverEdge?.(edge, { x: ev.clientX, y: ev.clientY })
        updateLabels()
      }
    }
  })

  function endPointer(ev) {
    pointers.delete(ev.pointerId)
    if (pointers.size < 2) pinchStart = 0
    canvas.classList.remove('grabbing')
    if (pointers.size === 0) last = null
  }

  canvas.addEventListener('pointerup', ev => {
    const wasDrag = dragMoved > 6
    const placed = dragNode
    const linking = linkDrag
    const dropTopic = state.dropTopic
    const wasPan = panDrag.active
    const group = galaxyDrag
    galaxyDrag = null
    panDrag.active = false
    endPointer(ev)
    dragActive = false
    if (wasPan) {
      spinTheta = 0
      spinPhi = 0
      return
    }
    if (group) {
      state.dragGalaxy = null
      if (wasDrag) {
        const g = state.graph?.galaxies.find(x => x.key === group.key)
        const members = (g?.topics || [])
          .map(k => {
            const p = state.layout.pos.get(k)
            return p ? { key: k, place: { x: +p.x.toFixed(3), y: +p.y.toFixed(3), z: +p.z.toFixed(3) } } : null
          })
          .filter(Boolean)
        const info = state.layout.galaxies.get(group.key)
        const center = info
          ? { x: +info.center.x.toFixed(3), y: +info.center.y.toFixed(3), z: +info.center.z.toFixed(3) }
          : null
        onPlaceGalaxy?.(group.key, members, center)
        scheduleSync()
        return
      }
      // 没拖动就是普通点击，继续走下面的选中逻辑
    }
    if (linking) {
      clearRubber()
      const to = linking.target || snapNode(ev.clientX, ev.clientY, linking.from)
      if (to && to !== linking.from) { onLinkDrop?.(linking.from, to); return }
      if (wasDrag) return
    }
    if (placed) {
      dragNode = null
      setDropTopic(null)
      if (wasDrag) {
        const node = state.graph.byKey.get(placed)
        if (node?.kind === 'star' && !node.topicKey && dropTopic) {
          // 星尘拖进星球 = 归到这颗大球；位置由重新布局接管，不再单独存钉子
          onDropStarOnTopic?.(placed, dropTopic)
          return
        }
        const p = state.layout.pos.get(placed)
        onPlaceNode?.(placed, { x: +p.x.toFixed(3), y: +p.y.toFixed(3), z: +p.z.toFixed(3) })
        scheduleSync()
        return
      }
    }
    if (wasDrag) return
    const { node, edge } = pick(ev.clientX, ev.clientY)
    if (node) onPick?.(node)
    else if (edge) onPickEdge?.(edge)
    else {
      // 左键点雾团空白：打开这颗星系的菜单，收星球/改名都在里面
      const g = ev.button === 0 && !state.scope ? galaxyAtScreen(ev.clientX, ev.clientY) : null
      if (g) { onPickGalaxy?.(g, ev.clientX, ev.clientY); return }
      onPick?.(null)
    }
  })
  canvas.addEventListener('pointercancel', ev => {
    clearRubber()
    dragNode = null
    galaxyDrag = null
    state.dragGalaxy = null
    dragActive = false
    panDrag.active = false
    setDropTopic(null)
    endPointer(ev)
  })
  canvas.addEventListener('pointerleave', () => {
    if (pointers.size) return
    state.hover = null
    state.hoverEdge = null
    canvas.classList.remove('pickable')
    onHoverEdge?.(null)
    updateLabels()
  })

  canvas.addEventListener('wheel', ev => {
    ev.preventDefault()
    tween = null
    const max = Math.max(HOME.radius * 2.4, 900)
    goal.radius = clamp(goal.radius * Math.exp(ev.deltaY * 0.00105), 16, max)
  }, { passive: false })

  canvas.addEventListener('dblclick', ev => {
    const { node } = pick(ev.clientX, ev.clientY, { ignoreEdges: true })
    if (!node) { resetView(); return }
    if (state.graph.byKey.get(node)?.kind === 'topic') onEnterTopic?.(node)
    else { onPick?.(node); flyTo(node) }
  })

  canvas.addEventListener('contextmenu', ev => {
    ev.preventDefault()
    const { node, edge } = pick(ev.clientX, ev.clientY)
    const galaxy = node ? galaxyOfNode(node) : (edge ? null : galaxyAtScreen(ev.clientX, ev.clientY))
    onContext?.({ node, edge, galaxy, world: planePointAtTarget(ev.clientX, ev.clientY), x: ev.clientX, y: ev.clientY })
  })

  /** 右键处的世界坐标：过当前观察中心的、面向相机的平面，用来把新星系放到手指下面 */
  function planePointAtTarget(clientX, clientY) {
    const rect = canvas.getBoundingClientRect()
    if (!rect.width || !rect.height) return null
    ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1)
    ray.setFromCamera(ndc, camera)
    const p = new THREE.Plane().setFromNormalAndCoplanarPoint(
      camera.getWorldDirection(new THREE.Vector3()).negate(), view.target
    )
    const out = new THREE.Vector3()
    if (!ray.ray.intersectPlane(p, out)) return null
    return { x: +out.x.toFixed(3), y: +out.y.toFixed(3), z: +out.z.toFixed(3) }
  }

  /**
   * 拾取顺序：星点 → 星球核心 → 线 → 大气层。
   * 线排在核心之后，是为了让"球里的线"仍然点得到；大气层最后，因为它是整个球壳。
   * 进到球里后核心优先于星点：否则球心容易被合团的星点抢走（旧版真踩过）。
   */
  function pick(clientX, clientY, { ignoreEdges = false } = {}) {
    const rect = canvas.getBoundingClientRect()
    if (!rect.width || !rect.height) return { node: null, edge: null }
    ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1)
    ray.setFromCamera(ndc, camera)
    const starTargets = []
    const coreTargets = []
    const topicShells = []
    for (const obj of objects.values()) {
      if (!obj.core.visible) continue
      if (obj.kind === 'topic') coreTargets.push(obj.core)
      else starTargets.push(obj.core)
      if (obj.shell && obj.shell.visible) topicShells.push(obj.shell)
    }
    const starHits = ray.intersectObjects(starTargets, false)
    const coreHits = ray.intersectObjects(coreTargets, false)
    const insideThisTopic = state.scope && coreHits.some(h => h.object.userData.node?.key === state.scope)
    // 进到球内时，球心是这颗球自己的“返回全景锚点”，优先于可能贴着核心的星点
    if (insideThisTopic) return { node: state.scope, edge: null }
    // 星点永远画在星球前面，所以拾取也优先星点；否则“看得见却点不到”
    if (starHits.length) return { node: starHits[0].object.userData.node.key, edge: null }

    let best = null
    let bestD2 = Infinity
    if (!ignoreEdges) {
      const mx = clientX - rect.left
      const my = clientY - rect.top
      const tanHalf = Math.tan((camera.fov * Math.PI) / 360)
      for (const [, obj] of edgeObjs) {
        if (!obj.mesh.visible) continue
        const selected = state.selectedEdge === obj.e.styleKey
        const tubeR = edgeRadius(obj.e) * (selected ? 3.1 : 1)
        obj.curve.getPoint(0.5, edgeMid)
        const dist = camera.position.distanceTo(edgeMid)
        const pxPerWorld = rect.height / (2 * Math.max(0.001, dist) * tanHalf)
        const tol = Math.max(EDGE_PICK_PX, tubeR * pxPerWorld + 4)
        const tol2 = tol * tol
        let prevX = 0, prevY = 0, hasPrev = false
        let minD2 = Infinity
        for (let i = 0; i <= EDGE_PICK_SEGMENTS; i++) {
          obj.curve.getPoint(i / EDGE_PICK_SEGMENTS, sp)
          sp.project(camera)
          if (sp.z > 1) { hasPrev = false; continue }
          const sx = (sp.x * 0.5 + 0.5) * rect.width
          const sy = (-sp.y * 0.5 + 0.5) * rect.height
          if (hasPrev) {
            // 鼠标到“投影后的线段”的距离；只比采样点会在长线中间留下空隙
            const vx = sx - prevX
            const vy = sy - prevY
            const wx = mx - prevX
            const wy = my - prevY
            const len2 = vx * vx + vy * vy
            const t = len2 > 0 ? Math.max(0, Math.min(1, (wx * vx + wy * vy) / len2)) : 0
            const dx = mx - (prevX + t * vx)
            const dy = my - (prevY + t * vy)
            const d2 = dx * dx + dy * dy
            if (d2 < minD2) minD2 = d2
          }
          prevX = sx; prevY = sy; hasPrev = true
        }
        if (minD2 <= tol2 && minD2 < bestD2) { bestD2 = minD2; best = obj.e.styleKey }
      }
      if (best) return { node: null, edge: best }
    }
    // 全景拉远时星点可能只剩几个像素，纯射线很容易点空；给一个小的屏幕吸附。
    // 放在线之后：线是细目标，点在线上时优先选中线。
    let nearStar = null
    let nearD = 10
    for (const [key, obj] of objects) {
      if (obj.kind === 'topic' || !obj.core.visible) continue
      sp.copy(obj.core.position).project(camera)
      if (sp.z > 1) continue
      const dx = (sp.x * 0.5 + 0.5) * rect.width - (clientX - rect.left)
      const dy = (-sp.y * 0.5 + 0.5) * rect.height - (clientY - rect.top)
      const d = Math.hypot(dx, dy)
      if (d < nearD) { nearD = d; nearStar = key }
    }
    if (nearStar) return { node: nearStar, edge: null }
    if (coreHits.length) return { node: coreHits[0].object.userData.node.key, edge: null }
    const shellHits = ray.intersectObjects(topicShells, false)
    if (shellHits.length) return { node: shellHits[0].object.userData.node.key, edge: null }
    return { node: null, edge: null }
  }

  // ===== 轻量刷新（拖动时不重建材质） =====
  function refreshTransforms() {
    if (!state.graph || !state.layout) return
    for (const [key, obj] of objects) {
      const p = state.layout.pos.get(key)
      if (!p) continue
      obj.core.position.set(p.x, p.y, p.z)
      obj.halo.position.set(p.x, p.y, p.z)
      obj.ring.position.set(p.x, p.y, p.z)
      if (obj.outline) obj.outline.position.set(p.x, p.y, p.z)
      if (obj.shell) obj.shell.position.set(p.x, p.y, p.z)
      if (obj.planetRing) obj.planetRing.position.set(p.x, p.y, p.z)
      if (obj.orbitRing) obj.orbitRing.position.set(p.x, p.y, p.z)
      if (obj.kind === 'topic') {
        const node = state.graph.byKey.get(key)
        const baseR = state.layout.planet.get(key)?.baseR || 22
        if (node) {
          const haloR = topicEnvelope(node, baseR)
          obj.shellR = haloR
          if (obj.shell) obj.shell.scale.setScalar(haloR)
          obj.ring.scale.setScalar(haloR * 1.02)
          if (obj.planetRing) obj.planetRing.scale.setScalar(Math.min(obj.baseR * 1.02, haloR * 0.52))
          state.layout.shell.set(key, haloR)
        }
      }
    }
    for (const [, obj] of galaxyObjs) {
      const info = obj.info
      if (!info) continue
      // 拖走一颗行星时，星系云团的质心要跟着走，不然会出现“行星离开星云”的错觉
      const members = info.topics.map(k => state.layout.pos.get(k)).filter(Boolean)
      if (members.length) {
        const center = members.reduce((a, p) => ({ x: a.x + p.x / members.length, y: a.y + p.y / members.length, z: a.z + p.z / members.length }), { x: 0, y: 0, z: 0 })
        info.center = center
        const spread = members.reduce((max, p) => Math.max(max, Math.hypot(p.x - center.x, p.y - center.y, p.z - center.z)), 0)
        const maxShell = Math.max(...info.topics.map(k => state.layout.shell.get(k) || 22))
        info.radius = Math.min(360, spread + maxShell + 34)
        state.layout.galaxies.set(obj.key, info)
      }
      const isDragged = state.dragGalaxy === obj.key
      obj.cloud.position.set(info.center.x, info.center.y, info.center.z)
      obj.cloud.scale.setScalar(info.radius * (isDragged ? 3.0 : 2.7))
      obj.cloud.material.opacity = (obj.cloudBaseOpacity ?? (state.palette.light ? 0.25 : 0.55)) + (isDragged ? 0.18 : 0)
      if (obj.boundary) {
        obj.boundary.position.set(info.center.x, info.center.y, info.center.z)
        obj.boundary.scale.setScalar(info.radius * 1.12)
        obj.boundary.material.opacity = isDragged ? 0.5 : (state.palette.light ? 0.3 : 0.24)
      }
      obj.dust.position.set(info.center.x, info.center.y, info.center.z)
      obj.rings.forEach((ring, ri) => {
        ring.position.set(info.center.x, info.center.y, info.center.z)
        ring.scale.setScalar(info.radius * (ri === 0 ? 1 : 1.28))
      })
    }
  }

  // ===== 每帧 =====
  function animateFlows(t) {
    if (state.palette.light || !state.graph) {
      for (const s of flowPool) s.visible = false
      return
    }
    ensureFlow()
    let used = 0
    const limit = display.quality === 'low' ? 70 : flowPool.length
    for (const [, obj] of edgeObjs) {
      if (!obj.flow || used >= limit) continue
      const sprite = flowPool[used++]
      const key = obj.e.styleKey
      const phase = (key.length * 0.137 + key.charCodeAt(0) * 0.011) % 1
      const dir = obj.e.flowDir === -1 ? -1 : 1
      const raw = (t * (obj.e.type === 'ai' ? 0.14 : 0.09) + phase) % 1
      obj.curve.getPoint(dir === 1 ? raw : 1 - raw, sp)
      // 鼠标停在线上或线被选中时，光点留在原地：便于看清理由，也真的“停住”
      const paused = state.hoverEdge === key || state.selectedEdge === key
      const changed = sprite.userData.key !== key
      if (!paused || changed) sprite.position.copy(sp)
      sprite.scale.setScalar(obj.e.type === 'ai' ? 1.8 : 1.4)
      if (changed) {
        sprite.userData.key = key
        setCol(sprite.material.color, obj.e.color ? rgbaOf(obj.e.color, edgeBaseColor(obj.e, state.palette)) : edgeBaseColor(obj.e, state.palette))
        sprite.material.opacity = 0.82
      }
      sprite.visible = true
    }
    for (let i = used; i < flowPool.length; i++) flowPool[i].visible = false
  }

  function applyQuality() {
    const q = display.quality
    const tier = q === 'low' ? 2 : q === 'high' ? 0 : autoTier
    const dpr = Math.min(window.devicePixelRatio || 1, tier >= 2 ? 1 : tier === 1 ? 1.35 : 2)
    if (renderer.getPixelRatio() !== dpr) {
      renderer.setPixelRatio(dpr)
      composer.setPixelRatio?.(dpr)
      resize()
    }
    const strength = state.palette.light || tier >= 2 ? 0 : BLOOM.strength * display.glow * (tier === 1 ? 0.72 : 1)
    bloom.strength = q === 'high' && !state.palette.light ? BLOOM.strength * display.glow : strength
    bloom.enabled = bloom.strength > 0.001
    if (starfieldFar) {
      starfieldFar.visible = display.dust
      starfieldNear.visible = display.dust
    }
    for (const sprite of nebulas) sprite.visible = display.dust
    for (const obj of galaxyObjs.values()) {
      obj.dust.visible = display.dust && !state.palette.light && !state.scope
      obj.cloud.visible = display.dust && !state.scope
    }
  }

  function tickQuality(now, dt) {
    if (display.quality !== 'auto' || state.palette.light) return
    fpsAcc += dt
    fpsFrames++
    if (now - lastQualityCheck < 1500 || now < 5000) return
    lastQualityCheck = now
    const fps = fpsFrames / Math.max(0.001, fpsAcc)
    fpsAcc = 0
    fpsFrames = 0
    if (fps < 20 && autoTier < 2) { autoTier = 2; applyQuality() }
    else if (fps < 32 && autoTier < 1) { autoTier = 1; applyQuality() }
  }

  let raf = 0
  function frame(now = performance.now()) {
    raf = requestAnimationFrame(frame)
    const dt = Math.min(0.08, (now - lastFrame) / 1000 || 0.016)
    lastFrame = now
    elapsed += dt
    if (pendingEdgeKeys) {
      const touched = pendingEdgeKeys
      pendingEdgeKeys = null
      rebuildEdgesTouching(touched)
      // 普通线已经换了新几何；选中线的高亮管也必须同一帧换，否则拖拽时亮的那层会粘在旧位置
      const sel = state.selectedEdge ? edgeObjs.get(state.selectedEdge) : null
      if (sel && (touched.has(sel.e.a) || touched.has(sel.e.b))) paintSelectedEdge(state.palette)
    }
    stepTween(now)

    if (!tween) {
      if (!dragActive && (Math.abs(spinTheta) > 0.0001 || Math.abs(spinPhi) > 0.0001)) {
        view.theta += spinTheta
        view.phi = clamp(view.phi + spinPhi, 0.16, Math.PI - 0.16)
        goal.theta = view.theta
        goal.phi = view.phi
        spinTheta *= Math.pow(0.06, dt)
        spinPhi *= Math.pow(0.06, dt)
        if (Math.abs(spinTheta) < 0.0001) spinTheta = 0
        if (Math.abs(spinPhi) < 0.0001) spinPhi = 0
      }
      if (Math.abs(goal.radius - view.radius) > 0.02) view.radius += (goal.radius - view.radius) * Math.min(1, dt * 10)
      if (autoRotate) {
        view.theta += dt * 0.07
        goal.theta = view.theta
      }
    }
    applyCamera()

    const camPos = camera.position
    for (const [, obj] of objects) {
      if (obj.ring.visible) {
        obj.ring.quaternion.copy(camera.quaternion)
        if (obj.kind === 'topic') {
          // 边界环不做像素封顶：它必须始终包住所有星点
          const selected = state.selected === obj.key
          obj.ring.scale.setScalar(obj.shellR * 1.02)
          obj.ring.material.opacity = selected
            ? 0.5 + 0.08 * (0.5 + 0.5 * Math.sin(elapsed * 2.4))
            : state.palette.light ? 0.42 : 0.3
        } else {
          const base = obj.baseR * 2.0
          const dist = camPos.distanceTo(obj.ring.position)
          const h = canvas.clientHeight || window.innerHeight
          const cap = 96 * 2 * dist * Math.tan((camera.fov * Math.PI) / 360) / Math.max(1, h)
          const pulse = 1 + Math.sin(elapsed * 2.6) * 0.018
          obj.ring.scale.setScalar(Math.min(base * pulse, cap))
          obj.ring.material.opacity = 0.35 + 0.18 * (0.5 + 0.5 * Math.sin(elapsed * 2.6))
        }
      }
      if (obj.kind === 'topic') {
        obj.core.rotation.y += obj.spin * dt
        if (obj.core.material.uniforms) obj.core.material.uniforms.uTime.value = elapsed
      }
      if (obj.halo.visible && obj.haloBase) {
        // 按“屏幕像素”封顶：推近时星点不会糊成一大团白光，星球光晕也不会吃掉整屏
        const dist = camPos.distanceTo(obj.halo.position)
        const h = canvas.clientHeight || window.innerHeight
        const maxPx = obj.kind === 'star' ? 80 : Math.min(h * 0.18, 190)
        const cap = maxPx * 2 * dist * Math.tan((camera.fov * Math.PI) / 360) / Math.max(1, h)
        const pulse = obj.kind === 'star' ? 0.94 + 0.06 * Math.sin(elapsed * 3.4 + obj.baseR) : 1
        obj.halo.scale.setScalar(Math.min(obj.haloBase * pulse, cap))
      }
      if (obj.core.visible) {
        // 星球自转只转表面，不影响星点位置与拾取
        if (obj.kind === 'star' && state.palette.light) obj.core.rotation.y += obj.spin * dt
      }
    }
    if (starfieldFar) starfieldFar.rotation.y += dt * 0.0025
    if (starfieldNear) {
      starfieldNear.rotation.y += dt * 0.004
      // 近层星点轻微呼吸：深空是活的，但不至于让人分心
      if (!state.palette.light) starfieldNear.material.opacity = 0.64 + Math.sin(elapsed * 1.35) * 0.05
    }
    for (const [, g] of galaxyObjs) {
      if (g.dust.visible) g.dust.rotation.y += dt * 0.012
      for (const ring of g.rings) ring.rotation.z += dt * 0.003
      if (g.boundary) g.boundary.quaternion.copy(camera.quaternion)
    }
    animateFlows(elapsed)
    tickQuality(now, dt)
    // 始终走 OutputPass：自定义星球着色器需要它做线性 → sRGB 的输出转换
    composer.render()
    updateLabels()
  }

  function resize() {
    const w = canvas.clientWidth || window.innerWidth
    const h = canvas.clientHeight || window.innerHeight
    renderer.setSize(w, h, false)
    composer.setSize(w, h)
    bloom.setSize(w, h)
    camera.aspect = w / Math.max(1, h)
    if (w > 900 && inset) camera.setViewOffset(w, h, inset / 2, 0, w, h)
    else camera.clearViewOffset()
    camera.updateProjectionMatrix()
  }
  window.addEventListener('resize', resize)
  window.addEventListener('keydown', onSpaceDown)
  window.addEventListener('keyup', onSpaceUp)

  buildBackdrop()
  resize()
  frame()

  return {
    setGraph(graph, layout) {
      // 挂载时会先用空图 paint 一次；第一次拿到真实数据必须重新落到全景，
      // 否则相机会停在内置的 380 半径上，大图边缘/星球会被裁掉。
      const wasEmpty = !state.graph || !state.layout || state.graph.nodes.length === 0
      state.graph = graph
      state.layout = layout
      rebuildEdges()
      sync()
      fitHome()
      if (firstGraph || wasEmpty) {
        resetView(false)
        firstGraph = false
      }
      placeBackdrop()
      applyQuality()
    },
    patchNodeStyle(styleKey, patch) {
      for (const node of state.graph?.nodes || []) {
        if (node.styleKey !== styleKey) continue
        if ('size' in patch) node.size = Math.min(3, Math.max(0.3, Number(patch.size) || 1))
        if ('glow' in patch) node.glow = Math.min(1.8, Math.max(0, Number(patch.glow)))
        if ('pattern' in patch) node.pattern = ['banded', 'smooth', 'cloudy'].includes(patch.pattern) ? patch.pattern : 'banded'
        break
      }
      scheduleSync()
    },
    patchEdge(styleKey, patch) {
      const obj = edgeObjs.get(styleKey)
      if (!obj) return
      const next = { ...obj.e, ...patch }
      obj.e = next
      const e = state.graph.edges.find(x => x.styleKey === styleKey)
      if (e) Object.assign(e, patch)
      if (patch.lineStyle !== undefined || patch.width !== undefined || patch.arrow !== undefined) {
        buildEdge(next)
        if (state.selectedEdge === styleKey) paintSelectedEdge(state.palette)
      } else {
        paintEdge(obj)
        if (state.selectedEdge === styleKey) paintSelectedEdge(state.palette)
      }
    },
    setSelected(key) {
      state.selected = key
      sync()
    },
    setSelectedEdge(key) { state.selectedEdge = key; sync() },
    setFocus(set) { state.focus = set; sync() },
    setIsolate(set) { state.isolate = set; sync() },
    setScope(topicKey, { focus = true } = {}) {
      state.scope = topicKey
      sync()
      if (topicKey && focus) focusTopic(topicKey)
    },
    setDisplay(patch) {
      const widthChanged = patch.linkWidth !== undefined && patch.linkWidth !== display.linkWidth
      Object.assign(display, patch)
      if (widthChanged) rebuildEdges()
      sync()
    },
    getDisplay: () => ({ ...display }),
    setLinkMode(on) {
      linkMode = !!on
      canvas.classList.toggle('linking', linkMode)
      if (!on) clearRubber()
    },
    setSideInset(px) {
      inset = px
      resize()
      fitHome()
    },
    flyTo,
    resetView,
    focusTopic,
    flyToGalaxy,
    sync() { sync(); fitHome(); resize() },
    setAutoRotate(on) { autoRotate = on },
    setGalaxyMode(on) {
      galaxyMode = !!on
      galaxyDrag = null
      state.dragGalaxy = null
      canvas.classList.toggle('galaxy-mode', galaxyMode)
      sync()
    },
    dispose() {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      window.removeEventListener('keydown', onSpaceDown)
      window.removeEventListener('keyup', onSpaceUp)
      for (const key of [...edgeObjs.keys()]) dropEdge(key)
      for (const key of [...galaxyObjs.keys()]) {
        const obj = galaxyObjs.get(key)
        group.remove(obj.cloud, ...obj.rings, obj.dust, obj.boundary)
        obj.cloud.material.dispose()
        for (const r of obj.rings) { r.geometry.dispose(); r.material.dispose() }
        obj.dust.geometry.dispose(); obj.dust.material.dispose()
        obj.boundary.geometry.dispose(); obj.boundary.material.dispose()
        obj.label.remove()
      }
      galaxyObjs.clear()
      if (belt) { group.remove(belt); belt.geometry.dispose(); belt.material.dispose() }
      beltLabel?.remove()
      for (const key of [...objects.keys()]) disposeObject(objects.get(key))
      for (const s of flowPool) { group.remove(s); s.material.dispose() }
      if (selEdgeMesh) { group.remove(selEdgeMesh); selEdgeMesh.geometry.dispose(); selEdgeMesh.material.dispose() }
      if (rubber) { group.remove(rubber); rubber.geometry.dispose(); rubber.material.dispose() }
      for (const child of backdrop.children) {
        child.geometry?.dispose()
        child.material?.dispose()
      }
      composer.dispose?.()
      renderer.dispose()
      for (const t of Object.values(tex).flat()) t?.dispose?.()
      for (const t of Object.values(dashTemplates)) t?.dispose?.()
    },
    // 自测读数，不参与渲染逻辑
    debug: {
      theta: () => view.theta,
      radius: () => view.radius,
      phi: () => view.phi,
      target: () => ({ x: view.target.x, y: view.target.y, z: view.target.z }),
      envelope: key => {
        const node = state.graph?.byKey.get(key)
        const obj = objects.get(key)
        const center = state.layout?.pos.get(key)
        if (!node || !obj || !center) return null
        let farthest = 0
        for (const childKey of node.children) {
          const p = state.layout.pos.get(childKey)
          const star = state.graph.byKey.get(childKey)
          if (!p || !star) continue
          const d = Math.hypot(p.x - center.x, p.y - center.y, p.z - center.z)
          farthest = Math.max(farthest, d + starVisualR(star))
        }
        return { shellR: obj.shellR, farthest, contains: obj.shellR + 0.001 >= farthest }
      },
      focusSize: () => (state.focus ? state.focus.size : 0),
      visibleCount: () => [...objects.values()].filter(o => o.core.visible).length,
      edgeCount: () => [...edgeObjs.values()].filter(o => o.mesh.visible).length,
      sceneMeshes: () => group.children.filter(c => c.isMesh).length,
      galaxyCount: () => galaxyObjs.size,
      maxHaloPx: () => {
        const rect = canvas.getBoundingClientRect()
        let max = 0
        for (const o of objects.values()) {
          if (!o.halo.visible) continue
          const d = camera.position.distanceTo(o.halo.position)
          const px = (o.halo.scale.x / (2 * d * Math.tan((camera.fov * Math.PI) / 360))) * rect.height
          max = Math.max(max, px)
        }
        return max
      },
      dragNode: (key, dx, dy) => {
        const p = state.layout.pos.get(key)
        const v = new THREE.Vector3(p.x, p.y, p.z).project(camera)
        const rect = canvas.getBoundingClientRect()
        const s = { x: rect.left + (v.x * 0.5 + 0.5) * rect.width, y: rect.top + (-v.y * 0.5 + 0.5) * rect.height }
        return { from: s, to: { x: s.x + dx, y: s.y + dy } }
      },
      flowCount: () => flowPool.filter(s => s.visible).length,
      bloomStrength: () => bloom.strength,
      clearColor: () => '#' + scene.background.getHexString(THREE.SRGBColorSpace),
      pickAt: (x, y) => pick(x, y),
      nodeScreen: key => {
        const p = state.layout?.pos.get(key)
        if (!p) return null
        const v = new THREE.Vector3(p.x, p.y, p.z).project(camera)
        const rect = canvas.getBoundingClientRect()
        return { x: (v.x * 0.5 + 0.5) * rect.width, y: (-v.y * 0.5 + 0.5) * rect.height }
      },
      galaxyScreen: key => {
        const info = state.layout?.galaxies.get(key)
        if (!info) return null
        const v = new THREE.Vector3(info.center.x, info.center.y, info.center.z).project(camera)
        const rect = canvas.getBoundingClientRect()
        return { x: (v.x * 0.5 + 0.5) * rect.width, y: (-v.y * 0.5 + 0.5) * rect.height }
      },
      nodePos: key => {
        const p = state.layout?.pos.get(key)
        return p ? { x: p.x, y: p.y, z: p.z } : null
      },
      edgeScreen: (styleKey, t = 0.5) => {
        const obj = edgeObjs.get(styleKey)
        if (!obj || !obj.mesh.visible) return null
        const v = obj.curve.getPoint(t).project(camera)
        const rect = canvas.getBoundingClientRect()
        return { x: (v.x * 0.5 + 0.5) * rect.width, y: (-v.y * 0.5 + 0.5) * rect.height }
      },
      selectedEdgeCenter: () => {
        if (!selEdgeMesh) return null
        selEdgeMesh.geometry.computeBoundingSphere()
        const c = selEdgeMesh.geometry.boundingSphere?.center
        if (!c) return null
        const v = c.clone().project(camera)
        const rect = canvas.getBoundingClientRect()
        return { x: (v.x * 0.5 + 0.5) * rect.width, y: (-v.y * 0.5 + 0.5) * rect.height }
      },
      edgeVisible: styleKey => {
        const o = edgeObjs.get(styleKey)
        return !!(o && o.mesh.visible)
      },
      edgeExternal: styleKey => {
        const o = edgeObjs.get(styleKey)
        return !!(o && o.external)
      },
      nodeColorOf: key => {
        const n = state.graph?.byKey.get(key)
        return n ? nodeColor(n, state.palette) : null
      },
      edgeRadius: () => {
        const obj = state.selectedEdge ? edgeObjs.get(state.selectedEdge) : null
        return obj?.mesh.geometry.parameters?.radius ?? 0
      },
      qualityTier: () => (display.quality === 'auto' ? autoTier : display.quality),
      objectState: key => {
        const o = objects.get(key)
        if (!o) return null
        return {
          kind: o.kind, core: o.core.visible, coreScale: o.core.scale.x, shell: o.shell?.visible ?? null,
          shellScale: o.shell?.scale.x ?? null,
          halo: o.halo.visible, haloScale: o.halo.scale.x, haloBase: o.haloBase,
          ring: o.ring.visible, planetRing: o.planetRing?.visible ?? null
        }
      },
      hideShells() { for (const o of objects.values()) if (o.shell) o.shell.visible = false }
    }
  }
}
