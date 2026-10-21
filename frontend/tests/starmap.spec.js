// @ts-check
// 知识星图（离线，不依赖后端）：接口由 tests/starmap-mock.mjs 在 Node 侧兜住，
// 所以"删掉的共现线重开不回来"这类断言是真的过了往返一次存储的。
//
// 需要跑在 dev 服务上（生产构建里没有 window.__starmap 这个调试出口）：
//   PW_DEV=1 PW_BASE=http://localhost:5173 PW_HEADLESS=1 npx playwright test tests/starmap.spec.js
import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { computeLayout } from '../src/starmap/layout.js'
import { derive, layoutInput } from '../src/starmap/graph.js'
import { createStarMapStore, seed } from './starmap-mock.mjs'

const auth = () => {
  localStorage.setItem('token', 'fake-starmap')
  localStorage.setItem('user', JSON.stringify({ id: 1, username: 'uni', nickname: '星图' }))
  localStorage.setItem('starmap.helpSeen', '1')
}

async function open(page, store) {
  await page.addInitScript(auth)
  await store.install(page)
  await page.goto('/knowledge-universe', { waitUntil: 'load' })
  await page.waitForSelector('.splash-screen', { state: 'detached', timeout: 9000 }).catch(() => {})
  await page.waitForSelector('.star-label.show', { timeout: 15000 })
  // 标签出现后线几何还会晚一两帧；拾取类断言前先让场景稳定
  await page.waitForFunction(() => !!window.__starmap)
  await page.waitForTimeout(180)
}

/** 找一条既没被星挡住、又是指定类型的线的屏幕坐标 */
async function linePoint(page, type) {
  return page.evaluate(t => {
    const { renderer, store } = window.__starmap
    const g = store.graph.value
    for (const e of g.edges.filter(x => x.type === t)) {
      for (const k of [0.3, 0.4, 0.5, 0.6, 0.7]) {
        const p = renderer.debug.edgeScreen(e.styleKey, k)
        if (!p || p.y < 70) continue
        const hit = renderer.debug.pickAt(p.x, p.y)
        if (!hit.node && hit.edge === e.styleKey) return { x: p.x, y: p.y, styleKey: e.styleKey }
      }
    }
    return null
  }, type)
}

async function nodePoint(page, key) {
  return page.evaluate(k => window.__starmap.renderer.debug.nodeScreen(k), key)
}

/** 大球中心常被线挡住，找一个"射线打上去确实是这颗球"的像素 */
function nodeClickPoint(page, key) {
  return page.evaluate(async k => {
    const { renderer } = window.__starmap
    const c = renderer.debug.nodeScreen(k)
    for (const [dx, dy] of [[0, 0], [0, -18], [0, 18], [-18, 0], [18, 0], [0, -30], [0, 30], [-30, -30], [30, 30]]) {
      const x = c.x + dx, y = c.y + dy
      const hit = renderer.debug.pickAt(x, y)
      if (hit.node === k && !hit.edge) return { x, y }
    }
    return c
  }, key)
}

/** 沿曲线均匀取点，统计命中目标线/其他线/节点/落空；offset 是屏幕法向偏移 */
function edgePickStats(page, styleKey, offset = 0, samples = 22) {
  return page.evaluate(({ styleKey: key, offset: off, samples: n }) => {
    const { renderer } = window.__starmap
    let hit = 0, otherEdge = 0, node = 0, miss = 0, total = 0
    let prev = null
    for (let i = 1; i < n; i++) {
      const p = renderer.debug.edgeScreen(key, i / n)
      if (!p) continue
      let x = p.x, y = p.y
      if (off && prev) {
        const dx = p.x - prev.x
        const dy = p.y - prev.y
        const len = Math.hypot(dx, dy) || 1
        x += (-dy / len) * off
        y += (dx / len) * off
      }
      prev = p
      total++
      const h = renderer.debug.pickAt(x, y)
      if (h.edge === key) hit++
      else if (h.edge) otherEdge++
      else if (h.node) node++
      else miss++
    }
    return { hit, otherEdge, node, miss, total }
  }, { styleKey, offset, samples })
}

/** 找屏幕长度最长的可见关联线 */
function longestEdge(page) {
  return page.evaluate(() => {
    const { renderer, store } = window.__starmap
    let best = null
    for (const e of store.graph.value.edges) {
      if (e.type !== 'cooc' && e.type !== 'ai') continue
      let len = 0
      let prev = null
      for (let i = 0; i <= 12; i++) {
        const p = renderer.debug.edgeScreen(e.styleKey, i / 12)
        if (!p) { prev = null; continue }
        if (prev) len += Math.hypot(p.x - prev.x, p.y - prev.y)
        prev = p
      }
      if (len > 20 && (!best || len > best.len)) best = { key: e.styleKey, type: e.type, len }
    }
    return best
  })
}

/** 找一条中点能选中、且有一个端点可直接拖的线（避开右侧面板覆盖区） */
function edgeWithDraggableNode(page) {
  return page.evaluate(() => {
    const { renderer, store } = window.__starmap
    for (const e of store.graph.value.edges) {
      if (e.type !== 'cooc' && e.type !== 'ai') continue
      const node = store.graph.value.byKey.get(e.a)
      if (!node || node.kind !== 'star') continue
      const mid = renderer.debug.edgeScreen(e.styleKey, 0.5)
      if (!mid || mid.x > 1000) continue
      if (renderer.debug.pickAt(mid.x, mid.y).edge !== e.styleKey) continue
      const c = renderer.debug.nodeScreen(e.a)
      for (const [dx, dy] of [[0, 0], [0, -8], [0, 8], [-8, 0], [8, 0], [0, -14], [0, 14], [-14, 0], [14, 0]]) {
        const x = c.x + dx, y = c.y + dy
        const top = document.elementFromPoint(x, y)
        if (!top || !top.classList?.contains('stage')) continue
        if (renderer.debug.pickAt(x, y).node === e.a) {
          return { key: e.styleKey, node: e.a, point: { x, y }, mid }
        }
      }
    }
    return null
  })
}

test('派生层：三种线都在，跨大球也有共现，被否决的共现不再出现', () => {
  const g = derive(seed())
  const byType = g.edges.reduce((a, e) => (a[e.type] = (a[e.type] || 0) + 1, a), {})
  expect(byType.hier).toBeGreaterThan(0)
  expect(byType.cooc).toBeGreaterThan(0)
  expect(byType.ai).toBeGreaterThan(0)
  const cross = g.edges.filter(e => e.type === 'cooc'
    && g.byKey.get(e.a).topicKey && g.byKey.get(e.a).topicKey !== g.byKey.get(e.b).topicKey)
  expect(cross.length).toBeGreaterThan(0)

  // 「内科学 · 循环系统」「内科学 · 呼吸系统」自动成团，星系是按命名派生出来的
  expect(g.galaxies.map(x => x.title)).toContain('内科学')
  expect(g.byKey.get('T1').galaxyKey, 'T1 应归到内科学星系').toBe('内科学')
  expect(g.byKey.get('T3').galaxyKey, '英语只有一颗主题，不成团').toBe(null)

  // 用户否决过的那一对，重算不能再冒出来
  const vetoed = JSON.parse(JSON.stringify(seed()))
  vetoed.vetoes.push({ kind: 'cooc', aPoint: 21, bPoint: 22, aKey: 'copd分级与吸入药', bKey: '呼吸衰竭的血气判读', aTitle: 'a', bTitle: 'b' })
  const g2 = derive(vetoed)
  expect(g2.edges.some(e => e.type === 'cooc' && ((e.a === 'P21' && e.b === 'P22') || (e.a === 'P22' && e.b === 'P21')))).toBe(false)

  // 删掉归属线（hierLine=0）不影响它仍在球内
  expect(g.byKey.get('P34').topicKey).toBe('T3')
  expect(g.edges.some(e => e.type === 'hier' && e.b === 'P34')).toBe(false)
})

test('游离星尘的钉子不受星球边界限制：右键放多远就留多远', () => {
  const p = seed()
  p.points.push({ id: 98, topicId: null, hierLine: 0, title: '远处星尘', titleKey: '远处星尘', color: null, merged: false, origin: '手动', pin: { x: 1000, y: 180, z: -420 } })
  const L = computeLayout(layoutInput(derive(p)))
  const at = L.pos.get('P98')
  expect([at.x, at.y, at.z]).toEqual([1000, 180, -420])
})

