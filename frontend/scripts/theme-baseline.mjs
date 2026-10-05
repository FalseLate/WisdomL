// scripts/theme-baseline.mjs —— 主题改造的回归守卫
//
// 为什么需要它：把深色写死的字面量换成 token、或给浅色加覆盖时，最容易出的事故是
// "深色悄悄变了"。肉眼看不出来，但直方图会：遍历路由，把每个可见元素算出来的
// color / backgroundColor / borderColor / boxShadow / textShadow 值做频次统计，
// 改造前后各存一份 JSON，diff 必须为空。
//
// 用法（需要 npm run preview 在 4173 上跑着）：
//   node scripts/theme-baseline.mjs dark  shots/base-dark.json
//   node scripts/theme-baseline.mjs light shots/base-light.json
//   node scripts/theme-baseline.mjs dark  shots/after-dark.json --diff shots/base-dark.json
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';

const BASE = 'http://localhost:4173';
// 覆盖自家 + 队友两类页面；后端不通也能跑（数据请求失败只影响空状态，不影响颜色统计）
const ROUTES = [
  '/', '/login', '/register', '/settings', '/lazy-practice', '/question-bank',
  '/history', '/wrong-questions', '/error-stats', '/collections', '/profile',
  '/word/home', '/word/my', '/word/book', '/word/plan', '/word/notebook', '/word/english-wrong',
  '/wiki/mine', '/study-map', '/reading/home'
];
const PROPS = ['color', 'backgroundColor', 'borderTopColor', 'boxShadow', 'textShadow'];

const [theme = 'dark', out = 'shots/theme-baseline.json', ...rest] = process.argv.slice(2);
const diffIdx = rest.indexOf('--diff');
const diffFile = diffIdx >= 0 ? rest[diffIdx + 1] : null;

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.addInitScript(([th]) => {
  localStorage.setItem('token', 'fake-theme-baseline');
  localStorage.setItem('user', JSON.stringify({ id: 1, username: 'tb', nickname: 'TB' }));
  localStorage.setItem('zhifuxi_a11y_v1', JSON.stringify({ feedback: { theme: th } }));
}, [theme]);

const report = { theme, viewport: '390x844', routes: {} };
for (const route of ROUTES) {
  await page.goto(BASE + route, { waitUntil: 'load' }).catch(() => {});
  // 每次 goto 都会重播 2.5 秒开场动画，而 router-view 在它期间是 v-show=false（尺寸为 0）
  // → 不等到它消失就会随机量成"过场页"，直方图必然抖动
  await page.waitForSelector('.splash-screen', { state: 'detached', timeout: 9000 }).catch(() => {});
  await page.waitForTimeout(1200);
  const data = await page.evaluate((props) => {
    const hist = {};
    for (const p of props) hist[p] = {};
    const nodes = document.querySelectorAll('body *');
    let visible = 0;
    for (const el of nodes) {
      // 虚拟人（pet-tutor）的加载小 chip 按模型就绪时间出现/消失，会让直方图随机抖动，
      // 且它自成一套配色、不参与主题改造 → 排除整棵子树
      if (el.closest('.pet-world')) continue;
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      if (getComputedStyle(el).visibility === 'hidden') continue;
      visible++;
      const cs = getComputedStyle(el);
      for (const p of props) {
        const v = cs[p];
        if (!v || v === 'none' || v === 'normal') continue;
        hist[p][v] = (hist[p][v] || 0) + 1;
      }
    }
    // :root 上解析出来的自定义属性（token 实际取值）
    const tokens = {};
    const rs = getComputedStyle(document.documentElement);
    for (const name of Array.from(rs)) {
      if (name.startsWith('--')) tokens[name] = rs.getPropertyValue(name).trim();
    }
    return { visible, hist, tokens, dataTheme: document.documentElement.dataset.theme, mounted: !!document.querySelector('#app > *') };
  }, PROPS);
  // 服务没起来时浏览器渲染的是"无法访问此网站"错误页，颜色统计会全 0 却"看起来 diff 通过" → 必须硬失败
  if (!data.mounted || data.dataTheme !== theme) {
    console.error(`!! ${route} 页面没正常加载（data-theme=${data.dataTheme}，挂载=${data.mounted}）—— preview 服务是否起着？`);
    await browser.close();
    process.exit(2);
  }
  report.routes[route] = data;
}
await browser.close();

// 频次表排序，保证 JSON 可 diff
for (const r of Object.values(report.routes)) {
  for (const p of Object.keys(r.hist)) {
    r.hist[p] = Object.fromEntries(Object.entries(r.hist[p]).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
  }
}
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(report, null, 1));
console.log(`已写出 ${out}（${theme}，${ROUTES.length} 个路由）`);

if (diffFile) {
  const base = JSON.parse(readFileSync(diffFile, 'utf8'));
  const newTokens = new Set();
  let bad = 0;
  for (const route of ROUTES) {
    const a = base.routes[route], b = report.routes[route];
    if (!a || !b) { console.log(`[${route}] 一侧缺失（新增路由，跳过）`); continue }
    const deltas = [];
    for (const p of PROPS) {
      const keys = new Set([...Object.keys(a.hist[p]), ...Object.keys(b.hist[p])]);
      for (const k of keys) {
        const av = a.hist[p][k] || 0, bv = b.hist[p][k] || 0;
        if (av !== bv) deltas.push(`  ${p}: ${JSON.stringify(k)}  ${av} → ${bv}`);
      }
    }
    for (const [k, v] of Object.entries(b.tokens)) {
      if (!(k in a.tokens)) { newTokens.add(k); continue }   // 新增 token 不算回归
      if (a.tokens[k] !== v) deltas.push(`  token ${k}: ${a.tokens[k]} → ${v}`);
    }
    for (const k of Object.keys(a.tokens)) if (!(k in b.tokens)) deltas.push(`  token ${k} 被删除（原 ${a.tokens[k]}）`);
    if (deltas.length) { bad++; console.log(`[${route}] ${deltas.length} 处差异`); deltas.slice(0, 12).forEach(d => console.log(d)); }
  }
  if (newTokens.size) console.log(`\n新增 token ${newTokens.size} 个（不计回归）：${[...newTokens].sort().join(', ')}`);
  console.log(bad === 0 ? '\n✅ 直方图完全一致：这一侧主题零变化' : `\n❌ ${bad} 个路由有差异`);
  process.exit(bad === 0 ? 0 : 1);
}
