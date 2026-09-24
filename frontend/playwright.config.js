// playwright.config.js —— 智复习 E2E 配置（frontend 根目录）
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: 'html',
  timeout: 120000,

  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on',
    headless: false,
    actionTimeout: 30000,
  },

  projects: [
    {
      name: 'local-edge',
      use: { ...devices['Desktop Edge'], channel: 'msedge' },
    },
  ],

  webServer: {
    command: 'npm run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
