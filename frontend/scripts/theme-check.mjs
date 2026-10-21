// scripts/theme-check.mjs —— 主题守卫：结构样式里不许再写死颜色
//
// 为什么要有它：这套 UI 有深色/浅色两套视觉语言，任何一处裸 hex 都是"浅色下迟早会瞎"的债。
// 之前浅色就是靠一层 [data-theme=light] + !important 的补丁硬撑，补丁和组件样式特异性打平、
// 谁赢取决于打包顺序（真出过"应用设置白字白底"的事故）。现在颜色只允许出现在：
//   styles/tokens-dark.css / styles/tokens-light.css（两张变量表）
// 以及下面 EXCEPTIONS 里说清楚原因的三处"不吃 CSS 变量"的地方。
//
// 用法：npm run theme:check
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC = join(process.cwd(), 'src');
const COLOR_PROPS = '(?:color|background-color|background|border-color|border|border-top|border-bottom|border-left|border-right|border-top-color|border-bottom-color|fill|stroke)';
const LITERAL = /#[0-9a-fA-F]{3,8}\b|\brgba?\(\s*\d/;

// 允许保留字面量的文件：值由 JS 在运行时喂给 canvas / echarts，或该区域本身恒深底
const EXCEPTIONS = {
  'styles/tokens-dark.css': '变量表本体',
  'styles/tokens-light.css': '变量表本体',
  'components/cyber/ParticleBackground.vue': 'tsParticles 配置只吃 JS 字符串，配色在 PALETTE 里按主题分两套',
  'views/ErrorStatsView.vue': 'echarts 画在 canvas 上，配色在 CHART_COLORS 里按主题分两套',
  'components/cyber/GestureHUD.vue': '小窗里的视频视口恒深底（摄像头画面本来就暗），只保留视口区字面量',
  'components/cyber/SplashScreen.vue': '过场动画的霓虹扫描线',
  'components/starmap/WarpOverlay.vue': '进入知识星图的过场：全屏恒深空底，和 SplashScreen 一样不参与浅色主题',
  'pet-tutor/PetTutor.vue': '虚拟人桌宠自成一套 UI（3D 舞台 + 气泡），不参与全站主题',
  'pet-tutor/components/VirtualHuman.vue': '同上',
  'views/HomeView.original.vue': '已废弃的旧版首页备份，不在路由里',
  // 下面四个全仓零 import、也不在路由里 —— 是死代码，不是"待主题化的债"。
  // 豁免只为让基线数字反映真实工作量；要清债请先删文件（需要用户确认）。
  'components/QuestionCard.vue': '死代码：全仓零 import（PracticeView 用的是 Objective/SubjectiveQuestionCard）',
  'components/LoadingDialog.vue': '死代码：全仓零 import',
  'components/SummaryPanel.vue': '死代码：全仓零 import',
  'views/LandingView.vue': '死代码：全仓零 import、不在路由里'
};

const files = [];
(function walk(d) {
  if (d.includes('node_modules')) return;
  for (const name of readdirSync(d)) {
    const p = join(d, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(vue|css)$/.test(name) && !p.includes('node_modules')) files.push(p);
  }
})(SRC);

const hits = [];
for (const p of files) {
  const rel = relative(SRC, p).replace(/\\/g, '/');
  if (EXCEPTIONS[rel]) continue;
  const lines = readFileSync(p, 'utf8').split(/\r?\n/);
  lines.forEach((line, i) => {
    const code = line.replace(/\/\/.*$/, '').replace(/<!--.*?-->/g, '');
    if (!new RegExp(`${COLOR_PROPS}\\s*:`).test(code)) return;
    if (!LITERAL.test(code)) return;
    if (code.includes('var(--')) return;                       // 已经走 token
    hits.push(`${rel}:${i + 1}: ${line.trim()}`);
  });
}

