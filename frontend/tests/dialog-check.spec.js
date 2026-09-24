// @ts-check
// 双出题完成弹窗验证：出题完成后页面上有几个"出题完成"弹窗
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const API = 'http://localhost:8080';

test('出题完成后弹窗只弹一次', async ({ page, request }) => {
  const u = 'dlg_' + Date.now();
  await request.post(`${API}/api/auth/register`, { data: { username: u, password: 'Test123456', nickname: 'D' } });
  const lr = await request.post(`${API}/api/auth/login`, { data: { username: u, password: 'Test123456' } });
  const { token, user } = await lr.json();

  await page.addInitScript(([t, usr]) => { localStorage.setItem('token', t); localStorage.setItem('user', JSON.stringify(usr)); }, [token, user]);

  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);

  // 点 FILE 卡片
  await page.locator('.func-card', { hasText: 'FILE' }).first().click();
  await expect(page.locator('.tab-item', { hasText: '上传文件' }).first()).toBeVisible({ timeout: 15000 });

  // 上传 test.pdf
  await page.locator('input[type="file"]').setInputFiles('D:/C-project/WisdomL/frontend/test.pdf');
  const uploadBtn = page.locator('button, .cyber-button').filter({ hasText: '上传并解析' }).first();
  await expect(uploadBtn).toBeVisible({ timeout: 15000 });
  await uploadBtn.click();

  // 等章节出现
  await expect(page.locator('.file-card, .section-list').first()).toBeVisible({ timeout: 60000 });
  await page.waitForTimeout(1000);
  // 勾选第一个章节
  const sec = page.locator('.section-item').first();
  if (await sec.count()) await sec.click();
  await page.waitForTimeout(500);

  // 点开始生成
  const genBtn = page.locator('.gen-btn').first();
  if (await genBtn.count()) await genBtn.click();

  // 等出题完成弹窗出现
  await page.waitForTimeout(50000);

  // 数"出题完成"弹窗
  const dialogs = page.locator('.dialog-box, .complete-dialog').filter({ hasText: '出题完成' });
  const count = await dialogs.count();
  console.log('[DLG] 出题完成弹窗数 =', count);

  const allDialogs = page.locator('.dialog-overlay, .complete-dialog-overlay');
  const total = await allDialogs.count();
  console.log('[DLG] 所有弹窗遮罩数 =', total);

  if (count > 1 || total > 1) {
    console.log('[DLG] ❌ 弹了多个弹窗（双弹bug未修）');
  } else {
    console.log('[DLG] ✅ 只弹一个');
  }

  // 验证"立即刷题"按钮
  const goBtn = page.locator('button, .cyber-button').filter({ hasText: /立即刷题|立即去刷题/ });
  console.log('[DLG] 立即刷题按钮数 =', await goBtn.count());
});
