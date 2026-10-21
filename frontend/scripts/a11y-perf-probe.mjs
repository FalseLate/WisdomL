/**
 * 无障碍链路耗时探针：把"慢在哪一段"变成数字。
 * 用法（先 npm run build）：
 *   node scripts/a11y-perf-probe.mjs            # 本地不限速
 *   node scripts/a11y-perf-probe.mjs --slow     # 模拟 4Mbps / 100ms RTT（手机在外的体感）
 *   node scripts/a11y-perf-probe.mjs --slow --reopen   # 再量一次"关掉手势后重新点开"的第二次开销
 *   node scripts/a11y-perf-probe.mjs --seconds 20
 * 摄像头用 Chromium 的合成设备（--use-fake-device），不需要真摄像头。
 */
import { chromium } from 'playwright'

const args = process.argv.slice(2)
const slow = args.includes('--slow')
const secondsIdx = args.indexOf('--seconds')
const SECONDS = secondsIdx >= 0 ? Number(args[secondsIdx + 1]) : 12
const BASE = process.env.PROBE_BASE || 'http://localhost:4173'

const A11Y = {
  channels: { hand: true, head: true, arm: true },
  feedback: { debug: true }
}
const QUESTIONS = [{
  id: 'p1', type: '多选', question: '下列哪些是水果？',
  options: { A: '苹果', B: '香蕉', C: '石头', D: '橘子' }, answer: 'ABD'
}]

async function waitServer(url, ms = 20000) {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    try { const r = await fetch(url); if (r.ok) return true } catch { /* 还没起来 */ }
    await new Promise(r => setTimeout(r, 500))
  }
  return false
}

// 本机 preview 没起来就是真的没起来；线上站点自签证书会让 node 侧探测失败，只警告不退出
if (BASE.startsWith('https')) {
  console.log(`[probe] 目标 ${BASE}（https：跳过本地可达性探测，浏览器已忽略证书错误）`)
} else {
  const ok = await waitServer(BASE, 1500)
  if (!ok) {
    console.error(`预览服务没起来：先跑 npm run preview（或 npm run build && npm run preview），BASE=${BASE}`)
    process.exit(2)
  }
}

const browser = await chromium.launch({
  channel: 'msedge',
  headless: false,
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--use-fake-device-for-media-stream']
})
const ctx = await browser.newContext({ viewport: { width: 480, height: 900 }, ignoreHTTPSErrors: true })
const page = await ctx.newPage()

const lines = []
page.on('console', m => { const t = m.text(); if (t.includes('[a11y:perf]') || t.includes('[channel')) lines.push(t.slice(0, 400)) })
page.on('pageerror', e => lines.push('PAGEERROR ' + e.message))

if (slow) {
  const cdp = await ctx.newCDPSession(page)
  await cdp.send('Network.enable')
  // 4Mbps / 100ms RTT：≈ 0.5MB/s，28MB 资源要 ~56 秒
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false, latency: 100, downloadThroughput: 4 * 1000 * 1000 / 8, uploadThroughput: 1 * 1000 * 1000 / 8
  })
}

await page.addInitScript(([cfg, qs]) => {
  localStorage.setItem('token', 'probe-token')
  localStorage.setItem('user', JSON.stringify({ id: 1, username: 'probe', nickname: '探针' }))
  localStorage.setItem('zhifuxi_a11y_v1', JSON.stringify(cfg))
  localStorage.setItem('zhifuxi-questions', JSON.stringify({ questions: qs }))
  localStorage.setItem('lazy_gesture_tutorial_shown', '1')
}, [A11Y, QUESTIONS])

const t0 = Date.now()
await page.goto(`${BASE}/lazy-practice`, { waitUntil: 'load' })
await page.waitForSelector('.lp-option', { timeout: 60000 })
await page.locator('.lp-gesture-toggle').first().click()
await page.waitForSelector('.gesture-hud', { timeout: 60000 })

// 等全部启用的通道都开完（首访要下 3 个模型 + wasm），再采 SECONDS 秒稳态帧
const want = Object.keys(A11Y.channels).filter(k => A11Y.channels[k]).length
await page.waitForFunction(
  (n) => (window.__a11yManager?.channels.size || 0) >= n,
  want,
  { timeout: 300000 }
).catch(() => console.warn('[probe] 未等到全部通道开启（可能超时/权限被拒）'))
const openedAt = Date.now()
await page.waitForFunction(
  (n) => (window.__a11yManager?.perf.ticks || 0) >= n,
  Math.round(SECONDS * 1000 / 33),
  { timeout: SECONDS * 1000 + 30000 }
).catch(() => {})

