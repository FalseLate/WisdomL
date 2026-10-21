// @ts-check
// 手通道发射门控 + 通道生命周期泄漏（离线，不依赖后端；默认通道全关，不碰 getUserMedia）
// 背景：持续比 2 指时旧代码每帧都往总线发 select:B，600ms 冷却一到期就再翻转一次
//      => 多选题选项 A/B 来回闪、永远确认不了。修法是上升沿：一次手势只发一次。
import { test, expect } from '@playwright/test';

const EMPTY = {
  questions: [], sections: [], records: [], items: [], list: [], data: [],
  books: [], words: [], articles: [], notes: [], wrongQuestions: [], stats: {},
  total: 0, count: 0, percentage: 0
};

const MULTI = {
  id: 'q-multi-1', type: '多选', question: '下列哪些是水果？',
  options: { A: '苹果', B: '香蕉', C: '石头', D: '橘子' }, answer: 'ABD', explanation: 'C 不是'
};

// init script 在浏览器上下文执行：既不能引用模块作用域变量，也不能依赖数组解构，
// 题目对象必须随参数一起序列化传进去
const seed = ([cfg, multi]) => {
  localStorage.setItem('token', 'fake-gesture-emit');
  localStorage.setItem('user', JSON.stringify({ id: 1, username: 'emit', nickname: '门控' }));
  localStorage.setItem('zhifuxi_a11y_v1', JSON.stringify(cfg));
  localStorage.setItem('zhifuxi-questions', JSON.stringify({ questions: [multi] }));
  localStorage.setItem('lazy_gesture_tutorial_shown', '1');
};

async function openPractice(page, a11y) {
  await page.addInitScript(seed, [a11y, MULTI]);
  await page.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(EMPTY) }));
  await page.goto('/lazy-practice', { waitUntil: 'load' });
  await page.waitForSelector('.splash-screen', { state: 'detached', timeout: 9000 }).catch(() => {});
  await page.waitForSelector('.lp-option', { timeout: 15000 });
  // 开手势运行时（通道全关 => HUD 挂载但不会请求摄像头）
  await page.locator('.lp-gesture-toggle').first().click();
  await expect(page.locator('.gesture-hud')).toBeVisible({ timeout: 8000 });
}

/**
 * 按真实帧率持续比同一个候选，返回总线收到该动作的次数。
 * 必须用真实时间跨帧：同步循环里 performance.now() 几乎不前进，冷却期会把重复发射
 * 全挡住，那样即使没有门控也能过——就测不出这个 bug 了。
 */
function hold(candidate, action, frames, stepMs = 33) {
  return page => page.evaluate(async ({ candidate, action, frames, stepMs }) => {
    let n = 0;
    const off = window.__zhifuxiA11y.bus.on(e => { if (e.action === action) n++; });
    for (let i = 0; i < frames; i++) {
      window.__a11yManager.feedHandCandidate(candidate);
      await new Promise(r => setTimeout(r, stepMs));
    }
    off();
    return n;
  }, { candidate, action, frames, stepMs });
}

const release = (frames = 10) => page => page.evaluate(async (n) => {
  for (let i = 0; i < n; i++) {
    window.__a11yManager.feedHandCandidate(null);
    await new Promise(r => setTimeout(r, 33));
  }
}, frames);

test.describe('手通道发射门控', () => {
  test('多选：持续比 2 指只翻转一次，松开后重比才翻转第二次', async ({ page }) => {
    await openPractice(page, { channels: { hand: false, head: false, arm: false } });

    // 60 帧 ≈ 2 秒，跨过 600ms 冷却期 3 次：旧代码这里会发 3~4 次
    const first = await hold('select:B', 'selectB', 60)(page);
    expect(first, '持续比同一个手势绝不能反复发射').toBe(1);
    await expect(page.locator('.lp-option.selected .opt-key')).toHaveText('B');

    // 松手（中立帧）后再比 => 允许第二次，B 取消选中（就是用户记忆里的"再比一次取消"）
    await release()(page);
    const second = await hold('select:B', 'selectB', 60)(page);
    expect(second, '松手后重比应当再发一次').toBe(1);
    await expect(page.locator('.lp-option.selected')).toHaveCount(0);

    // 键盘兜底不属于门控路径：连按两次 b 应照常翻转两次
    await page.keyboard.press('b');
    await page.waitForTimeout(700);
    await page.keyboard.press('b');
    await page.waitForTimeout(700);
    await expect(page.locator('.lp-option.selected')).toHaveCount(0);
    console.log('[GATE] 持续 60 帧 select:B => 1 次；松开重比 => 第 2 次；键盘连按照常翻转 ✅');
  });

  test('next 属翻页，持续比保持连发（约定：不加次数上限）', async ({ page }) => {
    await openPractice(page, { channels: { hand: false, head: false, arm: false } });
    const n = await hold('next', 'next', 50, 40)(page);
    expect(n, 'next 应按 800ms 冷却连发').toBeGreaterThanOrEqual(2);
    console.log('[GATE] 持续比 next 2 秒 => 连发', n, '次');
  });
});

test.describe('通道生命周期', () => {
  test('模型加载途中卸载：不得在后台偷偷登记通道并启动帧循环', async ({ page }) => {
    await openPractice(page, { channels: { hand: true, head: false, arm: false } });
    // 拖慢 wasm 胶水文件的响应，制造可靠的"加载中"窗口（其余 mediapipe 资源照常放行）
    await page.route('**/vision_wasm_internal.js', async route => {
      await new Promise(r => setTimeout(r, 3000));
      await route.continue();
    });

    // 关掉手势 => GestureHUD 卸载，与切走路由走的是同一个 onUnmounted -> closeAll 分支
    await page.locator('.lp-gesture-toggle').first().click();
    await expect(page.locator('.gesture-hud')).toHaveCount(0);
    // 等被拖慢的在飞 open 真正落地
    await page.waitForTimeout(6000);

    const after = await page.evaluate(() => {
      const m = window.__a11yManager;
      return {
        channels: m.channels.size,
        running: m.running,
        raf: m._rafId,
        handOn: !!m.channels.get('hand')
      };
    });
    console.log('[LEAK] 卸载后 =', JSON.stringify(after));
    expect(after.channels, '在飞 open 落地后不得留下通道').toBe(0);
    expect(after.handOn).toBe(false);
    expect(after.running, '帧循环必须停住').toBe(false);
    expect(after.raf, 'rAF 句柄必须清空').toBeFalsy();
  });
});
