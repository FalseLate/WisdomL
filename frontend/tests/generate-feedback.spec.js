// @ts-check
// 出题结果反馈：后端不通也能验——用 route 拦截 /api，断言"成功只弹一个框、失败一定看得见原因"。
// 背景：真机反馈"上传文档成功后既不弹生成成功、也不跳刷题"，根因是轮询静默失败（旧 pollTask 只 console.warn）。
import { test, expect } from '@playwright/test';

const AUTH = ['fake-token-for-generate-check', { id: 999, username: 'gen', nickname: '生成' }];

const OBJ = [
  { id: 1, type: 'single', question: '1+1=?', options: ['1', '2', '3', '4'], answer: 'B', explanation: '小学算术' },
  { id: 2, type: 'single', question: '2+2=?', options: ['3', '4', '5', '6'], answer: 'B', explanation: '还是算术' }
];

async function seed(page) {
  await page.addInitScript(([t, u]) => {
    localStorage.setItem('token', t);
    localStorage.setItem('user', JSON.stringify(u));
  }, AUTH);
}

async function openTextGenerate(page) {
  await page.goto('/');
  await page.waitForSelector('.section-more');
  await page.locator('.section-more').first().click();
  await page.waitForSelector('.cyber-textarea');
  await page.locator('.cyber-textarea').fill('第一章 牛顿运动定律：F=ma，惯性参考系……');
}

test.describe('出题结果反馈', () => {
  test('成功：只弹一个完成弹窗，点「立即刷题」跳到题库', async ({ page }) => {
    await seed(page);
    await page.route('**/api/generate-async', r => r.fulfill({ json: { taskId: 'tk-ok' } }));
    await page.route('**/api/task/tk-ok', r => r.fulfill({
      json: { status: 'completed', totalCount: OBJ.length, objectiveQuestions: OBJ, subjectiveQuestions: [] }
    }));
    await openTextGenerate(page);
    await page.locator('.generate-container button').filter({ hasText: /生成题目/ }).click();

    await page.waitForSelector('.dialog-overlay .dialog-title', { timeout: 20000 });
    const overlays = await page.locator('.dialog-overlay, .complete-dialog-overlay').count();
    const title = await page.locator('.dialog-overlay .dialog-title').first().innerText();
    console.log('[GEN-OK] 弹窗数 =', overlays, '标题 =', title);
    expect(overlays).toBe(1);
    expect(title).toContain('出题完成');
    await page.screenshot({ path: 'shots/generate-success.png' });

    await page.locator('.dialog-actions button').filter({ hasText: /立即刷题/ }).click();
    await page.waitForURL(/question-bank/, { timeout: 15000 });
    console.log('[GEN-OK] 跳转后 URL =', page.url());
  });

  test('轮询查不到任务：失败原因以常驻弹窗写出来，不是一闪而过的 toast', async ({ page }) => {
    await seed(page);
    await page.route('**/api/generate-async', r => r.fulfill({ json: { taskId: 'tk-gone' } }));
    await page.route('**/api/task/tk-gone', r => r.fulfill({ status: 404, json: { error: '任务不存在' } }));
    await openTextGenerate(page);
    await page.locator('.generate-container button').filter({ hasText: /生成题目/ }).click();

    // 连续 5 次查询失败才判死（每 2 秒一次），留出余量
    await page.waitForSelector('.dialog-overlay .dialog-title', { timeout: 30000 });
    const title = await page.locator('.dialog-overlay .dialog-title').first().innerText();
    const body = await page.locator('.dialog-overlay').first().innerText();
    console.log('[GEN-FAIL] 标题 =', title, '| 正文 =', body.replace(/\n+/g, ' / '));
    expect(title).toContain('出题未完成');
    expect(body).toContain('任务不存在');
    await page.screenshot({ path: 'shots/generate-fail.png' });

    // 关掉后不应残留"生成中"浮动条
    await page.locator('.dialog-actions button').filter({ hasText: /知道了/ }).click();
    await page.waitForTimeout(400);
    expect(await page.locator('.global-loading-bar').count()).toBe(0);
  });

  test('生成中离开页面：轮询继续，完成时在任意页面弹全局完成提示', async ({ page }) => {
    await seed(page);
    let polls = 0;
    await page.route('**/api/generate-async', r => r.fulfill({ json: { taskId: 'tk-slow' } }));
    await page.route('**/api/task/tk-slow', r => {
      polls++;
      // 先在 running 停两轮，确保用户有时间离开首页
      if (polls < 3) return r.fulfill({ json: { status: 'running' } });
      return r.fulfill({
        json: { status: 'completed', totalCount: OBJ.length, objectiveQuestions: OBJ, subjectiveQuestions: [] }
      });
    });
    await openTextGenerate(page);
    await page.locator('.generate-container button').filter({ hasText: /生成题目/ }).click();
    await page.waitForSelector('.global-loading-bar');
    await page.waitForTimeout(2500);
    const before = polls;

    // 用站内路由离开首页，模拟“边刷题/边看星图边生成”。
    await page.locator('.navbar-left').first().click();
    await page.locator('.icon-btn[aria-label="设置"]').click();
    await page.waitForURL(/settings/, { timeout: 10000 });

    // 离开后轮询必须继续，而不是像旧版那样 abort
    await page.waitForTimeout(3000);
    console.log('[GEN-BG] 离开前 =', before, '| 离开后 =', polls);
    expect(polls).toBeGreaterThan(before);

    // 任务完成时已经不在首页，App 应弹全局主题完成框
    await expect(page.locator('.gen-complete-overlay .dialog-title')).toHaveText('出题完成', { timeout: 20000 });
    await expect(page.locator('.gen-complete-overlay .ds-num').first()).toHaveText('2');
    await page.screenshot({ path: 'shots/generate-background-done.png' });
    await page.locator('.dialog-actions button').filter({ hasText: /立即刷题/ }).click();
    await page.waitForURL(/question-bank/, { timeout: 15000 });
    await expect(page.locator('.global-loading-bar')).toHaveCount(0);
  });
});
