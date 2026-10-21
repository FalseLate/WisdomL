/**
 * 星图接口的离线 mock：在 Node 侧（Playwright 的 route handler 里）持有一份内存 store，
 * 所以"删掉一条共现线 → 重新打开页面它还不回来"这类断言不需要真后端也能成立。
 * 数据结构与 GET /api/starmap/graph 的约定一致，改这里就等于改契约，前后端都要跟。
 */

const seed = () => ({
  nextId: 100,
  galaxies: [],
  topics: [
    { id: 1, title: '内科学 · 循环系统', color: '--accent', source: '上传资料《内科学》循环系统章节', pin: null },
    { id: 2, title: '内科学 · 呼吸系统', color: '--sky-text', source: '拍照识别《呼吸系统考点小结》', pin: null },
    { id: 3, title: '英语 · 阅读与语法', color: '--orange', source: 'AI 出题自《历年真题》', pin: null }
  ],
  points: [
    { id: 11, topicId: 1, hierLine: 1, title: '心衰的病因与诱因', titleKey: '心衰的病因与诱因', color: null, merged: false, origin: '手动' },
    { id: 12, topicId: 1, hierLine: 1, title: 'NYHA 心功能分级', titleKey: 'nyha心功能分级', color: null, merged: false, origin: '手动' },
    { id: 13, topicId: 1, hierLine: 1, title: '慢性心衰四联用药', titleKey: '慢性心衰四联用药', color: null, merged: false, origin: '手动' },
    { id: 14, topicId: 1, hierLine: 1, title: '急性左心衰抢救流程', titleKey: '急性左心衰抢救流程', color: null, merged: true, origin: '手动' },
    { id: 15, topicId: 1, hierLine: 1, title: '高血压诊断与分级', titleKey: '高血压诊断与分级', color: null, merged: false, origin: '手动' },
    { id: 16, topicId: 1, hierLine: 1, title: '洋地黄中毒的识别', titleKey: '洋地黄中毒的识别', color: null, merged: false, origin: '手动' },
    { id: 21, topicId: 2, hierLine: 1, title: 'COPD 分级与吸入药', titleKey: 'copd分级与吸入药', color: null, merged: false, origin: '手动' },
    { id: 22, topicId: 2, hierLine: 1, title: '呼吸衰竭的血气判读', titleKey: '呼吸衰竭的血气判读', color: null, merged: false, origin: '手动' },
    { id: 23, topicId: 2, hierLine: 1, title: '慢性肺源性心脏病', titleKey: '慢性肺源性心脏病', color: null, merged: false, origin: '手动' },
    { id: 24, topicId: 2, hierLine: 1, title: '气胸的识别与处理', titleKey: '气胸的识别与处理', color: null, merged: false, origin: '手动' },
    { id: 31, topicId: 3, hierLine: 1, title: '定语从句关系词选择', titleKey: '定语从句关系词选择', color: null, merged: false, origin: '手动' },
    { id: 32, topicId: 3, hierLine: 1, title: '长难句主干提取', titleKey: '长难句主干提取', color: null, merged: false, origin: '手动' },
    { id: 33, topicId: 3, hierLine: 1, title: '阅读主旨题定位', titleKey: '阅读主旨题定位', color: null, merged: false, origin: '手动' },
    { id: 34, topicId: 3, hierLine: 0, title: '熟词僻义', titleKey: '熟词僻义', color: null, merged: false, origin: '手动' }
  ],
  // 错题 ↔ 知识点：共现线与掌握度都从这里现算
  refs: [
    { q: 901, k: [11, 12], et: ['knowledge'], st: 0, wc: 1, txt: '慢性心衰最常见的诱因是（单选）' },
    { q: 902, k: [12, 13], et: ['knowledge', 'audit'], st: 0, wc: 1, txt: 'NYHA Ⅲ 级应优先启动的药物组合是（单选）' },
    { q: 903, k: [13], et: [], st: 2, wc: 1, txt: '' },
    { q: 904, k: [14], et: ['strategy'], st: 0, wc: 2, txt: '急性左心衰伴血压下降首选措施（单选）' },
    { q: 905, k: [15, 16], et: ['knowledge'], st: 0, wc: 1, txt: '洋地黄中毒在高血压患者中的表现（单选）' },
    { q: 906, k: [21, 22], et: ['math', 'strategy'], st: 0, wc: 1, txt: '慢阻肺合并呼衰的血气判读（单选）' },
    { q: 907, k: [21, 22], et: ['math'], st: 1, wc: 1, txt: '低流量吸氧的设定依据（单选）' },
    { q: 908, k: [22, 23], et: ['knowledge'], st: 0, wc: 1, txt: '肺心病患者血气提示哪型呼衰（单选）' },
    { q: 909, k: [12, 23], et: ['strategy'], st: 0, wc: 1, txt: '肺心病气促按心功能分级判断右心衰（单选）' },
    { q: 910, k: [24, 21], et: [], st: 2, wc: 1, txt: '' },
    { q: 911, k: [31, 32], et: ['knowledge'], st: 0, wc: 1, txt: 'The book ___ covers are torn（单选）' },
    { q: 912, k: [32, 33], et: ['strategy'], st: 0, wc: 1, txt: '本文最合适的标题是（单选）' },
    { q: 913, k: [33], et: [], st: 3, wc: 1, txt: '' }
  ],
  edges: [
    { id: 51, from: 21, to: 23, fromKind: 'point', toKind: 'point', kind: 'ai', rel: '先修', reason: '肺心病是慢阻肺持续进展的结果', conf: 0.83, status: 'accepted' },
    { id: 52, from: 11, to: 31, fromKind: 'point', toKind: 'point', kind: 'custom', rel: '关联', reason: '我自己连的测试线', conf: null, status: 'accepted' }
  ],
  candidates: [
    { id: 61, from: 22, to: 24, fromKind: 'point', toKind: 'point', rel: '依赖', reason: '气胸也会引起呼衰，处置前先看血气', conf: 0.7 }
  ],
  pointCandidates: [
    { id: 71, wrongQuestionId: 904, title: '急性左心衰的体位管理', reason: '题干考抢救措施，体位是第一步', conf: 0.78, qText: '急性左心衰伴血压下降首选措施（单选）' }
  ],
  // 错题本里还没挂过知识点的题：给"手动挂错题"当候选池
  unlinked: [
    { q: 921, txt: '高血压诊断切点与家庭血压（单选）', et: ['audit'], st: 0, wc: 1 },
    { q: 922, txt: '定容性 vs 低容量性休克的补液选择（单选）', et: ['knowledge'], st: 0, wc: 1 },
    { q: 923, txt: 'The report, ___ results were published（单选）', et: ['knowledge'], st: 1, wc: 1 }
  ],
  styles: {},
  vetoes: [],
  task: null
})

