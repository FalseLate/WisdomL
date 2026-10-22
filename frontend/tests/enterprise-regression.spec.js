// @ts-check
// 企业级回归补测：多线程出题跨页 + 3D 星图并发渲染 + 已知缺陷回归化。
// 只依赖 dev server（window.__starmap）和 page.route，不写业务代码。
import { test, expect } from '@playwright/test'
import { createStarMapStore } from './starmap-mock.mjs'

const AUTH = ['ent-token', { id: 2001, username: 'ent', nickname: '企业回归' }]

const OBJ = [
  { id: 'ent-1', type: 'single', question: '1+1=?', options: { A: '1', B: '2', C: '3', D: '4' }, answer: 'B', explanation: '算术' },
  { id: 'ent-2', type: 'single', question: '2+2=?', options: { A: '3', B: '4', C: '5', D: '6' }, answer: 'B', explanation: '算术' }
]

async function seed(page, theme = 'dark') {
  await page.addInitScript(([token, user, t]) => {
    localStorage.setItem('token', token)
    localStorage.setItem('user', JSON.stringify(user))
    localStorage.setItem('starmap.helpSeen', '1')
    localStorage.setItem('zhifuxi_a11y_v1', JSON.stringify({ feedback: { theme: t } }))
  }, [AUTH[0], AUTH[1], theme])
}

function installStarMap(page) {
  const store = createStarMapStore()
  return store.install(page).then(() => store)
}

async function startTextGeneration(page, taskId = 'ent-bg', runningPolls = 4) {
  await page.route('**/api/generate-async', r => r.fulfill({ json: { taskId } }))
  let polls = 0
  await page.route(`**/api/task/${taskId}`, r => {
    polls++
    if (polls < runningPolls) return r.fulfill({ json: { status: 'running' } })
    return r.fulfill({
      json: { status: 'completed', totalCount: OBJ.length, objectiveQuestions: OBJ, subjectiveQuestions: [] }
    })
  })
  await page.goto('/')
  await page.waitForSelector('.section-more')
  await page.locator('.section-more').first().click()
  await page.waitForSelector('.cyber-textarea')
  await page.locator('.cyber-textarea').fill('第一章 牛顿运动定律：F=ma，惯性参考系。')
  await page.locator('.generate-container button').filter({ hasText: /生成题目/ }).click()
  await expect(page.locator('.global-loading-bar')).toBeVisible()
  return () => polls
}

async function openStarMapFromHome(page) {
  if (await page.locator('.generate-mode .navbar-left').count()) {
    await page.locator('.generate-mode .navbar-left').click()
    await page.waitForSelector('.dashboard .func-card', { timeout: 10000 })
  }
  await page.locator('.func-card').filter({ hasText: '知识星图' }).click()
  await page.waitForURL(/knowledge-universe/, { timeout: 20000 })
  await page.waitForSelector('.star-label.show', { timeout: 25000 })
  await page.waitForFunction(() => !!window.__starmap, null, { timeout: 20000 })
}

test.describe('多线程出题 × 3D 星图并发', () => {
  test('生成中进入 3D 星图：轮询继续、星图持续渲染、完成弹窗可关闭', async ({ page }) => {
    await seed(page)
    await installStarMap(page)
    const polls = await startTextGeneration(page, 'ent-bg', 4)
    await openStarMapFromHome(page)

    const before = await page.evaluate(() => ({
      nodes: window.__starmap.renderer.debug.visibleCount(),
      meshes: window.__starmap.renderer.debug.sceneMeshes(),
      contextLost: window.__starmap.renderer.debug.contextLost?.() ?? false
    }))
    expect(before.nodes).toBeGreaterThan(0)
    expect(before.meshes).toBeGreaterThan(0)
    console.log('[ENT-CONC] 切到星图后节点/网格/上下文:', before)

    await expect(page.locator('.gen-complete-overlay .dialog-title')).toHaveText('出题完成', { timeout: 25000 })
    await expect.poll(polls, { timeout: 10000 }).toBeGreaterThanOrEqual(4)
    console.log('[ENT-CONC] 跨页轮询次数:', polls())

    const after = await page.evaluate(() => ({
      nodes: window.__starmap.renderer.debug.visibleCount(),
      meshes: window.__starmap.renderer.debug.sceneMeshes(),
      contextLost: window.__starmap.renderer.debug.contextLost?.() ?? false
    }))
    expect(after.nodes).toBe(before.nodes)
    expect(after.meshes).toBe(before.meshes)
    expect(after.contextLost).toBe(false)
    await page.screenshot({ path: 'shots/enterprise-starmap-dialog.png' })

    await page.getByRole('button', { name: '留在此页' }).click()
    await expect(page.locator('.gen-complete-overlay')).toHaveCount(0)
    await expect(page.locator('.star-label.show').first()).toBeVisible()
  })

  test('生成中离开再回首页：完成提示不能丢', async ({ page }) => {
    await seed(page)
    await installStarMap(page)
    await startTextGeneration(page, 'ent-return', 5)
    await openStarMapFromHome(page)
    await page.waitForTimeout(4500)
    await page.goBack({ waitUntil: 'load' })
    await page.waitForSelector('.section-more', { timeout: 15000 })
    await expect(page.locator('.global-loading-bar')).toHaveCount(0, { timeout: 25000 })
    await expect(page.locator('.gen-complete-overlay .dialog-title')).toHaveText('出题完成', { timeout: 10000 })
    await page.screenshot({ path: 'shots/enterprise-return-home-completion.png' })
  })
})

