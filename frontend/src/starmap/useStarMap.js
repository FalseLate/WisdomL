/**
 * 星图页面的状态编排：数据 → 派生 → 布局 → 渲染，以及所有用户操作。
 *
 * 两条纪律：
 *   1) three 对象、图对象、布局结果一律不进 Vue 的响应式（深层代理会让每帧成本失控），
 *      只有 UI 态用 ref。
 *   2) 拖动类的调节（线的粗细/透明度）走 preview + commit，只碰渲染器与一次落库，
 *      绝不重算布局、不重渲染面板 —— 原型上"拖滑条只能点一下"就是因为 input 里做了整页 rebuild。
 *      点选类的改动（颜色、归属线、增删节点）走 run()，写完静默重取整张图。
 */
import { ref, computed, shallowRef } from 'vue'
import { showConfirmDialog } from 'vant'
import { toast, failToast } from './toast.js'
import * as api from '../api/starmap.js'
import { derive, layoutInput, normalizeTitle, findDuplicate, topicKey, pointKey } from './graph.js'
import { computeLayout } from './layout.js'

/** 题干在库里是整道题的 JSON，面板只留一行 */
function stemOf(raw) {
  let o = raw
  try { o = JSON.parse(raw) } catch { /* 也可能就是一段纯文本 */ }
  const text = o && typeof o === 'object' ? (o.stem || o.question || o.content || o.title || '') : String(o || '')
  return String(text).replace(/\s+/g, ' ').trim().slice(0, 42) || '（无题干）'
}

