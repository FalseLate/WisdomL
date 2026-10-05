// scripts/theme-audit.mjs —— 逐路由的 WCAG 对比度审计（不需要后端）
//
// 为什么单独做这个：浅色主题"好不好看"要人眼评，但"读不读得清"是可以机器判的。
// 遍历每个可见元素，把 color 与"沿 DOM 合成的真实底色"（渐变取最差色标）算对比度，
// 低于 4.5:1（AA 正文）就按选择器聚合报出来。
//
// 用法：node scripts/theme-audit.mjs light          # 或 dark
//       node scripts/theme-audit.mjs light --fail   # 有违规就退出码 1
import { chromium } from '@playwright/test';

const theme = process.argv[2] || 'light';
const strict = process.argv.includes('--fail');
const BASE = 'http://localhost:4173';
const MIN_RATIO = 4.5;

const QUESTIONS = { questions: [{ id: 1, type: 'single', question: '牛顿第二定律？', options: { A: 'F=mv', B: 'F=ma', C: 'E=mc²', D: 'p=mv' }, answer: 'B', explanation: 'x' }] };

const ROUTES = ['/', '/login', '/register', '/settings', '/lazy-practice', '/question-bank', '/history',
  '/wrong-questions', '/error-stats', '/collections', '/profile', '/word/home', '/word/my', '/word/book',
  '/word/plan', '/word/notebook', '/word/english-wrong', '/wiki/mine', '/study-map', '/reading/home', '/reading/article'];

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.addInitScript(([th, q]) => {
  localStorage.setItem('token', 'fake-theme-audit');
  localStorage.setItem('user', JSON.stringify({ id: 1, username: 'audit', nickname: '审计' }));
  localStorage.setItem('zhifuxi_a11y_v1', JSON.stringify({ feedback: { theme: th, motion: 'off' } }));
  localStorage.setItem('zhifuxi-questions', JSON.stringify(q));
  localStorage.setItem('lazy_gesture_tutorial_shown', '1');
}, [theme, QUESTIONS]);
await page.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"questions":[],"sections":[],"records":[],"items":[],"list":[]}' }));

const AUDIT = `(function () {
  function parse(str) {
    const m = (str || '').match(/(-?\\d+(?:\\.\\d+)?)/g);
    if (!m) return { rgb: [0, 0, 0], alpha: 0 };
    return { rgb: [+m[0], +m[1], +m[2]], alpha: m[3] === undefined ? 1 : +m[3] };
  }
  function lum(c) {
    const s = c.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) });
    return 0.2126 * s[0] + 0.7152 * s[1] + 0.0722 * s[2];
  }
  function stack(node) {
    const out = [];
    let n = node;
    while (n && n !== document.documentElement) { out.push(parse(getComputedStyle(n).backgroundColor)); n = n.parentElement; }
    out.push({ rgb: ${theme === 'light' ? '[255, 255, 255]' : '[10, 10, 15]'}, alpha: 1 });
    return out;
  }
  function flatten(layers) {
    return layers.reduceRight((acc, l) => l.rgb.map((v, i) => v * l.alpha + acc[i] * (1 - l.alpha)), [255, 255, 255]);
  }
  const out = [];
  for (const el of document.querySelectorAll('body *')) {
    if (el.closest('.pet-world')) continue;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || +cs.opacity < 0.15) continue;
    const text = Array.from(el.childNodes).some(n => n.nodeType === 3 && n.textContent.trim());
    if (!text) continue;
    const size = parseFloat(cs.fontSize);
    const bold = +cs.fontWeight >= 700;
    // AA 大字号（≥24px，或 ≥18.66px 且加粗）门槛放宽到 3:1
    const need = (size >= 24 || (size >= 18.66 && bold)) ? 3 : 4.5;
    const solid = flatten(stack(el));
    const stops = (cs.backgroundImage && cs.backgroundImage !== 'none')
      ? (cs.backgroundImage.match(/rgba?\\([^)]*\\)/g) || []).map(g => parse(g)).filter(p => p.rgb.length === 3) : [];
    const bgs = stops.length ? stops.map(p => p.rgb.map((v, i) => v * p.alpha + solid[i] * (1 - p.alpha))) : [solid];
    const fg = parse(cs.color);
    // 渐变文字（background-clip: text）里渐变就是字本身，不能当底色算，否则必然 1:1
    if (cs.webkitBackgroundClip === 'text' || cs.backgroundClip === 'text') continue;
    if (fg.alpha === 0) continue;
    let worst = Infinity;
    for (const bg of bgs) {
      const f = fg.rgb.map((v, i) => v * fg.alpha + bg[i] * (1 - fg.alpha));
      const l1 = lum(f), l2 = lum(bg);
      worst = Math.min(worst, (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05));
    }
    if (worst < need) {
      out.push({ sel: el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/).slice(0, 3).join('.') : ''), ratio: Math.round(worst * 100) / 100, need, size, sample: el.textContent.trim().slice(0, 18) });
    }
  }
  return out;
})()`;

const total = new Map();
for (const route of ROUTES) {
  await page.goto(BASE + route, { waitUntil: 'load' }).catch(() => {});
  await page.waitForSelector('.splash-screen', { state: 'detached', timeout: 9000 }).catch(() => {});
  await page.waitForTimeout(900);
  const bad = await page.evaluate(AUDIT).catch(() => []);
  for (const b of bad) {
    const k = `${route}  ${b.sel}  ${b.ratio}:1 (需 ${b.need})  ${b.size}px  「${b.sample}」`;
    total.set(k, (total.get(k) || 0) + 1);
  }
}
await browser.close();

const list = [...total.keys()].sort();
console.log(`\n${theme} 主题对比度审计：${ROUTES.length} 个路由，${list.length} 类问题元素`);
list.forEach(k => console.log('  ' + k));
if (!list.length) console.log('  ✅ 没有低于 AA 门槛的正文文字');
if (strict && list.length) process.exit(1);
