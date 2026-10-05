// @ts-check
// 浅色主题可读性守卫：抽屉「应用设置」按钮文字/底色对比、auto 档粒子、聚焦环。
// 只依赖前端（假 token 过路由守卫），后端不通也能跑。
import { test, expect } from '@playwright/test';

const TOKEN = ['fake-token-for-theme-check', { id: 999, username: 'theme', nickname: '主题' }];

/**
 * 生成一段页内脚本：算某个元素文字与"真实可见底色"的 WCAG 对比度。
 * 背景经常是 rgba/transparent，所以要沿 DOM 往上把每层 alpha 累加合成，
 * 否则会把"白字白底＝可读"这类误判放过去。
 * 底色是渐变（background-image）时 computed backgroundColor 是透明的，
 * 这里取渐变里所有色标，逐个算对比度后取最小值（最保守的那一段文字才代表真实可读性）。
 */
function contrastScript(selector) {
  return `
  (function () {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return { error: 'not found' };
    const cs = getComputedStyle(el);
    function parse(str) {
      const m = (str || '').match(/(-?\\d+(?:\\.\\d+)?)/g);
      if (!m) return { rgb: [0, 0, 0], alpha: 0 };
      return { rgb: [+m[0], +m[1], +m[2]], alpha: m[3] === undefined ? 1 : +m[3] };
    }
    // 逐层往上累加 alpha，得到真实可见底色（透明背景很常见）
    function stack(node) {
      const out = [];
      let n = node;
      while (n && n !== document.documentElement) { out.push(parse(getComputedStyle(n).backgroundColor)); n = n.parentElement; }
      out.push({ rgb: [255, 255, 255], alpha: 1 });
      return out;
    }
    function flatten(layers, base) {
      return layers.reduceRight((acc, l) => l.rgb.map((v, i) => v * l.alpha + acc[i] * (1 - l.alpha)), base);
    }
    function lum(c) {
      const s = c.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) });
      return 0.2126 * s[0] + 0.7152 * s[1] + 0.0722 * s[2];
    }
    function ratioAgainst(bg) {
      const fg = parse(cs.color);
      const fgOnBg = fg.rgb.map((v, i) => v * fg.alpha + bg[i] * (1 - fg.alpha));
      const l1 = lum(fgOnBg), l2 = lum(bg);
      return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    }
    const solidBg = flatten(stack(el), [255, 255, 255]);
    const stops = [];
    const img = cs.backgroundImage || '';
    if (img && img !== 'none') {
      const groups = img.match(/rgba?\\([^)]*\\)/g) || [];
      // 渐变画在背景色之上：色标不透明时它就是最终底色，只有带 alpha 的色标才往下合成
      groups.forEach(g => {
        const p = parse(g);
        stops.push(p.rgb.map((v, i) => v * p.alpha + solidBg[i] * (1 - p.alpha)));
      });
    }
    const candidates = stops.length ? stops : [solidBg];
    const ratios = candidates.map(ratioAgainst);
    return {
      ratio: Math.round(Math.min.apply(null, ratios) * 100) / 100,
      gradient: stops.length > 0,
      color: cs.color,
      fontSize: cs.fontSize,
      disabled: el.disabled === true,
      bg: (stops.length ? candidates : [solidBg]).map(b => b.map(v => Math.round(v)))
    };
  })()
  `;
}

async function seed(page, theme) {
  await page.addInitScript(([t, u, th]) => {
    localStorage.setItem('token', t);
    localStorage.setItem('user', JSON.stringify(u));
    localStorage.setItem('zhifuxi_a11y_v1', JSON.stringify({ feedback: { theme: th } }));
  }, [...TOKEN, theme]);
}

async function openDrawer(page) {
  await page.locator('.set-row.link').first().click();
  await page.waitForSelector('.a11y-drawer .drawer-btn.primary');
}