export function useStarMap() {
  // 非响应式：数据与渲染
  let payload = { topics: [], points: [], edges: [], candidates: [], refs: [], styles: {}, vetoes: [], meta: {} }
  let renderer = null
  let layout = null

  // 响应式：只放界面要看的
  const graph = shallowRef(derive(payload))
  const loading = ref(true)
  const error = ref('')
  const selectedKey = ref(null)
  const selectedEdge = ref(null)
  const scope = ref(null)
  const dimOn = ref(false)
  const linkFrom = ref(null)
  const linkMode = ref(false)
  const pendingLink = ref(null)
  const autoRotate = ref(false)
  const galaxyMode = ref(false)
  const unanalyzed = ref(0)
  const analyzing = ref(false)
  const wrongPool = shallowRef([])
  const wrongToday = shallowRef([])
  const unanalyzedQuestions = shallowRef([])
  const vetoes = shallowRef([])
  const pointCandidates = shallowRef([])

  const selected = computed(() => (selectedKey.value ? graph.value.byKey.get(selectedKey.value) : null))
  /** shallowRef 里的边被就地改了不会惊动面板，靠 styleTick 戳一下 */
  const styleTick = ref(0)
  const selectedEdgeObj = computed(() => {
    void styleTick.value
    return selectedEdge.value ? graph.value.edges.find(e => e.styleKey === selectedEdge.value) : null
  })
  const topics = computed(() => graph.value.topics)
  const stats = computed(() => ({
    nodes: graph.value.nodes.length,
    edges: graph.value.edges.length,
    byType: graph.value.edges.reduce((a, e) => (a[e.type] = (a[e.type] || 0) + 1, a), {}),
    candidates: graph.value.candidates.length
  }))

  function attach(r) {
    renderer = r
    paint()
  }

  function paint() {
    if (!renderer) return
    renderer.setGraph(graph.value, layout)
    renderer.setSelectedEdge(selectedEdge.value)
    renderer.setSelected(selectedKey.value)
    applyFocus()
  }

  /** 结构变化才重算布局；档位只由数据量决定，所以同一份数据两次打开一模一样 */
  function rebuild(preferKey) {
    graph.value = derive(payload)
    layout = computeLayout(layoutInput(graph.value))
    const keep = preferKey || selectedKey.value
    selectedKey.value = keep && graph.value.byKey.has(keep) ? keep : null
    if (scope.value && !graph.value.byKey.has(scope.value)) scope.value = null
    if (selectedEdge.value && !graph.value.edges.some(e => e.styleKey === selectedEdge.value)) selectedEdge.value = null
    paint()
  }

  /** silent：写操作完重取整张图但不盖全屏 loading，否则每点一下颜色都闪一次遮罩 */
  async function load({ silent = false } = {}) {
    if (!silent) loading.value = true
    try {
      payload = await api.getGraph()
      // payload 是普通对象（不进响应式），所以面板要看的两份派生数据单独放 ref
      pointCandidates.value = payload.pointCandidates || []
      vetoes.value = payload.vetoes || []
      error.value = ''
      rebuild()
    } catch (e) {
      error.value = e?.message || '星图加载失败'
    } finally {
      if (!silent) loading.value = false
    }
  }

  /**
   * 写操作一律静默重取整张图：颜色、归属线开关这类字段级改动，
   * 只 rebuild 不 load 会拿旧 payload 重算，界面看着就像"点了没反应"。
   * 布局是确定性的（同一份数据同一张图），所以重算不会让星位跳。
   */
  async function run(promise, { ok } = {}) {
    try {
      const res = await promise
      await load({ silent: true })
      if (ok) toast(ok)
      return res
    } catch (e) {
      failToast(e?.message || '操作失败，请重试')
      return null
    }
  }

  // ===== 选中与导航 =====
  function neighborsOf(key) {
    const set = new Set([key])
    const node = graph.value.byKey.get(key)
    if (!node) return set
    for (const nb of graph.value.adj.get(key) || []) set.add(nb.key)
    if (node.kind === 'star' && node.topicKey) set.add(node.topicKey)
    if (node.kind === 'topic') for (const c of node.children) set.add(c)
    return set
  }

  function applyFocus() {
    if (!renderer) return
    const on = selectedKey.value && dimOn.value
    renderer.setFocus(on ? neighborsOf(selectedKey.value) : null)
    renderer.setIsolate(null)
  }

  /**
   * 跳转前先保证目标在当前可见范围内。以前在球内点“跳到另一端”，
   * scope 还停在这颗球里，镜头飞到另一个被隐藏的节点上，画面就只剩背景。
   */
  function revealTarget(node) {
    if (!node) return
    if (node.kind === 'star') {
      const targetScope = node.topicKey || null
      if (scope.value === targetScope) return
      const from = scope.value ? graph.value.byKey.get(scope.value)?.title : ''
      const to = targetScope ? graph.value.byKey.get(targetScope)?.title : ''
      scope.value = targetScope
      renderer?.setScope(targetScope, { focus: false })
      if (from && to) toast(`离开「${from}」，进入「${to}」`)
      else if (from) toast(`离开「${from}」，回到全景`)
      return
    }
    if (node.kind === 'topic' && scope.value && scope.value !== node.key) {
      const from = graph.value.byKey.get(scope.value)?.title || ''
      scope.value = null
      renderer?.setScope(null)
      toast(`离开「${from}」，回到全景定位「${node.title}」`)
    }
  }

  function select(key, { dim = false, fly = false } = {}) {
    if (!graph.value.byKey.has(key)) return
    if (linkMode.value) {
      if (!linkFrom.value) {
        linkFrom.value = key
        toast('起点选好了，再点（或拖到）另一颗')
      } else if (linkFrom.value !== key) {
        const from = linkFrom.value
        linkFrom.value = null
        proposeLink(from, key)
      }
    } else if (linkFrom.value && linkFrom.value !== key) {
      const from = linkFrom.value
      linkFrom.value = null
      proposeLink(from, key)
    }
    // 只有“飞过去”的跳转才自动切 scope；普通点选保持当前视角
    if (fly) revealTarget(graph.value.byKey.get(key))
    selectedEdge.value = null
    selectedKey.value = key
    dimOn.value = dim
    if (renderer) {
      renderer.setSelected(key)
      renderer.setSelectedEdge(null)
    }
    applyFocus()
    if (fly && renderer) renderer.flyTo(key)
  }

  function selectEdge(styleKey) {
    selectedEdge.value = styleKey
    if (styleKey) {
      selectedKey.value = null
      if (renderer) { renderer.setSelected(null); renderer.setIsolate(null); renderer.setFocus(null) }
    }
    renderer?.setSelectedEdge(styleKey)
  }

  function clearSelection() {
    selectedKey.value = null
    selectedEdge.value = null
    linkFrom.value = null
    pendingLink.value = null
    dimOn.value = false
    renderer?.setSelected(null)
    renderer?.setSelectedEdge(null)
    applyFocus()
  }

  function enterTopic(key) {
    const node = graph.value.byKey.get(key)
    if (!node || node.kind !== 'topic') return
    scope.value = key
    renderer?.setScope(key)
    select(key)
    renderer?.focusTopic(key)
  }

  function backToRoot() {
    scope.value = null
    renderer?.setScope(null)
    renderer?.resetView()
  }

  // ===== 搜索 =====
  function search(text) {
    const q = normalizeTitle(text)
    if (!q) return []
    const hits = []
    for (const n of graph.value.nodes) {
      const score = n.titleKey.includes(q) ? (n.titleKey === q ? 0 : 1) : 9
      if (score < 9) hits.push({ key: n.key, title: n.title, kind: n.kind, topicKey: n.topicKey, isGalaxy: false, score })
    }
    for (const g of graph.value.galaxies) {
      const key = normalizeTitle(g.title)
      const score = key.includes(q) ? (key === q ? 0 : 1) : 9
      if (score < 9) hits.push({ key: g.key, title: g.title, kind: 'galaxy', isGalaxy: true, topics: g.topics.length, score })
    }
    return hits
      .sort((a, b) => a.score - b.score || a.title.localeCompare(b.title))
      .slice(0, 8)
  }

  /** 搜到星系时飞过去：没有具体节点可选中，直接取景到雾团 */
  function jumpToGalaxy(key) {
    const galaxy = graph.value.galaxies.find(g => g.key === key)
    if (!galaxy) return
    if (scope.value) {
      scope.value = null
      renderer?.setScope(null, { focus: false })
    }
    clearSelection()
    renderer?.flyToGalaxy(key)
    toast(`已定位到「${galaxy.title}」`)
  }

  function jumpTo(key) {
    const node = graph.value.byKey.get(key)
    if (!node) return
    if (node.kind === 'topic') {
      enterTopic(key)
      select(key, { dim: true })
      return
    }
    // select 会先把当前 scope 切到目标星球，再飞过去；不会飞到被隐藏的节点上
    select(key, { dim: true, fly: true })
  }

  // ===== 用户操作 =====
  function createTopic(title, note = '', galaxyId = null) {
    return run(api.addTopic({ title, note, galaxyId }), {
      ok: galaxyId == null ? '新星球已建，进去加知识点' : '新星球已建，并归进这个星系'
    })
  }

  /** 手建星系：空星系也会立刻得到一团雾，之后加星球半径会自动长大 */
  function createGalaxy({ title, color = '--accent', pin = null } = {}) {
    return run(api.addGalaxy({ title, color, pin }), { ok: '星系已建，右键雾团可以往里加星球' })
  }

  function updateGalaxy(id, patch) {
    return run(api.updateGalaxy(id, patch), { ok: '星系已更新' })
  }

  /** 删星系不删星球：成员退回自动成团/独立星球 */
  function deleteGalaxy(id) {
    return run(api.deleteGalaxy(id), { ok: '星系已删，里面的星球都还在' })
  }

  /** 图内键（'T3' / 'P11'）→ 数据库 id */
  const rawId = key => (key == null ? null : Number(String(key).slice(1)))

  async function createPoint(topicIdKey, title, force = false, note = '', pin = null) {
    const dup = findDuplicate(graph.value, title)
    if (dup && !force) return { duplicate: dup }
    return run(api.addPoint({ title, topicId: rawId(topicIdKey), force, note, pin }), { ok: '已加进星图' })
  }

  /** 知识点/星球描述：保存后静默重取，下次打开还在 */
  function setNote(key, note) {
    const id = key.slice(1)
    const call = key[0] === 'T' ? api.updateTopic(id, { note }) : api.updatePoint(id, { note })
    return run(call, { ok: '描述已保存' })
  }

  /** 已有星球改归手建星系；galaxyId=null 表示退回标题自动成团/独立 */
  function setTopicGalaxy(key, galaxyId) {
    // 换星系时清掉旧位置：不沿用上一团的钉子，交给新星系重新排座
    return run(api.updateTopic(key.slice(1), { galaxyId, pin: null }), {
      ok: galaxyId ? '已归入这个星系' : '已移出手建星系，重新按标题自动成团'
    })
  }

  function renameNode(key, title) {
    const id = key.slice(1)
    const call = key[0] === 'T' ? api.updateTopic(id, { title }) : api.updatePoint(id, { title })
    const dup = findDuplicate(graph.value, title, key)
    return run(call, { ok: dup ? `已改名，但「${dup.title}」也叫这个，考虑合并` : '名字已更新' })
  }

  function setNodeColor(key, token) {
    const id = key.slice(1)
    if (key[0] === 'T') return run(api.updateTopic(id, { color: token }), { ok: token ? '这颗球换了色，骨架线一起换' : '恢复默认色' })
    return run(api.updatePoint(id, { color: token }), { ok: token ? '这颗星钉住了颜色' : '恢复按掌握度上色' })
  }

  function setMerged(key, merged) {
    return run(api.updatePoint(key.slice(1), { merged: merged ? 1 : 0 }), {
      ok: merged ? '合并：小球吸回大球成一团' : '拆分：小球散开回自己的轨道'
    })
  }

  function reparent(key, topicKeyOrNull) {
    return run(api.updatePoint(rawId(key), { topicId: rawId(topicKeyOrNull) }), {
      ok: topicKeyOrNull ? '已归到那颗大球' : '已设为游离星，不属于任何大球'
    })
  }

  /** 归属线开关：删线不脱离主题（用户明确要的两件事分开） */
  function setHierLine(key, on) {
    return run(api.updatePoint(key.slice(1), { hierLine: on ? 1 : 0 }), {
      ok: on ? '归属线画回来了' : '线删掉了，但它还在这颗大球里'
    })
  }

  async function removeNode(key) {
    const node = graph.value.byKey.get(key)
    if (!node) return null
    const what = node.kind === 'topic' ? `大球「${node.title}」和它的连线` : `知识点「${node.title}」`
    try {
      await showConfirmDialog({ title: '删除', message: `确定删掉${what}？`, confirmButtonText: '删除', cancelButtonText: '取消' })
    } catch { return null }
    const id = key.slice(1)
    return run(key[0] === 'T' ? api.deleteTopic(id) : api.deletePoint(id), { ok: '已删除' })
  }

  async function mergeInto(fromKey, intoKey) {
    return run(api.mergePoint(fromKey.slice(1), intoKey.slice(1)), { ok: '已合并到那颗星' })
  }

  function createEdge({ fromKey, toKey, rel, reason }) {
    const from = graph.value.byKey.get(fromKey)
    const to = graph.value.byKey.get(toKey)
    return run(api.addEdge({
      from: from.id, to: to.id, fromKind: from.kind, toKind: to.kind, rel, reason
    }), { ok: '线已连上，颜色线型都能在面板里改' })
  }

  function acceptCandidate(id) {
    return run(api.acceptEdge(id), { ok: 'AI 候选已确认，画进图里了' })
  }

  /**
   * 三种线的"删"各不相同，语义不能混：
   *   层级线 = 归属开关（hierLine=0），删了它还在球里
   *   共现线 = 库里没有行，只能记一条否决
   *   语义线 = 删行，顺带记否决，AI 重跑不再提同一对
   */
  async function deleteEdge(edge) {
    if (edge.type === 'hier') return setHierLine(edge.b, false)
    if (edge.type === 'cooc') {
      return run(api.vetoEdge(vetoPayloadFor(edge)), { ok: '这条线已删除，重算不会再冒出来' })
    }
    return run(api.deleteEdge(edge.edgeId, true), { ok: '这条线已删除' })
  }

  function undoVeto(v) {
    return run(api.undoVeto({ kind: v.kind, aPoint: v.aPoint, bPoint: v.bPoint, aKey: v.aKey, bKey: v.bKey }), { ok: '这条线恢复了' })
  }

  function vetoPayloadFor(edge) {
    const a = graph.value.byKey.get(edge.a)
    const b = graph.value.byKey.get(edge.b)
    const [lo, hi] = (a.id < b.id ? [a, b] : [b, a])
    // 节点类型是 star/topic，不是 point：写错会让端点 id 全存成 null，否决只能靠名字兜
    return {
      kind: edge.type,
      aPoint: lo.kind === 'topic' ? null : lo.id,
      bPoint: hi.kind === 'topic' ? null : hi.id,
      aKind: lo.kind === 'topic' ? 'topic' : 'point',
      bKind: hi.kind === 'topic' ? 'topic' : 'point',
      aKey: lo.titleKey,
      bKey: hi.titleKey,
      aTitle: lo.title,
      bTitle: hi.title
    }
  }

  /**
   * 外观：先只改渲染器（拖动期间每帧都调，绝不能碰布局与面板），
   * 松手时 commit=true 才写本地覆盖层并落库。
   */
  function previewStyle(styleKey, patch) {
    renderer?.patchEdge(styleKey, patch)
  }

  function commitStyle(targetType, targetKey, style) {
    payload.styles[targetKey] = { ...(payload.styles[targetKey] || {}), ...style }
    // 就地改那条边面板看不见（graph 是 shallowRef，里面全是普通对象）：
    // 换成新对象 + styleTick，选中线的 props 才会真的变引用、面板才会重渲染
    const i = graph.value.edges.findIndex(x => x.styleKey === targetKey)
    if (i >= 0) graph.value.edges[i] = { ...graph.value.edges[i], ...style }
    styleTick.value++
    renderer?.patchEdge(targetKey, style)
    return api.putStyle({ targetType, targetKey, style: payload.styles[targetKey] })
      .catch(err => failToast(err?.message || '外观保存失败'))
  }

  function resetStyle(targetKey) {
    delete payload.styles[targetKey]
    return api.deleteStyle(targetKey).then(() => rebuild()).catch(() => {})
  }

  /** 节点外观（大小/发光）：拖动时只喂渲染器，松手才落库，和连线滑杆同一套节奏 */
  function previewNodeStyle(key, patch) {
    const node = graph.value.byKey.get(key)
    if (!node) return
    Object.assign(node, patch)
    renderer?.patchNodeStyle(node.styleKey, patch)
  }

  function commitNodeStyle(key, patch) {
    const node = graph.value.byKey.get(key)
    if (!node) return null
    const targetType = node.kind === 'topic' ? 'topic' : 'point'
    payload.styles[node.styleKey] = { ...(payload.styles[node.styleKey] || {}), ...patch }
    Object.assign(node, patch)
    styleTick.value++
    renderer?.patchNodeStyle(node.styleKey, patch)
    return api.putStyle({ targetType, targetKey: node.styleKey, style: payload.styles[node.styleKey] })
      .catch(err => failToast(err?.message || '外观保存失败'))
  }

  function pinTopic(rawId, place) {
    return api.updateTopic(rawId, { pin: place }).catch(err => failToast(err?.message || '位置没存住'))
  }

  /**
   * 拖完松手：大球存绝对坐标；小球存"相对父球的偏移"，这样以后拖大球整团一起走。
   * 本地 payload 同步改，后续 rebuild 不会把刚摆好的位置弹回去。
   */
  function placeNode(key, abs) {
    const node = graph.value.byKey.get(key)
    if (!node) return null
    if (node.kind === 'topic') {
      const t = payload.topics.find(x => x.id === node.id)
      if (t) t.pin = abs
      return pinTopic(node.id, abs)
    }
    const parent = node.topicKey ? layout?.pos.get(node.topicKey) : null
    const pin = parent
      ? { x: +(abs.x - parent.x).toFixed(3), y: +(abs.y - parent.y).toFixed(3), z: +(abs.z - parent.z).toFixed(3) }
      : abs
    const p = payload.points.find(x => x.id === node.id)
    if (p) p.pin = pin
    node.pin = pin
    return api.updatePoint(node.id, { pin }).catch(err => failToast(err?.message || '位置没存住'))
  }

  function unpinNode(key) {
    const node = graph.value.byKey.get(key)
    if (!node) return null
    const call = node.kind === 'topic' ? api.updateTopic(node.id, { pin: null }) : api.updatePoint(node.id, { pin: null })
    return run(call, { ok: '已取消固定，回到自动排布' })
  }

  /**
   * 所有"连线"入口（点两下 / 拖过去 / 右键从这里连线）都走这里：
   * 大球连自己球里的知识点 = 把那条归属线画回来，不另建一条重复的线。
   */
  function proposeLink(a, b) {
    const na = graph.value.byKey.get(a)
    const nb = graph.value.byKey.get(b)
    if (!na || !nb || a === b) return
    const topic = na.kind === 'topic' ? na : nb.kind === 'topic' ? nb : null
    const star = topic === na ? nb : na
    if (topic && star.kind === 'star' && star.topicKey === topic.key) {
      if (star.hierLine) toast(`「${star.title}」已经连着这颗大球了`)
      else setHierLine(star.key, true)
      return
    }
    // 只挡同方向重复；A→B 和 B→A 是两条有方向的关系，允许各连一条
    const already = graph.value.edges.some(e => e.type === 'ai' && e.a === a && e.b === b)
    if (already) { toast('这两颗之间同方向已经有一条线了；可以从另一头连反向关系，线会自动分开'); return }
    pendingLink.value = { a, b }
    selectedEdge.value = null
    selectedKey.value = b
    renderer?.setSelected(b)
  }

  function setLinkMode(on) {
    linkMode.value = !!on
    if (!on) linkFrom.value = null
    renderer?.setLinkMode(linkMode.value)
  }

  function unpinAll() {
    return run(api.unpinAllTopics(), { ok: '全部重排：手摆的位置已取消' })
  }

  function toggleAutoRotate() {
    autoRotate.value = !autoRotate.value
    renderer?.setAutoRotate(autoRotate.value)
    return autoRotate.value
  }

  /** 星系模式：拖任意一颗属于星系的星球/雾团，整团一起移动并落库 */
  function toggleGalaxyMode(next) {
    galaxyMode.value = next == null ? !galaxyMode.value : !!next
    renderer?.setGalaxyMode(galaxyMode.value)
    if (galaxyMode.value) toast('星系模式：按住雾团/星球整团移动；点或右键雾团可以收星球、改颜色')
    return galaxyMode.value
  }

  function placeGalaxy(galaxyKey, members, center = null) {
    const list = (members || []).filter(m => m && m.key && m.place)
    const galaxy = graph.value.galaxies.find(g => g.key === galaxyKey)
    if (!list.length && !(center && galaxy?.manual)) return null
    const calls = []
    for (const { key, place } of list) {
      const id = Number(String(key).slice(1))
      const t = payload.topics.find(x => x.id === id)
      if (t) t.pin = place
      const node = graph.value.byKey.get(key)
      if (node) node.pin = place
      calls.push(api.updateTopic(id, { pin: place }))
    }
    // 空星系/整团拖动后的中心也落库，下次打开雾团还在原地
    if (center && galaxy?.manual) {
      galaxy.pin = center
      const pg = (payload.galaxies || []).find(g => g.id === galaxy.id)
      if (pg) pg.pin = center
      calls.push(api.updateGalaxy(galaxy.id, { pin: center }))
    }
    return Promise.all(calls)
      .then(() => toast(list.length
        ? `整个星系已移动，${list.length} 颗星球跟着走`
        : '空星系已移动'))
      .catch(err => failToast(err?.message || '星系位置没存住'))
  }

  // ===== AI 反推 =====
  /** 只是起一个后台任务，图还没变，所以不走 run() 的静默重取 */
  async function analyze(questionIds = null) {
    let res
    try {
      res = await api.analyzePoints(Array.isArray(questionIds) && questionIds.length
        ? { questionIds }
        : {})
    } catch (e) {
      failToast(e?.message || '反推没能启动')
      return null
    }
    if (!res.taskId) {
      toast(res.reason === 'busy' ? '上一次反推还在跑，稍等一下' : '没有需要反推的错题了')
      return null
    }
    return res.taskId
  }

  async function refreshUnanalyzed() {
    try {
      const [res, listRes] = await Promise.all([
        api.unanalyzedCount(),
        api.unanalyzedQuestions().catch(() => null)
      ])
      unanalyzed.value = res?.count || 0
      // 刷新过页面也要认出"后台还在跑"，否则按钮看着能点（后端会拦，但骗了用户）
      analyzing.value = !!res?.running
      unanalyzedQuestions.value = Array.isArray(listRes?.list)
        ? listRes.list.map(w => ({ id: w.id, txt: w.stem || '（无题干）', type: w.type || '', errorTypes: w.errorTypes || '' }))
        : []
    } catch { /* 拿不到就不提示，不打扰 */ }
  }

  /** 错题池：给"手动挂知识点"用，题干只留一行；另取今日复习子集 */
  async function loadWrongPool() {
    try {
      const [list, today] = await Promise.all([
        api.listWrongQuestions(),
        api.reviewTodayWrong().catch(() => null)
      ])
      wrongPool.value = (Array.isArray(list) ? list : []).map(w => ({ id: w.id, txt: stemOf(w.questionContent) }))
      wrongToday.value = (today?.list || []).map(w => ({ id: w.id, txt: stemOf(w.questionContent) }))
    } catch {
      wrongPool.value = []
      wrongToday.value = []
    }
  }

  function attachRef(key, wrongQuestionId) {
    return run(api.addPointRef(rawId(key), { wrongQuestionId }), {
      ok: '挂上了：同一道题里的知识点会连出共现线'
    }).then(r => { loadWrongPool(); return r })
  }

  function detachRef(key, wrongQuestionId) {
    return run(api.deletePointRef(rawId(key), wrongQuestionId), { ok: '已和这道错题解绑' })
  }

  /** topicKey 决定这颗 AI 点收进哪颗大球；不给就是游离星（没有归属线） */
  function acceptPointCandidate(id, topicKey) {
    return run(api.acceptPointCandidate(id, { topicId: rawId(topicKey) }), { ok: topicKey ? '已收进这颗大球，归属线一起画上了' : '已收进星图（还没归到任何大球）' })
  }

  function rejectPointCandidate(id) {
    return run(api.rejectPointCandidate(id), { ok: '这条候选已忽略' })
  }

  const hiddenEdges = computed(() => graph.value.hiddenEdges)
  const checksum = () => layout?.checksum ?? 0
  const debugState = () => ({ payload, graph: graph.value, layout, selectedKey, selectedEdge, scope, linkFrom, pendingLink })

  return {
    graph, stats, topics, selected, selectedEdgeObj, hiddenEdges, vetoes, pointCandidates, candidates: computed(() => graph.value.candidates),
    loading, error, selectedKey, selectedEdge, scope, dimOn, linkFrom, pendingLink, autoRotate, galaxyMode, unanalyzed, analyzing, wrongPool, wrongToday, unanalyzedQuestions,
    truncated: computed(() => graph.value.truncated),
    attach, load, rebuild, select, selectEdge, clearSelection, enterTopic, backToRoot,
    search, jumpTo, jumpToGalaxy, neighborsOf, applyFocus,
    createTopic, createPoint, createGalaxy, updateGalaxy, deleteGalaxy,
    setNote, renameNode, setTopicGalaxy, setNodeColor, setMerged, reparent, setHierLine, removeNode, mergeInto,
    attachRef, detachRef, loadWrongPool,
    createEdge, acceptCandidate, deleteEdge, undoVeto,
    previewStyle, commitStyle, resetStyle, previewNodeStyle, commitNodeStyle,
    pinTopic, placeNode, placeGalaxy, unpinNode, proposeLink, setLinkMode, linkMode, unpinAll, toggleAutoRotate, toggleGalaxyMode,
    analyze, refreshUnanalyzed, acceptPointCandidate, rejectPointCandidate,
    checksum, debugState,
    keys: { topicKey, pointKey }
  }
}
