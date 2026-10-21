// @ts-check
// 知识星图 · 真接口回归（需要后端在 8080、库已建好 starmap_* 表）
//   PW_DEV=1 PW_BASE=http://localhost:5173 PW_HEADLESS=1 npx playwright test tests/starmap-live.spec.js
// 它只给自己新建的一次性账号写数据，不动任何人的错题与队友功能。
import { test, expect } from '@playwright/test'

const API = 'http://localhost:8080'

async function newUser(request) {
  const u = 'smv_' + Date.now() + '_' + Math.floor(Math.random() * 1e4)
  await request.post(`${API}/api/auth/register`, { data: { username: u, password: 'Test123456', nickname: '星图自检' } })
  const lr = await request.post(`${API}/api/auth/login`, { data: { username: u, password: 'Test123456' } })
  return lr.json()
}

/** 在页面里用真 token 打真接口，走的就是前端那套 URL */
function api(page, path, method = 'GET', data) {
  return page.evaluate(async ([p, m, d]) => {
    const r = await fetch('/api' + p, {
      method: m,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('token') },
      body: d ? JSON.stringify(d) : undefined
    })
    return { status: r.status, body: await r.json().catch(() => null) }
  }, [path, method, data])
}

async function open(page, authData) {
  await page.addInitScript(([t, u]) => {
    localStorage.setItem('token', t)
    localStorage.setItem('user', JSON.stringify(u))
    localStorage.setItem('starmap.helpSeen', '1')
  }, [authData.token, authData.user])
  await page.goto('/knowledge-universe', { waitUntil: 'load' })
  await page.waitForSelector('.splash-screen', { state: 'detached', timeout: 9000 }).catch(() => {})
}

/** 用 node 侧请求给这个一次性账号铺数据，不占页面时间 */
async function seed(request, token) {
  const h = { Authorization: 'Bearer ' + token }
  const post = async (path, data) => (await request.post(`${API}/api${path}`, { data, headers: h })).json()
  const topics = ['内科学 · 循环系统', '呼吸系统', '错题习惯']
  const points = { 0: ['急性左心衰的体位管理', '洋地黄的适应证', '房颤的抗凝选择'], 1: ['慢阻肺分级与吸入药', '呼衰的血气判读'], 2: ['审题漏条件', '单位换算'] }
  const ids = []
  for (const t of topics) ids.push((await post('/starmap/topic', { title: t })).id)
  const pids = []
  for (const [ti, list] of Object.entries(points)) {
    for (const title of list) pids.push((await post('/starmap/point', { title, topicId: ids[Number(ti)] })).id)
  }
  await post('/starmap/edge', { from: pids[0], to: pids[1], fromKind: 'point', toKind: 'point', rel: '先修', reason: '血流动力学不稳时先看容量再谈用药' })
  await post('/starmap/edge', { from: pids[3], to: pids[4], fromKind: 'point', toKind: 'point', rel: '依赖', reason: '血气判读要用到分级里的 FEV1' })
}

test.beforeEach(async ({ page, request }) => {
  test.slow()
  const auth = await newUser(request)
  await seed(request, auth.token)
  await open(page, auth)
})

test('真接口：整张图能拉下来，三种线各就各位', async ({ page }) => {
  const g = await api(page, '/starmap/graph')
  expect(g.status, JSON.stringify(g.body)).toBe(200)
  expect(g.body.topics.length).toBe(3)
  expect(g.body.points.length).toBe(7)
  expect(g.body.edges.length).toBe(2)
  await page.reload({ waitUntil: 'load' })
  await page.waitForSelector('.star-label.show', { timeout: 20000 })
  const counts = await page.evaluate(() => {
    const e = window.__starmap.store.graph.value.edges.reduce((a, x) => (a[x.type] = (a[x.type] || 0) + 1, a), {})
    return { ...e, nodes: window.__starmap.store.graph.value.nodes.length, visible: window.__starmap.renderer.debug.visibleCount(), edges: window.__starmap.renderer.debug.edgeCount() }
  })
  expect(counts.hier).toBe(7)
  expect(counts.ai).toBe(2)
  expect(counts.visible).toBe(10)
  expect(counts.edges).toBeGreaterThan(5)
})

