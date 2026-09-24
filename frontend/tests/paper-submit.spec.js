// @ts-check
// 试卷单题提交：草稿移除、结果锁定；懒人快速连点切题不划蓝/不弹复制菜单
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const API = 'http://localhost:8080';
const DOCX = 'D:/C-project/WisdomL/证件抽考题库(2).docx';

async function setupUser(request) {
  const u = 'psub_' + Date.now() + '_' + Math.floor(Math.random() * 1e5);
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
      data: { questions, title: 'E2E题库' },
    });
  }
  return { token, user };
}

test.describe('试卷单题提交 + 快速连点切题', () => {
  test('单题提交后草稿移除/结果锁定；快速连点右箭头不划蓝', async ({ page, request }) => {
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

    const card1 = page.locator('.obj-card').nth(0);
    await expect(card1).toBeVisible({ timeout: 15000 });

    // 选 A（不提交，草稿）
    await card1.locator('.opt').nth(0).click();
    await expect(card1.locator('.opt').nth(0)).toHaveClass(/active/);
    // 草稿应写入 localStorage
    await page.waitForTimeout(300);
    let draftHasQ1 = await page.evaluate(() => {
      const k = Object.keys(localStorage).find(x => x.startsWith('practice_draft_'));
      if (!k) return false;
      try { const j = JSON.parse(localStorage.getItem(k)); return j.answers && Object.keys(j.answers).length > 0; } catch (e) { return false; }
    });
    console.log('[PAPER] 选题后草稿存在:', draftHasQ1);
    expect(draftHasQ1).toBe(true);

    // 单题提交
    await card1.locator('.act button, .cyber-button').filter({ hasText: '提交答案' }).click();
    await expect(card1.locator('.res .wrong, .res.correct, .res.wrong')).toBeVisible({ timeout: 20000 });
    // 结果锁定：选项 disabled
    await expect(card1.locator('.opt').nth(0)).toHaveClass(/disabled/, { timeout: 3000 });
    // 草稿应被移除（dropDraft）
    await page.waitForTimeout(500);
    draftHasQ1 = await page.evaluate(() => {
      const k = Object.keys(localStorage).find(x => x.startsWith('practice_draft_'));
      if (!k) return false;
      try { const j = JSON.parse(localStorage.getItem(k)); return j.answers && Object.keys(j.answers).length > 0; } catch (e) { return false; }
    });
    console.log('[PAPER] 提交后草稿残留:', draftHasQ1);
    expect(draftHasQ1).toBe(false);
    console.log('[PAPER] 单题提交后草稿移除+结果锁定 ✅');

    // ===== 快速连点切题（懒人模式右箭头）不划蓝 =====
    await page.goto('/question-bank');
    await page.waitForLoadState('networkidle');
    await page.locator('.qb-card').first().locator('button, .cyber-button').filter({ hasText: '懒人模式' }).first().click();
    await page.waitForURL(/\/lazy-practice/);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);
    await expect(page.locator('.lp-option').first()).toBeVisible({ timeout: 15000 });

    // 快速连点右箭头 8 次
    const right = page.locator('.lp-arrow.right');
    for (let i = 0; i < 8; i++) { await right.click({ force: true }); }
    await page.waitForTimeout(500);
    const sel = await page.evaluate(() => window.getSelection().toString());
    console.log('[PAPER] 快速连点后选中文本:', JSON.stringify(sel));
    expect(sel.trim()).toBe(''); // 没有划蓝
    console.log('[PAPER] 快速连点不划蓝 ✅');
  });
});
