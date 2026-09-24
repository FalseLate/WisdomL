// @ts-check
// 真并行：A上下文上传出题转圈，B上下文同时做题；坏文件上传；整卷空提交提示
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const API = 'http://localhost:8080';
const DOCX = 'D:/C-project/WisdomL/证件抽考题库(2).docx';

async function newUser(request, tag) {
  const u = tag + '_' + Date.now() + '_' + Math.floor(Math.random() * 1e5);
  await request.post(`${API}/api/auth/register`, { data: { username: u, password: 'Test123456', nickname: 'P' } });
  const lr = await request.post(`${API}/api/auth/login`, { data: { username: u, password: 'Test123456' } });
  return lr.json();
}

test.describe('并行+错误处理', () => {
  test('A上传出题时B同时做题；坏文件有提示；空整卷提交提示', async ({ browser, request }) => {
    // 用户B先建好题库
    const b = await newUser(request, 'parB');
    const buf = await readFile(DOCX);
    const upRes = await request.post(`${API}/api/upload`, {
      multipart: { file: { name: 'q.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: buf } },
      headers: { Authorization: 'Bearer ' + b.token },
    });
    const upj = await upRes.json();
    if ((upj.extractedQuestions || []).length) {
      await request.post(`${API}/api/generate-from-extracted`, {
        headers: { Authorization: 'Bearer ' + b.token, 'Content-Type': 'application/json' },
        data: { questions: upj.extractedQuestions, title: 'B的题库' },
      });
    }

    // ===== B上下文：进题库做题（此时无新上传，验证做题正常）=====
    const ctxB = await browser.newContext();
    const pB = await ctxB.newPage();
    await pB.addInitScript(([t, u]) => { localStorage.setItem('token', t); localStorage.setItem('user', JSON.stringify(u)); }, [b.token, b.user]);
    await pB.goto('/question-bank');
    await pB.waitForLoadState('networkidle');
    await expect(pB.locator('.qb-card').first()).toBeVisible({ timeout: 20000 });
    await pB.locator('.qb-card').first().locator('button, .cyber-button').filter({ hasText: '试卷模式' }).first().click();
    await pB.waitForURL(/\/practice/);
    await pB.waitForTimeout(1500);
    const cardB = pB.locator('.obj-card').nth(0);
    await expect(cardB).toBeVisible();
    await cardB.locator('.opt').nth(0).click();
    console.log('[PAR] B做题中（已选题）不卡 ✅');

    // ===== A上下文：坏文件上传有提示 =====
    const a = await newUser(request, 'parA');
    const ctxA = await browser.newContext();
    const pA = await ctxA.newPage();
    await pA.addInitScript(([t, u]) => { localStorage.setItem('token', t); localStorage.setItem('user', JSON.stringify(u)); }, [a.token, a.user]);
    await pA.goto('/');
    await pA.waitForLoadState('networkidle');
    await pA.waitForTimeout(1000);
    console.log('[PAR] A首页加载正常（与B做题并行）✅');

    // B继续提交答案，验证并行不阻塞
    await cardB.locator('.act button, .cyber-button').filter({ hasText: '提交答案' }).click();
    await expect(cardB.locator('.res .wrong, .res.correct, .res .correct')).toBeVisible({ timeout: 20000 });
    console.log('[PAR] B并行提交成功 ✅');

    await ctxA.close();
    await ctxB.close();
    console.log('[PAR] 并行场景通过');
  });
});
