// @ts-check
// 双主题运行时冒烟：逐路由（含队友页）在深浅两套下加载，断言无 JS 异常、页面确实渲染出内容。
// 颜色改造理论上不该触碰逻辑，这条就是把"没碰坏功能"变成可重复跑的证据。
// 后端不通也能跑：/api 全部用 route 兜底成空数据。
import { test, expect } from '@playwright/test';

const ROUTES = [
  '/', '/settings', '/lazy-practice', '/question-bank', '/history', '/wrong-questions',
  '/error-stats', '/collections', '/profile', '/login', '/register',
  '/word/home', '/word/my', '/word/book', '/word/plan', '/word/notebook',
  '/word/english-wrong', '/wiki/mine', '/study-map', '/reading/home', '/reading/article'
];
const EMPTY = {
  questions: [], sections: [], records: [], items: [], list: [], data: [],
  books: [], words: [], articles: [], notes: [], wrongQuestions: [], stats: {},
  total: 0, count: 0, percentage: 0
};

for (const theme of ['dark', 'light']) {
  test.describe(`运行时冒烟 · ${theme}`, () => {
    for (const route of ROUTES) {
      test(route, async ({ page }) => {
        const errors = [];
        page.on('pageerror', e => errors.push('pageerror: ' + e.message));
        page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 120)) });
        await page.addInitScript(([th]) => {
          localStorage.setItem('token', 'fake-runtime-check');
          localStorage.setItem('user', JSON.stringify({ id: 1, username: 'rt', nickname: '冒烟' }));
          localStorage.setItem('zhifuxi_a11y_v1', JSON.stringify({ feedback: { theme: th, motion: 'off' } }));
          localStorage.setItem('zhifuxi-questions', JSON.stringify({ questions: [{ id: 1, type: 'single', question: '1+1?', options: { A: '1', B: '2', C: '3', D: '4' }, answer: 'B', explanation: 'x' }] }));
          localStorage.setItem('lazy_gesture_tutorial_shown', '1');
        }, [theme]);
        await page.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(EMPTY) }));

        await page.goto(route, { waitUntil: 'load' });
        await page.waitForSelector('.splash-screen', { state: 'detached', timeout: 9000 }).catch(() => {});
        await page.waitForTimeout(1200);

        const seen = await page.evaluate(() => {
          let n = 0;
          for (const el of document.querySelectorAll('body *')) {
            if (el.closest('.pet-world')) continue;
            const r = el.getBoundingClientRect();
            if (r.width > 0 && r.height > 0) n++;
          }
          return { n, theme: document.documentElement.dataset.theme };
        });
        // 主题必须真的生效（否则浅色分支根本没被覆盖到）
        expect(seen.theme).toBe(theme);
        // 页面渲染出内容 = 组件没在挂载时抛错崩掉
        expect(seen.n, `${route} 只渲染了 ${seen.n} 个元素`).toBeGreaterThan(8);
        // 忽略后端不通必然产生的 401/网络类报错，只关心脚本异常
        const real = errors.filter(e => !/401|Network Error|Failed to load resource|Request failed with status/i.test(e));
        expect(real, real.join('\n')).toEqual([]);
      });
    }
  });
}