test('布局可复现：同一份数据两次算出同一个校验和；有钉子时不整体平移', () => {
  const p = seed()
  const first = computeLayout(layoutInput(derive(p))).checksum
  const again = computeLayout(layoutInput(derive(p))).checksum
  expect(first).toBe(again)

  const pinned = JSON.parse(JSON.stringify(p))
  pinned.topics[0].pin = { x: 120, y: -40, z: 60 }
  const withPin = computeLayout(layoutInput(derive(pinned)))
  const t = withPin.pos.get('T1')
  expect([Math.round(t.x), Math.round(t.y), Math.round(t.z)]).toEqual([120, -40, 60])
  expect(computeLayout(layoutInput(derive(pinned))).checksum).toBe(withPin.checksum)
})

test('挂错题、连语义线都不许让知识点跳位（位置只由归属和钉子决定）', () => {
  const base = computeLayout(layoutInput(derive(seed())))
  const positions = o => [...o.pos.entries()].map(([k, p]) => [k, +p.x.toFixed(6), +p.y.toFixed(6), +p.z.toFixed(6)])

  // 挂一道新错题到两颗已有知识点上 → 会多一条共现线，但一颗星都不许动
  const attached = seed()
  attached.refs.push({ q: 999, k: [11, 13], et: ['knowledge'], st: 0, wc: 1, txt: '新挂的题' })
  const afterAttach = computeLayout(layoutInput(derive(attached)))
  expect(derive(attached).edges.some(e => e.type === 'cooc' && ((e.a === 'P11' && e.b === 'P13') || (e.a === 'P13' && e.b === 'P11'))), '共现线应该出现').toBe(true)
  expect(positions(afterAttach)).toEqual(positions(base))

  // 再加一条语义线也一样
  const edged = seed()
  edged.edges.push({ id: 90, from: 31, to: 22, fromKind: 'point', toKind: 'point', kind: 'custom', rel: '关联', reason: '测试', conf: null, status: 'accepted' })
  expect(positions(computeLayout(layoutInput(derive(edged))))).toEqual(positions(base))

  // 往某颗大球里加一颗星：只有这颗大球自己会重排，别的大球必须原地不动
  const grown = seed()
  grown.points.push({ id: 99, topicId: 1, hierLine: 1, title: '新加的一颗', titleKey: '新加的一颗', color: null, merged: false, origin: '手动' })
  const moved = computeLayout(layoutInput(derive(grown)))
  for (const key of ['T2', 'T3', 'P21', 'P22', 'P31', 'P32']) {
    const a = base.pos.get(key), b = moved.pos.get(key)
    expect(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z), `${key} 不该被 A 球的新星挤走`).toBeLessThan(1e-6)
  }
})

test('未登录进不去，守卫会把地址换成 /login', async ({ page }) => {
  const store = createStarMapStore()
  await store.install(page)
  await page.goto('/knowledge-universe')
  await expect(page).toHaveURL(/\/login/)
})

test('打开就有骨架：三个大球的标签都在，面板有新建与反推入口', async ({ page }) => {
  const store = createStarMapStore()
  await open(page, store)
  await expect(page.locator('.star-label.topic')).toHaveCount(3)
  await expect(page.locator('.panel')).toContainText('我的知识星图')
  await expect(page.locator('.panel').first()).toContainText('让 AI 从错题反推没掌握的知识')
  expect(await page.evaluate(() => !!window.__starmap), '调试出口需要 dev 服务').toBeTruthy()
})

