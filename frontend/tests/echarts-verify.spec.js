// @ts-check
// echarts 图表尺寸回归（真断言版）
//
// 锁定 E2E 回归报告 P2-2：
//   /error-stats 按 F5 刷新时，首屏开场动画（App.vue 的 SplashScreen）用 v-show 把页面容器
//   隐藏 1~3 秒；若此时 echarts.init，zrender 会把 computed 的 "100%" 解析成 100，
//   图表被永久钉成 100px 宽。修复方案：容器有真实布局尺寸后才初始化，并由 ResizeObserver 跟随尺寸变化。
//
// 运行前提：
//   后端 :8080 已启动、MySQL 可连、frontend 已 npm run build && npm run preview（:4173）
// 运行方式：
//   cd frontend && npx playwright test tests/echarts-verify.spec.js
import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'

const API = 'http://localhost:8080'
const DOCX = 'D:/C-project/WisdomL/证件抽考题库(2).docx'

/**
 * 造数据：注册 → 上传题库 → 故意做错若干题 → 给错题标错因。
 * 错因必须标，否则饼图走空态分支（不渲染 canvas），就测不到三图尺寸了。
 */
async function seedWrongQuestions(request) {
  const u = 'ech_' + Date.now() + '_' + Math.floor(Math.random() * 1e5)
  await request.post(`${API}/api/auth/register`, { data: { username: u, password: 'Test123456', nickname: 'E' } })
  const lr = await request.post(`${API}/api/auth/login`, { data: { username: u, password: 'Test123456' } })
  const { token, user } = await lr.json()
  const h = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }

  const buf = await readFile(DOCX)
  const up = await request.post(`${API}/api/upload`, {
    multipart: { file: { name: 'q.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: buf } },
    headers: { Authorization: 'Bearer ' + token },
  })
  const upj = await up.json()
  const questions = (upj.extractedQuestions || []).slice(0, 6)

  for (const q of questions) {
    const ans = String(q.answer || '').replace(/[^A-Z]/g, '')
    const wrong = Object.keys(q.options || {}).find(k => !ans.includes(k)) || 'B'
    await request.post(`${API}/api/check`, {
      headers: h,
      data: { question: q, userAnswer: wrong, questionType: q.type || 'single', answerTime: 20000 },
    })
  }

  const wl = await request.get(`${API}/api/wrong-questions`, { headers: h })
  const list = await wl.json()
  const wrongs = Array.isArray(list) ? list : (list.list || [])
  const TYPES = ['audit', 'knowledge', 'math']
  for (let i = 0; i < wrongs.length; i++) {
    if (!wrongs[i].questionId) continue
    await request.post(`${API}/api/wrong-questions/error-type`, {
      headers: h,
      data: { questionId: wrongs[i].questionId, errorTypes: TYPES[i % TYPES.length], errorNote: '' },
    })
  }
  return { token, user, wrongCount: wrongs.length }
}

async function canvasSizes(page) {
  return page.locator('.chart canvas').evaluateAll(els => els.map(el => {
    const r = el.getBoundingClientRect()
    return { w: Math.round(r.width), h: Math.round(r.height) }
  }))
}

/** 等开场动画收尾：页面容器恢复可见（clientWidth > 0） */
async function waitSplashDone(page) {
  await page.waitForFunction(() => {
    const el = document.querySelector('.stats-view')
    return !!el && el.clientWidth > 0
  }, null, { timeout: 20000 })
}

async function loginAndOpenStats(page, token, user) {
  await page.addInitScript(([t, u]) => {
    localStorage.setItem('token', t)
    localStorage.setItem('user', JSON.stringify(u))
  }, [token, user])
  await page.goto('/error-stats')
  await waitSplashDone(page)
  await page.waitForSelector('.chart canvas', { timeout: 20000 })
}

test.describe('echarts 图表尺寸', () => {
  test('F5 刷新后三图不被压扁（Splash + v-show 场景）', async ({ page, request }) => {
    const { token, user, wrongCount } = await seedWrongQuestions(request)
    expect(wrongCount, '需要先造出错题，否则饼图/柱图走空态分支').toBeGreaterThan(0)

    await loginAndOpenStats(page, token, user)

    // 复现报告场景：F5 刷新（再次经历开场动画 + display:none）
    await page.reload()
    await waitSplashDone(page)
    await page.waitForSelector('.chart canvas', { timeout: 20000 })
    await page.waitForTimeout(300) // 留一帧给 ResizeObserver 回调

    const sizes = await canvasSizes(page)
    console.log('[EC] F5 后三图尺寸:', JSON.stringify(sizes))
    expect(sizes.length, '三图（饼/线/柱）都应渲染').toBeGreaterThanOrEqual(3)
    for (const s of sizes) {
      expect(s.w, `图宽 ${s.w}px：100 表示又被算成百分比宽度了`).toBeGreaterThan(400)
      expect(s.h).toBeGreaterThan(200)
    }
  })

  test('容器变窄后图表跟随重绘', async ({ page, request }) => {
    const { token, user, wrongCount } = await seedWrongQuestions(request)
    expect(wrongCount).toBeGreaterThan(0)

    await loginAndOpenStats(page, token, user)
    const before = await canvasSizes(page)
    expect(before.length).toBeGreaterThanOrEqual(3)

    // 收窄到比 .page-container 的 max-width(560) 更窄，才能验证跟随容器而不是跟随窗口
    await page.setViewportSize({ width: 420, height: 900 })
    await page.waitForTimeout(600)

    const after = await canvasSizes(page)
    console.log('[EC] 收窄前:', JSON.stringify(before), '收窄后:', JSON.stringify(after))
    expect(after[0].w).toBeGreaterThan(200)
    expect(after[0].w).toBeLessThan(before[0].w)
  })
})
