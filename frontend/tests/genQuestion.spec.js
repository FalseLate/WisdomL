// @ts-check
// E2E: 上传 test.pdf → 开始出题 → 断言生成题目卡片
// 运行: npx playwright test tests/genQuestion.spec.js
import { test, expect } from '@playwright/test';

const API = 'http://localhost:8080';
const PDF_PATH = 'test.pdf';

test.describe('文档上传出题 E2E', () => {
  let token = '';
  let user = null;

  test.beforeAll(async ({ request }) => {
    const uname = 'e2e_' + Date.now();
    await request.post(`${API}/api/auth/register`, {
      data: { username: uname, password: 'Test123456', nickname: 'E2E' },
    });
    const res = await request.post(`${API}/api/auth/login`, {
      data: { username: uname, password: 'Test123456' },
    });
    const body = await res.json();
    token = body.token;
    user = body.user;
    console.log('[E2E] 登录成功 user=', uname);
  });

  test('上传PDF→出题→题库出现题目卡片', async ({ page }) => {
    // 注入登录态（auth.js 启动时读 localStorage.token）
    await page.addInitScript(
      ([t, u]) => {
        localStorage.setItem('token', t);
        localStorage.setItem('user', JSON.stringify(u));
      },
      [token, user],
    );

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // 1. 首页点 FILE 卡片进入出题模式（openGenerate('file') → activeTab=2）
    await page.locator('.func-card', { hasText: 'FILE' }).first().click();
    await expect(page.locator('.tab-item', { hasText: '上传文件' }).first()).toBeVisible({ timeout: 15000 });

    // 2. 上传 test.pdf（隐藏 file input 可直接 setInputFiles）
    await page.locator('input[type="file"]').setInputFiles(PDF_PATH);

    // 2.5 点击“上传并解析”按钮，触发真实 /upload
    const uploadBtn = page.locator('button, .cyber-button').filter({ hasText: '上传并解析' }).first();
    await expect(uploadBtn).toBeVisible({ timeout: 15000 });
    await uploadBtn.click();

    // 3. 等待解析完成：章节卡片出现
    await expect(page.locator('.file-card, .section-list').first()).toBeVisible({ timeout: 60000 });

    // 4. 勾选章节（直接点章节条目；.section-item 点击即 toggleSec）
    const secItem = page.locator('.section-item').first();
    await secItem.click();
    await expect(page.locator('.section-item.checked').first()).toBeVisible({ timeout: 10000 });

    // 5. 点击“开始生成”（按钮需在章节选中后才 enabled）
    const genBtn = page.locator('.gen-btn').first();
    await expect(genBtn).toBeEnabled({ timeout: 10000 });
    await genBtn.click();

    // 6. 等待 AI 出题（后端实测约 40s；任务完成后题目入库）
    test.setTimeout(360000);
    await page.waitForTimeout(60000);

    // 7. 直达题库页断言题目卡片（后端已确认题目入库）
    await page.goto('/question-bank');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('.qb-card').first()).toBeVisible({ timeout: 30000 });

    const cardCount = await page.locator('.qb-card').count();
    console.log('[E2E] 题库题目卡片数 =', cardCount);
    expect(cardCount, '题库应出现题目卡片').toBeGreaterThan(0);
  });
});
