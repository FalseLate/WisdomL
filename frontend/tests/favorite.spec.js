// @ts-check
// 收藏完整链路：做题页点收藏 → /api/collection 入库 → 收藏页能看到该题
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const API = 'http://localhost:8080';
const DOCX = 'D:/C-project/WisdomL/证件抽考题库(2).docx';

async function setupUser(request) {
  const u = 'fav_' + Date.now() + '_' + Math.floor(Math.random() * 1e5);
  await request.post(`${API}/api/auth/register`, { data: { username: u, password: 'Test123456', nickname: 'F' } });
  const lr = await request.post(`${API}/api/auth/login`, { data: { username: u, password: 'Test123456' } });
  const { token, user } = await lr.json();
  const buf = await readFile(DOCX);
  const upRes = await request.post(`${API}/api/upload`, {
    multipart: { file: { name: 'q.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: buf } },
    headers: { Authorization: 'Bearer ' + token },
  });
  const upJson = await upRes.json();
  const questions = upJson.extractedQuestions || [];
  if (questions.length) {
    await request.post(`${API}/api/generate-from-extracted`, {
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      data: { questions, title: 'E2E题库' },
    });
  }
  return { token, user };
}

test.describe('收藏链路', () => {
  test('点收藏→入库→收藏页显示', async ({ page, request }) => {
    const { token, user } = await setupUser(request);
    await page.addInitScript(([t, u]) => {
      localStorage.setItem('token', t);
      localStorage.setItem('user', JSON.stringify(u));
    }, [token, user]);

    await page.goto('/question-bank');
    await page.waitForLoadState('networkidle');
    await page.locator('.qb-card').first().locator('button, .cyber-button').filter({ hasText: '试卷模式' }).first().click();
    await page.waitForURL(/\/practice/);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    // 抓 /api/collection 写入请求
    const collectReq = page.waitForRequest(r => r.url().includes('/collection') && r.method() === 'POST', { timeout: 5000 }).catch(() => null);

    const card1 = page.locator('.obj-card').nth(0);
    await expect(card1).toBeVisible({ timeout: 15000 });
    await card1.locator('.fav-btn').click();
    await expect(card1.locator('.fav-btn')).toHaveClass(/active/);

    const req = await collectReq;
    test.info().annotations.push({ type: 'collectPost', description: String(!!req) });
    if (!req) {
      console.warn('[FAV] 点收藏未发出 POST /collection（前端 toggleFav 只切本地态，未入库）');
    } else {
      console.log('[FAV] POST /collection 已发出 ✅');
    }

    // 去收藏页
    await page.goto('/collections');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);
    const body = await page.locator('body').innerText();
    const hasCard = await page.locator('.fav-card').count();
    console.log('[FAV] 收藏页卡片数 =', hasCard);
    console.log('[FAV] 页面文本:', body.slice(0, 120));
    expect(hasCard).toBeGreaterThan(0);
  });
});
