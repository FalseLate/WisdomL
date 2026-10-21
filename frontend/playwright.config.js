// playwright.config.js —— 智复习 E2E 配置（frontend 根目录）
import { defineConfig, devices } from '@playwright/test';

// 默认行为不变（有头 Edge + 跑 preview 产物）。
// PW_HEADLESS=1 无头跑；PW_BASE 换地址（例如配合 npm run dev 的 5173，用 DEV 构建里的调试出口）。
const BASE = process.env.PW_BASE || 'http://localhost:4173';
const headless = process.env.PW_HEADLESS === '1';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: 'html',
  timeout: 120000,

  use: {
    baseURL: BASE,
    trace: 'on',
    headless,
    actionTimeout: 30000,
  },

  projects: [
    {
      name: 'local-edge',
      use: { ...devices['Desktop Edge'], channel: 'msedge' },
    },
  ],

  webServer: {
    command: process.env.PW_DEV ? 'npm run dev -- --port 5173' : 'npm run preview',
    url: BASE,
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
