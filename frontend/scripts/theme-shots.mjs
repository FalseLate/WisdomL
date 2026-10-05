// scripts/theme-shots.mjs —— 双主题逐路由截图（不需要后端）
// 用法：node scripts/theme-shots.mjs dark shots/dark   或   light shots/light
// 与 tests/theme-visual.spec.js 的区别：这里用 localStorage 直接塞假登录态与题库，
// 所以 8080 不通也能出图，专门用来看"浅色是不是真的一套设计"。
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const theme = process.argv[2] || 'dark';
const outDir = process.argv[3] || `shots/theme-${theme}`;
const BASE = 'http://localhost:4173';

const QUESTIONS = {
  questions: [
    { id: 1, type: 'single', question: '下列哪一项是牛顿第二定律的正确表达？', options: { A: 'F=mv', B: 'F=ma', C: 'E=mc²', D: 'p=mv' }, answer: 'B', explanation: '加速度与合外力成正比。' },
    { id: 2, type: 'single', question: '关于惯性，下列说法正确的是？', options: { A: '速度越大惯性越大', B: '质量越大惯性越大', C: '惯性可以消失', D: '与质量无关' }, answer: 'B', explanation: '质量是惯性大小的量度。' },
    { id: 3, type: 'subjective', question: '简述作用力与反作用力的关系。', answer: '大小相等、方向相反、作用在两个物体上。', explanation: '牛顿第三定律。' }
  ]
};

const ROUTES = [
  ['home', '/'],
  ['login', '/login'],
  ['settings', '/settings'],
  ['lazy-practice', '/lazy-practice'],
  ['question-bank', '/question-bank'],
  ['history', '/history'],
  ['wrong-questions', '/wrong-questions'],
  ['profile', '/profile'],
  ['word-home', '/word/home'],
  ['word-my', '/word/my'],
  ['word-notebook', '/word/notebook'],
  ['english-wrong', '/word/english-wrong'],
  ['wiki', '/wiki/mine'],
  ['study-map', '/study-map'],
  ['reading-home', '/reading/home']
];

mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.addInitScript(([th, q, mo]) => {
  localStorage.setItem('token', 'fake-theme-shot');
  localStorage.setItem('user', JSON.stringify({ id: 1, username: 'shot', nickname: '截图' }));
  // 默认用 auto（= 用户实际看到的档位：深色霓虹、浅色关粒子）；SHOT_MOTION=neon 可强制开粒子
  localStorage.setItem('zhifuxi_a11y_v1', JSON.stringify({ feedback: { theme: th, motion: mo } }));
  localStorage.setItem('zhifuxi-questions', JSON.stringify(q));
}, [theme, QUESTIONS, process.env.SHOT_MOTION || 'auto']);
// 拦掉接口，避免后端不通时页面被错误 toast 打断
await page.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' })).catch(() => {});

for (const [name, path] of ROUTES) {
  await page.goto(BASE + path, { waitUntil: 'load' }).catch(() => {});
  await page.waitForSelector('.splash-screen', { state: 'detached', timeout: 9000 }).catch(() => {});
  await page.waitForTimeout(1400);
  await page.screenshot({ path: `${outDir}/${name}.png`, fullPage: true });
  console.log(`${theme}/${name}.png`);
}
await browser.close();
