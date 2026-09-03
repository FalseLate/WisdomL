/**
 * 手势识别纯逻辑自测（无需摄像头/浏览器，node scripts/gesture-selftest.mjs 直接运行）
 * 覆盖：
 *  1. 9 种合成手势在抖动帧下的滑窗稳定输出
 *  2. 整体旋转 45° 后分类一致（旋转不变性）
 *  3. 迟滞：伸直/弯曲临界序列不反复横跳
 *  4. 两阶段握拳提交：完整流程 / 单握不提交 / 超时取消
 */

import {
  GESTURE_CONFIG as CFG,
  createSmoother,
  createGeoState,
  analyzeFrame,
  createVoter,
  createSubmitArmer
} from '../src/utils/gestureGeometry.js'

let pass = 0
let fail = 0
function assert(cond, msg) {
  if (cond) { pass++; console.log('  PASS', msg) }
  else { fail++; console.log('  FAIL', msg) }
}

// ---------- 合成手部模型 ----------
const WRIST = { x: 0.5, y: 0.85 }
// 四指 MCP：index/middle/ring/pinky
const MCP = [
  { x: 0.43, y: 0.55 },
  { x: 0.50, y: 0.50 },
  { x: 0.57, y: 0.55 },
  { x: 0.63, y: 0.60 }
]
// 每根手指相对 MCP 的偏移：伸直（向上展开）/弯曲（折回掌心）
const EXT_D = [
  { pip: [0, -0.10], dip: [0, -0.18], tip: [0, -0.25] },
  { pip: [0, -0.11], dip: [0, -0.20], tip: [0, -0.28] },
  { pip: [0, -0.10], dip: [0, -0.18], tip: [0, -0.25] },
  { pip: [0, -0.09], dip: [0, -0.16], tip: [0, -0.23] }
]
const BENT_D = [
  { pip: [0, -0.06], dip: [0.03, -0.02], tip: [0.02, 0.05] },
  { pip: [0, -0.06], dip: [0.02, -0.01], tip: [0.02, 0.05] },
  { pip: [0, -0.05], dip: [0.02, 0.00], tip: [0.02, 0.05] },
  { pip: [0, -0.05], dip: [0.02, 0.00], tip: [0.02, 0.05] }
]

// 确定性伪随机（可复现抖动）
let seed = 42
function rnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return (seed / 4294967296 - 0.5) * 2 }

function makeHand({ ext = [true, true, true, true], thumb = 'in' } = {}) {
  const lm = new Array(21).fill(0).map(() => ({ x: 0, y: 0, z: 0 }))
  lm[0] = { ...WRIST }
  lm[1] = { x: 0.45, y: 0.72 } // CMC
  // 四指
  for (let i = 0; i < 4; i++) {
    const mcpIdx = [5, 9, 13, 17][i]
    const ids = [mcpIdx, mcpIdx + 1, mcpIdx + 2, mcpIdx + 3]
    const d = ext[i] ? EXT_D[i] : BENT_D[i]
    lm[ids[0]] = { ...MCP[i] }
    lm[ids[1]] = { x: MCP[i].x + d.pip[0], y: MCP[i].y + d.pip[1] }
    lm[ids[2]] = { x: MCP[i].x + d.dip[0], y: MCP[i].y + d.dip[1] }
    lm[ids[3]] = { x: MCP[i].x + d.tip[0], y: MCP[i].y + d.tip[1] }
  }
  // 拇指：in=握拳内收 / like-left=点赞偏左 / like-right=点赞偏右 /
  //       like-up=点赞竖直(方向不明) / gray=半伸灰区 / open=五指张开位
  const thumbPos = {
    in: { mcp: [0.40, 0.58], ip: [0.40, 0.55], tip: [0.42, 0.53] },
    'like-left': { mcp: [0.36, 0.60], ip: [0.30, 0.50], tip: [0.26, 0.40] },
    'like-right': { mcp: [0.64, 0.60], ip: [0.70, 0.50], tip: [0.74, 0.40] },
    'like-up': { mcp: [0.48, 0.58], ip: [0.53, 0.48], tip: [0.565, 0.405] },
    gray: { mcp: [0.38, 0.58], ip: [0.33, 0.53], tip: [0.27, 0.47] },
    open: { mcp: [0.68, 0.66], ip: [0.82, 0.72], tip: [0.92, 0.75] }
  }[thumb]
  lm[2] = { x: thumbPos.mcp[0], y: thumbPos.mcp[1] }
  lm[3] = { x: thumbPos.ip[0], y: thumbPos.ip[1] }
  lm[4] = { x: thumbPos.tip[0], y: thumbPos.tip[1] }
  return lm
}

// 加小幅抖动
function jitter(lm, amp = 0.004) {
  return lm.map(p => ({ x: p.x + rnd() * amp, y: p.y + rnd() * amp, z: 0 }))
}

