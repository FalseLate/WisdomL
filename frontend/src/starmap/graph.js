/**
 * 星图的派生层：把后端给的"事实"算成一张可画的图。纯函数，不碰 DOM、不碰 three。
 *
 * 三条口径（与产品定义一致）：
 *   掌握度 = 1 - 错题数/题数，从 starmap_point_ref 现算，不存字段
 *   共现线 = 同一道错题里同时出现的两个知识点，每出现一次权重 +1；被用户否决过的对不再出现
 *   层级线 = 知识点归属某主题"且"用户没把这条线删掉；归属与连线是两件事
 */
import { resolveStyle, PALETTE } from './style-lang.js'
import { deriveGalaxyGroups } from './galaxy.js'

/** 主题与知识点的 id 来自两张表，数字会撞，所以图内一律用带前缀的键 */
export const topicKey = id => `T${id}`
export const pointKey = id => `P${id}`

/** 查重口径：只做字符串规范化（去空白与标点、统一小写），范围仅用户自己的节点 */
export function normalizeTitle(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[\s ]+/g, '')
    .replace(/[（）()【】\[\]·、，,。.：:;；!?！？"'“”_-]/g, '')
}

const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`)

function vetoKeys(v) {
  const out = []
  if (v.aPoint != null && v.bPoint != null) out.push(pairKey(`P${v.aPoint}`, `P${v.bPoint}`))
  if (v.aKey && v.bKey) out.push(pairKey(v.aKey, v.bKey))
  return out
}

export function findDuplicate(graph, title, exceptKey) {
  const key = normalizeTitle(title)
  if (!key) return null
  return graph.stars.find(n => n.key !== exceptKey && n.titleKey === key) || null
}

export function derive(payload) {
  const styles = payload.styles || {}
  const byKey = new Map()

  const topics = (payload.topics || []).map(t => {
    const rec = {
      key: topicKey(t.id),
      id: t.id,
      kind: 'topic',
      title: t.title,
      titleKey: normalizeTitle(t.title),
      note: t.note || '',
      color: t.color || null,
      galaxyId: t.galaxyId ?? null,
      galaxyKey: null,
      galaxyTitle: null,
      pin: t.pin || null,
      source: t.source || '我自己建的主题',
      children: []
    }
    byKey.set(rec.key, rec)
    return rec
  })

  // 没钉过色的大球按 id 顺序轮转调色板：全青会把几颗球糊成一片，骨架线也跟着球色走
  topics.slice().sort((a, b) => a.id - b.id).forEach((t, i) => {
    if (!t.color) t.color = PALETTE[i % PALETTE.length].token
  })

  const stars = (payload.points || []).map(p => {
    const rec = {
      key: pointKey(p.id),
      id: p.id,
      kind: 'star',
      title: p.title,
      titleKey: p.titleKey || normalizeTitle(p.title),
      note: p.note || '',
      topicKey: p.topicId == null ? null : topicKey(p.topicId),
      hierLine: p.hierLine !== 0,
      merged: p.merged === 1,
      color: p.color || null,
      pin: p.pin || null,
      origin: p.origin || '手动',
      total: 0,
      wrong: 0,
      err: {},
      wrongList: []
    }
    byKey.set(rec.key, rec)
    return rec
  })
  for (const s of stars) {
    const parent = s.topicKey ? byKey.get(s.topicKey) : null
    if (parent) parent.children.push(s.key)
  }

  // 掌握度与错因分布：全部来自"这道错题挂了哪些知识点"
  for (const ref of payload.refs || []) {
    for (const pid of ref.k || []) {
      const rec = byKey.get(pointKey(pid))
      if (!rec) continue
      rec.total += 1
      // status>=2 表示已经重做答对（复习中/已掌握），不再计入"错"
      if (!(ref.st >= 2)) {
        rec.wrong += 1
        for (const code of ref.et || []) rec.err[code] = (rec.err[code] || 0) + 1
        rec.wrongList.push({ id: ref.q, q: ref.txt || '（题干未记录）', et: ref.et || [], kps: (ref.k || []).length })
      }
    }
  }
  for (const rec of stars) rec.mastery = rec.total > 0 ? (rec.total - rec.wrong) / rec.total : null
  // 手建星系优先；没被手建星系收走的星球才按标题前缀自动成团。
  // 这样老数据（galaxy_id=NULL）行为完全不变，新建星系也不会和自动团重复。
  const manualGalaxies = (payload.galaxies || []).map(g => ({
    key: `G${g.id}`,
    id: g.id,
    title: g.title,
    color: g.color || null,
    pin: g.pin || null,
    manual: true,
    topics: []
  }))
  const manualById = new Map(manualGalaxies.map(g => [g.id, g]))
  for (const t of topics) {
    const g = t.galaxyId == null ? null : manualById.get(t.galaxyId)
    if (!g) continue
    t.galaxyKey = g.key
    g.topics.push(t.key)
  }
  const auto = deriveGalaxyGroups(
    topics.filter(t => !t.galaxyKey).map(t => ({ key: t.key, title: t.title, color: t.color }))
  )
  for (const t of topics) {
    if (!t.galaxyKey && auto.byTopic.has(t.key)) t.galaxyKey = auto.byTopic.get(t.key)
  }
  const galaxies = [...manualGalaxies, ...auto.galaxies.map(g => ({ ...g, manual: false }))]
  for (const g of manualGalaxies) {
    if (!g.color) g.color = topics.find(t => g.topics.includes(t.key))?.color || PALETTE[0].token
  }
  for (const t of topics) {
    const kids = t.children.map(k => byKey.get(k)).filter(Boolean)
    t.total = kids.reduce((s, k) => s + k.total, 0)
    t.wrong = kids.reduce((s, k) => s + k.wrong, 0)
    t.mastery = t.total > 0 ? (t.total - t.wrong) / t.total : null
    t.err = kids.reduce((acc, k) => {
      for (const [code, n] of Object.entries(k.err)) acc[code] = (acc[code] || 0) + n
      return acc
    }, {})
    const galaxy = t.galaxyKey ? galaxies.find(g => g.key === t.galaxyKey) : null
    t.galaxyTitle = galaxy?.title || null
  }

  // 否决集合：id 对与规范化名对都算命中，"删掉再建同名"也不会复活
  const vetoed = new Set()
  for (const v of payload.vetoes || []) for (const k of vetoKeys(v)) vetoed.add(k)

  const edges = []
  const hidden = []
  const push = edge => {
    const full = { ...edge, ...resolveStyle(edge.type, styles[edge.styleKey]) }
    ;(full.hidden ? hidden : edges).push(full)
  }

  for (const s of stars) {
    const parent = s.topicKey ? byKey.get(s.topicKey) : null
    if (parent && s.hierLine) {
      push({ type: 'hier', a: parent.key, b: s.key, styleKey: `hier|${parent.id}|${s.id}`, source: '归属' })
    }
  }

  const cooc = new Map()
  for (const ref of payload.refs || []) {
    const ids = [...new Set((ref.k || []).map(pointKey).filter(k => byKey.has(k)))].sort()
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const key = pairKey(ids[i], ids[j])
        if (vetoed.has(key) || vetoed.has(pairKey(byKey.get(ids[i]).titleKey, byKey.get(ids[j]).titleKey))) continue
        cooc.set(key, (cooc.get(key) || 0) + 1)
      }
    }
  }
  for (const [key, weight] of [...cooc.entries()].sort((x, y) => (x[0] < y[0] ? -1 : 1))) {
    const [a, b] = key.split('|')
    // 稳定键按数字 id 排（'P9' 与 'P11' 按字符串排会翻边，翻边会让已保存的外观找不到归属）
    const [lo, hi] = byKey.get(a).id < byKey.get(b).id ? [a, b] : [b, a]
    push({ type: 'cooc', a, b, weight, styleKey: `cooc|${byKey.get(lo).id}|${byKey.get(hi).id}`, source: '错题共现' })
  }

  const endpointOf = e => (e.fromKind === 'topic' ? topicKey(e.from) : pointKey(e.from))
  for (const e of payload.edges || []) {
    const a = endpointOf(e)
    const b = e.toKind === 'topic' ? topicKey(e.to) : pointKey(e.to)
    if (!byKey.has(a) || !byKey.has(b) || a === b) continue
    push({
      type: 'ai', a, b, edgeId: e.id, kind: e.kind, rel: e.rel, reason: e.reason, conf: e.conf,
      mine: e.kind === 'custom', styleKey: `${e.kind}|${e.id}`, source: e.kind === 'custom' ? '我连的' : 'AI 已确认'
    })
  }

  // AI 候选：不进图、不受力，只在面板与"点线"预览里出现
  const candidates = (payload.candidates || [])
    .map(c => ({
      ...c,
      a: c.fromKind === 'topic' ? topicKey(c.from) : pointKey(c.from),
      b: c.toKind === 'topic' ? topicKey(c.to) : pointKey(c.to)
    }))
    .filter(c => byKey.has(c.a) && byKey.has(c.b))

  // 节点外观也存在同一张 starmap_style 里：targetKey = topic|<id> / point|<id>。
  // 后端本来就接受任意 targetType，所以不用加表、不用改 SQL。
  const look = (node, key) => {
    const s = styles[key] || {}
    const size = Number(s.size)
    const glow = Number(s.glow)
    node.size = Number.isFinite(size) ? Math.min(3, Math.max(0.3, size)) : 1
    node.glow = Number.isFinite(glow) ? Math.min(1.8, Math.max(0, glow)) : 1
    node.pattern = ['banded', 'smooth', 'cloudy'].includes(s.pattern) ? s.pattern : 'banded'
  }
  for (const t of topics) {
    t.styleKey = `topic|${t.id}`
    look(t, t.styleKey)
  }
  for (const s of stars) {
    s.styleKey = `point|${s.id}`
    look(s, s.styleKey)
  }

  const adj = new Map()
  const link = (a, b, type) => {
    if (!adj.has(a)) adj.set(a, [])
    if (!adj.has(b)) adj.set(b, [])
    adj.get(a).push({ key: b, type })
    adj.get(b).push({ key: a, type })
  }
  for (const e of edges) link(e.a, e.b, e.type)

  return {
    nodes: [...topics, ...stars],
    topics,
    stars,
    galaxies,
    edges,
    hiddenEdges: hidden,
    candidates,
    adj,
    byKey: new Map([...topics, ...stars].map(n => [n.key, n])),
    truncated: !!(payload.meta && payload.meta.refsTruncated)
  }
}

/**
 * 布局要的紧凑结构：id → 位置输入。
 * 故意**不传 edges**：位置只由归属关系和用户摆过的钉子决定，加一条线不该让全图跳位。
 */
export function layoutInput(graph) {
  return {
    topics: graph.topics.map(t => ({
      key: t.key, title: t.title, color: t.color, place: t.pin,
      galaxyKey: t.galaxyKey, children: t.children
    })),
    stars: graph.stars.map(s => ({ key: s.key, topicKey: s.topicKey, merged: s.merged, total: s.total, mastery: s.mastery, place: s.pin })),
    galaxies: graph.galaxies.map(g => ({
      key: g.key, title: g.title, color: g.color, manual: !!g.manual,
      pin: g.pin || null, topics: g.topics
    }))
  }
}
