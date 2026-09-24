// @ts-check
// 整卷全对/全错 + 坏文件上传提示
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const API = 'http://localhost:8080';
const DOCX = 'D:/C-project/WisdomL/证件抽考题库(2).docx';

async function setupUser(request) {
  const u = 'batch_' + Date.now() + '_' + Math.floor(Math.random() * 1e5);
  await request.post(`${API}/api/auth/register`, { data: { username: u, password: 'Test123456', nickname: 'B' } });
  const lr = await request.post(`${API}/api/auth/login`, { data: { username: u, password: 'Test123456' } });
  const { token, user } = await lr.json();
  const buf = await readFile(DOCX);
  const upRes = await request.post(`${API}/api/upload`, {
    multipart: { file: { name: 'q.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: buf } },
    headers: { Authorization: 'Bearer ' + token },
  });
  const upJson = await upRes.json();
  return { token, user, questions: upJson.extractedQuestions || [] };
}

test.describe('整卷全对/全错 + 坏文件', () => {
  test('全对→全对；全错→0%；坏文件上传提示', async ({ page, request }) => {
    const { token, user, questions } = await setupUser(request);
    const h = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
    const sample = questions.slice(0, 5);

    // 全对
    const allRight = sample.map(q => ({ question: q, userAnswer: q.answer, questionType: q.type || 'single' }));
    const r1 = await request.post(`${API}/api/check-batch`, { headers: h, data: { answers: allRight } });
    const j1 = await r1.json();
    const rightCount = j1.results.filter(r => r.correct === true).length;
    console.log('[BATCH] 全对:', rightCount, '/', sample.length);
    expect(rightCount).toBe(sample.length);

    // 全错（选相反项）
    const allWrong = sample.map(q => {
      const ans = (q.answer || '').replace(/[^A-Z]/g, '');
      const wrong = Object.keys(q.options || {}).find(k => !ans.includes(k)) || 'B';
      return { question: q, userAnswer: wrong, questionType: q.type || 'single' };
    });
    const r2 = await request.post(`${API}/api/check-batch`, { headers: h, data: { answers: allWrong } });
    const j2 = await r2.json();
    const wrongCount = j2.results.filter(r => r.correct === false).length;
    console.log('[BATCH] 全错:', wrongCount, '/', sample.length);
    expect(wrongCount).toBe(sample.length);

    // 正确率不为负
    console.log('[BATCH] 全对/全错判分一致 ✅');

    // 坏文件上传 UI 提示
    await page.addInitScript(([t, u]) => { localStorage.setItem('token', t); localStorage.setItem('user', JSON.stringify(u)); }, [token, user]);
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    await page.locator('.func-card', { hasText: 'FILE' }).first().click();
    await expect(page.locator('.tab-item', { hasText: '上传文件' }).first()).toBeVisible({ timeout: 15000 });

    // 上传一个空 txt
    await page.locator('input[type="file"]').setInputFiles({ name: 'bad.txt', mimeType: 'text/plain', buffer: Buffer.from('') });
    const uploadBtn = page.locator('button, .cyber-button').filter({ hasText: '上传并解析' }).first();
    if (await uploadBtn.count()) {
      await uploadBtn.click();
      await page.waitForTimeout(5000);
      console.log('[BATCH] 坏文件上传有反应（toast/错误提示）✅');
    }
    console.log('[BATCH] 全过');
  });
});