test('真接口：大球换色立刻生效（就是线上报的那个"颜色不能选"）', async ({ page }) => {
  await page.waitForSelector('.star-label.show', { timeout: 20000 })
  const key = await page.evaluate(() => window.__starmap.store.graph.value.topics[0].key)
  const at = await page.evaluate(k => {
    const c = window.__starmap.renderer.debug.nodeScreen(k)
    for (const [dx, dy] of [[0, 0], [0, -18], [0, 18], [-18, 0], [18, 0]]) {
      const hit = window.__starmap.renderer.debug.pickAt(c.x + dx, c.y + dy)
      if (hit.node === k && !hit.edge) return { x: c.x + dx, y: c.y + dy }
    }
    return c
  }, key)
  await page.mouse.click(at.x, at.y)
  await expect(page.locator('.panel .swatch[aria-label="紫"]')).toBeVisible()
  await page.locator('.panel .swatch[aria-label="紫"]').click()
  await expect(page.locator('.panel .swatch.on')).toHaveAttribute('aria-label', '紫')
  const color = await page.evaluate(k => window.__starmap.renderer.debug.nodeColorOf(k), key)
  expect(color.b).toBeGreaterThan(color.g)
  // 库里也真的写进去了
  const g = await api(page, '/starmap/graph')
  expect(g.body.topics.find(t => 'T' + t.id === key).color).toBe('--violet')
})