// 禁止再新增 "[data-theme=light] + !important" 的补丁（特异性与打包顺序战争的回潮点）
const patchHits = [];
for (const p of files) {
  const rel = relative(SRC, p).replace(/\\/g, '/');
  if (rel.startsWith('styles/')) continue;
  const src = readFileSync(p, 'utf8');
  if (/\[data-theme=["']light["']\][^{}]*!important/.test(src)) patchHits.push(rel);
}

// 棘轮：历史遗留一次改不完，所以按文件记录当前违规数，
// 只允许变少、不允许变多（npm run theme:check -- --update 重算基线）
const BASELINE_FILE = join(process.cwd(), 'scripts', 'theme-check.baseline.json');
const perFile = {};
for (const h of hits) { const f = h.split(':')[0]; perFile[f] = (perFile[f] || 0) + 1 };

if (process.argv.includes('--update')) {
  writeFileSync(BASELINE_FILE, JSON.stringify(perFile, null, 1) + '\n');
  console.log(`已写入基线：${Object.keys(perFile).length} 个文件、共 ${hits.length} 处待清`);
  process.exit(0);
}

let baseline = {};
try { baseline = JSON.parse(readFileSync(BASELINE_FILE, 'utf8')) } catch { /* 首次运行没有基线 */ }

// 两张表必须键集完全一致：少一个键不会报错，只会让浅色"悄悄退回深色值"，是最难发现的一类 bug。
// （与主题无关的圆角/字体/缓动放在 tokens-shared.css，不参与比对）
function keySet(f) {
  const src = readFileSync(join(SRC, 'styles', f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  return new Set([...src.matchAll(/(--[\w-]+)\s*:/g)].map(m => m[1]));
}
const dk = keySet('tokens-dark.css'), lt = keySet('tokens-light.css');
const missingInLight = [...dk].filter(k => !lt.has(k));
const missingInDark = [...lt].filter(k => !dk.has(k));

if (missingInLight.length || missingInDark.length) {
  console.error(`\n❌ token 表键集不一致（深色 ${dk.size} / 浅色 ${lt.size}）`);
  if (missingInLight.length) console.error('  浅色缺键，这些处在浅色下会退回深色值：' + missingInLight.join(', '));
  if (missingInDark.length) console.error('  深色缺键：' + missingInDark.join(', '));
  process.exit(1);
}

// 引用了却没定义的 token = 那一处颜色直接不渲染（比写死 hex 更难发现），必须拦。
// 三种情况不算问题：写了兜底值的 var(--x, fallback)、JS 运行时 setProperty 上去的
// （--vt-x 这类动画原点）、CSS 注释里的举例。
const defined = new Set();
for (const p of files) {
  const src = readFileSync(p, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of src.matchAll(/(--[\w-]+)\s*:/g)) defined.add(m[1]);
}
const runtimeSet = new Set();
(function scanJs(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) { if (name !== 'node_modules') scanJs(p); continue }
    if (!/\.(js|vue)$/.test(name)) continue;
    for (const m of readFileSync(p, 'utf8').matchAll(/setProperty\(\s*['"](--[\w-]+)['"]/g)) runtimeSet.add(m[1]);
  }
})(SRC);

const undefinedTokens = new Set();
for (const p of files) {
  const src = readFileSync(p, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '');
  for (const m of src.matchAll(/var\((--[\w-]+)(\s*,[^)]*)?\)/g)) {
    if (m[2]) continue;                              // 有兜底值
    if (defined.has(m[1]) || runtimeSet.has(m[1])) continue;
    undefinedTokens.add(`${m[1]} ← ${relative(SRC, p).replace(/\\/g, '/')}`);
  }
}

const grew = Object.entries(perFile).filter(([f, n]) => n > (baseline[f] || 0));
const shrunk = Object.entries(baseline).filter(([f]) => (perFile[f] || 0) < (baseline[f] || 0));

if (grew.length || patchHits.length || undefinedTokens.size) {
  console.error(`\n❌ 主题守卫不通过`);
  [...undefinedTokens].forEach(t => console.error('  引用了未定义的 token  ' + t));
  grew.forEach(([f, n]) => console.error(`  ${f}: 裸颜色 ${baseline[f] || 0} → ${n}（比基线多了 ${n - (baseline[f] || 0)} 处）`));
  hits.filter(h => grew.some(([f]) => h.startsWith(f + ':'))).slice(0, 20).forEach(h => console.error('    ' + h));
  patchHits.forEach(h => console.error(`  新增浅色 !important 补丁  ${h} —— 请改成 token，或写进 styles/effects-light.css 并说明理由`));
  console.error('\n颜色只能写在 styles/tokens-*.css；例外清单见本文件顶部注释。');
  process.exit(1);
}

const left = Object.values(perFile).reduce((s, n) => s + n, 0);
console.log(`✅ 主题守卫通过：${files.length} 个文件；历史遗留 ${left} 处（只减不增）`
  + (shrunk.length ? `；本轮已清掉 ${shrunk.length} 个文件的违规，记得 npm run theme:check -- --update 收紧基线` : ''));
