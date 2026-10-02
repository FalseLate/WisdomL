// @ts-check
// 视觉验收：逐路由 × 深/浅两态全页截图，输出到 frontend/shots/
// 跑法：cd frontend && npx playwright test tests/theme-visual.spec.js --reporter=list
import { test } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const API = 'http://localhost:8080';
const OUT = 'shots';
const MOTION = 'neon';   // 截图时固定用霓虹档，避免中性灰档看不出粒子是否工作

const ROUTES = [
  '/', '/practice', '/question-bank', '/history', '/error-stats',
  '/wrong-questions', '/review-today', '/collections', '/profile',
  '/lazy-practice', '/settings'
];

const slug = (r) => r === '/' ? 'home' : r.replace(/\W/g, '_');

async function newUser(request) {
  const u = 'vis_' + Date.now() + '_' + Math.floor(Math.random() * 1e5);
  await request.post(`${API}/api/auth/register`, { data: { username: u, password: 'Test123456', nickname: 'V' } });
  const lr = await request.post(`${API}/api/auth/login`, { data: { username: u, password: 'Test123456' } });
  return lr.json();
}

/** 开屏动画是全屏覆盖层，截图前必须等它消失 */
async function settle(page) {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForSelector('.splash-screen', { state: 'detached', timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(900);
}

test('逐路由 × 深浅两态截图', async ({ page, request }) => {
  test.setTimeout(300000);
  mkdirSync(OUT, { recursive: true });
  const { token, user } = await newUser(request);
  await page.addInitScript(([t, u]) => {
    localStorage.setItem('token', t);
    localStorage.setItem('user', JSON.stringify(u));
  }, [token, user]);
  await page.setViewportSize({ width: 390, height: 844 });

  for (const theme of ['dark', 'light']) {
    for (const route of ROUTES) {
      await page.goto('/');
      await page.evaluate(([t, m]) => {
        localStorage.setItem('zhifuxi_a11y_v1', JSON.stringify({ feedback: { theme: t, motion: m } }));
      }, [theme, MOTION]);
      await page.goto(route);
      await settle(page);
      const file = `${OUT}/${theme}-${slug(route)}.png`;
      await page.screenshot({ path: file, fullPage: true });
      console.log('[SHOT]', file, 'url=' + page.url());
    }
  }
});