test('真接口：虚线吃粗细、悬停出手指、深浅色两张图都能截出来', async ({ page }) => {  await page.waitForSelector('.star-label.show', { timeout: 20000 })
  const p = await page.evaluate(() => {
    const { renderer, store } = window.__starmap
    for (const e of store.graph.value.edges.filter(x => x.type === 'ai')) {
      for (const t of [0.3, 0.4, 0.5, 0.6, 0.7]) {
        const q = renderer.debug.edgeScreen(e.styleKey, t)
        if (!q || q.y < 70) continue
        const hit = renderer.debug.pickAt(q.x, q.y)
        if (!hit.node && hit.edge === e.styleKey) return { ...q, styleKey: e.styleKey }
      }
    }
    return null
  })
  expect(p, '找不到一条可点的语义线').toBeTruthy()
  await page.mouse.move(p.x, p.y)
  await expect.poll(() => page.evaluate(() => document.querySelector('.stage').classList.contains('pickable'))).toBe(true)
  await page.mouse.click(p.x, p.y)
  const before = await page.evaluate(() => window.__starmap.renderer.debug.edgeRadius())
  await page.locator('.panel input[aria-label="线的粗细"]').evaluate(el => {
    el.value = '3'
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await expect.poll(() => page.evaluate(() => window.__starmap.renderer.debug.edgeRadius()), { timeout: 8000 }).toBeGreaterThan(before)

  await page.screenshot({ path: 'tests/.shots/starmap-live-dark.png' })
  await page.locator('.tool', { hasText: /浅色|深色/ }).first().click()
  await page.waitForTimeout(1200)
  await page.screenshot({ path: 'tests/.shots/starmap-live-light.png' })
  expect(await page.evaluate(() => document.documentElement.getAttribute('data-theme'))).toBeTruthy()
})

// 演示账号由 scripts/starmap-demo-seed.mjs 灌数据，覆盖用户提过的每一种情况
test.describe('演示星图（demo_star）', () => {
  test.beforeEach(async ({ page, request }) => {
    test.slow()
    const r = await request.post(`${API}/api/auth/login`, { data: { username: 'demo_star', password: 'Demo123456' } })
    const auth = await r.json()
    expect(auth.token, '先跑 node scripts/starmap-demo-seed.mjs').toBeTruthy()
    await open(page, auth)
    await page.waitForSelector('.star-label.show', { timeout: 20000 })
  })

  test('全景：四颗大球、共现线、语义线、深浅两套', async ({ page }) => {
    const s = await page.evaluate(() => {
      const g = window.__starmap.store.graph.value
      const byType = g.edges.reduce((a, e) => (a[e.type] = (a[e.type] || 0) + 1, a), {})
      return {
        topics: g.topics.length, stars: g.stars.length, byType,
        hidden: g.hiddenEdges.length, vetoes: window.__starmap.store.vetoes.value.length,
        weights: g.edges.filter(e => e.type === 'cooc').map(e => e.weight).sort((a, b) => b - a).slice(0, 3),
        topicColors: g.topics.map(t => t.color)
      }
    })
    expect(s.topics).toBe(4)
    expect(s.stars).toBe(26)
    expect(s.byType.hier).toBe(24)
    expect(s.byType.cooc).toBe(29)
    expect(s.byType.ai).toBe(3)
    expect(s.hidden).toBe(1)
    expect(s.vetoes).toBe(1)
    expect(s.weights[0]).toBeGreaterThanOrEqual(2)
    expect(new Set(s.topicColors).size, '四颗大球不该一个色').toBeGreaterThan(2)

    await page.screenshot({ path: 'tests/.shots/demo-dark.png' })
    await page.locator('.tool', { hasText: /浅色|深色/ }).first().click()
    await page.waitForTimeout(1400)
    await page.screenshot({ path: 'tests/.shots/demo-light.png' })
    await page.locator('.tool', { hasText: /浅色|深色/ }).first().click()
    await page.waitForTimeout(1000)
  })

  test('进大球、选中一颗星的面板内容', async ({ page }) => {
    const key = await page.evaluate(() => window.__starmap.store.graph.value.topics[0].key)
    await page.evaluate(k => window.__starmap.store.enterTopic(k), key)
    await page.waitForTimeout(1400)
    await page.screenshot({ path: 'tests/.shots/demo-inside-topic.png' })
    const scope = await page.evaluate(() => window.__starmap.store.scope.value)
    expect(scope).toBe(key)

    const star = await page.evaluate(() => window.__starmap.store.graph.value.stars.find(s => s.title === 'NYHA 心功能分级').key)
    await page.evaluate(k => window.__starmap.store.select(k, { dim: true, fly: true }), star)
    await page.waitForTimeout(1400)
    await expect(page.locator('.panel h3')).toHaveText('NYHA 心功能分级')
    await expect(page.locator('.panel')).toContainText('挂在哪道错题上')
    await expect(page.locator('.panel')).toContainText('共现')
    // 题干与错因都要能从关联里现算出来，不能是"（题干未记录）"
    await expect(page.locator('.panel .wq-item').first()).not.toContainText('题干未记录')
    await expect(page.locator('.panel')).toContainText('慢性心衰最常见的诱因')
    await expect(page.locator('.panel')).toContainText(/审题性|知识性|策略性/)
    await page.screenshot({ path: 'tests/.shots/demo-star-panel.png' })
  })

  test('反推按钮：任务在跑时按钮要一直显示"反推中"且点不动', async ({ page }) => {    const btn = page.locator('.panel button').filter({ hasText: /开始反推|反推中/ })
    await expect(btn).toBeEnabled()
    expect(await page.evaluate(() => window.__starmap.store.analyzing.value), '演示账号没有正在跑的任务').toBe(false)
    await page.evaluate(() => { window.__starmap.store.analyzing.value = true })
    await expect(btn).toHaveText(/反推中/)
    await expect(btn).toBeDisabled()
  })
})

test.describe('演示星图 · 交互截图（demo_star）', () => {
  test.beforeEach(async ({ page, request }) => {
    test.slow()
    const r = await request.post(`${API}/api/auth/login`, { data: { username: 'demo_star', password: 'Demo123456' } })
    await open(page, await r.json())
    await page.waitForSelector('.star-label.show', { timeout: 20000 })
  })

  test('拖大球两下不留残影；显示面板与下拉框截图', async ({ page }) => {
    const meshes = () => page.evaluate(() => window.__starmap.renderer.debug.sceneMeshes())
    const before = await meshes()
    const key = await page.evaluate(() => window.__starmap.store.graph.value.topics[0].key)
    for (const [dx, dy] of [[110, 60], [-170, -40]]) {
      const at = await page.evaluate(k => {
        const { renderer } = window.__starmap
        const c = renderer.debug.nodeScreen(k)
        for (const [ox, oy] of [[0, 0], [0, -6], [6, 0], [0, 6], [-6, 0]]) if (renderer.debug.pickAt(c.x + ox, c.y + oy).node === k) return { x: c.x + ox, y: c.y + oy }
        return c
      }, key)
      await page.mouse.move(at.x, at.y)
      await page.mouse.down()
      await page.mouse.move(at.x + dx, at.y + dy, { steps: 10 })
      await page.mouse.up()
    }
    expect(await meshes()).toBe(before)
    // 刚才拖的是演示账号：把位置还原，别把用户要看的图拖乱
    await page.evaluate(k => window.__starmap.store.unpinNode(k), key)
    await page.waitForTimeout(800)
    await page.screenshot({ path: 'tests/.shots/demo-after-drag.png' })

    await page.locator('.tool', { hasText: '显示' }).click()
    await page.screenshot({ path: 'tests/.shots/demo-display.png' })
  })
})

test.describe('演示星图 · 位置稳定性（demo_star）', () => {
  test.beforeEach(async ({ page, request }) => {
    test.slow()
    const r = await request.post(`${API}/api/auth/login`, { data: { username: 'demo_star', password: 'Demo123456' } })
    await open(page, await r.json())
    await page.waitForSelector('.star-label.show', { timeout: 20000 })
  })

  const snapshot = page => page.evaluate(() => {
    const L = window.__starmap.store.debugState().layout
    return [...L.pos.entries()].map(([k, p]) => `${k}:${p.x.toFixed(4)},${p.y.toFixed(4)},${p.z.toFixed(4)}`).join('|')
  })

  test('挂一道错题到两颗知识点上：只多一条共现线，一颗星都不许跳', async ({ page }) => {
    const before = await snapshot(page)
    const coocBefore = await page.evaluate(() => window.__starmap.store.graph.value.edges.filter(e => e.type === 'cooc').length)
    // 共现要"同一道题挂了两个知识点"才成立，所以挑两颗还没同框过的星，把同一道题挂给它们
    const keys = await page.evaluate(() => {
      const g = window.__starmap.store.graph.value
      const a = g.stars.find(s => s.title === '心肌梗死的心电图演变')
      const b = g.stars.find(s => s.title === '主动脉瓣狭窄的杂音')
      return [a.key, b.key]
    })
    let stemLabel = ''
    for (const key of keys) {
      await page.evaluate(k => window.__starmap.store.select(k), key)
      if (!stemLabel) {
        await expect.poll(() => page.evaluate(() => window.__starmap.store.wrongPool.value.length)).toBeGreaterThan(0)
        stemLabel = await page.evaluate(() => window.__starmap.store.wrongPool.value[0].txt)
      }
      await page.locator('.starmap-panel button', { hasText: '选择错题挂上' }).click()
      await page.locator('.wq-search').fill(stemLabel)
      await page.locator('.wq-row', { hasText: stemLabel }).first().click()
      await page.locator('.wq-btn.primary', { hasText: '挂上' }).click()
    }
    await expect.poll(() => page.evaluate(() => window.__starmap.store.graph.value.edges.filter(e => e.type === 'cooc').length))
      .toBeGreaterThan(coocBefore)
    expect(await snapshot(page), '共现线多了，但所有节点位置必须一模一样').toBe(before)

    // 还原演示数据：精确删掉本次自己造的两条关联，不靠文案匹配
    const created = await page.evaluate(async ([ks, label]) => {
      const { store } = window.__starmap
      const qid = (await (await fetch('/api/wrong-questions', { headers: { Authorization: 'Bearer ' + localStorage.token } })).json())
        .find(w => { try { return JSON.parse(w.questionContent).stem.startsWith(label.slice(0, 8)) } catch { return false } })?.id
      const out = []
      for (const k of ks) {
        const id = Number(k.slice(1))
        await fetch(`/api/starmap/point/${id}/ref/${qid}`, { method: 'DELETE', headers: { Authorization: 'Bearer ' + localStorage.token } })
        out.push([id, qid])
      }
      return out
    }, [keys, stemLabel.trim()])
    expect(created.length).toBe(2)
    await page.reload({ waitUntil: 'load' })
    await page.waitForSelector('.star-label.show', { timeout: 20000 })
    await expect.poll(() => page.evaluate(() => window.__starmap.store.graph.value.edges.filter(e => e.type === 'cooc').length))
      .toBe(coocBefore)
  })

  test('拖一颗小球摆位置：存进库，刷新后还在原地', async ({ page }) => {
    const key = await page.evaluate(() => window.__starmap.store.graph.value.stars.find(s => s.title === '房颤的抗凝选择').key)
    const at = await page.evaluate(k => {
      const { renderer } = window.__starmap
      const c = renderer.debug.nodeScreen(k)
      for (const [dx, dy] of [[0, 0], [0, -4], [4, 0], [0, 4], [-4, 0], [0, -10], [0, 10]]) {
        if (renderer.debug.pickAt(c.x + dx, c.y + dy).node === k) return { x: c.x + dx, y: c.y + dy }
      }
      return null
    }, key)
    expect(at, '找不到能按住的这颗星').toBeTruthy()
    await page.mouse.move(at.x, at.y)
    await page.mouse.down()
    await page.mouse.move(at.x + 80, at.y - 60, { steps: 8 })
    await page.mouse.up()
    const pin = await page.evaluate(async k => {
      const g = await (await fetch('/api/starmap/graph', { headers: { Authorization: 'Bearer ' + localStorage.token } })).json()
      return g.points.find(p => 'P' + p.id === k).pin
    }, key)
    expect(pin, '小球的钉子要写进 starmap_point').toBeTruthy()
    const moved = await page.evaluate(k => {
      const L = window.__starmap.store.debugState().layout
      const t = L.pos.get(window.__starmap.store.graph.value.byKey.get(k).topicKey), p = L.pos.get(k)
      return { x: p.x - t.x, y: p.y - t.y, z: p.z - t.z }
    }, key)
    expect(Math.abs(moved.x - pin.x) + Math.abs(moved.y - pin.y) + Math.abs(moved.z - pin.z)).toBeLessThan(0.02)

    await page.reload({ waitUntil: 'load' })
    await page.waitForSelector('.star-label.show', { timeout: 20000 })
    const after = await page.evaluate(k => {
      const L = window.__starmap.store.debugState().layout
      const t = L.pos.get(window.__starmap.store.graph.value.byKey.get(k).topicKey), p = L.pos.get(k)
      return { x: p.x - t.x, y: p.y - t.y, z: p.z - t.z }
    }, key)
    expect(Math.abs(after.x - pin.x) + Math.abs(after.y - pin.y) + Math.abs(after.z - pin.z), '刷新后要回到摆好的位置').toBeLessThan(0.02)
    await page.screenshot({ path: 'tests/.shots/demo-pin-kept.png' })
  })
})
