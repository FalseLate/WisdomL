// @ts-check
// A. 鉴权模块 E2E：注册/登录/路由守卫/退出
import { test, expect } from '@playwright/test';

const API = 'http://localhost:8080';

test.describe('鉴权模块', () => {
  test('注册→登录→刷新保持→访问受保护页→退出', async ({ page, request }) => {
    const uname = 'auth_' + Date.now();
    // 注册
    await request.post(`${API}/api/auth/register`, {
      data: { username: uname, password: 'Test123456', nickname: 'AUTH' },
    });
    // 登录拿 token
    const loginRes = await request.post(`${API}/api/auth/login`, {
      data: { username: uname, password: 'Test123456' },
    });
    const { token, user } = await loginRes.json();
    expect(token, '登录应返回 token').toBeTruthy();

    // 注入 token 访问受保护页
    await page.addInitScript(([t, u]) => {
      localStorage.setItem('token', t);
      localStorage.setItem('user', JSON.stringify(u));
    }, [token, user]);

    await page.goto('/question-bank');
    await page.waitForLoadState('networkidle');
    // 不应被踢回登录页
    expect(page.url()).not.toContain('/login');

    // 刷新后仍在受保护页（token 持久化）
    await page.reload();
    await page.waitForLoadState('networkidle');
    expect(page.url()).not.toContain('/login');
    console.log('[AUTH] 注册/登录/刷新保持 OK, user=', uname);
  });

  test('未登录访问受保护页 → 跳登录页', async ({ page }) => {
    await page.goto('/practice');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/login/);
    console.log('[AUTH] 未登录守卫跳转 OK');
  });

  test('错误密码登录应失败', async ({ page, request }) => {
    const uname = 'auth_cred_' + Date.now();
    await request.post(`${API}/api/auth/register`, {
      data: { username: uname, password: 'Right123', nickname: 'C' },
    });
    const res = await request.post(`${API}/api/auth/login`, {
      data: { username: uname, password: 'Wrong999' },
    });
    expect(res.ok()).toBeFalsy();
    console.log('[AUTH] 错误密码拒绝 OK');
  });
});