const norm = s => String(s || '').toLowerCase().replace(/[\s ]+/g, '').replace(/[（）()【】\[\]·、，,。.：:;；!?！？"'“”_-]/g, '')
const asInt = v => (v == null ? null : Number(v))

export function createStarMapStore(initial) {
  const db = initial || seed()

  const point = id => db.points.find(p => p.id === Number(id))
  const topic = id => db.topics.find(t => t.id === Number(id))
  const galaxy = id => db.galaxies.find(g => g.id === Number(id))

  const json = (route, body, status = 200) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })

  /** 与后端一致：graph 一次给全，refs 由错题关联现算，被否决的共现在前端派生时过滤 */
  function graphPayload() {
    return {
      topics: db.topics,
      galaxies: db.galaxies,
      points: db.points,
      edges: db.edges.filter(e => e.status === 'accepted'),
      candidates: db.candidates,
      pointCandidates: db.pointCandidates,
      refs: db.refs,
      styles: db.styles,
      vetoes: db.vetoes,
      meta: { refsTruncated: false }
    }
  }

  function refreshKnowledgePoints() {
    for (const ref of db.refs) {
      const titles = ref.k.map(id => point(id)?.title).filter(Boolean)
      const row = ref
      row.kpCache = titles.join(',').slice(0, 480)
    }
  }

  async function handle(route) {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname.replace(/^\/api/, '')
    const method = request.method()
    const body = request.postData() ? JSON.parse(request.postData()) : {}
    const q = url.searchParams

    if (method === 'GET' && path === '/starmap/graph') return json(route, graphPayload())
    if (method === 'GET' && path === '/wrong-questions/review-today') {
      const list = db.refs.slice(0, 2).map(r => ({
        id: r.q,
        questionContent: JSON.stringify({ stem: r.txt || `错题 #${r.q}` })
      }))
      return json(route, { count: list.length, list })
    }
    if (method === 'GET' && path === '/starmap/ai/unanalyzed') {
      const list = db.unlinked.map(r => ({ id: r.q, stem: r.txt, type: 'single', errorTypes: (r.et || []).join(',') }))
      return json(route, { list, count: list.length })
    }
    if (method === 'POST' && path === '/starmap/galaxy') {
      const id = ++db.nextId
      db.galaxies.push({ id, title: body.title, color: body.color || null, pin: body.pin || null })
      return json(route, { id })
    }
    const gm = path.match(/^\/starmap\/galaxy\/(\d+)$/)
    if (gm && method === 'PUT') {
      const g = galaxy(gm[1])
      if (!g) return json(route, { error: 'no such galaxy' }, 404)
      if (body.title != null) g.title = body.title
      if (body.color !== undefined) g.color = body.color
      if ('pin' in body) g.pin = body.pin
      return json(route, { success: true })
    }
    if (gm && method === 'DELETE') {
      const id = Number(gm[1])
      db.topics.forEach(t => { if (t.galaxyId === id) t.galaxyId = null })
      db.galaxies = db.galaxies.filter(g => g.id !== id)
      return json(route, { success: true })
    }
    if (method === 'POST' && path === '/starmap/topic') {
      const id = ++db.nextId
      db.topics.push({ id, title: body.title, note: body.note || '', color: body.color || null, galaxyId: body.galaxyId ?? null, source: '我自己建的主题', pin: null })
      return json(route, { id })
    }
    if (method === 'POST' && path === '/starmap/topic/unpin-all') {
      db.topics.forEach(t => { t.pin = null })
      db.points.forEach(p => { p.pin = null })
      return json(route, { success: true })
    }
    let m = path.match(/^\/starmap\/topic\/(\d+)$/)
    if (m && method === 'PUT') {
      const t = topic(m[1])
      if (!t) return json(route, { error: 'no such topic' }, 404)
      if (body.title != null) t.title = body.title
      if (body.note !== undefined) t.note = body.note
      if (body.color !== undefined) t.color = body.color
      if (body.galaxyId !== undefined) t.galaxyId = body.galaxyId
      if ('pin' in body) t.pin = body.pin
      return json(route, { success: true })
    }
    if (m && method === 'DELETE') {
      const id = Number(m[1])
      db.topics = db.topics.filter(t => t.id !== id)
      db.points.forEach(p => { if (p.topicId === id) p.topicId = null })
      return json(route, { success: true })
    }

    if (method === 'GET' && path === '/starmap/point/match') {
      const key = norm(q.get('title'))
      const hit = db.points.find(p => p.titleKey === key)
      return json(route, { hit: hit ? { id: hit.id, title: hit.title, topicId: hit.topicId } : null })
    }
    if (method === 'POST' && path === '/starmap/point') {
      const key = norm(body.title)
      const hit = db.points.find(p => p.titleKey === key)
      if (hit && !body.force) return json(route, { duplicate: true, hit: { id: hit.id, title: hit.title } })
      const id = ++db.nextId
      db.points.push({
        id, topicId: body.topicId ?? null, hierLine: body.topicId == null ? 0 : 1,
        title: body.title, titleKey: key, note: body.note || '', color: null, merged: false,
        origin: '手动', pin: body.pin || null
      })
      return json(route, { id })
    }
    if (method === 'POST' && path === '/starmap/edge/veto') {
      db.vetoes.push(body)
      return json(route, { success: true })
    }
    if (method === 'DELETE' && path === '/starmap/edge/veto') {
      const same = v => (q.get('aPoint') && q.get('bPoint')
        ? String(v.aPoint) === q.get('aPoint') && String(v.bPoint) === q.get('bPoint')
        : v.aKey === q.get('aKey') && v.bKey === q.get('bKey'))
      db.vetoes = db.vetoes.filter(v => !(v.kind === q.get('kind') && same(v)))
      return json(route, { success: true })
    }
    m = path.match(/^\/starmap\/point\/(\d+)(\/merge-into)?$/)
    if (m && method === 'PUT') {
      const p = point(m[1])
      if (!p) return json(route, { error: 'no such point' }, 404)
      if (body.title != null) { p.title = body.title; p.titleKey = norm(body.title) }
      if (body.note !== undefined) p.note = body.note
      if (body.color !== undefined) p.color = body.color
      if (body.topicId !== undefined) { if (body.topicId !== p.topicId) p.pin = null; p.topicId = body.topicId }
      if ('pin' in body) p.pin = body.pin
      if (body.merged !== undefined) p.merged = !!body.merged
      if (body.hierLine !== undefined) p.hierLine = Number(body.hierLine)
      refreshKnowledgePoints()
      return json(route, { success: true })
    }
    if (m && method === 'POST') {
      const from = point(m[1]); const into = point(body.intoId)
      if (!from || !into) return json(route, { error: 'no such point' }, 404)
      db.refs.forEach(r => { r.k = [...new Set(r.k.map(id => (id === from.id ? into.id : id)))] })
      db.points = db.points.filter(p => p.id !== from.id)
      db.edges = db.edges.filter(e => e.from !== from.id && e.to !== from.id)
      return json(route, { success: true })
    }
    if (m && method === 'DELETE') {
      const id = Number(m[1])
      db.points = db.points.filter(p => p.id !== id)
      db.refs.forEach(r => { r.k = r.k.filter(k => k !== id) })
      db.refs = db.refs.filter(r => r.k.length > 0)
      db.edges = db.edges.filter(e => e.from !== id && e.to !== id)
      return json(route, { success: true })
    }

    if (method === 'POST' && path === '/starmap/edge') {
      const id = ++db.nextId
      db.edges.push({
        id, from: asInt(body.from), to: asInt(body.to), fromKind: body.fromKind, toKind: body.toKind,
        kind: 'custom', rel: body.rel, reason: body.reason, conf: null, status: 'accepted'
      })
      return json(route, { id })
    }
    m = path.match(/^\/starmap\/edge\/(\d+)(\/accept)?$/)
    if (m && method === 'POST' && m[2]) {
      const e = db.edges.find(x => x.id === Number(m[1]))
      if (e) e.status = 'accepted'
      const c = db.candidates.find(x => x.id === Number(m[1]))
      if (c) {
        db.candidates = db.candidates.filter(x => x !== c)
        db.edges.push({ id: ++db.nextId, from: c.from, to: c.to, fromKind: c.fromKind, toKind: c.toKind, kind: 'ai', rel: c.rel, reason: c.reason, conf: c.conf, status: 'accepted' })
      }
      return json(route, { success: true })
    }
    if (m && method === 'DELETE') {
      const id = Number(m[1])
      db.edges = db.edges.filter(e => e.id !== id)
      db.candidates = db.candidates.filter(c => c.id !== id)
      return json(route, { success: true })
    }

    if (method === 'PUT' && path === '/starmap/style') {
      db.styles[body.targetKey] = { ...(db.styles[body.targetKey] || {}), ...body.style }
      return json(route, { success: true })
    }
    if (method === 'DELETE' && path === '/starmap/style') {
      delete db.styles[q.get('targetKey')]
      return json(route, { success: true })
    }

    if (method === 'POST' && path === '/starmap/ai/points') {
      db.task = { status: 'running', done: 0, total: 1, candidates: 0 }
      return json(route, { taskId: 'mock-task', total: 1 })
    }
    // 错题 ↔ 知识点：手动挂/解绑
    if (method === 'GET' && path === '/wrong-questions') {
      const rows = db.refs.map(r => ({ id: r.q, questionContent: JSON.stringify({ stem: r.txt || `错题 #${r.q}` }) }))
      rows.push(...db.unlinked.map(r => ({ id: r.q, questionContent: JSON.stringify({ stem: r.txt }) })))
      return json(route, rows)
    }
    m = path.match(/^\/starmap\/point\/(\d+)\/ref(?:\/(\d+))?$/)
    if (m && method === 'POST') {
      const pid = Number(m[1])
      const qid = Number(body.wrongQuestionId)
      const hit = db.refs.find(r => r.q === qid)
      if (hit) { if (!hit.k.includes(pid)) hit.k.push(pid) }
      else {
        const free = db.unlinked.find(r => r.q === qid)
        db.refs.push({ q: qid, k: [pid], et: free?.et || [], st: free?.st ?? 0, wc: free?.wc ?? 1, txt: free?.txt || '' })
        db.unlinked = db.unlinked.filter(r => r.q !== qid)
      }
      return json(route, { success: true })
    }
    if (m && method === 'DELETE') {
      const pid = Number(m[1])
      const qid = Number(m[2])
      const hit = db.refs.find(r => r.q === qid)
      if (hit) hit.k = hit.k.filter(x => x !== pid)
      if (hit && !hit.k.length) db.refs = db.refs.filter(r => r !== hit)
      return json(route, { success: true })
    }
    if (method === 'GET' && path === '/starmap/ai/unanalyzed-count') {
      return json(route, { count: db.refs.length, failed: 0, running: !!db.taskRunning })
    }
    m = path.match(/^\/starmap\/ai\/candidate\/(\d+)\/accept$/)
    if (m && method === 'POST') {
      const c = db.pointCandidates.find(x => x.id === Number(m[1]))
      if (!c) return json(route, { error: 'no such candidate' }, 404)
      const id = ++db.nextId
      db.points.push({ id, topicId: body.topicId ?? null, hierLine: body.topicId ? 1 : 0, title: c.title, titleKey: norm(c.title), color: null, merged: false, origin: 'AI反推' })
      db.refs.push({ q: c.wrongQuestionId, k: [id], et: ['knowledge'], st: 0, wc: 1, txt: c.qText })
      db.pointCandidates = db.pointCandidates.filter(x => x !== c)
      return json(route, { pointId: id })
    }
    m = path.match(/^\/starmap\/ai\/candidate\/(\d+)$/)
    if (m && method === 'DELETE') {
      db.pointCandidates = db.pointCandidates.filter(x => x.id !== Number(m[1]))
      return json(route, { success: true })
    }
    if (method === 'GET' && path.startsWith('/task/')) {
      if (!db.task) return json(route, { error: 'no task' }, 404)
      db.task.status = 'completed'
      db.task.done = db.task.total
      db.task.candidates = db.pointCandidates.length
      return json(route, { taskId: 'mock-task', status: 'completed', result: { done: db.task.done, total: db.task.total, failed: 0, candidates: db.task.candidates } })
    }

    return json(route, {})
  }

  return {
    db,
    handle,
    graphPayload,
    /**
     * 装到 Playwright 的 page 上。
     * 必须按"路径以 /api/ 开头"匹配，不能用 '**&#47;api/**&#47;'：dev 服务下源码模块的
     * URL 形如 /src/api/starmap.js，通配会连模块一起拦成 JSON，页面直接白屏。
     */
    install(page) {
      return page.route(url => new URL(url).pathname.startsWith('/api/'), route => {
        const path = new URL(route.request().url()).pathname
        if (!path.startsWith('/api/starmap') && !path.startsWith('/api/task') && !path.startsWith('/api/wrong-questions')) {
          return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
        }
        return handle(route)
      })
    }
  }
}

export { seed }
