/**
 * 确定性 3D 布局：宇宙 → 星系 → 星球 → 星点。
 *
 * 三条硬约束：
 * 1) 同一份数据两次打开必须一模一样 —— 只用键哈希和固定迭代，不读设备、不读时间。
 * 2) 往一颗星球里加知识点，别的星球一颗都不许动 —— 星系/星球的中心位置只由
 *    「有哪些主题、谁和谁同属一个星系」决定，和球内知识点数量无关。
 * 3) 用户摆过的位置必须原样保留 —— 大球钉子存绝对坐标，小球钉子存相对父球的偏移；
 *    只对越出宇宙边界的坐标做软钳制，免得一次误拖把整张图撑成一张邮票。
 *
 * 星球尺寸与知识量挂钩，星点在球内按旋臂分布；未归类知识点落在宇宙外缘的星尘带。
 */
import { deriveGalaxyGroups } from './galaxy.js'

const GOLD = Math.PI * (3 - Math.sqrt(5))
const UNIVERSE_LIMIT = 380
const PLANET_MIN = 18
const PLANET_MAX = 42
const STAR_LIMIT = 4.2
const MEMBER_GAP = 104

function hash32(str) {
  let h = 2166136261 >>> 0
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** 同一个键永远给同一个 0..1 */
function unit(str, salt = '') {
  return (hash32(str + '::' + salt) % 100000) / 100000
}

export function starRadius(star) {
  if (star.mastery == null) return 1.5
  const volume = 1.1 + Math.sqrt(star.total || 0) * 0.42
  const need = 1 - star.mastery
  return Math.min(STAR_LIMIT, volume + need * 1.3)
}

/**
 * 星球大小只看知识点数量，不看题量/掌握度。
 * 题量一变星球就变大的话，“挂一道错题”会让球内所有星点重排（用户看到的是整张图抖一下）。
 */
export function planetRadius(childCount) {
  const n = Math.max(1, childCount || 0)
  return Math.min(PLANET_MAX, 18 + Math.sqrt(n) * 3.4)
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v))
}

function clampPoint(p, limit) {
  const d = Math.hypot(p.x, p.y, p.z)
  if (d <= limit) return { x: p.x, y: p.y, z: p.z }
  const k = limit / d
  return { x: p.x * k, y: p.y * k, z: p.z * k }
}

function memberOrbit(count) {
  if (count <= 1) return 0
  if (count === 2) return MEMBER_GAP / 2
  return 58 + (count - 3) * 12
}

function clusterSpan(cluster) {
  return Math.max(memberOrbit(cluster.topics.length) + PLANET_MAX, cluster.minRadius || 0)
}

/**
 * 把星系和独立星球排到槽位上。
 * 槽位直径按“这一团最长能长到多大”算，和当前球内知识点数量无关 —— 这是“加一颗星不推动别人”的关键。
 */
function clusterCenters(clusters) {
  const n = clusters.length
  if (!n) return new Map()
  if (n === 1) return new Map([[clusters[0].key, { x: 0, y: 0, z: 0 }]])

  const maxSpan = Math.max(...clusters.map(clusterSpan))
  const cell = maxSpan * 2 + 42
  // 10 团以内一圈排；再多就叠成上下两层的圆盘（同半径、错开角度，靠 y 拉开垂直距离）
  const layers = n <= 10
    ? [{ count: n, y: 0 }]
    : [{ count: Math.ceil(n / 2), y: cell * 0.52 }, { count: n - Math.ceil(n / 2), y: -cell * 0.52 }]
  const widest = Math.max(...layers.map(l => l.count))
  const radius = Math.max(145, widest <= 1 ? 0 : cell / (2 * Math.sin(Math.PI / widest)))

  const out = new Map()
  let index = 0
  layers.forEach((layer, li) => {
    for (let i = 0; i < layer.count; i++) {
      const cluster = clusters[index++]
      if (!cluster) break
      const angle = -Math.PI / 2 + (i / layer.count) * Math.PI * 2 + li * 0.37 + (unit(cluster.key, 'a') - 0.5) * 0.14
      const radiusJitter = (unit(cluster.key, 'r') - 0.5) * 18
      out.set(cluster.key, {
        x: Math.cos(angle) * (radius + radiusJitter),
        y: layer.y + (unit(cluster.key, 'y') - 0.5) * (layers.length > 1 ? 60 : cell * 0.44),
        z: Math.sin(angle) * (radius + radiusJitter)
      })
    }
  })
  return out
}

