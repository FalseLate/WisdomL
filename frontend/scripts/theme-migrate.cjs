// 队友页颜色字面量 → 主题 token 的迁移器（默认只预演，WRITE=1 才落盘）
//
// 为什么用「rgb 三元组 token」而不是每个 alpha 造一个 token：
//   rgba(167,139,250,.12) / .5 / .6 是同一个色相的三种强度，
//   写成 rgb(var(--violet-rgb) / .12) 就能用一个 token 覆盖全部强度，
//   深色取值与原字面量逐字节相同，浅色只需把三元组换成同色相的深色版。
// 只动 color / background / border / fill / stroke；box-shadow 与 text-shadow 不动
// （那是"深色发光 vs 浅色描边"的手法层，由 styles/effects-light.css 统一处理）。
const fs = require('fs');
const path = require('path');

// 每个条目是一种"色相身份"：三元组 + 它的纯色 hex 别名
const HUES = [
  ['violet', '167 139 250', ['#a78bfa']],
  ['violet-soft', '196 181 253', ['#c4b5fd']],
  ['purple', '139 92 246', []],
  ['purple-deep', '124 58 237', []],
  ['sky', '56 189 248', ['#38bdf8']],
  ['indigo', '79 124 255', []],
  ['emerald', '52 211 153', ['#34d399']],
  ['emerald-soft', '134 239 172', ['#86efac']],
  ['orange', '249 115 22', ['#f97316']],
  ['orange-soft', '251 146 60', ['#fb923c']],
  ['amber', '255 193 7', []],
  ['amber-deep', '255 152 0', []],
  ['coral', '248 113 113', ['#f87171']],
  ['danger-red', '255 68 68', []],
  ['ink', '10 10 15', []],
  ['paper', '232 232 240', []],
  ['tag-single', '102 126 234', ['#667eea']],
  ['tag-multiple', '153 68 255', ['#9944ff']],
  ['tag-subjective', '255 140 0', ['#ff8c00']]
];
// 已经是语义 token 的，直接复用
const HEX_DIRECT = { '#00f5ff': '--accent', '#ff00ff': '--secondary', '#00ff88': '--success', '#f9f002': '--warning', '#0a0a0f': '--surface-solid', '#ff66ff': '--secondary-bright' };
const RGB_DIRECT = { '0 245 255': '--accent', '255 0 255': '--secondary', '0 255 136': '--success', '249 240 2': '--warning', '255 68 68': '--danger' };

const PROPS = '(color|background-color|background|border-color|border-top-color|border-bottom-color|border-left-color|border-right-color|border-top|border-bottom|border-left|border-right|border|fill|stroke)';
const SRC = path.join(process.cwd(), 'src');
const WRITE = process.env.WRITE === '1';

const files = [];
for (const dir of ['views', 'components']) {
  (function walk(d) {
    for (const name of fs.readdirSync(d)) {
      const p = path.join(d, name);
      if (fs.statSync(p).isDirectory()) { if (name !== 'pet-tutor') walk(p) }
      else if (name.endsWith('.vue')) files.push(p);
    }
  })(path.join(SRC, dir));
}
const TEAM = /Word|Reading|MyWiki|EnglishWrong|StudyMap|VocabNotebook|Wiki/;
// FILES="a.vue,b.vue" 可以只跑指定文件（自家页面补迁时用），否则扫全部队友页
const targets = process.env.FILES
  ? process.env.FILES.split(',').map(x => path.join(SRC, x.trim()))
  : files.filter(f => TEAM.test(path.basename(f)) && !f.includes('original'));

const used = new Map();   // token 名 → 深色取值（冲突即报错，绝不静默换色）
const left = new Map();
let changed = 0;
function claim(name, value) {
  if (used.has(name) && used.get(name) !== value) {
    throw new Error(`token 冲突：${name} 既要等于 ${used.get(name)} 又要等于 ${value} —— 需要拆成两种色相身份`);
  }
  used.set(name, value);
}

for (const f of targets) {
  const before = fs.readFileSync(f, 'utf8');
  const out = before.replace(new RegExp(`${PROPS}(\\s*:\\s*)([^;\\n]+)`, 'g'), (m, prop, sep, decl) => {
    if (/-shadow/.test(prop) || /var\(/.test(decl)) return m;
    let o = decl;
    o = o.replace(/rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)/g, (mm, r, g, b, a) => {
      const key = `${r} ${g} ${b}`;
      const direct = RGB_DIRECT[key];
      if (direct) { claim(`${direct}-rgb`, key); return `rgb(var(${direct}-rgb) / ${a})` }
      const hue = HUES.find(h => h[1] === key);
      if (!hue) { left.set(mm, (left.get(mm) || 0) + 1); return mm }
      claim(`--${hue[0]}-rgb`, key);
      return `rgb(var(--${hue[0]}-rgb) / ${a})`;
    });
    o = o.replace(/#[0-9a-fA-F]{3,8}\b/g, (mm) => {
      const low = mm.toLowerCase();
      if (HEX_DIRECT[low]) { claim(HEX_DIRECT[low], low); return `var(${HEX_DIRECT[low]})` }
      if (low === '#fff' || low === '#ffffff') return mm;      // 品牌底上的白字，逐处人工判断
      const hue = HUES.find(h => h[2].includes(low));
      if (!hue) { left.set(mm, (left.get(mm) || 0) + 1); return mm }
      const name = prop === 'color' ? `--${hue[0]}-text` : `--${hue[0]}`;
      claim(name, low);
      return `var(${name})`;
    });
    if (o === decl) return m;
    changed++;
    if (process.env.VERBOSE) console.log(`  - ${prop}${sep}${decl}\n  + ${prop}${sep}${o}`);
    return `${prop}${sep}${o}`;
  });
  if (out !== before) { if (WRITE) fs.writeFileSync(f, out); else console.log(`[预演] ${path.relative(SRC, f)}`); }
}

console.log(`\n${WRITE ? '已写入' : '预演（WRITE=1 落盘）'} | 改写声明 ${changed} 条 | 涉及文件 ${targets.length}`);
console.log('\n需要的 token（深色 = 原字面量）：');
[...used.entries()].sort().forEach(([k, v]) => console.log(`  ${k}: ${v};`));
console.log('\n未匹配（保留原样）：');
[...left.entries()].sort((a, b) => b[1] - a[1]).forEach(([v, n]) => console.log(`  ${n}× ${v}`));
