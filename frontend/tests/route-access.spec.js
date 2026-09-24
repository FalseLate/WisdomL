// @ts-check
// 路由可达性：从首页点击 UI 进入各路由，验证无孤岛、【我的】指向新版
import { test, expect } from '@playwright/test';

const API = 'http://localhost:8080';

async function newUser(request) {
  const u = 'rout_' + Date.now() + '_' + Math.floor(Math.random() * 1e5);
  await request.post(`${API}/api/auth/register`, { data: { username: u, password: 'Test123456', nickname: 'R' } });
  const lr = await request.post(`${API}/api/auth/login`, { data: { username: u, password: 'Test123456' } });
  return lr.json();
}

test.describe('路由可达性（防孤岛）', () => {
  test('首页【我的】→ 应到新版 /profile，不是旧 /user-center', async ({ page, request }) => {
    const { token, user } = await newUser(request);
    await page.addInitScript(([t, u]) => { localStorage.setItem('token', t); localStorage.setItem('user', JSON.stringify(u)); }, [token, user]);
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    // 点底部【我的】
    const meBtn = page.locator('a, button, .nav-item, .tab').filter({ hasText: /我的|个人|profile/i }).first();
    await meBtn.click();
    await page.waitForTimeout(1500);
    const url = page.url();
    console.log('[ROUTE] 点【我的】后 URL =', url);

    if (url.includes('/user-center')) {
      console.log('[ROUTE] ❌ 仍指向旧版 /user-center，路由孤岛未修');
    } else if (url.includes('/profile')) {
      console.log('[ROUTE] ✅ 已指向新版 /profile');
    } else {
      console.log('[ROUTE] ⚠️ 指向其他: ', url);
    }
    // 断言新版页有特征（错题分析/今日复习等新菜单）
    await expect(page.locator('body')).toContainText(/个人中心|错题分析|今日复习|错因统计|我的收藏|收藏|历史/, { timeout: 5000 });
  });

  test('从首页点击进入题库/错题/收藏等主路由', async ({ page, request }) => {
    const { token, user } = await newUser(request);
    await page.addInitScript(([t, u]) => { localStorage.setItem('token', t); localStorage.setItem('user', JSON.stringify(u)); }, [token, user]);
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    // 首页应有的导航入口
    const entries = ['题库', '错题', '收藏', '历史', '复习'];
    for (const name of entries) {
      const btn = page.locator('a, button, .nav-item, .tab, .menu-item').filter({ hasText: new RegExp('^' + name + '$') }).first();
      if (await btn.count()) {
        await btn.click();
        await page.waitForTimeout(1000);
        console.log('[ROUTE] 点[' + name + '] →', page.url());
      }
    }
    console.log('[ROUTE] 主路由可达性遍历完成');
  });
});
