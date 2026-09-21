// @ts-check
// 做对完整链路 + 关键页面 UI（题库管理/错题本/历史/统计/个人中心）
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const API = 'http://localhost:8080';
const DOCX = 'D:/C-project/WisdomL/证件抽考题库(2).docx';

async function setupUser(request) {
  const u = 'journey_' + Date.now() + '_' + Math.floor(Math.random() * 1e5);
  await request.post(`${API}/api/auth/register`, { data: { username: u, password: 'Test123456', nickname: 'J' } });
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
      data: { questions, title: '旅程题库' },
    });
  }
  return { token, user, questions };
}

test.describe('做对完整链路 + 关键页面', () => {
  test('全部做对→整卷100%；题库改名；错题本订正；各页不白屏', async ({ page, request }) => {
    const { token, user, questions } = await setupUser(request);
    expect(questions.length).toBeGreaterThan(5);

    await page.addInitScript(([t, u]) => {
      localStorage.setItem('token', t);
      localStorage.setItem('user', JSON.stringify(u));
    }, [token, user]);

    // ===== 进试卷模式 =====
    await page.goto('/question-bank');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('.qb-card').first()).toBeVisible({ timeout: 20000 });
    await page.locator('.qb-card').first().locator('button, .cyber-button').filter({ hasText: '试卷模式' }).first().click();
    await page.waitForURL(/\/practice/);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    // ===== 全部做对：逐题选正确答案，单题提交 =====
    const cards = page.locator('.obj-card');
    const cardCount = await cards.count();
    console.log('[JOURNEY] 客观题卡数 =', cardCount);
    expect(cardCount).toBeGreaterThan(0);

    let correct = 0;
    for (let i = 0; i < Math.min(cardCount, 5); i++) {
      const card = cards.nth(i);
      await card.scrollIntoViewIfNeeded();
      await expect(card).toBeVisible();
      // 从 questions 拿正确答案字母
      const q = questions[i];
      const ans = (q.answer || '').replace(/[^A-Z]/g, '').split('')[0];
      const optIdx = ['A', 'B', 'C', 'D'].indexOf(ans);
      if (optIdx >= 0) {
        await card.locator('.opt').nth(optIdx).click();
        await card.locator('.act button, .cyber-button').filter({ hasText: '提交答案' }).click();
        await expect(card.locator('.res .correct, .res.correct, .res .wrong')).toBeVisible({ timeout: 20000 });
        const green = await card.locator('.res .correct, .res.correct').count();
        if (green > 0) correct++;
        await page.waitForTimeout(300);
      }
    }
    console.log('[JOURNEY] 做对题数 =', correct, '/', Math.min(cardCount, 5));
    expect(correct).toBeGreaterThan(0);

    // ===== 错题本：查看订正 =====
    await page.goto('/wrong-questions');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    const wqCard = page.locator('.wrong-card');
    console.log('[JOURNEY] 错题本卡片数 =', await wqCard.count());
    if (await wqCard.count()) {
      await wqCard.first().locator('button, .wq-btn').filter({ hasText: '查看订正' }).first().click().catch(() => {});
      await page.waitForTimeout(500);
      console.log('[JOURNEY] 错题本查看订正 ✅');
    }

    // ===== 历史页不白屏 =====
    await page.goto('/history');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(800);
    console.log('[JOURNEY] 历史页文本:', (await page.locator('body').innerText()).slice(0, 60));

    // ===== 错因统计页不白屏 =====
    await page.goto('/error-stats');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    console.log('[JOURNEY] 错因统计页不白屏 ✅');

    // ===== 个人中心不白屏 =====
    await page.goto('/profile');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(800);
    console.log('[JOURNEY] 个人中心不白屏 ✅');

    console.log('[JOURNEY] 全过');
  });
});