test.describe('出题完成弹窗主题回归', () => {
  test('深色主题下完成弹窗跟随主题', async ({ page }) => {
    await seed(page, 'dark')
    await installStarMap(page)
    await startTextGeneration(page, 'ent-theme', 2)
    await openStarMapFromHome(page)
    await expect(page.locator('.gen-complete-overlay .dialog-box')).toBeVisible({ timeout: 25000 })
    const style = await page.evaluate(() => {
      const el = document.querySelector('.gen-complete-overlay .dialog-box')
      const cs = getComputedStyle(el)
      return {
        theme: document.documentElement.dataset.theme,
        background: cs.backgroundColor,
        color: cs.color,
        overlay: getComputedStyle(document.querySelector('.gen-complete-overlay')).backgroundColor
      }
    })
    console.log('[ENT-THEME] 深色主题弹窗 computed style:', style)
    await page.screenshot({ path: 'shots/enterprise-dialog-dark.png' })
    expect(style.theme).toBe('dark')
    expect(style.background).not.toBe('rgb(255, 255, 255)')
  })

  test('浅色主题下完成弹窗为浅色底', async ({ page }) => {
    await seed(page, 'light')
    await installStarMap(page)
    await startTextGeneration(page, 'ent-theme-light', 2)
    await openStarMapFromHome(page)
    await expect(page.locator('.gen-complete-overlay .dialog-box')).toBeVisible({ timeout: 25000 })
    const style = await page.evaluate(() => {
      const el = document.querySelector('.gen-complete-overlay .dialog-box')
      return { theme: document.documentElement.dataset.theme, background: getComputedStyle(el).backgroundColor }
    })
    console.log('[ENT-THEME] 浅色主题弹窗 computed style:', style)
    await page.screenshot({ path: 'shots/enterprise-dialog-light.png' })
    expect(style.theme).toBe('light')
    expect(style.background).toBe('rgb(255, 255, 255)')
  })
})

test.describe('错题本旧数据契约回归', () => {
  test('stem 形状的错题仍应显示题干', async ({ page }) => {
    await seed(page)
    const legacy = {
      id: 'legacy-1',
      type: 'single',
      stem: '旧版题干：慢性心衰最常见的诱因是（单选）',
      options: ['A 感染', 'B 呼吸道感染', 'C 心律失常', 'D 过度劳累'],
      answer: 'B'
    }
    await page.route(url => new URL(url).pathname === '/api/wrong-questions', r => r.fulfill({
      json: [{
        id: 1,
        questionId: 'legacy-1',
        questionContent: JSON.stringify(legacy),
        questionType: 'single',
        userAnswer: 'A',
        correctAnswer: 'B',
        wrongCount: 1,
        status: 0,
        isSlow: 0
      }]
    }))
    await page.goto('/wrong-questions')
    await expect(page.locator('.wrong-card')).toBeVisible({ timeout: 15000 })
    const questionText = await page.locator('.wrong-question').first().innerText()
    const optionCount = await page.locator('.wrong-opt').count()
    console.log('[ENT-WQ] 题干文本 =', JSON.stringify(questionText), '| 选项数 =', optionCount)
    await page.screenshot({ path: 'shots/enterprise-wrong-question-normalized.png' })
    expect(optionCount).toBe(4)
    expect(questionText).toContain('旧版题干')
    await expect(page.locator('.wrong-opt').first()).toHaveText('A. 感染')
  })

  test('错题卡的状态标签必须显示文字', async ({ page }) => {
    await seed(page)
    const question = {
      id: 'tag-1',
      type: 'single',
      question: '标签回归题',
      options: { A: '甲', B: '乙', C: '丙', D: '丁' },
      answer: 'A'
    }
    await page.route(url => new URL(url).pathname === '/api/wrong-questions', r => r.fulfill({
      json: [{
        id: 2,
        questionId: 'tag-1',
        questionContent: JSON.stringify(question),
        questionType: 'single',
        userAnswer: 'B',
        correctAnswer: 'A',
        wrongCount: 3,
        status: 0,
        isSlow: 0
      }]
    }))
    await page.goto('/wrong-questions')
    await expect(page.locator('.wrong-card')).toBeVisible({ timeout: 15000 })
    const texts = await page.locator('.wrong-header .cyber-tag').allInnerTexts()
    console.log('[ENT-TAG] 错题卡标签文本 =', JSON.stringify(texts))
    await page.screenshot({ path: 'shots/enterprise-cyber-tag-text.png' })
    expect(texts.filter(Boolean).length).toBeGreaterThanOrEqual(3)
  })
})

