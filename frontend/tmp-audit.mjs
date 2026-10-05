// 一次性盘点：public 静态资源与根目录散文件是否被引用
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = '..';
const SCAN = ['frontend/src', 'frontend/tests', 'frontend/scripts', 'backend/src', 'prototypes', 'frontend/index.html', 'README.md'];

// 把所有可能被引用的文本拼起来（源码 + 配置 + 文档），一次性匹配
let hay = '';
function collect(dirOrFile) {
  if (!existsSync(dirOrFile)) return;
  const st = statSync(dirOrFile);
  if (st.isFile()) { if (/\.(vue|js|mjs|cjs|ts|json|html|css|py|md|xml|java|properties|yml|yaml)$/.test(dirOrFile)) { try { hay += readFileSync(dirOrFile, 'utf8') } catch {} } return }
  for (const name of readdirSync(dirOrFile)) {
    if (['node_modules', 'dist', '.git', 'shots', 'test-results', 'playwright-report', 'target', 'models', 'mediapipe', 'images'].includes(name)) continue;
    collect(join(dirOrFile, name));
  }
}
for (const s of SCAN) collect(join(ROOT, s));

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else out.push({ p, size: st.size });
  }
  return out;
}

const label = f => {
  const rel = relative(ROOT, f).replace(/\\/g, '/');
  const base = rel.split('/').pop();
  const referenced = hay.includes(base) || hay.includes(rel.replace(/^frontend\//, '/'));
  return { rel, size: 0, referenced, base };
};

for (const dir of ['frontend/public/images', 'frontend/public/models', 'frontend/public/mediapipe']) {
  const files = walk(join(ROOT, dir));
  if (!files.length) continue;
  console.log(`\n### ${dir}（${files.length} 个文件）`);
  const unref = [];
  for (const f of files) {
    const l = label(f.p);
    l.size = f.size;
    if (!l.referenced) unref.push(l);
  }
  console.log(`被引用 ${files.length - unref.length} / 未引用 ${unref.length}`);
  unref.sort((a, b) => b.size - a.size).slice(0, 25).forEach(l => console.log(`   ${(l.size / 1024).toFixed(0).padStart(7)} KB  ${l.rel}`));
}

// 根目录散文件（只扫一层，避免爬 node_modules）
console.log('\n### 仓库根目录散落的文件（.gitignore 里根目录全被忽略 → 删了 git 找不回来）');
const rootFiles = readdirSync(ROOT).filter(n => !n.startsWith('.') && statSync(join(ROOT, n)).isFile())
  .map(n => ({ p: join(ROOT, n), size: statSync(join(ROOT, n)).size }));
for (const f of rootFiles.sort((a, b) => b.size - a.size)) {
  const l = label(f.p);
  if (['.gitignore'].includes(l.base)) continue;
  console.log(`   ${(f.size / 1024).toFixed(0).padStart(7)} KB  ${l.base}   ${l.referenced ? '被文档/代码提到' : '无人引用'}`);
}
