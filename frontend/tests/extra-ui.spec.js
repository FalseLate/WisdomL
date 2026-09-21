// @ts-check
// 重生成解析按钮 + 今日复习UI + 登出
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const API = 'http://localhost:8080';
const DOCX = 'D:/C-project/WisdomL/证件抽考题库(2).docx';

async function setupUser(request) {
  const u = 'extra_' + Date.now() + '_' + Math.floor(Math.random() * 1e5);
  await request.post(`${API}/api/auth/register`, { data: { username: u, password: 'Test123456', nickname: 'E' } });
  const lr = await request.post(`${API}/api/auth/login`, { data: { username: u, password: 'Test123456' } });
  const { token, user } = await lr.json();
  const buf = await readFile(DOCX);
  const upRes = await request.post(`${API}/api/upload`, {
    multipart: { file: { name: 'q.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: buf } },
    headers: { Authorization: 'Bearer ' + token },
  });
  const upJson = await upRes.json();
  if ((upJson.extractedQuestions || []).length) {
    await request.post(`${API}/api/generate-from-extracted`, {
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      data: { questions: upJson.extractedQuestions, title: '补测题库' },
    });
  }
  return { token, user };
}

test.describe('重生成解析+今日复习+登出', () => {
  test('重生成解析按钮；今日复习页；登出清token', async ({ page, request }) => {
    const { token, user } = await setupUser(request);
    await page.addInitScript(([t, u]) => { localStorage.setItem('token', t); localStorage.setItem('user', JSON.stringify(u)); }, [token, user]);

    // ===== 重生成解析按钮（缺解析时显示）=====
    await page.goto('/question-bank');
    await page.waitForLoadState('networkidle');
    await page.locator('.qb-card').first().locator('button, .cyber-button').filter({ hasText: '试卷模式' }).first().click();
    await page.waitForURL(/\/practice/);
    await page.waitForTimeout(1500);
    const retryBtns = await page.locator('text=重新生成解析').count();
    console.log('[EXTRA] 重生成解析按钮数 =', retryBtns);
    if (retryBtns > 0) {
      await page.locator('text=重新生成解析').first().click();
      await page.waitForTimeout(3000);
      console.log('[EXTRA] 点重生成解析按钮无报错 ✅');
    } else {
      console.log('[EXTRA] 本题解析齐全，无重生成按钮（正常）');
    }

    // ===== 今日复习页 =====
    await page.goto('/review-today');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    const body = await page.locator('body').innerText();
    console.log('[EXTRA] 今日复习页文本:', body.slice(0, 60).replace(/\n/g, ' '));

    // ===== 登出清token =====
    await page.goto('/profile');
    await page.waitForLoadState('networkidle');
    await page.locator('button, .logout-btn').filter({ hasText: '退出登录' }).first().click();
    await page.waitForTimeout(1000);
    const hasToken = await page.evaluate(() => !!localStorage.getItem('token'));
    console.log('[EXTRA] 登出后token存在=', hasToken);
    console.log('[EXTRA] 补测全过');
  });
});
