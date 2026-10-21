/**
 * 星图演示数据播种：读 starmap-demo.json，全部走真接口（和前端点按钮走的是同一批 URL），
 * 不直接写库。所以它同时也是接口的一次端到端自测。
 *
 *   node scripts/starmap-demo-seed.mjs            # 后端要在 8080
 * 重跑会先把这个演示账号自己的图清空，不会碰别的账号。
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { derive } from '../src/starmap/graph.js'

const API = process.env.SEED_API || 'http://localhost:8080/api'
const data = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'starmap-demo.json'), 'utf8'))

let token = ''
async function call(path, method = 'GET', body) {
  const res = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined
  })
  const text = await res.text()
  let json = null
  try { json = text ? JSON.parse(text) : null } catch { json = { raw: text } }
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text.slice(0, 160)}`)
  return json
}

async function login() {
  await call('/auth/register', 'POST', data.account).catch(() => null)
  const r = await call('/auth/login', 'POST', { username: data.account.username, password: data.account.password })
  if (!r?.token) throw new Error('登录失败：' + JSON.stringify(r))
  token = r.token
}

async function clear() {
  const g = await call('/starmap/graph')
  for (const p of g.points || []) await call(`/starmap/point/${p.id}`, 'DELETE')
  for (const t of g.topics || []) await call(`/starmap/topic/${t.id}`, 'DELETE')
  for (const gx of g.galaxies || []) if (gx.manual) await call(`/starmap/galaxy/${gx.id}`, 'DELETE')
  for (const v of g.vetoes || []) {
    const params = { kind: v.kind, aKey: v.aKey, bKey: v.bKey }
    if (v.aPoint != null) params.aPoint = v.aPoint
    if (v.bPoint != null) params.bPoint = v.bPoint
    await call('/starmap/edge/veto?' + new URLSearchParams(params), 'DELETE')
  }
  return (g.points || []).length + (g.topics || []).length
}

async function main() {
  await login()
  const cleared = await clear()
  const topicId = {}
  const pointId = {}
  const log = []

  for (const t of data.topics) {
    const r = await call('/starmap/topic', 'POST', { title: t.title })
    topicId[t.key] = r.id
    const patch = {}
    if (t.color) patch.color = t.color
    if (t.pin) patch.pin = t.pin
    if (Object.keys(patch).length) await call(`/starmap/topic/${r.id}`, 'PUT', patch)
    log.push(`大球 #${r.id} ${t.title}${t.color ? '（钉色 ' + t.color + '）' : '（轮转默认色）'}${t.pin ? ' · 手摆位置已固定' : ''}`)
  }

  for (const p of data.points) {
    const r = await call('/starmap/point', 'POST', { title: p.title, topicId: p.topic ? topicId[p.topic] : null })
    pointId[p.key] = r.id
    const patch = {}
    if (p.color) patch.color = p.color
    if (p.merged) patch.merged = 1
    if (p.hierLine === 0) patch.hierLine = 0
    if (Object.keys(patch).length) await call(`/starmap/point/${r.id}`, 'PUT', patch)
    const where = p.topic ? `在「${data.topics.find(t => t.key === p.topic).title}」里` : '游离星，不属于任何大球'
    const extra = p.hierLine === 0 ? ' · 归属但不画线' : p.merged ? ' · 吸回大球成团' : p.color ? ` · 钉色 ${p.color}` : ''
    log.push(`小球 #${r.id} ${p.title} · ${where}${extra}`)
  }

  // 错题：走答题判分接口造，和真实使用完全同一条路
  const qid = {}
  for (const q of data.questions) {
    await call('/check', 'POST', {
      question: { id: 'demo_' + q.key, type: 'single', stem: q.stem, options: q.options, answer: q.answer, explanation: '演示题' },
      userAnswer: q.userAnswer,
      answerTime: q.answerTime
    })
    qid[q.key] = q.key
  }
  const wrongList = await call('/wrong-questions')
  const byStem = new Map(wrongList.map(w => {
    let stem = ''
    try { stem = JSON.parse(w.questionContent).stem } catch { stem = w.questionContent || '' }
    return [stem, w.id]
  }))
  let refCount = 0
  for (const q of data.questions) {
    const id = byStem.get(q.stem)
    if (!id) { log.push(`⚠ 没找到错题：${q.stem}`); continue }
    for (const key of q.points) {
      await call(`/starmap/point/${pointId[key]}/ref`, 'POST', { wrongQuestionId: id })
      refCount++
    }
  }
  log.push(`错题 ${data.questions.length} 道，手动挂出的 知识点↔错题 关联 ${refCount} 条 → 共现线全部由这些数据现算`)

  // 错因标注：走错题本自己的接口，面板上的错因分布和颜色才有依据
  let annotated = 0
  for (const q of data.questions) {
    if (!q.et?.length) continue
    await call('/wrong-questions/error-type', 'POST', { questionId: 'demo_' + q.key, errorTypes: q.et.join(','), errorNote: q.note || '' })
    annotated++
  }
  log.push(`错因标注 ${annotated} 道题（审题/知识/数学/策略/习惯五类，参与球内汇总与颜色）`)

  // 一部分题按正确答案重做：走错题本自己的"动手重做"接口，掌握度才会有红黄绿，不是满屏红
  let redone = 0
  for (const q of data.questions) {
    if (!q.redo) continue
    const id = byStem.get(q.stem)
    if (!id) continue
    await call(`/wrong-questions/${id}/redo`, 'POST', { userAnswer: q.answer, answerTime: 30 })
    redone++
  }
  log.push(`重做答对 ${redone} 道（这些题对应的知识点掌握度上升）`)

  const edgeId = {}
  for (const e of data.edges) {
    const r = await call('/starmap/edge', 'POST', {
      from: pointId[e.from], to: pointId[e.to], fromKind: 'point', toKind: 'point', rel: e.rel, reason: e.reason
    })
    edgeId[`${e.from}-${e.to}`] = r.id
    log.push(`语义线 #${r.id} ${e.rel}：${title(e.from)} ↔ ${title(e.to)} · 理由「${e.reason}」`)
  }
  function title(key) { return data.points.find(p => p.key === key).title }

  const pairKey = (a, b) => {
    const [lo, hi] = a < b ? [a, b] : [b, a]
    return [lo, hi]
  }
  for (const s of data.styles) {
    let targetKey
    if (s.target === 'cooc') targetKey = 'cooc|' + pairKey(pointId[s.pair[0]], pointId[s.pair[1]]).join('|')
    else if (s.target === 'hier') targetKey = `hier|${topicId[s.pair[0]]}|${pointId[s.pair[1]]}`
    else targetKey = `custom|${edgeId[s.key]}`
    await call('/starmap/style', 'PUT', { targetType: 'edge', targetKey, style: s.style })
    log.push(`外观 ${targetKey} → ${JSON.stringify(s.style)}`)
  }

  const v = data.veto
  const [lo, hi] = pairKey(pointId[v.pair[0]], pointId[v.pair[1]])
  await call('/starmap/edge/veto', 'POST', { kind: 'cooc', aPoint: lo, bPoint: hi, aKind: 'point', bKind: 'point' })
  log.push(`否决：删掉 ${title(v.pair[0])} ↔ ${title(v.pair[1])} 的共现线（重开页面也不会回来）`)

  const h = data.hidden
  const [hlo, hhi] = pairKey(pointId[h.pair[0]], pointId[h.pair[1]])
  await call('/starmap/style', 'PUT', { targetType: 'edge', targetKey: `cooc|${hlo}|${hhi}`, style: { hidden: true } })
  log.push(`隐藏：${title(h.pair[0])} ↔ ${title(h.pair[1])} 的共现线只是收起，不是否决`)

  const g = await call('/starmap/graph')
  // 用前端同一份派生层数一遍，确认"库里的事实"真能长成"图上的线"
  const graph = derive(g)
  const byType = graph.edges.reduce((a, e) => (a[e.type] = (a[e.type] || 0) + 1, a), {})
  const heaviest = graph.edges.filter(e => e.type === 'cooc').sort((a, b) => b.weight - a.weight)[0]
  console.log(`演示账号：${data.account.username} / ${data.account.password}（清空了旧的 ${cleared} 条）`)
  for (const l of log) console.log('  ' + l)
  console.log(`落库校验：大球 ${graph.topics.length} · 小球 ${graph.stars.length} · 图上线 ${graph.edges.length}`
    + `（层级 ${byType.hier || 0} / 共现 ${byType.cooc || 0} / 语义 ${byType.ai || 0}）`
    + ` · 被收起 ${graph.hiddenEdges.length} · 否决 ${g.vetoes.length} · 最粗的共现线权重 ${heaviest ? heaviest.weight : 0}`)
}

main().catch(e => { console.error('播种失败：', e.message); process.exit(1) })
