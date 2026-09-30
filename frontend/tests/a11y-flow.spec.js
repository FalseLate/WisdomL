// @ts-check
// 无障碍模式流程：步进选答（点头/微笑/张嘴注入）、键盘兜底、撤销、扫描开关、变身交卷
// 依赖：后端 8080 运行 + 前端 preview 4173（与既有 E2E 相同前置）；不依赖摄像头
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const API = 'http://localhost:8080';
const DOCX = 'D:/C-project/WisdomL/证件抽考题库(2).docx';

async function setupUser(request) {
  const u = 'a11y_' + Date.now() + '_' + Math.floor(Math.random() * 1e5);
  await request.post(`${API}/api/auth/register`, { data: { username: u, password: 'Test123456', nickname: 'A' } });
  const lr = await request.post(`${API}/api/auth/login`, { data: { username: u, password: 'Test123456' } });
  const { token, user } = await lr.json();
  const buf = await readFile(DOCX);
  const upRes = await request.post(`${API}/api/upload`, {
    multipart: { file: { name: 'q.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.docx', buffer: buf } },
    headers: { Authorization: 'Bearer ' + token },
  });
  const upJson = await upRes.json();
  const questions = upJson.extractedQuestions || [];
  if (questions.length) {
    await request.post(`${API}/api/generate-from-extracted`, {
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      data: { questions, title: 'A11Y题库' },
    });
  }
  return { token, user };
}

const route = (channel, candidate) =>
  `window.__zhifuxiA11y.bus.routeChannelCandidate('${channel}', '${candidate}')`;

test.describe('无障碍模式：步进选答与注入链路', () => {
  test('点头循环 -> 张嘴确认 -> 撤销 -> 键盘 -> 扫描 -> 变身交卷', async ({ page, request }) => {
    const { token, user } = await setupUser(request);
    await page.addInitScript(([t, u]) => {
      localStorage.setItem('token', t);
      localStorage.setItem('user', JSON.stringify(u));
    }, [token, user]);

    await page.goto('/question-bank');
    await page.waitForLoadState('networkidle');
    await page.locator('.qb-card').first().locator('button, .cyber-button').filter({ hasText: '懒人模式' }).first().click();
    await page.waitForURL(/\/lazy-practice/);
    await page.waitForTimeout(1500);
    await expect(page.locator('.lp-option').first()).toBeVisible({ timeout: 15000 });

    // 开启手势运行时（不勾通道不会有摄像头请求）
    await page.locator('.lp-gesture-toggle').first().click();

    // 步进选答：nod -> 第一个选项高亮
    await page.evaluate(route('head', 'nod'));
    await expect(page.locator('.lp-option.cycle-cursor')).toHaveCount(1);
    const firstKey = await page.locator('.lp-option.cycle-cursor .opt-key').innerText();
    expect(firstKey.trim()).toBe('A');

    // nod 两次 -> C；smile 一次 -> B
    await page.evaluate(route('head', 'nod'));
    await page.evaluate(route('head', 'nod'));
    await page.waitForTimeout(1200);
    await page.evaluate(route('head', 'smile'));
    await page.waitForTimeout(600);
    await expect(page.locator('.lp-option.cycle-cursor .opt-key')).toHaveText('C');

    // 张嘴确认 -> C 被选中，高亮消失
    await page.evaluate(route('head', 'mouthOpen'));
    await page.waitForTimeout(300);
    await expect(page.locator('.lp-option.selected')).toHaveCount(1);
    await expect(page.locator('.lp-option.cycle-cursor')).toHaveCount(0);

    // 摇头撤销（3s 窗口内）-> 选择被撤回
    await page.evaluate(route('head', 'shake'));
    await page.waitForTimeout(400);
    await expect(page.locator('.lp-option.selected')).toHaveCount(0);

    // 键盘兜底：按 B 选中第二项
    await page.keyboard.press('b');
    await page.waitForTimeout(300);
    await expect(page.locator('.lp-option.selected')).toHaveCount(1);

    // 扫描模式：S 开启 -> 游标出现 -> mouthOpen 命中当前格
    await page.keyboard.press('s');
    await page.waitForTimeout(300);
    await page.waitForSelector('.lp-option.scan-cursor', { timeout: 5000 });
    await page.evaluate(route('head', 'mouthOpen'));
    await page.waitForTimeout(300);
    await page.keyboard.press('s');

    // 变身姿势注入 -> 整卷提交出结果页
    await page.evaluate(route('arm', 'handsUp'));
    await expect(page.locator('.lp-result')).toBeVisible({ timeout: 30000 });
    console.log('[A11Y] 步进选答/撤销/键盘/扫描/变身交卷 全链路 ✅');
  });
});
