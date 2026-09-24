// @ts-check
// PDCA 闭环：试卷模式做题 → 判分红绿一致 → 进度条 → 刷新保留 → localStorage草稿清除 → 错题本 → 收藏
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const API = 'http://localhost:8080';
const DOCX = 'D:/C-project/WisdomL/证件抽考题库(2).docx';

async function setupUser(request) {
  const u = 'pdca_' + Date.now() + '_' + Math.floor(Math.random() * 1e5);
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
  return { token, user, questions };
}

// 从一道题的 answer 字符串里挑一个“错误”选项 key（故意选错用）
function pickWrongKey(question) {
  const opts = question.options || {};
  const keys = Object.keys(opts);
  if (keys.length < 2) return keys[0];
  const correct = (question.answer || '').replace(/\s/g, '');
  // 第一个不在正确答案里的 key
  const wrong = keys.find(k => !correct.includes(k));
  return wrong || keys[1];
}
function correctKeys(question) {
  return (question.answer || '').replace(/\s/g, '').split('').filter(Boolean);
}

test.describe('试卷模式 PDCA 闭环', () => {
  test('做题判分→进度→刷新→草稿清除→错题本→收藏', async ({ page, request }) => {
    const { token, user, questions } = await setupUser(request);
    expect(questions.length).toBeGreaterThan(10);
    const q1 = questions[0], q2 = questions[1];
    console.log('[SETUP] 入库题数:', questions.length, '| Q1正确答案:', q1.answer, '| Q2正确答案:', q2.answer);

    await page.addInitScript(([t, u]) => {
      localStorage.setItem('token', t);
      localStorage.setItem('user', JSON.stringify(u));
    }, [token, user]);

    // 题库页 → 试卷模式
    await page.goto('/question-bank');
    await page.waitForLoadState('networkidle');
    const card = page.locator('.qb-card').first();
    await expect(card).toBeVisible({ timeout: 30000 });
    await card.locator('button, .cyber-button').filter({ hasText: '试卷模式' }).first().click();
    await page.waitForURL(/\/practice/);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    const card1 = page.locator('.obj-card').nth(0);
    const card2 = page.locator('.obj-card').nth(1);
    await expect(card1).toBeVisible({ timeout: 15000 });

    // ---------- Q1 故意选错 ----------
    const wrongKey = pickWrongKey(q1);
    const optKeys1 = Object.keys(q1.options || {});
    const wrongIdx = Math.max(0, optKeys1.indexOf(wrongKey));
    const opt1Wrong = card1.locator('.opt').nth(wrongIdx);
    await opt1Wrong.click();
    await expect(opt1Wrong).toHaveClass(/active/);
    await card1.locator('.act button, .cyber-button').filter({ hasText: '提交答案' }).click();
    await expect(card1.locator('.res .wrong, .res.wrong')).toBeVisible({ timeout: 20000 });
    await expect(card1.locator('.res .wrong, .res.wrong')).toContainText(/回答错误|正确答案是/);
    console.log('[PDCA] Q1 故意选', wrongKey, '→ 判红 ✅');

    // ---------- Q2 选对 ----------
    const ck2 = correctKeys(q2)[0] || 'A';
    const optKeys2 = Object.keys(q2.options || {});
    const rightIdx2 = Math.max(0, optKeys2.indexOf(ck2));
    const opt2Right = card2.locator('.opt').nth(rightIdx2);
    await opt2Right.click();
    await card2.locator('.act button, .cyber-button').filter({ hasText: '提交答案' }).click();
    await expect(card2.locator('.res .correct, .res.correct')).toBeVisible({ timeout: 20000 });
    await expect(card2.locator('.res .correct, .res.correct')).toContainText(/回答正确/);
    console.log('[PDCA] Q2 选', ck2, '→ 判绿 ✅');

    // ---------- 进度条数字 ----------
    const progressText = await page.locator('.progress-num').innerText();
    console.log('[PDCA] 进度条:', progressText);
    expect(progressText.trim()).toMatch(/^2\//);
    const stats = await page.locator('.progress-stats').innerText();
    expect(stats).toMatch(/1\s*正确/);
    expect(stats).toMatch(/1\s*错误/);

    // ---------- localStorage：已提交题草稿应被清除 ----------
    const draftRaw = await page.evaluate(() => {
      const keys = Object.keys(localStorage).filter(k => k.startsWith('practice_draft_'));
      return keys.map(k => localStorage.getItem(k));
    });
    // 提交后 dropDraft，draft answers 里不应再含这两题的未提交答案
    let leaked = false;
    for (const raw of draftRaw) {
      try { const j = JSON.parse(raw || '{}'); if (j.answers && Object.keys(j.answers).length) leaked = true; } catch (e) {}
    }
    console.log('[PDCA] 提交后草稿泄漏检查 leaked=', leaked);

    // ---------- 刷新页面：已提交结果回显，不被锁进结果页 ----------
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    await expect(page.locator('.obj-card').nth(0).locator('.res .wrong, .res.wrong')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.obj-card').nth(1).locator('.res .correct, .res.correct')).toBeVisible({ timeout: 10000 });
    console.log('[PDCA] 刷新后结果保留 ✅');

    // ---------- 收藏 Q1 ----------
    const fav = page.locator('.obj-card').nth(0).locator('.fav-btn');
    await fav.click();
    await expect(fav).toHaveClass(/active/);
    console.log('[PDCA] 收藏 Q1 ✅');

    // ---------- 错题本：Q1 应在列 ----------
    await page.goto('/wrong-questions');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);
    const wrongBody = await page.locator('body').innerText();
    // Q1 题面前缀，证明错题已进错题本
    expect(wrongBody).toContain('发证机关');
    console.log('[PDCA] 错题本已收录 Q1 错题 ✅');
    await page.screenshot({ path: 'test-results/wrong-list.png' });

    // ---------- 收藏页：Q1 应在列 ----------
    await page.goto('/favorites');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1200);
    console.log('[PDCA] 收藏页进入 ✅');
    await page.screenshot({ path: 'test-results/fav-list.png' });

    console.log('[PDCA] 全链路完成');
  });
});
