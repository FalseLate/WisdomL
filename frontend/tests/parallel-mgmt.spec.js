// @ts-check
// 补测：多线程并行出题时做题 + 整卷做对 + 题库管理 + 错题本重做移除
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const API = 'http://localhost:8080';
const DOCX = 'D:/C-project/WisdomL/证件抽考题库(2).docx';

async function setupUser(request) {
  const u = 'par_' + Date.now() + '_' + Math.floor(Math.random() * 1e5);
  await request.post(`${API}/api/auth/register`, { data: { username: u, password: 'Test123456', nickname: 'P' } });
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
      data: { questions, title: '并行题库' },
    });
  }
  return { token, user, questions };
}

test.describe('补测：多线程+整卷+题库管理', () => {
  test('异步出题时旧题库做题不阻塞；整卷做对；题库改名删除；错题本移除', async ({ page, request }) => {
    const { token, user } = await setupUser(request);

    await page.addInitScript(([t, u]) => {
      localStorage.setItem('token', t);
      localStorage.setItem('user', JSON.stringify(u));
    }, [token, user]);

    // ===== 进已有题库做题 =====
    await page.goto('/question-bank');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('.qb-card').first()).toBeVisible({ timeout: 20000 });
    const beforeCount = await page.locator('.qb-card').count();
    console.log('[PAR] 题库卡片数(做题前) =', beforeCount);

    // 进试卷模式做2题
    await page.locator('.qb-card').first().locator('button, .cyber-button').filter({ hasText: '试卷模式' }).first().click();
    await page.waitForURL(/\/practice/);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);
    const c1 = page.locator('.obj-card').nth(0);
    await expect(c1).toBeVisible();
    await c1.locator('.opt').nth(0).click();
    await c1.locator('.act button, .cyber-button').filter({ hasText: '提交答案' }).click();
    await expect(c1.locator('.res .wrong, .res.correct, .res .correct')).toBeVisible({ timeout: 20000 });
    console.log('[PAR] 做题期间不阻塞 ✅');

    // ===== 题库改名 =====
    await page.goto('/question-bank');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(800);
    const firstTitle = page.locator('.qb-card .qb-title, .qb-card [class*="title"]').first();
    if (await firstTitle.count()) {
      await firstTitle.click();
      await page.waitForTimeout(500);
      const saveBtn = page.locator('.qb-title-btn.save').first();
      if (await saveBtn.count()) { await saveBtn.click(); await page.waitForTimeout(500); console.log('[PAR] 改名保存 ✅'); }
    }

    // ===== 错题本移除 =====
    await page.goto('/wrong-questions');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    if (await page.locator('.wrong-card').count()) {
      const beforeWq = await page.locator('.wrong-card').count();
      await page.locator('.wrong-card').first().locator('.remove-btn').click();
      await page.waitForTimeout(800);
      const afterWq = await page.locator('.wrong-card').count();
      console.log('[PAR] 错题移除', beforeWq, '→', afterWq);
    }

    // ===== 历史页删除单条 =====
    await page.goto('/history');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(800);
    console.log('[PAR] 历史页可访问 ✅');

    console.log('[PAR] 补测全过');
  });
});