test('点一条线能选中；拖粗细滑条不会把滑条换掉，松手才发一次请求', async ({ page }) => {
  const store = createStarMapStore()
  await open(page, store)
  const hit = await linePoint(page, 'cooc')
  expect(hit, '找不到一条可点的共现线').not.toBeNull()
  await page.mouse.click(hit.x, hit.y)
  await expect(page.locator('.panel')).toContainText('这条连线')

  const slider = page.locator('.panel input[type=range]').first()
  await slider.focus()
  const putRequests = []
  page.on('request', r => { if (r.method() === 'PUT' && r.url().includes('/starmap/style')) putRequests.push(r) })
  // 连发 input 模拟按住拖动：中途面板绝不能被整体重渲染，否则拖不动
  for (const v of ['1.5', '2', '2.5']) {
    await page.evaluate(val => {
      const el = document.querySelector('.panel input[type=range]')
      el.value = val
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }, v)
  }
  expect(await page.evaluate(() => document.activeElement?.className), '拖动中滑条应保持聚焦').toContain('range')
  expect(putRequests.length, '拖动期间不该发请求').toBe(0)
  await page.evaluate(() => {
    const el = document.querySelector('.panel input[type=range]')
    el.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await page.waitForFunction(() => true)
  expect(putRequests.length, '松手后恰好一次落库').toBe(1)
  const key = hit.styleKey
  await page.waitForTimeout(300)
  expect(store.db.styles[key].width).toBe(2.5)
})

test('删掉一条共现线：重开不出现，恢复后回来', async ({ page }) => {
  const store = createStarMapStore()
  await open(page, store)
  const hit = await linePoint(page, 'cooc')
  await page.mouse.click(hit.x, hit.y)
  await expect(page.locator('.panel')).toContainText('这条连线')
  await page.locator('.panel button', { hasText: '删除这条线' }).click()
  await expect.poll(() => store.db.vetoes.length).toBe(1)
  await expect.poll(() => page.evaluate(k => window.__starmap.store.graph.value.edges.some(e => e.styleKey === k), hit.styleKey)).toBe(false)

  // 重新加载：否决记录在 Node 侧存着，线不该回来
  await page.reload({ waitUntil: 'load' })
  await page.waitForSelector('.star-label.show')
  expect(await page.evaluate(k => window.__starmap.store.graph.value.edges.some(e => e.styleKey === k), hit.styleKey)).toBe(false)

  await page.getByRole('button', { name: '恢复', exact: true }).first().click()
  await expect.poll(() => store.db.vetoes.length).toBe(0)
})

test('进入大球后能直接加知识点，且新点归在这颗球里', async ({ page }) => {
  const store = createStarMapStore()
  await open(page, store)
  const p = await nodePoint(page, 'T1')
  await page.mouse.dblclick(p.x, p.y)
  await expect(page.locator('.pill')).toBeVisible()
  await page.locator('.pill').click()
  await page.locator('.quick input').fill('心脏再同步化治疗')
  await page.locator('.quick button[type=submit]').click()
  await expect.poll(() => store.db.points.length).toBe(15)
  const added = store.db.points[store.db.points.length - 1]
  expect(added.title).toBe('心脏再同步化治疗')
  expect(added.topicId).toBe(1)
})

test('右键宇宙空白处：给新建星系/星球/游离知识点，不给球内知识点按钮', async ({ page }) => {
  await open(page, createStarMapStore())
  const spot = await contextPoint(page, '在宇宙空白处')
  expect(spot, '没找到宇宙空白处').toBeTruthy()
  const menu = page.locator('.menu')
  await expect(menu).toBeVisible()
  await expect(menu).toContainText('新建星系')
  await expect(menu).toContainText('新建星球（主题）')
  await expect(menu).toContainText('新建游离知识点')
  await expect(menu).not.toContainText('新建知识点（这颗星球）')
})

test('归属改成"不归到任何主题"后层级线消失，但它还在图里', async ({ page }) => {
  const store = createStarMapStore()
  await open(page, store)
  const p = await grabPoint(page, 'P11')
  expect(p, '找不到能按中 P11 的像素').toBeTruthy()
  await page.mouse.click(p.x, p.y)
  await expect(page.locator('.panel')).toContainText('心衰的病因与诱因')
  await page.locator('.panel select[aria-label="归属主题"]').selectOption('')
  await expect.poll(() => store.db.points.find(x => x.id === 11).topicId).toBe(null)
  expect(await page.evaluate(() => window.__starmap.store.graph.value.byKey.has('P11'))).toBe(true)
  expect(await page.evaluate(() => window.__starmap.store.graph.value.edges.some(e => e.type === 'hier' && e.b === 'P11'))).toBe(false)
})

test('深浅两套：浅色关掉辉光与流动光点，深色都开着', async ({ page }) => {
  const store = createStarMapStore()
  await open(page, store)
  await page.waitForTimeout(600)
  const dark = await page.evaluate(() => ({
    bloom: window.__starmap.renderer.debug.bloomStrength(),
    flows: window.__starmap.renderer.debug.flowCount()
  }))
  expect(dark.bloom).toBeGreaterThan(0)
  expect(dark.flows).toBeGreaterThan(0)

  await page.locator('.tool', { hasText: '深色' }).click()
  await page.waitForTimeout(600)
  const light = await page.evaluate(() => ({
    bloom: window.__starmap.renderer.debug.bloomStrength(),
    flows: window.__starmap.renderer.debug.flowCount(),
    bg: getComputedStyle(document.documentElement).getPropertyValue('--bg-base').trim(),
    canvas: window.__starmap.renderer.debug.clearColor()
  }))
  expect(light.bloom).toBe(0)
  expect(light.flows).toBe(0)
  expect(light.canvas.toLowerCase()).toBe(light.bg.toLowerCase())
})

test('从首页进入：warp 覆盖到 3D 首帧，没有 CALIBRATING 二次黑屏', async ({ page }) => {
  const store = createStarMapStore()
  await page.addInitScript(auth)
  await store.install(page)
  await page.goto('/', { waitUntil: 'load' })
  await page.waitForSelector('.splash-screen', { state: 'detached', timeout: 9000 }).catch(() => {})
  await page.locator('.func-card', { hasText: '知识星图' }).click()
  await expect(page.locator('.warp-mask')).toBeVisible()
  await expect(page.getByText('CALIBRATING STAR MAP')).toHaveCount(0)
  await page.waitForSelector('.star-label.show', { timeout: 15000 })
  await expect(page.locator('.warp-mask')).toHaveCount(0, { timeout: 5000 })
})

test('删层级线只关连线，不把它踢出大球（归属与连线是两件事）', async ({ page }) => {
  const store = createStarMapStore()
  await open(page, store)
  const hit = await linePoint(page, 'hier')
  expect(hit, '找不到一条可点的层级线').not.toBeNull()
  const pointId = Number(hit.styleKey.split('|')[2])
  await page.mouse.click(hit.x, hit.y)
  await expect(page.locator('.panel')).toContainText('这条连线')
  await page.locator('.panel button', { hasText: '删除这条线' }).click()
  await expect.poll(() => store.db.points.find(p => p.id === pointId).hierLine).toBe(0)
  expect(store.db.points.find(p => p.id === pointId).topicId, '线删了但还在球里').toBeTruthy()
  expect(store.db.vetoes.length, '层级线不该记成否决').toBe(0)
})

test('AI 反推：走现成的任务轮询，候选要确认才进图，收进哪颗大球由用户点定', async ({ page }) => {
  const store = createStarMapStore()
  await open(page, store)
  const before = store.db.points.length
  await page.locator('.panel button', { hasText: '自动取下一批' }).click()
  await expect.poll(() => store.db.pointCandidates.length, { timeout: 15000 }).toBe(1)
  await expect(page.locator('.panel')).toContainText('急性左心衰的体位管理')
  await expect(page.locator('.panel')).toContainText('该知识点与这道错题的关联把握')
  // 全景下 AI 不替用户归类：默认未归类，用户选了大球才画归属线
  await expect(page.locator('.panel select[aria-label="收进哪颗大球"]')).toHaveCount(1)
  await page.locator('.panel button', { hasText: '收进星图（未归类，写入笔记）' }).click()
  await expect.poll(() => store.db.points.length).toBe(before + 1)
  const fresh = store.db.points[store.db.points.length - 1]
  expect(fresh.origin).toBe('AI反推')
  expect(fresh.topicId, '默认应该保持未归类').toBe(null)
  expect(fresh.hierLine).toBe(0)
  expect(fresh.note, '确认候选后要把约100字知识讲解写进笔记').toContain('端坐位')
})

test('选中大球时面板直接给出"收进这颗球"，收进来的点带归属线', async ({ page }) => {
  const store = createStarMapStore()
  await open(page, store)
  const key = await page.evaluate(() => window.__starmap.store.graph.value.topics[1].key)
  // 这条测的是面板，不是拾取：直接走 select，避免大球中心被小球/线挡住时的偶发误选
  await page.evaluate(k => window.__starmap.store.select(k), key)
  await expect(page.locator('.panel')).toContainText('AI 反推的知识点候选')
  const before = store.db.points.length
  // 用户明确选目标星球，候选才会带上归属
  await page.locator('.panel select[aria-label="收进哪颗大球"]').selectOption(key)
  await page.locator('.panel button', { hasText: '收进这颗球并写入笔记' }).click()
  await expect.poll(() => store.db.points.length).toBe(before + 1)
  const fresh = store.db.points[store.db.points.length - 1]
  expect(fresh.topicId).toBe(Number(key.slice(1)))
  expect(fresh.hierLine).toBe(1)
  expect(fresh.note).toContain('端坐位')
  // 图上真有一条从这颗大球到它的层级线（写库后是静默重取，要等它回来）
  await expect.poll(() => page.evaluate(([tk, pid]) => window.__starmap.store.graph.value.edges
    .some(e => e.type === 'hier' && e.a === tk && e.b === 'P' + pid), [key, fresh.id]), { message: '收进大球后应该立刻有归属线' })
    .toBe(true)
})

test('颜色可选：点一颗大球换色，图上和面板都要立刻认账', async ({ page }) => {
  const store = createStarMapStore()
  await open(page, store)
  const key = await page.evaluate(() => window.__starmap.store.graph.value.topics[0].key)
  const at = await nodeClickPoint(page, key)
  await page.mouse.click(at.x, at.y)
  await expect(page.locator('.panel h3')).toHaveText(await page.evaluate(k => window.__starmap.store.graph.value.byKey.get(k).title, key))

  await page.locator('.panel .swatch[aria-label="紫"]').click()
  await expect.poll(() => store.db.topics[0].color).toBe('--violet')
  // 旧 bug：写完只 rebuild 不重取数据，payload 里还是旧颜色，选中的色块点不上高亮
  await expect(page.locator('.panel .swatch.on')).toHaveCount(1)
  await expect(page.locator('.panel .swatch.on')).toHaveAttribute('aria-label', '紫')

  const color = await page.evaluate(k => {
    const { renderer } = window.__starmap
    return renderer.debug.nodeColorOf(k)
  }, key)
  expect(color.r, '紫而不是默认的青').toBeLessThan(0.8)
  expect(color.b).toBeGreaterThan(color.g)
})

test('节点外观：拖滑杆实时预览，松手才落库，刷新后仍然生效', async ({ page }) => {
  const store = createStarMapStore()
  await open(page, store)
  await page.evaluate(() => window.__starmap.store.select('T1'))
  const scale = () => page.evaluate(() => window.__starmap.renderer.debug.objectState('T1').coreScale)
  const before = await scale()
  const slider = page.locator('.panel input[aria-label="节点大小"]')
  await slider.evaluate(el => {
    el.value = '1.5'
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await expect.poll(scale, '预览应该立刻变大').toBeGreaterThan(before)
  expect(await page.evaluate(() => window.__starmap.store.debugState().payload.styles['topic|1'])).toBeUndefined()
  await slider.evaluate(el => el.dispatchEvent(new Event('change', { bubbles: true })))
  await expect.poll(() => store.db.styles['topic|1']?.size ?? 0).toBe(1.5)

  await page.reload({ waitUntil: 'load' })
  await page.waitForSelector('.star-label.show', { timeout: 15000 })
  expect(await page.evaluate(() => window.__starmap.store.graph.value.byKey.get('T1').size)).toBe(1.5)
  expect(await scale()).toBeGreaterThan(before)
})

test('知识点描述：保存后刷新还在，面板能读回来', async ({ page }) => {
  const store = createStarMapStore()
  await open(page, store)
  await page.evaluate(() => window.__starmap.store.select('P11'))
  const note = '心衰最常见的诱因是感染；先看诱因，再谈用药。'
  await page.locator('.panel textarea[aria-label="知识点描述"]').fill(note)
  await page.locator('.panel button', { hasText: '保存描述' }).click()
  await expect.poll(() => store.db.points.find(p => p.id === 11)?.note).toBe(note)

  await page.reload({ waitUntil: 'load' })
  await page.waitForSelector('.star-label.show', { timeout: 15000 })
  await page.evaluate(() => window.__starmap.store.select('P11'))
  await expect(page.locator('.panel textarea[aria-label="知识点描述"]')).toHaveValue(note)
})

test('空面板能直接新建知识点，并把描述一起写进去', async ({ page }) => {
  const store = createStarMapStore()
  await open(page, store)
  await page.locator('.panel input[aria-label="新知识点名字"]').fill('利尿剂抵抗的处理')
  await page.locator('.panel textarea[aria-label="新知识点描述"]').fill('先确认依从性和钠摄入，再考虑加量。')
  await page.locator('.panel button', { hasText: '加入星图' }).click()
  await expect.poll(() => store.db.points.find(p => p.title === '利尿剂抵抗的处理')?.note).toBe('先确认依从性和钠摄入，再考虑加量。')
  await expect(page.locator('.panel h3')).toHaveText('利尿剂抵抗的处理')
})

test('光环包住所有星点：边界半径不小于最远星点', async ({ page }) => {
  await open(page, createStarMapStore())
  const bad = await page.evaluate(() => {
    const { renderer, store } = window.__starmap
    return store.graph.value.topics
      .map(t => ({ key: t.key, env: renderer.debug.envelope(t.key) }))
      .filter(x => !x.env || !x.env.contains)
  })
  expect(bad, JSON.stringify(bad)).toEqual([])
})

test('星球光罩着色器在 pow 前 clamp：负底数产生 NaN，会被泛光扩散成整屏黑', () => {
  const src = readFileSync(new URL('../src/starmap/universe.js', import.meta.url), 'utf8')
  const shell = src.slice(src.indexOf('const SHELL_FRAG'), src.indexOf('function planetMaterial'))
  // dot 的浮点误差会略大于 1，1-abs(dot) 变负数；pow(负数, 小数) 是 NaN，
  // 泛光模糊会把一个 NaN 扩散到整屏。这条守卫防止以后把 clamp 删掉。
  expect(shell).toMatch(/pow\(\s*clamp\(\s*1\.0 - abs\(dot/)
})

test('中键拖拽只平移，不改变旋转角度', async ({ page }) => {
  await open(page, createStarMapStore())
  const before = await page.evaluate(() => ({
    theta: window.__starmap.renderer.debug.theta(),
    target: window.__starmap.renderer.debug.target()
  }))
  const spot = await page.evaluate(() => {
    const { renderer } = window.__starmap
    const r = document.querySelector('.stage').getBoundingClientRect()
    for (const [x, y] of [[r.left + 180, r.top + 240], [r.left + 220, r.bottom - 160], [r.left + 300, r.top + 220]]) {
      const hit = renderer.debug.pickAt(x, y)
      if (!hit.node && !hit.edge) return { x, y }
    }
    return { x: r.left + 180, y: r.top + 240 }
  })
  await page.mouse.move(spot.x, spot.y)
  await page.mouse.down({ button: 'middle' })
  for (let i = 1; i <= 6; i++) await page.mouse.move(spot.x + i * 14, spot.y + i * 7)
  await page.mouse.up({ button: 'middle' })
  const after = await page.evaluate(() => ({
    theta: window.__starmap.renderer.debug.theta(),
    target: window.__starmap.renderer.debug.target()
  }))
  expect(after.theta).toBe(before.theta)
  const moved = Math.hypot(after.target.x - before.target.x, after.target.y - before.target.y, after.target.z - before.target.z)
  expect(moved, '中键拖拽应该平移场景').toBeGreaterThan(1)
})

test('星系模式：拖一颗星球，整团星球一起移动并落库', async ({ page }) => {
  const store = createStarMapStore()
  await open(page, store)
  await page.locator('.tool', { hasText: '星系模式' }).click()
  const galaxy = await page.evaluate(() => {
    const g = window.__starmap.store.graph.value.galaxies.find(x => x.topics.includes('T1'))
    return { key: g.key, topics: g.topics }
  })
  const before = await page.evaluate(keys => Object.fromEntries(keys.map(k => [k, window.__starmap.renderer.debug.nodePos(k)])), galaxy.topics)
  const at = await grabPoint(page, 'T1')
  expect(at, '找不到能按住的 T1').toBeTruthy()
  await mouseDrag(page, at, { x: at.x + 80, y: at.y + 40 })
  await page.waitForTimeout(500)
  const after = await page.evaluate(keys => Object.fromEntries(keys.map(k => [k, window.__starmap.renderer.debug.nodePos(k)])), galaxy.topics)
  const dx = after.T1.x - before.T1.x
  const dy = after.T1.y - before.T1.y
  const dz = after.T1.z - before.T1.z
  expect(Math.hypot(dx, dy, dz), '整团应该真的移动').toBeGreaterThan(1)
  for (const key of galaxy.topics) {
    expect(Math.abs(after[key].x - before[key].x - dx)).toBeLessThan(0.05)
    expect(Math.abs(after[key].y - before[key].y - dy)).toBeLessThan(0.05)
    expect(Math.abs(after[key].z - before[key].z - dz)).toBeLessThan(0.05)
  }
  await expect.poll(() => store.db.topics.filter(t => galaxy.topics.includes('T' + t.id)).every(t => t.pin)).toBe(true)
})

/** 在空白处右键，直到菜单标题命中期望的层级 */
async function contextPoint(page, capText) {
  const box = await page.locator('.stage').boundingBox()
  const spots = [
    [0.07, 0.3], [0.06, 0.62], [0.12, 0.84], [0.4, 0.18], [0.55, 0.82], [0.3, 0.72]
  ]
  for (const [rx, ry] of spots) {
    const x = box.x + box.width * rx
    const y = box.y + box.height * ry
    await page.mouse.click(x, y, { button: 'right' })
    const menu = page.locator('.menu')
    if (!(await menu.isVisible().catch(() => false))) continue
    const text = await menu.textContent()
    if (text.includes(capText)) return { x, y, text }
    await page.keyboard.press('Escape')
  }
  return null
}

test('右键菜单：点外面/Esc 会收起，并按宇宙/星球分层', async ({ page }) => {
  await open(page, createStarMapStore())
  const empty = await contextPoint(page, '在宇宙空白处')
  expect(empty, '没找到宇宙空白处').toBeTruthy()
  await expect(page.locator('.menu')).toContainText('新建星系')
  await expect(page.locator('.menu')).toContainText('新建星球（主题）')
  await expect(page.locator('.menu')).toContainText('新建游离知识点')

  // 点菜单外面：菜单收起，原点击继续（点顶栏品牌，不会命中星系雾团再开一个）
  await page.locator('.brand').click()
  await expect(page.locator('.menu')).toHaveCount(0)

  await page.mouse.click(empty.x, empty.y, { button: 'right' })
  await expect(page.locator('.menu')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('.menu')).toHaveCount(0)

  // 进入星球后，空白处只给“这颗星球加知识点”
  await page.evaluate(() => window.__starmap.store.enterTopic('T1'))
  await page.waitForTimeout(1200)
  const inside = await contextPoint(page, '在「内科学 · 循环系统」里')
  expect(inside, '球内右键没出现星球菜单').toBeTruthy()
  await expect(page.locator('.menu')).toContainText('新建知识点（这颗星球）')
  await page.keyboard.press('Escape')
})

test('分层创建：全景能建游离知识点，自动星系里建星球会补标题前缀', async ({ page }) => {
  await open(page, createStarMapStore())
  const empty = await contextPoint(page, '在宇宙空白处')
  expect(empty, '没找到宇宙空白处').toBeTruthy()
  await page.locator('.menu .item', { hasText: '新建游离知识点' }).click()
  await expect(page.locator('.quick')).toContainText('星尘')
  await page.locator('.quick input[aria-label="名字"]').fill('待归类的观察')
  await page.locator('.quick button[type="submit"]').click()
  await expect.poll(() => page.evaluate(() => window.__starmap.store.graph.value.stars
    .some(s => s.title === '待归类的观察' && s.topicKey === null))).toBe(true)
  const dust = await page.evaluate(() => {
    const s = window.__starmap.store.graph.value.stars.find(x => x.title === '待归类的观察')
    return { pin: s.pin, at: window.__starmap.renderer.debug.nodeScreen(s.key) }
  })
  expect(dust.pin, '游离星尘要记住右键位置，不能回到随机星尘带').toBeTruthy()
  expect(Math.hypot(dust.at.x - empty.x, dust.at.y - empty.y), '星尘应该落在右键的位置').toBeLessThan(24)

  // 自动星系（内科学）里建星球：强制补 “内科学 · ” 前缀才能继续成团
  const at = await page.evaluate(() => window.__starmap.renderer.debug.galaxyScreen('内科学'))
  let onGalaxy = false
  for (const [dx, dy] of [[0, 0], [0, 48], [52, 0], [-52, 0], [0, -48], [64, 40], [-64, -40]]) {
    await page.mouse.click(at.x + dx, at.y + dy, { button: 'right' })
    const menu = page.locator('.menu')
    if (!(await menu.isVisible().catch(() => false))) continue
    if ((await menu.textContent()).includes('星系「内科学」')) { onGalaxy = true; break }
    await page.keyboard.press('Escape')
  }
  expect(onGalaxy, '没找到星系雾团的空白处').toBe(true)
  await page.locator('.menu .item', { hasText: '新建星球' }).click()
  await page.locator('.quick input[aria-label="名字"]').fill('循环生理')
  await page.locator('.quick button[type="submit"]').click()
  const created = await page.evaluate(() => {
    const t = window.__starmap.store.graph.value.topics.find(x => x.title === '内科学 · 循环生理')
    return t ? { key: t.key, galaxyKey: t.galaxyKey } : null
  })
  expect(created, '自动星系新建星球要带上标题前缀').toBeTruthy()
  expect(created.galaxyKey).toBe('内科学')
})

test('搜索能搜到星系和游离星尘，点星系结果会飞到雾团', async ({ page }) => {
  await open(page, createStarMapStore())
  await page.evaluate(() => window.__starmap.store.createPoint(null, '远方的星尘'))
  const box = page.locator('input[aria-label="搜索星球、星系、知识点"]')
  await box.fill('内科学')
  const galaxyHit = page.locator('.results li', { hasText: '星系 · 2 星球' })
  await expect(galaxyHit).toHaveCount(1)
  await galaxyHit.click()
  await expect(page.locator('.starmap-toast')).toContainText('已定位到「内科学」')
  expect(await page.evaluate(() => window.__starmap.store.scope.value)).toBe(null)

  await box.fill('远方')
  await expect(page.locator('.results li')).toContainText('游离星尘')
})

test('新建星系：颜色可选、空雾团出现、里面建星球会自动归入', async ({ page }) => {
  await open(page, createStarMapStore())
  const empty = await contextPoint(page, '在宇宙空白处')
  expect(empty, '没找到宇宙空白处').toBeTruthy()
  await page.locator('.menu .item', { hasText: '新建星系' }).click()
  await expect(page.locator('.quick')).toContainText('新建星系')
  await page.locator('.quick-color[aria-label="紫"]').click()
  // 只选颜色不写名字：必须提示，不能悄悄什么都不做
  await page.locator('.quick button[type="submit"]').click()
  await expect(page.locator('.starmap-toast')).toContainText('先给星系起个名字')
  await expect(page.locator('.quick')).toBeVisible()
  expect(await page.evaluate(() => window.__starmap.store.graph.value.galaxies
    .some(g => g.title === '考研英语'))).toBe(false)
  await page.locator('.quick input[aria-label="名字"]').fill('考研英语')
  await page.locator('.quick button[type="submit"]').click()
  await expect.poll(() => page.evaluate(() => window.__starmap.store.graph.value.galaxies
    .some(g => g.title === '考研英语' && g.manual))).toBe(true)

  const g = await page.evaluate(() => {
    const g = window.__starmap.store.graph.value.galaxies.find(x => x.title === '考研英语')
    const info = window.__starmap.store.debugState().layout.galaxies.get(g.key)
    return { key: g.key, id: g.id, color: g.color, radius: info?.radius, topics: g.topics }
  })
  expect(g.color).toBe('--violet')
  expect(g.radius, '空星系也要有能看见的雾团').toBeGreaterThanOrEqual(92)
  expect(g.topics).toEqual([])

  // 右键这团空雾：应该给出“归入这个星系”的入口，而不是全景菜单
  const at = await page.evaluate(k => window.__starmap.renderer.debug.galaxyScreen(k), g.key)
  await page.mouse.click(at.x, at.y, { button: 'right' })
  await expect(page.locator('.menu')).toContainText('星系「考研英语」')
  await page.locator('.menu .item', { hasText: '新建星球' }).click()
  await page.locator('.quick input[aria-label="名字"]').fill('阅读')
  await page.locator('.quick button[type="submit"]').click()
  await expect.poll(() => page.evaluate(id => window.__starmap.store.graph.value.topics
    .some(t => t.title === '阅读' && t.galaxyId === id), g.id)).toBe(true)

  // 再加一颗，雾团半径应随成员变多/变大
  await page.evaluate(id => window.__starmap.store.createTopic('写作', '', id), g.id)
  await expect.poll(() => page.evaluate(k => window.__starmap.store.debugState().layout.galaxies.get(k)?.topics.length, g.key)).toBe(2)
  const grown = await page.evaluate(k => window.__starmap.store.debugState().layout.galaxies.get(k)?.radius, g.key)
  expect(grown).toBeGreaterThan(92)

  // 已有星球也能在详情里归进去
  await page.evaluate(() => window.__starmap.store.select('T3'))
  await page.locator('.panel select[aria-label="归入手建星系"]').selectOption(String(g.id))
  await expect.poll(() => page.evaluate(id => window.__starmap.store.graph.value.byKey.get('T3')?.galaxyId === id, g.id)).toBe(true)

  // 删星系不删星球
  const before = await page.evaluate(() => window.__starmap.store.graph.value.topics.length)
  await page.evaluate(id => window.__starmap.store.deleteGalaxy(id), g.id)
  await expect.poll(() => page.evaluate(() => window.__starmap.store.graph.value.galaxies
    .some(x => x.title === '考研英语'))).toBe(false)
  expect(await page.evaluate(() => window.__starmap.store.graph.value.topics.length)).toBe(before)
})

test('星系收星球：已在别的星系的星球要先移出，不能抢', async ({ page }) => {
  await open(page, createStarMapStore())
  const info = await page.evaluate(async () => {
    const s = window.__starmap.store
    await s.createGalaxy({ title: '星系A', color: '--accent' })
    await s.createGalaxy({ title: '星系B', color: '--violet' })
    const A = s.graph.value.galaxies.find(g => g.title === '星系A')
    const B = s.graph.value.galaxies.find(g => g.title === '星系B')
    await s.setTopicGalaxy('T3', B.id)
    return { A: { key: A.key, id: A.id }, B: { key: B.key, id: B.id } }
  })
  await page.waitForTimeout(1200)

  const at = await page.evaluate(k => window.__starmap.renderer.debug.galaxyScreen(k), info.A.key)
  let opened = false
  for (const [dx, dy] of [[0, 0], [0, 50], [55, 0], [-55, 0], [0, -50], [72, 45], [-72, -45]]) {
    await page.mouse.click(at.x + dx, at.y + dy, { button: 'right' })
    const menu = page.locator('.menu')
    if (!(await menu.isVisible().catch(() => false))) continue
    if ((await menu.textContent()).includes('星系「星系A」')) { opened = true; break }
    await page.keyboard.press('Escape')
  }
  expect(opened, '没打开星系A的菜单').toBe(true)
  await page.locator('.menu .item', { hasText: '收一颗已有星球' }).click()
  await expect(page.locator('.galaxy-pick')).toBeVisible()
  await expect(page.locator('.galaxy-pick')).toContainText('一颗星球只能在一个手建星系里')

  // T3 已经在星系B：不能直接抢，点按钮只给提示
  const t3row = page.locator('.galaxy-pick li', { hasText: '英语 · 阅读与语法' })
  await t3row.locator('button', { hasText: '先移出' }).click()
  await expect(page.locator('.starmap-toast')).toContainText('已经在「星系B」')
  expect(await page.evaluate(id => window.__starmap.store.graph.value.byKey.get('T3')?.galaxyId === id, info.B.id)).toBe(true)

  // 自动成团的星球可以收进手建星系
  const t1row = page.locator('.galaxy-pick li', { hasText: '内科学 · 循环系统' })
  await t1row.locator('button', { hasText: '收进来' }).click()
  await expect.poll(() => page.evaluate(id => window.__starmap.store.graph.value.byKey.get('T1')?.galaxyId === id, info.A.id)).toBe(true)
  await expect(t1row.locator('button', { hasText: '已在本星系' })).toBeVisible()
  await page.locator('.galaxy-pick .gp-head .btn', { hasText: '关闭' }).click()
  await expect(page.locator('.galaxy-pick')).toHaveCount(0)

  // 左键点雾团空白也能打开同一份菜单（星系模式里更容易发现“收星球”）
  let leftOpened = false
  for (const [dx, dy] of [[0, 64], [64, 0], [-64, 0], [0, -64]]) {
    await page.mouse.click(at.x + dx, at.y + dy)
    const menu = page.locator('.menu')
    if (!(await menu.isVisible().catch(() => false))) continue
    if ((await menu.textContent()).includes('星系「星系A」')) { leftOpened = true; break }
    await page.keyboard.press('Escape')
  }
  expect(leftOpened, '左键点雾团应能打开星系菜单').toBe(true)
  await page.keyboard.press('Escape')
})

test('挂错题选择器：能搜题干、切今日复习；AI 反推能自己选错题', async ({ page }) => {
  await open(page, createStarMapStore())
  await page.evaluate(() => window.__starmap.store.select('P14'))
  await page.locator('.panel button', { hasText: '选择错题挂上' }).click()
  await expect(page.locator('.wq-card')).toContainText('全部错题')
  await expect(page.locator('.wq-card')).toContainText('今日复习（2）')
  await page.locator('.wq-search').fill('NYHA')
  await expect(page.locator('.wq-row')).toHaveCount(1)
  await page.locator('.wq-tabs button', { hasText: '今日复习' }).click()
  await expect(page.locator('.wq-row')).toHaveCount(1)
  await page.locator('.wq-x').click()

  await page.evaluate(() => window.__starmap.store.clearSelection())
  await page.locator('.panel button', { hasText: '自己选错题反推' }).click()
  await expect(page.locator('.wq-card')).toContainText('最多 10 道')
  await expect(page.locator('.wq-row')).not.toHaveCount(0)
  await page.locator('.wq-row').first().click()
  await expect(page.locator('.wq-count')).toContainText('已选 1')
  await page.locator('.wq-btn.primary', { hasText: '开始反推' }).click()
  await expect(page.locator('.wq-card')).toHaveCount(0)
})

test('球内保留跨星球共现线；跳到另一端会切到目标星球，不会只剩背景', async ({ page }) => {
  const store = createStarMapStore()
  await open(page, store)
  const styleKey = await page.evaluate(() => {
    const g = window.__starmap.store.graph.value
    return g.edges.find(e => e.type === 'cooc'
      && ((e.a === 'P12' && e.b === 'P23') || (e.a === 'P23' && e.b === 'P12')))?.styleKey
  })
  expect(styleKey, 'P12 与 P23 应该有跨星球共现线').toBeTruthy()
  await page.evaluate(() => window.__starmap.store.enterTopic('T1'))
  await page.waitForTimeout(1100)
  expect(await page.evaluate(k => window.__starmap.renderer.debug.edgeVisible(k), styleKey), '球内应保留为淡线').toBe(true)
  expect(await page.evaluate(k => window.__starmap.renderer.debug.edgeExternal(k), styleKey), '跨球线应是 external').toBe(true)

  await page.evaluate(k => window.__starmap.store.selectEdge(k), styleKey)
  await expect(page.locator('.panel')).toContainText('这条连线')
  await page.locator('.panel button', { hasText: '跳到另一端' }).click()
  await page.waitForTimeout(1200)
  expect(await page.evaluate(() => window.__starmap.store.scope.value), '应切到目标星球 T2').toBe('T2')
  expect(await page.evaluate(() => window.__starmap.store.selectedKey.value), '应选中另一端 P23').toBe('P23')
  expect(await page.evaluate(() => window.__starmap.renderer.debug.visibleCount())).toBeGreaterThan(0)
})

test('同一对星点可以各连一条反向关系，两条线自动分开', async ({ page }) => {
  const store = createStarMapStore()
  await open(page, store)
  const info = await page.evaluate(async () => {
    const s = window.__starmap.store
    await s.createEdge({ fromKey: 'P12', toKey: 'P15', rel: '先修', reason: '正向' })
    const reverseAllowed = (() => { s.proposeLink('P15', 'P12'); return !!s.pendingLink.value })()
    s.pendingLink.value = null
    await s.createEdge({ fromKey: 'P15', toKey: 'P12', rel: '依赖', reason: '反向' })
    const edges = s.graph.value.edges
      .filter(e => e.type === 'ai' && ((e.a === 'P12' && e.b === 'P15') || (e.a === 'P15' && e.b === 'P12')))
      .map(e => e.styleKey)
    return { reverseAllowed, edges }
  })
  expect(info.reverseAllowed, '从另一头连反向关系不应该被同方向查重挡住').toBe(true)
  expect(info.edges.length).toBe(2)
  const mids = await page.evaluate(keys => keys.map(k => window.__starmap.renderer.debug.edgeScreen(k, 0.5)), info.edges)
  expect(mids.every(Boolean)).toBe(true)
  expect(Math.hypot(mids[0].x - mids[1].x, mids[0].y - mids[1].y), '两条线不能重叠').toBeGreaterThan(1)

  // 创建时选的关系类型必须在详情里看得见，而不是只有一句通用解释
  await page.evaluate(k => window.__starmap.store.selectEdge(k), info.edges[0])
  await expect(page.locator('.panel .edge-relation')).toContainText(/先修|依赖/)
  await expect(page.locator('.panel .edge-relation')).toContainText('→')
})

test('连线悬停：光点暂停，并显示这条线为什么连', async ({ page }) => {
  await open(page, createStarMapStore())
  const p = await linePoint(page, 'ai')
  expect(p, '找不到一条可点的语义线').toBeTruthy()
  await page.mouse.move(p.x, p.y)
  await expect(page.locator('.edge-tip')).toBeVisible()
  // 线的采样点可能同时靠近另一条线，悬停命中的是“离光标最近的那条”，不强行绑定某一条
  await expect(page.locator('.edge-tip')).toContainText(/学习关系线 · 主张|错题共现线 · 证据|层级线 · 归属/)
  await expect(page.locator('.edge-tip')).toContainText('光点已暂停')
  await expect(page.locator('.edge-tip .edge-tip-why, .edge-tip .edge-tip-meta').first()).toBeVisible()
  const empty = await page.evaluate(() => {
    const r = document.querySelector('.stage').getBoundingClientRect()
    return { x: r.left + 20, y: r.bottom - 20 }
  })
  await page.mouse.move(empty.x, empty.y)
  await expect(page.locator('.edge-tip')).toHaveCount(0)
})

test('光点方向可调并落库：正向 / 反向 / 关闭', async ({ page }) => {
  const store = createStarMapStore()
  await open(page, store)
  const p = await linePoint(page, 'ai')
  expect(p).toBeTruthy()
  await page.mouse.click(p.x, p.y)
  await expect(page.locator('.panel')).toContainText('光点方向')
  await page.locator('.panel button', { hasText: '反向' }).click()
  await expect.poll(() => store.db.styles[p.styleKey]?.flowDir).toBe(-1)
  await page.locator('.panel button', { hasText: '关闭光点' }).click()
  await expect.poll(() => store.db.styles[p.styleKey]?.flowDir).toBe(0)
})

test('光标：悬停到线上也要变手指，不能一直是转视角的抓手', async ({ page }) => {
  await open(page, createStarMapStore())
  const p = await linePoint(page, 'cooc')
  expect(p, '找不到一条能点到的共现线').toBeTruthy()
  await page.mouse.move(p.x, p.y)
  await expect.poll(() => page.evaluate(() => document.querySelector('.stage').classList.contains('pickable'))).toBe(true)

  const empty = await page.evaluate(() => {
    const r = document.querySelector('.stage').getBoundingClientRect()
    return { x: r.left + 20, y: r.bottom - 20 }
  })
  await page.mouse.move(empty.x, empty.y)
  await expect.poll(() => page.evaluate(() => document.querySelector('.stage').classList.contains('pickable'))).toBe(false)
})

test('手动挂错题：不烧 AI 额度也能长出共现线，解绑后权重跟着回落', async ({ page }) => {
  const store = createStarMapStore()
  await open(page, store)
  // 15/16 已经因为 905 连过一次；把没挂过的 921 也挂到这两颗点上，共现次数应该 +1、线应该变粗
  const weight = () => page.evaluate(() => {
    const e = window.__starmap.store.graph.value.edges.find(x => x.type === 'cooc'
      && ((x.a === 'P15' && x.b === 'P16') || (x.a === 'P16' && x.b === 'P15')))
    return e ? e.weight : 0
  })
  const before = await weight()
  expect(before).toBe(1)
  for (const key of ['P15', 'P16']) {
    await page.evaluate(k => window.__starmap.store.select(k), key)
    await page.locator('.panel button', { hasText: '选择错题挂上' }).click()
    await page.locator('.wq-search').fill('高血压诊断切点')
    await page.locator('.wq-row', { hasText: '高血压诊断切点' }).click()
    await page.locator('.wq-btn.primary', { hasText: '挂上' }).click()
  }
  await expect.poll(weight).toBe(before + 1)

  await page.evaluate(() => window.__starmap.store.select('P16'))
  await page.locator('.panel .wq-item', { hasText: '高血压诊断切点' }).locator('button', { hasText: '解绑' }).click()
  await expect.poll(weight).toBe(before)
})

test('拾取：长线、宽线、同端点双线都不落空', async ({ page }) => {
  const store = createStarMapStore()
  await open(page, store)
  const long = await longestEdge(page)
  expect(long, '应该有一条可见关联线').toBeTruthy()

  const longStats = await edgePickStats(page, long.key)
  expect(longStats.total).toBeGreaterThan(10)
  expect(longStats.miss, '长线曲线中间不该有点不到的空隙').toBe(0)
  expect((longStats.hit + longStats.otherEdge) / longStats.total, '长线应能稳定命中一条线').toBeGreaterThanOrEqual(0.9)

  // 调粗后中心线仍然全中，偏 6px 也不落空
  await page.evaluate(k => window.__starmap.store.previewStyle(k, { width: 3 }), long.key)
  await page.waitForTimeout(200)
  const wide = await edgePickStats(page, long.key)
  expect(wide.miss).toBe(0)
  const off = await edgePickStats(page, long.key, 6)
  expect(off.miss, '宽线偏离中心 6px 仍应命中').toBeLessThanOrEqual(1)
  expect(off.hit + off.otherEdge).toBeGreaterThan(0)

  // 同端点再连一条（实际会分槽成近距离双线）：两个中点都不能点空
  const before = await page.evaluate(() => window.__starmap.store.graph.value.edges.length)
  const pair = await page.evaluate(() => {
    const e = window.__starmap.store.graph.value.edges.find(x => x.type === 'cooc')
    return e ? { a: e.a, b: e.b } : null
  })
  expect(pair).toBeTruthy()
  await page.evaluate(({ a, b }) => window.__starmap.store.createEdge({
    fromKey: a, toKey: b, rel: '关联', reason: '同端点测试'
  }), pair)
  await expect.poll(() => page.evaluate(() => window.__starmap.store.graph.value.edges.length)).toBeGreaterThan(before)
  const added = await page.evaluate(() => window.__starmap.store.graph.value.edges.find(e => e.reason === '同端点测试')?.styleKey)
  expect(added).toBeTruthy()
  for (const key of [long.key, added]) {
    const mid = await page.evaluate(k => window.__starmap.renderer.debug.edgeScreen(k, 0.5), key)
    expect(mid).toBeTruthy()
    const picked = await page.evaluate(([x, y]) => window.__starmap.renderer.debug.pickAt(x, y), [mid.x, mid.y])
    expect(picked.edge || picked.node, '同端点双线的中点不能点空').toBeTruthy()
  }
})

test('选中线拖拽：高亮层与普通线同一帧跟随，不滞留', async ({ page }) => {
  const store = createStarMapStore()
  await open(page, store)
  const target = await edgeWithDraggableNode(page)
  expect(target, '需要一条中点可选、端点可拖的线').toBeTruthy()

  await page.evaluate(k => window.__starmap.store.selectEdge(k), target.key)
  await page.waitForTimeout(300)
  const before = await page.evaluate(k => ({
    sel: window.__starmap.renderer.debug.selectedEdgeCenter(),
    curve: window.__starmap.renderer.debug.edgeScreen(k, 0.5)
  }), target.key)
  expect(before.sel, '选中线应该有高亮层').toBeTruthy()

  await page.mouse.move(target.point.x, target.point.y)
  await page.mouse.down()
  for (let i = 1; i <= 5; i++) {
    await page.mouse.move(target.point.x + i * 14, target.point.y - i * 4)
    await page.waitForTimeout(45)
  }
  const during = await page.evaluate(k => ({
    sel: window.__starmap.renderer.debug.selectedEdgeCenter(),
    curve: window.__starmap.renderer.debug.edgeScreen(k, 0.5)
  }), target.key)
  await page.mouse.up()

  expect(during.sel).toBeTruthy()
  const selMove = Math.hypot(during.sel.x - before.sel.x, during.sel.y - before.sel.y)
  const curveMove = Math.hypot(during.curve.x - before.curve.x, during.curve.y - before.curve.y)
  expect(selMove, '拖拽时选中高亮层必须跟着节点走').toBeGreaterThan(10)
  expect(Math.abs(selMove - curveMove), '高亮层和普通线不能一个走一个停').toBeLessThan(45)
})

test('远近视角拾取一致：拉远后线中间也不出现点不到的死区', async ({ page }) => {
  const store = createStarMapStore()
  await open(page, store)
  const long = await longestEdge(page)
  expect(long).toBeTruthy()

  const nearRadius = await page.evaluate(() => window.__starmap.renderer.debug.radius())
  const near = await edgePickStats(page, long.key)
  expect(near.miss).toBe(0)

  await page.mouse.move(700, 450)
  await page.mouse.wheel(0, 600)
  await page.waitForTimeout(700)
  const farRadius = await page.evaluate(() => window.__starmap.renderer.debug.radius())
  expect(farRadius, '滚轮应该拉远了').toBeGreaterThan(nearRadius)
  const far = await edgePickStats(page, long.key)
  expect(far.miss, '拉远后线中间不能出现死区').toBe(0)
  expect((far.hit + far.otherEdge) / far.total).toBeGreaterThanOrEqual(0.8)

  await page.mouse.wheel(0, -1000)
  await page.waitForTimeout(700)
  const closeRadius = await page.evaluate(() => window.__starmap.renderer.debug.radius())
  expect(closeRadius).toBeLessThan(farRadius)
  const close = await edgePickStats(page, long.key)
  expect(close.miss).toBe(0)
  expect((close.hit + close.otherEdge) / close.total).toBeGreaterThanOrEqual(0.8)
})

test('虚线也吃粗细：调宽后几何半径变大（管道 + alphaMap，不再是 1px 折线）', async ({ page }) => {
  await open(page, createStarMapStore())
  const p = await linePoint(page, 'ai')
  expect(p, '找不到一条能点到的语义线').toBeTruthy()
  await page.mouse.click(p.x, p.y)
  const before = await page.evaluate(() => window.__starmap.renderer.debug.edgeRadius())
  await page.locator('.panel input[type="range"][aria-label="线的粗细"]').evaluate(el => {
    el.value = '3'
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await expect.poll(() => page.evaluate(() => window.__starmap.renderer.debug.edgeRadius()), { timeout: 5000 })
    .toBeGreaterThan(before)
})

test('线的颜色也能选：面板高亮要跟着走（graph 是 shallowRef，就地改不会自己重渲染）', async ({ page }) => {
  const store = createStarMapStore()
  await open(page, store)
  const p = await linePoint(page, 'cooc')
  await page.mouse.click(p.x, p.y)
  await expect(page.locator('.panel h3')).toHaveText('这条连线')
  await page.locator('.panel .swatch[aria-label="橙"]').click()
  await expect(page.locator('.panel .swatch.on')).toHaveAttribute('aria-label', '橙')
  await expect.poll(() => Object.keys(store.db.styles).length).toBe(1)
  expect(Object.values(store.db.styles)[0].color).toBe('--orange')

  await page.reload({ waitUntil: 'load' })
  await page.waitForSelector('.star-label.show', { timeout: 15000 })
  const again = await linePoint(page, 'cooc')
  expect(again.styleKey, '刷新后外观还得认回同一条线').toBe(p.styleKey)
  await page.mouse.click(again.x, again.y)
  await expect(page.locator('.panel .swatch.on')).toHaveAttribute('aria-label', '橙')
})

// ===== 用户 2026-10-17 截图里报的几条：拖动残影 / 过曝 / 小球拖不动 / 球内连不上 / 面板 =====

/** 真鼠标拖：按下、分 8 步移动、松手 */
async function mouseDrag(page, from, to, { shift = false, slow = false } = {}) {
  await page.mouse.move(from.x, from.y)
  if (shift) await page.keyboard.down('Shift')
  await page.mouse.down()
  for (let i = 1; i <= 8; i++) {
    await page.mouse.move(from.x + (to.x - from.x) * i / 8, from.y + (to.y - from.y) * i / 8)
    if (slow) await page.waitForTimeout(24)
  }
  if (slow) await page.waitForTimeout(40)
  await page.mouse.up()
  if (shift) await page.keyboard.up('Shift')
}

/** 找一颗"按下去确实打中它自己、而且没被侧边面板盖住"的像素 */
function grabPoint(page, key) {
  return page.evaluate(k => {
    const { renderer } = window.__starmap
    const c = renderer.debug.nodeScreen(k)
    const rect = document.querySelector('.stage').getBoundingClientRect()
    for (const [dx, dy] of [[0, 0], [0, -3], [0, 3], [-3, 0], [3, 0], [0, -14], [0, 14], [-14, 0], [14, 0], [0, -24], [0, 24], [-24, 0], [24, 0]]) {
      const x = c.x + dx, y = c.y + dy
      if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) continue
      // 面板/顶栏盖住的点，真鼠标是点不到的
      const under = document.elementFromPoint(x, y)
      if (!under || !under.classList.contains('stage')) continue
      const hit = renderer.debug.pickAt(x, y)
      if (hit.node === k) return { x, y }
    }
    return null
  }, key)
}

test('拖两下大球：场景里的网格数不涨（旧 bug：每帧漏一个箭头，满屏三角形）', async ({ page }) => {
  await open(page, createStarMapStore())
  const meshes = () => page.evaluate(() => window.__starmap.renderer.debug.sceneMeshes())
  const before = await meshes()
  const at = await grabPoint(page, 'T1')
  expect(at, '找不到能按住的 T1').toBeTruthy()
  await mouseDrag(page, at, { x: at.x + 90, y: at.y + 40 })
  const at2 = await grabPoint(page, 'T1')
  await mouseDrag(page, at2, { x: at2.x - 140, y: at2.y - 30 })
  expect(await meshes()).toBe(before)
  await page.screenshot({ path: 'tests/.shots/after-drag.png' })
})

test('小球可以拖，位置存成相对父球的偏移，刷新后还在原地', async ({ page }) => {
  const store = createStarMapStore()
  await open(page, store)
  await page.waitForTimeout(250)
  const at = await grabPoint(page, 'P12')
  expect(at, '找不到能按住的 P12').toBeTruthy()
  await mouseDrag(page, at, { x: at.x + 70, y: at.y - 50 }, { slow: true })
  await expect.poll(() => store.db.points.find(p => p.id === 12).pin).toBeTruthy()
  const pin = store.db.points.find(p => p.id === 12).pin
  const where = await page.evaluate(() => {
    const L = window.__starmap.store.debugState().layout
    const p = L.pos.get('P12'), t = L.pos.get('T1')
    return { x: p.x - t.x, y: p.y - t.y, z: p.z - t.z }
  })
  expect(Math.abs(where.x - pin.x) + Math.abs(where.y - pin.y) + Math.abs(where.z - pin.z)).toBeLessThan(0.05)

  await page.reload({ waitUntil: 'load' })
  await page.waitForSelector('.star-label.show', { timeout: 15000 })
  const after = await page.evaluate(() => {
    const L = window.__starmap.store.debugState().layout
    const p = L.pos.get('P12'), t = L.pos.get('T1')
    return { x: p.x - t.x, y: p.y - t.y, z: p.z - t.z }
  })
  expect(Math.abs(after.x - pin.x) + Math.abs(after.y - pin.y) + Math.abs(after.z - pin.z), '刷新后要回到摆好的位置').toBeLessThan(0.05)
})

test('Shift+拖：从一颗拖到另一颗就弹出连线表单', async ({ page }) => {
  await open(page, createStarMapStore())
  const a = await grabPoint(page, 'P15')
  const b = await page.evaluate(() => window.__starmap.renderer.debug.nodeScreen('P21'))
  expect(a).toBeTruthy()
  await mouseDrag(page, a, b, { shift: true })
  await expect(page.locator('.panel h3')).toHaveText('给这两颗星连线')
  await expect(page.locator('.panel .sub').first()).toContainText('↔')
})

test('进到大球里面也能选中这颗大球；大球连自己球里没线的点 = 把归属线画回来', async ({ page }) => {
  const store = createStarMapStore()
  await open(page, store)
  await page.evaluate(() => window.__starmap.store.enterTopic('T3'))
  await page.waitForTimeout(1000)
  const hit = await page.evaluate(() => {
    const { renderer } = window.__starmap
    const c = renderer.debug.nodeScreen('T3')
    return renderer.debug.pickAt(c.x, c.y)
  })
  expect(hit.node, '球心要能点到').toBe('T3')

  expect(store.db.points.find(p => p.id === 34).hierLine).toBe(0)
  await page.evaluate(() => window.__starmap.store.proposeLink('T3', 'P34'))
  await expect.poll(() => store.db.points.find(p => p.id === 34).hierLine).toBe(1)
  expect(await page.locator('.panel h3').textContent()).not.toBe('给这两颗星连线')
})

test('推近看：光晕按距离封顶，不会糊满屏', async ({ page }) => {
  await open(page, createStarMapStore())
  await page.evaluate(() => window.__starmap.store.enterTopic('T1'))
  await page.evaluate(() => window.__starmap.store.select('P13', { fly: true }))
  await page.waitForTimeout(1200)
  const { px, h } = await page.evaluate(() => ({ px: window.__starmap.renderer.debug.maxHaloPx(), h: innerHeight }))
  expect(px, `最大光晕 ${Math.round(px)}px`).toBeLessThan(h * 0.2)
  await page.screenshot({ path: 'tests/.shots/zoomed-in.png' })
})

test('显示设置：亮度拉到 0 就关掉辉光；只有点"记住"才落盘', async ({ page }) => {
  await open(page, createStarMapStore())
  await page.locator('.tool', { hasText: '显示' }).click()
  await page.locator('.sm-pop input[aria-label="亮度"]').evaluate(el => { el.value = '0'; el.dispatchEvent(new Event('input', { bubbles: true })) })
  await expect.poll(() => page.evaluate(() => window.__starmap.renderer.debug.bloomStrength())).toBe(0)
  expect(await page.evaluate(() => localStorage.getItem('starmap.display'))).toBeNull()
  await page.locator('.sm-pop button', { hasText: '记住这套设置' }).click()
  expect(JSON.parse(await page.evaluate(() => localStorage.getItem('starmap.display'))).glow).toBe(0)
})

test('侧边面板：左缘拖宽、收起再展开；深色下拉框不是白底', async ({ page }) => {
  await open(page, createStarMapStore())
  const panel = page.locator('.starmap-panel')
  const w0 = (await panel.boundingBox()).width
  const handle = await page.locator('.sm-resize').boundingBox()
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2)
  await page.mouse.down()
  await page.mouse.move(handle.x - 120, handle.y + handle.height / 2, { steps: 6 })
  await page.mouse.up()
  const w1 = (await panel.boundingBox()).width
  expect(w1).toBeGreaterThan(w0 + 100)
  expect(Number(await page.evaluate(() => localStorage.getItem('starmap.panelW')))).toBeGreaterThan(w0 + 100)

  await page.locator('.sm-collapse').click()
  await expect(panel).toHaveCount(0)
  await page.locator('.starmap-panel-tab').click()
  await expect(panel).toHaveCount(1)

  await page.evaluate(() => window.__starmap.store.select('P15'))
  await page.locator('.panel button', { hasText: '选择错题挂上' }).click()
  const look = await page.locator('.wq-search').evaluate(el => ({
    bg: getComputedStyle(el).backgroundColor
  }))
  expect(look.bg).not.toBe('rgb(255, 255, 255)')
  await page.locator('.wq-x').click()
})

test('右键菜单的"改名 / 合并 / 归属线"真的生效（旧 bug：参数不全，点了没反应）', async ({ page }) => {
  const store = createStarMapStore()
  await open(page, store)
  const at = await grabPoint(page, 'P12')
  expect(at).toBeTruthy()
  await page.mouse.click(at.x, at.y, { button: 'right' })
  await page.locator('.menu .item', { hasText: '改名' }).click()
  await page.locator('.quick input').fill('NYHA 分级（改过）')
  await page.locator('.quick button', { hasText: '保存' }).click()
  await expect.poll(() => store.db.points.find(p => p.id === 12).title).toBe('NYHA 分级（改过）')

  // 合并会把这颗星吸到球心，可能被侧边面板盖住，所以改名先做、合并后做
  const at2 = await grabPoint(page, 'P12')
  expect(at2).toBeTruthy()
  await page.mouse.click(at2.x, at2.y, { button: 'right' })
  await page.locator('.menu .item', { hasText: '合并进大球' }).click()
  await expect.poll(() => store.db.points.find(p => p.id === 12).merged).toBe(true)

  await page.evaluate(() => window.__starmap.store.select('P34'))
  await expect(page.locator('.panel button', { hasText: '把线画回来' })).toBeVisible()
  await page.locator('.panel button', { hasText: '把线画回来' }).click()
  await expect.poll(() => store.db.points.find(p => p.id === 34).hierLine).toBe(1)
})
