// @ts-check
// 草稿双向互通：懒人做2题→试卷模式看已选；试卷做→懒人模式看已做；各自刷新草稿保留；摄像头开关
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const API = 'http://localhost:8080';
const DOCX = 'D:/C-project/WisdomL/证件抽考题库(2).docx';

async function setupUser(request) {
  const u = 'drft_' + Date.now() + '_' + Math.floor(Math.random() * 1e5);
  await request.post(`${API}/api/auth/register`, { data: { username: u, password: 'Test123456', nickname: 'D' } });
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

test.describe('草稿互通 + 摄像头开关', () => {
  test('懒人做2题→试卷模式回显；试卷做题→懒人回显；刷新保留；摄像头开关', async ({ page, request, context }) => {
    const { token, user } = await setupUser(request);
    await context.grantPermissions(['camera'], { origin: 'http://localhost:4173' });

    await page.addInitScript(([t, u]) => {
      localStorage.setItem('token', t);
      localStorage.setItem('user', JSON.stringify(u));
    }, [token, user]);

    // ===== 进懒人模式 =====
    await page.goto('/question-bank');
    await page.waitForLoadState('networkidle');
    await page.locator('.qb-card').first().locator('button, .cyber-button').filter({ hasText: '懒人模式' }).first().click();
    await page.waitForURL(/\/lazy-practice/);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    // 第1题选 A（.lp-option nth(0)）
    const lpOpt = page.locator('.lp-option');
    await expect(lpOpt.first()).toBeVisible({ timeout: 15000 });
    await lpOpt.nth(0).click();
    await expect(lpOpt.nth(0)).toHaveClass(/selected/);
    console.log('[DRAFT] 懒人第1题选 A ✅');

    // 切到第2题（右箭头），选 B
    await page.locator('.lp-arrow.right').click();
    await page.waitForTimeout(500);
    await page.locator('.lp-option').nth(1).click();
    await expect(page.locator('.lp-option').nth(1)).toHaveClass(/selected/);
    console.log('[DRAFT] 懒人第2题选 B ✅');

    // ===== 切试卷模式：返回题库再点试卷模式 =====
    await page.goto('/question-bank');
    await page.waitForLoadState('networkidle');
    await page.locator('.qb-card').first().locator('button, .cyber-button').filter({ hasText: '试卷模式' }).first().click();
    await page.waitForURL(/\/practice/);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // 试卷模式第1题 A 应已选中（.opt.active）
    const card1 = page.locator('.obj-card').nth(0);
    await expect(card1).toBeVisible({ timeout: 15000 });
    await expect(card1.locator('.opt').nth(0)).toHaveClass(/active/, { timeout: 5000 });
    console.log('[DRAFT] 试卷模式回显懒人第1题已选 A ✅');
    // 第2题 B 已选
    await expect(page.locator('.obj-card').nth(1).locator('.opt').nth(1)).toHaveClass(/active/, { timeout: 3000 });
    console.log('[DRAFT] 试卷模式回显懒人第2题已选 B ✅');

    // 试卷模式再做第3题选 C（不提交，仅草稿）
    const card3 = page.locator('.obj-card').nth(2);
    await card3.locator('.opt').nth(2).click();
    await expect(card3.locator('.opt').nth(2)).toHaveClass(/active/);
    console.log('[DRAFT] 试卷模式第3题选 C（未提交）✅');

    // ===== 反向切回懒人模式：第3题应已做（题号导航 done 或选项 selected）=====
    await page.goto('/question-bank');
    await page.waitForLoadState('networkidle');
    await page.locator('.qb-card').first().locator('button, .cyber-button').filter({ hasText: '懒人模式' }).first().click();
    await page.waitForURL(/\/lazy-practice/);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);
    // 跳到第3题（题号导航展开点第3个 dot）
    await page.locator('.lp-nav-toggle').click();
    await page.locator('.nav-dot').nth(2).click();
    await page.waitForTimeout(500);
    // 第3题 C 应 selected
    await expect(page.locator('.lp-option').nth(2)).toHaveClass(/selected/, { timeout: 5000 });
    console.log('[DRAFT] 懒人模式回显试卷第3题已选 C ✅');

    // ===== 刷新懒人模式：草稿保留 =====
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    await expect(page.locator('.lp-option').first()).toBeVisible();
    // 首题应仍选 A
    await expect(page.locator('.lp-option').nth(0)).toHaveClass(/selected/, { timeout: 5000 });
    console.log('[DRAFT] 懒人刷新后草稿保留 ✅');

    // ===== 摄像头开关：点 📷 → 手势开；再点 → 关 =====
    const toggle = page.locator('.lp-gesture-toggle');
    await expect(toggle).toContainText(/手势：关/);
    await toggle.click();
    await expect(toggle).toContainText(/手势：开/);
    // 首次开启应弹教程（或至少 HUD 出现）
    await page.waitForTimeout(800);
    const hudVisible = await page.locator('.tutorial-overlay, .gesture-hud, [class*="hud"]').first().isVisible().catch(() => false);
    console.log('[DRAFT] 摄像头开启，教程/HUD 出现:', hudVisible);
    // 首次教程弹窗会遮挡按钮，先关掉
    if (await page.locator('.tutorial-overlay').isVisible().catch(() => false)) {
      await page.locator('.tutorial-close').click();
      await page.waitForTimeout(300);
    }
    // 再点关闭
    await toggle.click();
    await expect(toggle).toContainText(/手势：关/);
    await page.waitForTimeout(500);
    console.log('[DRAFT] 摄像头关闭 ✅');

    console.log('[DRAFT] 草稿互通 + 摄像头开关 全链路完成');
  });
});