/**
 * 球内星点：知识点分布在星球表面外的一层扁球壳上（核心是实体星球，星点绕着它）。
 * 合团的星点贴着核心；金色角保证同一批星点的分布稳定且不会挤在一条线上。
 */
function placeStarsInPlanet(center, radius, members, starPins, starIndex, moved) {
  const free = members.filter(key => !starPins.has(key))

  free.forEach((key, i) => {
    const star = starIndex.get(key)
    const merged = !!star?.merged
    if (merged) {
      const angle = i * GOLD + unit(key, 'a') * 0.5
      const r = radius * (0.49 + unit(key, 'm') * 0.05)
      moved.set(key, {
        x: center.x + Math.cos(angle) * r,
        y: center.y + (unit(key, 'y') - 0.5) * radius * 0.08,
        z: center.z + Math.sin(angle) * r
      })
      return
    }
    const t = (i + 0.5) / free.length
    const y = 1 - 2 * t
    const ring = Math.sqrt(Math.max(0, 1 - y * y))
    const angle = i * GOLD + unit(key, 'a') * 0.45
    const shellR = radius * (0.64 + 0.32 * unit(key, 'j'))
    moved.set(key, {
      x: center.x + Math.cos(angle) * ring * shellR,
      y: center.y + y * shellR * 0.8,
      z: center.z + Math.sin(angle) * ring * shellR
    })
  })

  // 同一颗星球内的轻量斥力：只解决星点重叠，不改变“谁在哪颗球”和跨球位置
  const freeSet = new Set(free)
  for (let iter = 0; iter < 26; iter++) {
    for (let i = 0; i < free.length; i++) {
      const a = free[i]
      const pa = moved.get(a)
      const sa = starIndex.get(a)
      for (let j = i + 1; j < free.length; j++) {
        const b = free[j]
        if (!freeSet.has(b)) continue
        const pb = moved.get(b)
        const sb = starIndex.get(b)
        const dx = pa.x - pb.x, dy = pa.y - pb.y, dz = pa.z - pb.z
        const d2 = dx * dx + dy * dy + dz * dz + 0.001
        // 间距用固定值，不读掌握度：挂错题改变的是亮度，不是位置
        const min = sa?.merged && sb?.merged ? 5.4 : 7.2
        if (d2 >= min * min) continue
        const d = Math.sqrt(d2)
        const push = (min - d) * 0.42
        const nx = dx / d, ny = dy / d, nz = dz / d
        pa.x += nx * push; pa.y += ny * push; pa.z += nz * push
        pb.x -= nx * push; pb.y -= ny * push; pb.z -= nz * push
      }
    }
    // 别把星推进核心、也别推出大气层：只夹球内星，钉子不参与
    for (const key of free) {
      const p = moved.get(key)
      const dx = p.x - center.x, dy = p.y - center.y, dz = p.z - center.z
      const d = Math.hypot(dx, dy, dz)
      const min = radius * 0.55
      const max = radius * 1.02
      if (d > max || d < min) {
        const k = (d > max ? max : min) / Math.max(d, 0.0001)
        p.x = center.x + dx * k
        p.y = center.y + dy * k
        p.z = center.z + dz * k
      }
    }
  }

  // 钉住的星点：相对父球的偏移原样保留；只在极端越界时软钳制，
  // 不能按星球半径回弹，否则用户拖远后刷新会被静默拉回。
  for (const key of members) {
    const place = starPins.get(key)
    if (!place) continue
    const pin = clampPoint(place, UNIVERSE_LIMIT)
    moved.set(key, { x: center.x + pin.x, y: center.y + pin.y, z: center.z + pin.z })
  }
}