test.describe('浅色可读性', () => {
  test('抽屉按钮文字在两种主题下都达到 AA，浅色 auto 档不画粒子', async ({ page }) => {
    await seed(page, 'light');
    await page.goto('/settings');
    await page.waitForSelector('.seg-btn');

    // auto 档 + 浅色 = 关闭粒子（青色粒子在白底上看不见，还费电）
    await page.waitForTimeout(1200);
    const canvases = await page.locator('body > div[id^="tsparticles"] canvas').count();
    console.log('[LIGHT] 粒子 canvas 数 =', canvases);
    expect(canvases).toBe(0);

    await openDrawer(page);
    const disabled = await page.evaluate(contrastScript('.drawer-btn.primary'));
    console.log('[LIGHT] 应用设置(禁用态) =', JSON.stringify(disabled));
    expect(disabled.ratio).toBeGreaterThanOrEqual(4.5);

    // 制造"有改动"状态，检查可点态
    await page.locator('.a11y-drawer input[type=checkbox]').first().click();
    await page.waitForTimeout(200);
    const enabled = await page.evaluate(contrastScript('.drawer-btn.primary'));
    console.log('[LIGHT] 应用设置(可点) =', JSON.stringify(enabled));
    expect(enabled.ratio).toBeGreaterThanOrEqual(4.5);

    const ghost = await page.evaluate(contrastScript('.drawer-btn.ghost'));
    console.log('[LIGHT] 恢复默认 =', JSON.stringify(ghost));
    expect(ghost.ratio).toBeGreaterThanOrEqual(4.5);

    const note = await page.evaluate(contrastScript('.a11y-drawer .note'));
    console.log('[LIGHT] 说明文字 =', JSON.stringify(note));
    expect(note.ratio).toBeGreaterThanOrEqual(4.5);

    await page.screenshot({ path: 'shots/light-drawer.png', fullPage: false });

    // 未应用改动就关抽屉会弹确认；这里直接丢弃
    await page.locator('.drawer-close').click();
    await page.waitForTimeout(400);

    await page.goto('/settings');
    await page.waitForSelector('.seg-btn');
    await page.screenshot({ path: 'shots/light-settings.png', fullPage: true });
  });

  test('深色零回归：同一批元素对比度不低于改动前基线', async ({ page }) => {
    await seed(page, 'dark');
    await page.goto('/settings');
    await page.waitForSelector('.seg-btn');
    await page.waitForTimeout(1200);
    const canvases = await page.locator('body > div[id^="tsparticles"] canvas').count();
    console.log('[DARK] 粒子 canvas 数 =', canvases);
    expect(canvases).toBe(1);

    await openDrawer(page);
    for (const sel of ['.drawer-btn.primary', '.drawer-btn.ghost', '.a11y-drawer .note', '.drawer-title']) {
      const r = await page.evaluate(contrastScript(sel));
      console.log('[DARK]', sel, JSON.stringify(r));
      expect(r.ratio).toBeGreaterThanOrEqual(4.5);
    }
    await page.screenshot({ path: 'shots/dark-drawer.png' });
  });

  test('主题切换走 View Transition，并把扩散原点写进 CSS 变量', async ({ page }) => {
    await seed(page, 'dark');
    await page.goto('/settings');
    await page.waitForSelector('.seg-btn');
    const supported = await page.evaluate(() => typeof document.startViewTransition === 'function');
    const reduced = await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
    await page.locator('.seg-btn').filter({ hasText: '浅色' }).click();
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'light', null, { timeout: 8000 });
    const vt = await page.evaluate(() => ({
      x: document.documentElement.style.getPropertyValue('--vt-x'),
      y: document.documentElement.style.getPropertyValue('--vt-y'),
      r: document.documentElement.style.getPropertyValue('--vt-r')
    }));
    console.log('[VT] 支持 =', supported, '| 减少动效 =', reduced, '| 原点/半径 =', JSON.stringify(vt));
    expect(supported).toBe(true);
    if (!reduced) expect(vt.r).toMatch(/^\d+px$/);
  });
});
