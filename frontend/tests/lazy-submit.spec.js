// @ts-check
// 懒人整卷提交：对错数/正确率/对照条；再做一次清空回第一题可再提交
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const API = 'http://localhost:8080';
const DOCX = 'D:/C-project/WisdomL/证件抽考题库(2).docx';

async function setupUser(request) {
  const u = 'lazy_' + Date.now() + '_' + Math.floor(Math.random() * 1e5);
  await request.post(`${API}/api/auth/register`, { data: { username: u, password: 'Test123456', nickname: 'L' } });
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
  return { token, user, questions };
}

test.describe('懒人整卷提交 + 再做一次', () => {
  test('整卷提交结果统计/对照条；再做一次清空', async ({ page, request }) => {
    const { token, user } = await setupUser(request);

    await page.addInitScript(([t, u]) => {
      localStorage.setItem('token', t);
      localStorage.setItem('user', JSON.stringify(u));
    }, [token, user]);

    await page.goto('/question-bank');
    await page.waitForLoadState('networkidle');
    await page.locator('.qb-card').first().locator('button, .cyber-button').filter({ hasText: '懒人模式' }).first().click();
    await page.waitForURL(/\/lazy-practice/);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);
    await expect(page.locator('.lp-option').first()).toBeVisible({ timeout: 15000 });

    // 第1题选第一个选项，第2题选第二个选项（不预设对错，只走流程）
    await page.locator('.lp-option').nth(0).click();
    await page.locator('.lp-arrow.right').click();
    await page.waitForTimeout(400);
    await page.locator('.lp-option').nth(1).click();

    // 整卷提交
    await page.locator('.lp-submit-btn').click();
    await expect(page.locator('.lp-result')).toBeVisible({ timeout: 30000 });
    console.log('[LAZY] 结果页出现 ✅');

    // 统计：正确/错误数不为负
    const stats = await page.locator('.lp-result-header').innerText();
    console.log('[LAZY] 结果统计:', stats.replace(/\s+/g, ' '));
    expect(stats).not.toMatch(/-\d/); // 不为负
    // 对照条：你的答案 vs 正确答案
    await expect(page.locator('.lp-answer-compare').first()).toBeVisible({ timeout: 5000 });
    const cmp = await page.locator('.lp-answer-compare').first().innerText();
    console.log('[LAZY] 对照条:', cmp.replace(/\s+/g, ' '));
    expect(cmp).toContain('你的答案');
    expect(cmp).toContain('正确答案');
    console.log('[LAZY] 对照条 ✅');

    // 再做一次：清空回第一题
    await page.locator('.lp-result-btn').filter({ hasText: '再做一次' }).click();
    await page.waitForTimeout(1000);
    await expect(page.locator('.lp-container')).toBeVisible();
    // 回第一题，选项未选
    await expect(page.locator('.lp-option').nth(0)).not.toHaveClass(/selected/, { timeout: 3000 });
    // 题号导航不应有 done
    console.log('[LAZY] 再做一次后回答题页、选项清空 ✅');

    // 可再次整卷提交（选一题）
    await page.locator('.lp-option').nth(0).click();
    await page.locator('.lp-submit-btn').click();
    await expect(page.locator('.lp-result')).toBeVisible({ timeout: 30000 });
    console.log('[LAZY] 再做一次后可再次整卷提交 ✅');
  });
});
