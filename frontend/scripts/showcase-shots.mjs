/**
 * 展示账号截图：先跑 starmap-showcase-seed.mjs，再启动 Vite + 后端。
 *   node scripts/showcase-shots.mjs
 * 输出 frontend/shots/showcase/ 下的全景、星系内、单星、星尘、浅色、手机图。
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(fileURLToPath(import.meta.url))
const OUT = join(ROOT, '..', 'shots', 'showcase')
const BASE = process.env.SHOWCASE_BASE || 'http://localhost:5173'
const API = process.env.SEED_API || 'http://localhost:8080/api'
const ACCOUNT = { username: 'demo_showcase', password: 'Showcase123456' }
mkdirSync(OUT, { recursive: true })

async function login() {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ACCOUNT)
  })
  const json = await res.json()
  if (!json?.token) throw new Error('登录失败，先跑 starmap-showcase-seed.mjs')
  return json
}

async function installAuth(context, auth) {
  await context.addInitScript(([token, user]) => {
    localStorage.setItem('token', token)
    localStorage.setItem('user', JSON.stringify(user))
    localStorage.setItem('starmap.helpSeen', '1')
  }, [auth.token, auth.user])
}

async function waitMap(page) {
  await page.goto(BASE + '/knowledge-universe', { waitUntil: 'load' })
  await page.waitForSelector('.splash-screen', { state: 'detached', timeout: 9000 }).catch(() => {})
  await page.waitForSelector('.star-label.show', { timeout: 20000 })
  await page.waitForTimeout(1200)
}

async function openPage(browser, auth, viewport) {
  const context = await browser.newContext({ viewport: viewport || { width: 1280, height: 800 }, deviceScaleFactor: 1 })
  await installAuth(context, auth)
  const page = await context.newPage()
  await waitMap(page)
  return { context, page }
}

async function shot(page, name) {
  await page.screenshot({ path: join(OUT, name), fullPage: false })
  console.log('  →', name)
}

async function main() {
  const auth = await login()
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  try {
    const { context, page } = await openPage(browser, auth)
    await shot(page, '01-overview-dark.png')

    // 星系模式：雾团变亮，按住任一星球整团移动
    await page.locator('.tool', { hasText: '星系模式' }).click()
    await page.waitForTimeout(900)
    await shot(page, '07-galaxy-mode.png')
    await page.locator('.tool', { hasText: '星系模式' }).click()
    await page.waitForTimeout(600)

    const counts = await page.evaluate(() => {
      const g = window.__starmap.store.graph.value
      return { topics: g.topics.length, stars: g.stars.length, galaxies: g.galaxies.length, edges: g.edges.length }
    })
    console.log('当前图：', counts)

    // 浅色
    await page.locator('.tool', { hasText: '深色' }).click()
    await page.waitForTimeout(1200)
    await shot(page, '02-overview-light.png')
    await page.locator('.tool', { hasText: '浅色' }).click()
    await page.waitForTimeout(900)

    // 进入循环系统，看球内星点和连线
    const circ = await page.evaluate(() => window.__starmap.store.graph.value.topics.find(t => t.title.includes('循环系统'))?.key)
    if (circ) {
      await page.evaluate(k => window.__starmap.store.enterTopic(k), circ)
      await page.waitForTimeout(1700)
      await shot(page, '03-inside-circulation.png')
      await page.evaluate(() => window.__starmap.store.backToRoot())
      await page.waitForTimeout(1200)
    }

    // 选一个大知识点，展示详情和属性面板
    const star = await page.evaluate(() => window.__starmap.store.graph.value.stars.find(s => s.title.includes('心衰的病因'))?.key)
    if (star) {
      await page.evaluate(k => window.__starmap.store.jumpTo(k), star)
      await page.waitForTimeout(1700)
      await shot(page, '04-star-detail.png')
      await page.evaluate(() => window.__starmap.store.backToRoot())
      await page.waitForTimeout(1000)
    }

    // 未归类星尘
    const dust = await page.evaluate(() => window.__starmap.store.graph.value.stars.find(s => !s.topicKey)?.key)
    if (dust) {
      await page.evaluate(k => window.__starmap.store.jumpTo(k), dust)
      await page.waitForTimeout(1700)
      await shot(page, '05-stardust.png')
    }

    await context.close()

    // 手机
    const mobile = await openPage(browser, auth, { width: 390, height: 844 })
    await shot(mobile.page, '06-mobile.png')
    await mobile.context.close()
    console.log('截图完成：', OUT)
  } finally {
    await browser.close()
  }
}

main().catch(e => { console.error('截图失败：', e.message); process.exit(1) })
