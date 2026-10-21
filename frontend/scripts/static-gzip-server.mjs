/**
 * 只做一件事：把 dist 用"nginx 配好 gzip + 长缓存"的方式serve出来，
 * 用来量 P5（压缩 + Cache-Control）到底能省多少，不改变任何业务代码。
 * 用法：node scripts/static-gzip-server.mjs [端口]（默认 4174），然后
 *   PROBE_BASE=http://localhost:4174 node scripts/a11y-perf-probe.mjs --slow
 */
import http from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { gzipSync } from 'node:zlib'

const PORT = Number(process.argv[2] || 4174)
const DIST = normalize(join(process.cwd(), 'dist'))
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.task': 'application/octet-stream',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.vrm': 'application/octet-stream',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2'
}
// 这些类型压得动（wasm 实测能压到 1/3 左右），模型权重压不动就不指望
const GZIP_EXT = new Set(['.wasm', '.js', '.css', '.json', '.task', '.binarypb', '.tflite'])
const cache = new Map()

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost')
  let p = decodeURIComponent(url.pathname)
  let file = join(DIST, p)
  try {
    const st = await stat(file)
    if (st.isDirectory()) { file = join(file, 'index.html'); }
  } catch {
    // SPA 路由兜底
    file = join(DIST, 'index.html')
  }
  const ext = extname(file)
  let body
  try { body = await readFile(file) } catch { res.writeHead(404).end('not found'); return }
  const headers = {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': p.startsWith('/mediapipe/') || p.startsWith('/assets/')
      ? 'public, max-age=31536000, immutable'
      : 'no-store'
  }
  if (GZIP_EXT.has(ext) && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
    const key = file
    let gz = cache.get(key)
    if (!gz) { gz = gzipSync(body, { level: 9 }); cache.set(key, gz) }
    headers['Content-Encoding'] = 'gzip'
    headers['Vary'] = 'Accept-Encoding'
    body = gz
  }
  headers['Content-Length'] = String(body.length)
  res.writeHead(200, headers)
  res.end(body)
})

server.listen(PORT, () => console.log(`[static-gzip] dist 已按 gzip + immutable 缓存策略serve在 http://localhost:${PORT}`))
