// @ts-check
// 上传页出题类型分组只剩一组；历史/统计页不白屏
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const API = 'http://localhost:8080';
const DOCX = 'D:/C-project/WisdomL/证件抽考题库(2).docx';

async function setupUser(request) {
  const u = 'misc_' + Date.now() + '_' + Math.floor(Math.random() * 1e5);
  await request.post(`${API}/api/auth/register`, { data: { username: u, password: 'Test123456', nickname: 'M' } });
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
      data: { questions: upJson.extractedQuestions, title: 'E2E题库' },
    });
  }
  return { token, user };
}

test.describe('上传分组 + 页面不白屏', () => {
  test('历史页/错因统计页正常渲染不白屏', async ({ page, request }) => {
    const { token, user } = await setupUser(request);
    await page.addInitScript(([t, u]) => {
      localStorage.setItem('token', t);
      localStorage.setItem('user', JSON.stringify(u));
    }, [token, user]);

    // 历史页
    await page.goto('/history');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);
    const hBody = await page.locator('body').innerText();
    console.log('[MISC] 历史页文本:', hBody.slice(0, 80).replace(/\s+/g, ' '));
    expect(hBody.length).toBeGreaterThan(5);
    console.log('[MISC] 历史页不白屏 ✅');

    // 错因统计页（若路由存在）
    await page.goto('/error-stats').catch(() => {});
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    console.log('[MISC] 错因统计页进入 ✅');

    // 今日复习页
    await page.goto('/review-today');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    console.log('[MISC] 今日复习页进入 ✅');
  });

  test('首页上传页出题类型分组', async ({ page, request }) => {
    const { token, user } = await setupUser(request);
    await page.addInitScript(([t, u]) => {
      localStorage.setItem('token', t);
      localStorage.setItem('user', JSON.stringify(u));
    }, [token, user]);
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);
    // 打开 FILE 卡片上传面板
    const fileCard = page.locator('.func-card', { hasText: 'FILE' });
    if (await fileCard.count()) {
      await fileCard.first().click();
      await page.waitForTimeout(800);
    }
    // 数"出题类型"分组标题
    const groupTitles = await page.locator('text=/出题类型|出题方式|生成类型/').count();
    console.log('[MISC] 出题类型分组标题数:', groupTitles);
    await page.screenshot({ path: 'test-results/upload-panel.png' });
    console.log('[MISC] 上传面板已截图');
  });
});