const sum = await page.evaluate(() => {
  const m = window.__a11yManager
  if (m && typeof m.perfSummary === 'function') return { ...m.perfSummary(), instrumented: true }
  // 线上可能还是旧构建（没有探针方法）：下载数据仍能从浏览器 Resource Timing 取到
  const resources = performance.getEntriesByType('resource')
    .filter(e => e.name.includes('/mediapipe/'))
    .map(e => ({
      file: e.name.split('/mediapipe/')[1].split('?')[0],
      ms: Math.round(e.duration),
      netKB: Math.round((e.transferSize || 0) / 1024),
      sizeKB: Math.round((e.encodedBodySize || 0) / 1024)
    }))
  return { resources, open: {}, firstFrame: {}, perFrame: {}, ticks: 0, overBudget: 0, starved: 0, cycleMs: 0, glLost: 0, device: {}, instrumented: false }
})
if (!sum.instrumented) console.log('[probe] 这个构建里没有 [a11y:perf] 探针，只能给下载数据（初始化/每帧耗时要等新构建上线）')
const hud = await page.evaluate(() => {
  const el = document.querySelector('.hud-status, .hud-loading, .gesture-hud')
  return el ? el.innerText.replace(/\s+/g, ' ').slice(0, 200) : null
})

// 第二次开销：用户的原话是"无障碍设置之后再次点开摄像头就会很慢"，这条就是量那个
let reopen = null
if (args.includes('--reopen')) {
  await page.locator('.lp-gesture-toggle').first().click()
  await page.waitForSelector('.gesture-hud', { state: 'detached', timeout: 60000 })
  const t1 = Date.now()
  await page.locator('.lp-gesture-toggle').first().click()
  await page.waitForFunction((n) => (window.__a11yManager?.channels.size || 0) >= n, want, { timeout: 300000 }).catch(() => {})
  const s2 = await page.evaluate(() => window.__a11yManager.perfSummary())
  reopen = { ms: Date.now() - t1, open: s2.open, netMB: Math.round(s2.resources.reduce((a, r) => a + r.netKB, 0) / 1024 * 10) / 10 }
}

const netKB = sum.resources.reduce((s, r) => s + r.netKB, 0)
console.log(`\n=========== a11y 耗时探针 ${slow ? '【4Mbps 弱网】' : '【不限速】'} ===========`)
console.log(`点击"手势：开"到全部通道就绪：${openedAt - t0} ms`)
console.log(`mediapipe 资源：${sum.resources.length} 次请求 / 实际走网络 ${Math.round(netKB / 1024 * 10) / 10} MB`)
for (const r of sum.resources) {
  console.log(`  - ${r.file.padEnd(38)} ${String(r.ms).padStart(6)} ms  传输 ${String(r.netKB).padStart(6)} KB / 体积 ${String(r.sizeKB).padStart(6)} KB${r.netKB === 0 ? '  (缓存命中，未走网络)' : ''}`)
}
console.log('通道初始化（含下载+wasm编译+建模）：', JSON.stringify(sum.open))
console.log('每通道首帧：', JSON.stringify(sum.firstFrame))
console.log('稳态每帧主线程占用：', JSON.stringify(sum.perFrame))
console.log(`采样帧数=${sum.ticks} 超 33ms 预算=${sum.overBudget} rAF 饥饿=${sum.starved} 单周期均值=${sum.cycleMs} ms WebGL丢失=${sum.glLost}`)
console.log('设备：', JSON.stringify(sum.device))
console.log('HUD 文案：', hud)
if (reopen) console.log(`关掉再点开：${reopen.ms} ms，第二次各通道初始化 ${JSON.stringify(reopen.open)}，全程累计走网络 ${reopen.netMB} MB`)
console.log('控制台原行：\n' + lines.join('\n'))
console.log('==============================================\n')

await page.screenshot({ path: `shots/a11y-perf${slow ? '-slow' : ''}.png` }).catch(() => {})
await browser.close()