export function computeLayout(input) {
  const num = k => Number(String(k).slice(1))
  const topics = [...input.topics].sort((a, b) => num(a.key) - num(b.key))
  const stars = [...input.stars].sort((a, b) => num(a.key) - num(b.key))

  const topicIndex = new Map(topics.map(t => [t.key, t]))
  const starIndex = new Map(stars.map(s => [s.key, s]))
  // 有 galaxy 列表就用它（含空的手建星系）；老调用方没传时退回标题派生
  const galaxyList = Array.isArray(input.galaxies)
    ? input.galaxies
    : deriveGalaxyGroups(topics.map(t => ({ key: t.key, title: t.title || '', color: t.color }))).galaxies

  // 星系团 + 独立星球：排序键固定，保证同一份数据同一顺序
  const used = new Set()
  const clusters = []
  for (const g of [...galaxyList].sort((a, b) => (a.key < b.key ? -1 : 1))) {
    const members = (g.topics || []).map(k => topicIndex.get(k)).filter(Boolean)
    // 自动星系至少两颗才成团；手建星系即使还空着也要有雾团
    if (!g.manual && members.length < 2) continue
    for (const t of members) used.add(t.key)
    clusters.push({
      key: `G:${g.key}`, kind: 'galaxy', title: g.title, color: g.color, topics: members,
      galaxyKey: g.key, manual: !!g.manual, pin: g.pin || null,
      minRadius: g.manual ? 92 : 0
    })
  }
  for (const t of topics) if (!used.has(t.key)) clusters.push({ key: `S:${t.key}`, kind: 'solo', topics: [t] })
  clusters.sort((a, b) => (a.key < b.key ? -1 : 1))

  const centers = clusterCenters(clusters)
  const pos = new Map()
  const moved = new Map()
  const shell = new Map()
  const planetInfo = new Map()
  const starPins = new Map(stars.filter(s => s.place).map(s => [s.key, s.place]))

  // 先落每颗星球的中心（钉子优先），再放球内星点
  for (const cluster of clusters) {
    const center = cluster.pin || centers.get(cluster.key) || { x: 0, y: 0, z: 0 }
    const members = cluster.topics
    const orbit = memberOrbit(members.length)
    const baseAngle = Math.atan2(center.z, center.x) || unit(cluster.key, 'a') * Math.PI * 2
    members.forEach((t, i) => {
      let p
      if (t.place) {
        p = clampPoint(t.place, UNIVERSE_LIMIT)
      } else if (members.length === 1) {
        p = { ...center }
      } else {
        // 同一星系的星球排在“切线方向 + 少量垂直”上：从默认机位看是并排的，
        // 不会因为一前一后叠成一团；转视角后仍然有真实的前后层次。
        const tangent = { x: -Math.sin(baseAngle), z: Math.cos(baseAngle) }
        const phase = (i / members.length) * Math.PI * 2 + unit(cluster.key, 'phase') * 0.5
        p = {
          x: center.x + tangent.x * Math.cos(phase) * orbit,
          y: center.y + Math.sin(phase) * orbit * 0.38 + (unit(t.key, 'oy') - 0.5) * 10,
          z: center.z + tangent.z * Math.cos(phase) * orbit
        }
      }
      pos.set(t.key, p)
      const n = t.children.length
      const baseR = planetRadius(n)
      planetInfo.set(t.key, { baseR, center: p })
      moved.set(t.key, p)
    })
  }

  // 球内星点 + 计算有效壳半径
  for (const t of topics) {
    const center = pos.get(t.key)
    const info = planetInfo.get(t.key)
    if (!center || !info) continue
    placeStarsInPlanet(center, info.baseR, t.children, starPins, starIndex, moved)
    let farthest = 0
    for (const key of t.children) {
      const p = moved.get(key)
      const s = starIndex.get(key)
      if (!p) continue
      farthest = Math.max(farthest, Math.hypot(p.x - center.x, p.y - center.y, p.z - center.z) + (s ? starRadius(s) : 1.5))
    }
    // 布局层的壳只用于初始取景/星系云；渲染层还会按实际 size 和最远星点再算一次动态边界。
    // 封顶 2.5 倍，避免一次误拖把整张图撑成半个宇宙。
    const effective = clamp(farthest + 3.4, info.baseR, info.baseR * 2.5)
    shell.set(t.key, effective)
    info.shell = effective
  }

  // 未归类星尘：宇宙外缘的一条扁带；有钉子就照钉子放（同样软钳制）
  const freeStars = stars.filter(s => !s.topicKey)
  // 星尘带半径只读星球中心（+ 固定最大半径）：加知识点、加错题都不会让星尘跳位
  const planetExtent = topics.reduce((max, t) => {
    const p = pos.get(t.key)
    return p ? Math.max(max, Math.hypot(p.x, p.y, p.z) + PLANET_MAX) : max
  }, 0)
  const beltRadius = Math.max(170, planetExtent + 82)
  freeStars.forEach((s, i) => {
    if (s.place) {
      // 星尘本来就在宇宙外缘，不该被星球的 380 软边界拉回来：
      // 右键/拖动放到哪就留在哪，否则“记住位置”看起来像失效
      moved.set(s.key, { x: s.place.x, y: s.place.y, z: s.place.z })
      return
    }
    const angle = i * GOLD + unit(s.key, 'sa') * 0.3
    const r = beltRadius + (unit(s.key, 'sr') - 0.5) * 74
    moved.set(s.key, {
      x: Math.cos(angle) * r,
      y: (unit(s.key, 'sy') - 0.5) * 44,
      z: Math.sin(angle) * r
    })
  })

  // 星系云团：中心取成员质心；空星系用手摆中心/自动槽位。半径随成员数量和星球壳自适应
  const galaxies = new Map()
  const clusterOfGalaxy = new Map(clusters.filter(c => c.kind === 'galaxy').map(c => [c.galaxyKey, c]))
  for (const g of galaxyList) {
    const members = (g.topics || []).map(k => pos.get(k)).filter(Boolean)
    if (!g.manual && members.length < 2) continue
    const cluster = clusterOfGalaxy.get(g.key)
    const fallback = cluster?.pin || centers.get(cluster?.key) || { x: 0, y: 0, z: 0 }
    const center = members.length
      ? members.reduce((acc, p) => ({ x: acc.x + p.x / members.length, y: acc.y + p.y / members.length, z: acc.z + p.z / members.length }), { x: 0, y: 0, z: 0 })
      : fallback
    const spread = members.reduce((max, p) => Math.max(max, Math.hypot(p.x - center.x, p.y - center.y, p.z - center.z)), 0)
    const maxShell = (g.topics || []).length ? Math.max(...g.topics.map(k => shell.get(k) || PLANET_MIN)) : PLANET_MIN
    const radius = Math.max(g.manual ? 92 : 0, Math.min(360, spread + maxShell + 34))
    galaxies.set(g.key, {
      key: g.key, title: g.title, color: g.color, manual: !!g.manual, pin: g.pin || null,
      center, radius, topics: g.topics || []
    })
  }

  // 写回 pos：主题 + 所有星点（含星尘）
  for (const [key, p] of moved) pos.set(key, p)

  // 取景包围球：相机全景按这个来，副面板占的宽度也在渲染层另行处理
  let min = { x: Infinity, y: Infinity, z: Infinity }
  let max = { x: -Infinity, y: -Infinity, z: -Infinity }
  const include = (p, r) => {
    min = { x: Math.min(min.x, p.x - r), y: Math.min(min.y, p.y - r), z: Math.min(min.z, p.z - r) }
    max = { x: Math.max(max.x, p.x + r), y: Math.max(max.y, p.y + r), z: Math.max(max.z, p.z + r) }
  }
  for (const t of topics) {
    const p = pos.get(t.key)
    if (p) include(p, shell.get(t.key) || PLANET_MIN)
  }
  for (const s of stars) {
    const p = pos.get(s.key)
    if (p) include(p, starRadius(s) * 1.6)
  }
  // 星系云团一般不进包围球（否则大云把相机推远）；但空的手建星系没有星球可框，得把雾团自己算进去
  for (const g of galaxies.values()) include(g.center, g.manual && !g.topics.length ? g.radius : 0)
  if (!topics.length) include({ x: 0, y: 0, z: 0 }, 90)
  const bounds = {
    center: { x: (min.x + max.x) / 2, y: (min.y + max.y) / 2, z: (min.z + max.z) / 2 },
    radius: Math.max(70, Math.hypot(max.x - min.x, max.y - min.y, max.z - min.z) / 2)
  }
  // 星尘带只由“没摆过的游离星”勾勒；摆到远处的星尘是个体，不该把整条带拉成巨环
  const beltStars = freeStars.filter(s => !s.place)
  const belt = beltStars.length
    ? (() => {
        let minR = Infinity, maxR = 0
        for (const s of beltStars) {
          const p = pos.get(s.key)
          if (!p) continue
          const d = Math.hypot(p.x, p.y, p.z)
          minR = Math.min(minR, d)
          maxR = Math.max(maxR, d)
        }
        return { center: { x: 0, y: 0, z: 0 }, radius: Math.max(0, maxR), inner: Number.isFinite(minR) ? minR : 0, count: freeStars.length }
      })()
    : null

  let checksum = 0
  for (const [id, p] of [...pos.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    checksum = (checksum + hash32(`${id}:${p.x.toFixed(3)},${p.y.toFixed(3)},${p.z.toFixed(3)}`)) >>> 0
  }

  return { pos, shell, planet: planetInfo, galaxies, bounds, belt, checksum }
}