// 绕手腕整体旋转 deg 度（旋转保距，用于验证旋转不变）
function rotate(lm, deg) {
  const a = deg * Math.PI / 180
  const cs = Math.cos(a), sn = Math.sin(a)
  return lm.map(p => {
    const dx = p.x - WRIST.x, dy = p.y - WRIST.y
    return { x: WRIST.x + dx * cs - dy * sn, y: WRIST.y + dx * sn + dy * cs, z: 0 }
  })
}

// 跑完整链路：平滑 + 逐帧分类 + 投票，返回最终 stable
function runPipeline(handFactory, frames = 24, rot = 0) {
  const smoother = createSmoother()
  const state = createGeoState()
  const voter = createVoter()
  let last = null
  for (let f = 0; f < frames; f++) {
    let lm = handFactory()
    if (rot) lm = rotate(lm, rot)
    lm = smoother.push(jitter(lm))
    const { candidate } = analyzeFrame(lm, state, CFG)
    last = voter.push(candidate).stable
  }
  return last
}

// ---------- 用例 ----------
console.log('\n[1] 静态手势分类（含抖动，24帧投票）')
const cases = [
  ['选A：伸1指', () => makeHand({ ext: [true, false, false, false], thumb: 'in' }), 'select:A'],
  ['选B：伸2指', () => makeHand({ ext: [true, true, false, false], thumb: 'in' }), 'select:B'],
  ['选C：伸3指', () => makeHand({ ext: [true, true, true, false], thumb: 'in' }), 'select:C'],
  ['选D：伸4指拇指内收', () => makeHand({ ext: [true, true, true, true], thumb: 'in' }), 'select:D'],
  ['清空：五指张开', () => makeHand({ ext: [true, true, true, true], thumb: 'open' }), 'clear'],
  ['上一题：点赞偏左', () => makeHand({ ext: [false, false, false, false], thumb: 'like-left' }), 'prev'],
  ['下一题：点赞偏右', () => makeHand({ ext: [false, false, false, false], thumb: 'like-right' }), 'next'],
  ['握拳', () => makeHand({ ext: [false, false, false, false], thumb: 'in' }), 'fist']
]
for (const [name, fac, expect] of cases) {
  seed = 42
  assert(runPipeline(fac) === expect, `${name} => ${expect}`)
}

console.log('\n[2] 旋转不变性（数字/张开/握拳整体旋转 +45° / -30°，结果必须一致）')
// 点赞方向按画面绝对x判定，不参与大角度旋转测试（手横过来时左右本就无定义），见 [2c]
const rotateCases = cases.filter(c => c[2] !== 'prev' && c[2] !== 'next')
for (const [name, fac, expect] of rotateCases) {
  seed = 42
  const r45 = runPipeline(fac, 24, 45)
  seed = 42
  const r30 = runPipeline(fac, 24, -30)
  assert(r45 === expect && r30 === expect, `${name} 旋转后仍为 ${expect}（+45=>${r45}, -30=>${r30}）`)
}

console.log('\n[2c] 点赞方向：绝对x判定，左=prev/右=next（锁定，防止再被改反），自然倾斜±15°稳定')
{
  // 单帧层面直接锁定方向语义
  const stL = createGeoState()
  const rL = analyzeFrame(makeHand({ ext: [false, false, false, false], thumb: 'like-left' }), stL, CFG)
  assert(rL.candidate === 'prev' && rL.features.likeOffset < 0, `点赞偏左单帧=>prev 且 offset<0（实际 ${rL.candidate}, ${rL.features.likeOffset?.toFixed(2)}）`)
  const stR = createGeoState()
  const rR = analyzeFrame(makeHand({ ext: [false, false, false, false], thumb: 'like-right' }), stR, CFG)
  assert(rR.candidate === 'next' && rR.features.likeOffset > 0, `点赞偏右单帧=>next 且 offset>0（实际 ${rR.candidate}, ${rR.features.likeOffset?.toFixed(2)}）`)
}
for (const [name, fac, expect] of cases.filter(c => c[2] === 'prev' || c[2] === 'next')) {
  seed = 42
  const r15 = runPipeline(fac, 24, 15)
  seed = 42
  const r_15 = runPipeline(fac, 24, -15)
  assert(r15 === expect && r_15 === expect, `${name} 自然倾斜±15°仍为 ${expect}（+15=>${r15}, -15=>${r_15}）`)
}