test.describe('3D 星图渲染层级与稳定性', () => {
  test('多层 UI 不抢画布交互；旋转/缩放下 WebGL 持续出帧且不黑屏', async ({ page }) => {
    await seed(page)
    await installStarMap(page)
    await page.goto('/knowledge-universe', { waitUntil: 'load' })
    await page.waitForSelector('.splash-screen', { state: 'detached', timeout: 9000 }).catch(() => {})
    await page.waitForSelector('.star-label.show', { timeout: 25000 })
    await page.waitForFunction(() => !!window.__starmap, null, { timeout: 20000 })

    const layer = await page.evaluate(() => {
      const panel = document.querySelector('.starmap-panel')
      const topbar = document.querySelector('.topbar')
      const labels = document.querySelector('.labels')
      const canvas = document.querySelector('canvas.stage')
      const pr = panel.getBoundingClientRect()
      const tr = topbar.getBoundingClientRect()
      const panelTop = document.elementFromPoint(pr.left + pr.width / 2, pr.top + pr.height / 2)
      const topbarTop = document.elementFromPoint(tr.left + tr.width / 2, tr.top + tr.height / 2)
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl')
      return {
        panelZ: getComputedStyle(panel).zIndex,
        topbarZ: getComputedStyle(topbar).zIndex,
        labelsZ: getComputedStyle(labels).zIndex,
        panelHit: !!panelTop?.closest('.starmap-panel'),
        topbarHit: !!topbarTop?.closest('.topbar'),
        contextLost: gl ? gl.isContextLost() : null,
        nodes: window.__starmap.renderer.debug.visibleCount()
      }
    })
    console.log('[ENT-LAYER] DOM 层级/命中/上下文:', layer)
    expect(Number(layer.panelZ)).toBeGreaterThan(Number(layer.labelsZ))
    expect(layer.topbarZ).toBe('20')
    expect(layer.labelsZ).toBe('10')
    expect(layer.panelHit).toBe(true)
    expect(layer.topbarHit).toBe(true)
    expect(layer.contextLost).toBe(false)
    expect(layer.nodes).toBeGreaterThan(0)

    const key = await page.evaluate(() => window.__starmap.store.graph.value.topics[0].key)
    for (const [dx, dy] of [[140, 40], [-220, -70], [80, 130]]) {
      const at = await page.evaluate(k => window.__starmap.renderer.debug.nodeScreen(k), key)
      expect(at).toBeTruthy()
      await page.mouse.move(at.x, at.y)
      await page.mouse.down()
      await page.mouse.move(at.x + dx, at.y + dy, { steps: 6 })
      await page.mouse.up()
      await page.waitForTimeout(220)
    }
    const samples = []
    for (let i = 0; i < 4; i++) {
      const p = await page.evaluate(k => window.__starmap.renderer.debug.nodeScreen(k), key)
      const shot = await page.screenshot({ clip: { x: Math.max(0, p.x - 20), y: Math.max(0, p.y - 20), width: 40, height: 40 } })
      samples.push(shot.length)
      await page.waitForTimeout(160)
    }
    console.log('[ENT-LAYER] 连续 4 帧中心区域 PNG 字节数:', samples)
    expect(samples.every(n => n > 300)).toBe(true)
    await page.screenshot({ path: 'shots/enterprise-starmap-layer.png' })
  })
})