console.log('\n[2b] 点赞 vs 握拳互斥（用户实际 bug：点赞被误判成提交）')
for (const side of ['like-left', 'like-right']) {
  seed = 7
  const got = runPipeline(() => makeHand({ ext: [false, false, false, false], thumb: side }), 40)
  assert(got !== 'fist', `点赞${side}保持40帧绝不判为 fist（实际 ${got}）`)
}
{
  seed = 7
  // 拇指半伸灰区：既不判握拳也不判点赞
  const got = runPipeline(() => makeHand({ ext: [false, false, false, false], thumb: 'gray' }), 30)
  assert(got === null, `拇指半伸灰区无稳定手势（实际 ${got}）`)
  // 点赞竖直向上（未偏左右）：不切题、不提交
  seed = 7
  const up = runPipeline(() => makeHand({ ext: [false, false, false, false], thumb: 'like-up' }), 30)
  assert(up === null, `点赞竖直未偏左右时不触发（实际 ${up}）`)
}

console.log('\n[3] 迟滞：临界距离比序列不应在 A/无 之间反复')
{
  const state = createGeoState()
  // 直接构造食指距离比在迟滞带内来回的帧：先明确伸直，再落入迟滞带应保持伸直
  let toggles = 0
  let lastExt = null
  // 用真实手型：先伸1指10帧，再把食指tip逐步降到迟滞带（通过弯曲手型切换模拟）
  const smoother = createSmoother()
  const voter = createVoter()
  const seq = []
  for (let i = 0; i < 10; i++) seq.push(makeHand({ ext: [true, false, false, false], thumb: 'in' }))
  for (let i = 0; i < 10; i++) seq.push(makeHand({ ext: [false, false, false, false], thumb: 'in' }))
  const out = []
  for (const raw of seq) {
    const lm = smoother.push(raw)
    const r = analyzeFrame(lm, state, CFG)
    out.push(voter.push(r.candidate).stable)
  }
  // 最终应稳定为 fist（握拳），中间允许一次 A->fist 过渡，但不允许来回超过1次切换
  for (let i = 1; i < out.length; i++) if (out[i] !== out[i - 1] && out[i] && out[i - 1]) toggles++
  assert(toggles <= 1, `伸->握过渡只允许一次稳定切换（实际 ${toggles} 次），最终=${out[out.length - 1]}`)
  assert(out[out.length - 1] === 'fist', '最终稳定在 fist')
}

console.log('\n[4] 两阶段握拳提交状态机（注入时钟）')
{
  let t = 0
  const armer = createSubmitArmer(CFG, () => t)
  const events = []
  // 第一握保持到 1550ms（步长33，确保采样跨过1500阈值）
  for (; t <= 1550; t += 33) { const r = armer.frame('fist', t); if (r.event) events.push(r.event) }
  assert(events.includes('submit-arm'), '第一握满1.5s触发 submit-arm')
  assert(!events.includes('submit'), '第一握本身绝不触发 submit')
  // 松开约 300ms（1551 -> 1850）
  for (; t <= 1850; t += 33) armer.frame(null, t)
  // 第二握保持到 2550ms（第二握从约1881起算，需跨600ms）
  for (; t <= 2550; t += 33) { const r = armer.frame('fist', t); if (r.event) events.push(r.event) }
  assert(events.filter(x => x === 'submit').length === 1, '松手后第二握满0.6s触发一次 submit')
}

{
  let t = 0
  const armer = createSubmitArmer(CFG, () => t)
  let gotSubmit = false
  let armed = false
  for (; t <= 1550; t += 33) { if (armer.frame('fist', t).event === 'submit-arm') { armed = true; break } }
  assert(armed, '（前置）第一握成功进入待确认')
  // 之后一直不握（超过3秒窗口）
  for (; t <= 6000; t += 33) { const r = armer.frame(null, t); if (r.event === 'submit') gotSubmit = true }
  assert(!gotSubmit, '只完成第一握、3s内未第二握 => 不提交')
}

{
  let t = 0
  const armer = createSubmitArmer(CFG, () => t)
  let gotSubmit = false
  // 只握 1000ms 就松开（第一握未满1.5s）
  for (; t <= 1000; t += 33) armer.frame('fist', t)
  for (; t <= 5000; t += 33) { const r = armer.frame(null, t); if (r.event === 'submit') gotSubmit = true }
  assert(!gotSubmit, '第一握未满1.5s提前松开 => 不进入待确认、不提交')
}

{
  let t = 0
  const armer = createSubmitArmer(CFG, () => t)
  let gotSubmit = false
  // 第一握进入待确认
  for (; t <= 1550; t += 33) armer.frame('fist', t)
  // 松开后改比“选A”（明确其他手势）-> 应立即取消
  for (; t <= 1700; t += 33) armer.frame(null, t)
  for (; t <= 2000; t += 33) armer.frame('select:A', t)
  // 之后再握拳也不应提交（待确认已取消）
  for (; t <= 4000; t += 33) { const r = armer.frame('fist', t); if (r.event === 'submit') gotSubmit = true }
  assert(!gotSubmit, '待确认期间改比其他手势 => 取消，后续握拳不提交')
}

console.log(`\n========== 结果：${pass} passed, ${fail} failed ==========`)
process.exit(fail ? 1 : 0)
