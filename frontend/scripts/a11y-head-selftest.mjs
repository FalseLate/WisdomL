/**
 * 头部/姿态几何层自测（纯 Node，无需摄像头）
 * 覆盖：
 *  1. 变换矩阵 -> 欧拉角分解正确性
 *  2. 摇头（双峰）识别；叠加 2°@8Hz 震颤噪声不误触
 *  3. 点头峰值（下探->回升），低头看物（yaw 变化大）不触发
 *  4. 单侧扭头：迟滞 + 只触发一次
 *  5. 抬头持续阈值
 *  6. 挥肘 / 横扫
 * 运行：node scripts/head-arm-selftest.mjs
 */
import {
  HEAD_CONFIG, createHeadAnalyzer, createMouthGate, createSmileGate, geometricPitchRatio, eulerAnglesFromMatrix
} from '../src/utils/headGeometry.js'
import { ARM_CONFIG, createArmAnalyzer } from '../src/utils/armGeometry.js'
import { cycleNext, cyclePrev } from '../src/a11y/cycle.js'

let pass = 0, fail = 0
function assert(cond, msg) {
  if (cond) { pass++; console.log('  PASS', msg) }
  else { fail++; console.log('  FAIL', msg) }
}

const ZERO = { yaw: 0, pitch: 0, roll: 0 }
const STEP = 33 // ~30fps

console.log('\n[1] 矩阵轴语义回归（真实 mediapipe 数据 + 纯旋转无串扰）')
{
  const D = 180 / Math.PI
  // 真机实测帧：明显低头看屏幕的脸（列主序，平移在 12~14）
  const real = { rows: 4, columns: 4, data: [0.988, -0.059, -0.141, 0, 0.071, 0.994, 0.085, 0, 0.135, -0.094, 0.986, 0, -0.485, -5.729, -74.587, 1] }
  const e = eulerAnglesFromMatrix(real)
  assert(e && Math.abs(e.pitch * D - 5.4) < 0.2, `真实低头帧 pitch=asin(-R12)=5.4°（得 ${(e.pitch * D).toFixed(1)}°）`)
  assert(e && Math.abs(e.yaw * D - (-3.4)) < 0.2, `同帧 yaw 与旧公式一致 -3.4°（得 ${(e.yaw * D).toFixed(1)}°）`)
  // 纯点头 Rx(20°)：pitch 必须精确读出 20°，yaw 不得被污染
  const t = 20 * Math.PI / 180
  const Rx = [[1, 0, 0], [0, Math.cos(t), -Math.sin(t)], [0, Math.sin(t), Math.cos(t)]]
  const cm = new Array(16).fill(0)
  for (let row = 0; row < 3; row++) for (let c = 0; c < 3; c++) cm[c * 4 + row] = Rx[row][c]
  cm[15] = 1
  const e2 = eulerAnglesFromMatrix({ rows: 4, columns: 4, data: cm })
  assert(e2 && Math.abs(e2.pitch * D - 20) < 0.1 && Math.abs(e2.yaw * D) < 0.1,
    `纯点头20° => pitch 20° / yaw 0°（得 ${(e2.pitch * D).toFixed(1)}/${(e2.yaw * D).toFixed(1)}）`)
  // 纯扭头 Ry(25°)：yaw 通道动，pitch 不得被污染（旧公式的致命串扰点）
  const y = 25 * Math.PI / 180
  const Ry = [[Math.cos(y), 0, Math.sin(y)], [0, 1, 0], [-Math.sin(y), 0, Math.cos(y)]]
  for (let row = 0; row < 3; row++) for (let c = 0; c < 3; c++) cm[c * 4 + row] = Ry[row][c]
  const e3 = eulerAnglesFromMatrix({ rows: 4, columns: 4, data: cm })
  assert(e3 && Math.abs(e3.pitch * D) < 0.1, `纯扭头25° => pitch 不受污染（得 ${(e3.pitch * D).toFixed(1)}°）`)
  // 行主序布局（平移在右列）也要能识别
  const rm = new Array(16).fill(0)
  for (let row = 0; row < 3; row++) for (let c = 0; c < 3; c++) rm[row * 4 + c] = Rx[row][c]
  rm[3] = 0.4; rm[7] = 5.7; rm[11] = 74.6; rm[15] = 1
  const e4 = eulerAnglesFromMatrix({ rows: 4, columns: 4, data: rm })
  assert(e4 && Math.abs(e4.pitch * D - 20) < 0.1, `行主序纯点头 => 20°（得 ${(e4 ? e4.pitch * D : NaN).toFixed(1)}°）`)
}

function runFrames(analyzer, gen, frames, t0 = 0) {
  const fired = []
  for (let i = 0; i < frames; i++) {
    const deg = gen(i)
    const r = analyzer.push(deg, t0 + i * STEP)
    if (r.candidate) fired.push(r.candidate)
  }
  return fired
}

console.log('\n[2] 摇头：正弦 yaw 峰值（幅度18°，周期900ms）应触发一次 shake')
{
  const a = createHeadAnalyzer(ZERO, 'normal', HEAD_CONFIG, () => 0)
  const fired = runFrames(a, (i) => {
    const t = i * STEP
    const s = Math.sin((2 * Math.PI * t) / 900) * 18
    return { yaw: s, pitch: 0, roll: 0 }
  }, 45)
  assert(fired.filter(x => x === 'shake').length >= 1, `完整一次 shake（事件:${fired.join(',') || '无'}）`)
}

console.log('\n[2b] 震颤噪声：2°@8Hz 抖动 3 秒，绝不误触任何动作')
{
  const a = createHeadAnalyzer(ZERO, 'normal', HEAD_CONFIG, () => 0)
  const fired = runFrames(a, (i) => {
    const t = i * STEP
    return { yaw: 2 * Math.sin(2 * Math.PI * 8 * t / 1000), pitch: 1.5 * Math.sin(2 * Math.PI * 6 * t / 1000), roll: 0 }
  }, 90)
  assert(fired.length === 0, `零触发（实际 ${fired.join(',') || '无'}）`)
}

console.log('\n[2c] 敏感档也不被 3°@8Hz 触发（幅度门独立于间隔门）')
{
  const a = createHeadAnalyzer(ZERO, 'fast', HEAD_CONFIG, () => 0)
  const fired = runFrames(a, (i) => {
    const t = i * STEP
    return { yaw: 3 * Math.sin(2 * Math.PI * 8 * t / 1000), pitch: 0, roll: 0 }
  }, 90)
  assert(!fired.includes('shake'), '无 shake')
}

console.log('\n[3] 点头：pitch 下探14°再回升 => 一次 nod')
{
  const a = createHeadAnalyzer(ZERO, 'normal', HEAD_CONFIG, () => 0)
  const fired = runFrames(a, (i) => {
    let pitch = 0
    if (i >= 6 && i < 12) pitch = 14 * (i - 6) / 5
    else if (i >= 12 && i < 18) pitch = 14 - 14 * (i - 12) / 5
    return { yaw: 0, pitch, roll: 0 }
  }, 30)
  assert(fired.filter(x => x === 'nod').length === 1, `恰好一次 nod（事件:${fired.join(',') || '无'}）`)
}

console.log('\n[3b] 慢速漂移不触发：1.3s 缓下到 15° 再 1.3s 缓回 => 无 nod（速度门过滤）')
{
  const a = createHeadAnalyzer(ZERO, 'normal', HEAD_CONFIG, () => 0)
  runFrames(a, () => ({ yaw: 0, pitch: 0, roll: 0 }), 6)
  const seq = []
  for (let i = 0; i <= 40; i++) seq.push(15 * i / 40)
  for (let i = 40; i >= 0; i--) seq.push(15 * i / 40)
  const fired = runFrames(a, (i) => ({ yaw: 0, pitch: seq[i] ?? 0, roll: 0 }), seq.length, 6 * STEP)
  assert(!fired.includes('nod'), `慢漂移全程无 nod（事件:${fired.join(',') || '无'}）`)
}

console.log('\n[4] 单侧扭头：yaw 恒定 -18° 只触发一次 turnLeft，不重复')
{
  const a = createHeadAnalyzer(ZERO, 'normal', HEAD_CONFIG, () => 0)
  runFrames(a, () => ({ yaw: 0, pitch: 0, roll: 0 }), 10)   // 首帧即基线：先立中立姿态
  const fired = runFrames(a, () => ({ yaw: -18, pitch: 0, roll: 0 }), 30, 10 * STEP)
  assert(fired.filter(x => x === 'turnLeft').length === 1, `一次 turnLeft（事件:${fired.join(',') || '无'}）`)
}
{
  const a = createHeadAnalyzer(ZERO, 'normal', HEAD_CONFIG, () => 0)
  runFrames(a, () => ({ yaw: 0, pitch: 0, roll: 0 }), 6)
  const fired = runFrames(a, (i) => ({ yaw: i < 15 ? -18 : (i < 30 ? 0 : 18), pitch: 0, roll: 0 }), 45, 6 * STEP)
  assert(fired.includes('turnLeft') && fired.includes('turnRight'), '回中立后反向可再触发 turnRight')
}

console.log('\n[5] 抬头：快速上越 -20° 再回正 => lookUp')
{
  const a = createHeadAnalyzer(ZERO, 'normal', HEAD_CONFIG, () => 0)
  runFrames(a, () => ({ yaw: 0, pitch: 0, roll: 0 }), 3)
  const fired = runFrames(a, (i) => {
    let pitch = 0
    if (i >= 3 && i < 7) pitch = -20 * (i - 3) / 3
    else if (i >= 7 && i < 10) pitch = -20
    else if (i >= 10) pitch = -20 + 20 * Math.min(1, (i - 10) / 4)
    return { yaw: 0, pitch, roll: 0 }
  }, 20, 3 * STEP)
  assert(fired.includes('lookUp'), `lookUp 触发（事件:${fired.join(',') || '无'}）`)
}

console.log('\n[6] 中等幅度摇头 11°（周期900ms）：标准档触发、迟钝档（阈12.6°）不触发')
{
  const shake11 = (sens) => {
    const a = createHeadAnalyzer(ZERO, sens, HEAD_CONFIG, () => 0)
    return runFrames(a, (i) => {
      const t = i * STEP
      return { yaw: Math.sin((2 * Math.PI * t) / 900) * 11, pitch: 0, roll: 0 }
    }, 45)
  }
  assert(shake11('normal').includes('shake'), '标准档 11° 摇头可识别（旧 12° 门槛下常漏）')
  assert(!shake11('slow').includes('shake'), '迟钝档更难过阈值')
}

console.log('\n[7] 挥肘：左肘高于肩持续 400ms => elbowUp:left 一次')
{
  const an = createArmAnalyzer(ARM_CONFIG, () => 0)
  function pose(lElbowY, wristX) {
    const lm = new Array(33).fill(0).map(() => ({ x: 0.5, y: 0.5, visibility: 1 }))
    lm[11] = { x: 0.35, y: 0.4, visibility: 1 } // 左肩
    lm[12] = { x: 0.65, y: 0.4, visibility: 1 } // 右肩
    lm[13] = { x: 0.30, y: lElbowY, visibility: 1 }
    lm[14] = { x: 0.70, y: 0.55, visibility: 1 }
    lm[15] = { x: wristX ?? 0.30, y: 0.5, visibility: 1 }
    lm[16] = { x: wristX ?? 0.70, y: 0.5, visibility: 1 }
    return lm
  }
  const fired = []
  for (let i = 0; i < 15; i++) {
    const c = an.push(pose(0.30), i * STEP)
    if (c) fired.push(c)
  }
  assert(fired.filter(x => x === 'elbowUp:left').length === 1, `一次 elbowUp:left（事件:${fired.join(',') || '无'}）`)
}

console.log('\n[7b] 举腕过肩（肘未过肩）也触发 elbowUp:right')
{
  const an = createArmAnalyzer(ARM_CONFIG, () => 0)
  function poseWristUp() {
    const lm = new Array(33).fill(0).map(() => ({ x: 0.5, y: 0.5, visibility: 1 }))
    lm[11] = { x: 0.35, y: 0.4, visibility: 1 }
    lm[12] = { x: 0.65, y: 0.4, visibility: 1 }
    lm[13] = { x: 0.30, y: 0.55, visibility: 1 }
    lm[14] = { x: 0.70, y: 0.50, visibility: 1 } // 肘在肩下
    lm[15] = { x: 0.30, y: 0.6, visibility: 1 }
    lm[16] = { x: 0.70, y: 0.28, visibility: 1 } // 腕高于右肩 0.12 > 0.03
    return lm
  }
  const fired = []
  for (let i = 0; i < 15; i++) { const c = an.push(poseWristUp(), i * STEP); if (c) fired.push(c) }
  assert(fired.includes('elbowUp:right'), `举腕触发（事件:${fired.join(',') || '无'}）`)
}

console.log('\n[8] 横扫：右腕 500ms 内从 +0.2 肩宽扫到 -0.2 => sweep')
{
  const an = createArmAnalyzer(ARM_CONFIG, () => 0)
  function poseR(x) {
    const lm = new Array(33).fill(0).map(() => ({ x: 0.5, y: 0.5, visibility: 1 }))
    lm[11] = { x: 0.35, y: 0.4, visibility: 1 }
    lm[12] = { x: 0.65, y: 0.4, visibility: 1 }
    lm[13] = { x: 0.30, y: 0.55, visibility: 1 }
    lm[14] = { x: 0.70, y: 0.55, visibility: 1 }
    lm[15] = { x: 0.30, y: 0.6, visibility: 0.2 } // 左腕不可见
    lm[16] = { x, y: 0.45, visibility: 1 }
    return lm
  }
  const fired = []
  // 先扫到右侧 (+dx)，再扫到左侧 (-dx)，500ms 完成
  for (let i = 0; i < 8; i++) { const c = an.push(poseR(0.5 + 0.2 * 0.3), i * STEP); if (c) fired.push(c) }
  for (let i = 8; i < 16; i++) { const c = an.push(poseR(0.5 - 0.2 * 0.3), i * STEP); if (c) fired.push(c) }
  assert(fired.includes('sweep'), `sweep 触发（事件:${fired.join(',') || '无'}）`)
}

console.log('\n[9] 自适应基线：初始零点0但用户常態低头8°，静置收敛后 nod 仍能触发（相对运动）')
{
  const a = createHeadAnalyzer({ yaw: 0, pitch: 0, roll: 0 }, 'normal', HEAD_CONFIG, () => 0)
  // 静置 250 帧（~8s）让基线收敛到 pitch=8
  runFrames(a, () => ({ yaw: 0, pitch: 8, roll: 2 }), 250, 0)
  // 在 8° 常态上做一次点头（下探到 20 再回 8）
  const fired = runFrames(a, (i) => {
    let pitch = 8
    if (i >= 6 && i < 12) pitch = 8 + 12 * (i - 6) / 5
    else if (i >= 12 && i < 18) pitch = 20 - 12 * (i - 12) / 5
    return { yaw: 0, pitch, roll: 2 }
  }, 30, 250 * STEP)
  assert(fired.includes('nod'), `常态俯身下的 nod 触发（事件:${fired.join(',') || '无'}）`)
  // 触发后基线冻结：连续快速点头不应把 8° 偏移学丢
  // 先回正 12 帧过冷却窗，再以 1122ms 周期重复点头：应持续触发
  const fired2 = runFrames(a, (i) => {
    if (i < 12) return { yaw: 0, pitch: 8, roll: 2 }
    let pitch = 8
    const ph = (i - 12) % 34
    if (ph >= 6 && ph < 10) pitch = 8 + 10 * (ph - 6) / 3
    else if (ph >= 10 && ph < 14) pitch = 18
    else if (ph >= 14) pitch = Math.max(8, 18 - 10 * (ph - 14) / 4)
    return { yaw: 0, pitch, roll: 2 }
  }, 90, 280 * STEP)
  assert(fired2.filter(x => x === 'nod').length >= 2, `重复点头可持续触发（${fired2.filter(x => x === 'nod').length} 次）`)
}

console.log('\n[10] 举手过顶不触发 sweep（高度门）')
{
  const an = createArmAnalyzer(ARM_CONFIG, () => 0)
  function poseOverHead(phase) {
    const lm = new Array(33).fill(0).map(() => ({ x: 0.5, y: 0.5, visibility: 1 }))
    lm[11] = { x: 0.35, y: 0.4, visibility: 1 }
    lm[12] = { x: 0.65, y: 0.4, visibility: 1 }
    lm[13] = { x: 0.30, y: 0.30, visibility: 1 }
    lm[14] = { x: 0.70, y: 0.30, visibility: 1 }
    // 双手在头顶合拢：腕很高（y=0.12 远在肩线上方）且 x 左右小幅移动
    lm[15] = { x: phase ? 0.42 : 0.58, y: 0.12, visibility: 1 }
    lm[16] = { x: phase ? 0.58 : 0.42, y: 0.12, visibility: 1 }
    return lm
  }
  const fired = []
  for (let i = 0; i < 20; i++) { const c = an.push(poseOverHead(i % 4 < 2), i * STEP); if (c) fired.push(c) }
  assert(!fired.includes('sweep'), `头顶摆动手不判横扫（事件:${fired.join(',') || '无'}）`)
}

console.log('\n[11] 几何俯仰回退通道：矩阵 pitch=NaN 时仅靠 geo 也能 nod；geometricPitchRatio=(鼻-眼)/瞳距')
{
  // 合成面部关键点：眼 y=0.3，鼻 y=0.42，瞳距 0.2 -> ratio=(0.42-0.3)/0.2=0.6
  const lm = new Array(478).fill(0).map(() => ({ x: 0.5, y: 0.5, z: 0 }))
  lm[33] = { x: 0.4, y: 0.3, z: 0 }; lm[263] = { x: 0.6, y: 0.3, z: 0 }
  lm[1] = { x: 0.5, y: 0.42, z: 0 }; lm[152] = { x: 0.5, y: 0.6, z: 0 }
  const r = geometricPitchRatio(lm)
  assert(Math.abs(r - 0.6) < 1e-6, `ratio=0.6（实际 ${r}）`)
  const a = createHeadAnalyzer({ yaw: 0, pitch: 0, roll: 0 }, 'normal', HEAD_CONFIG, () => 0)
  // 矩阵 pitch 全 NaN（解析失败），geo 正常：静置 40 帧 -> 下探 -> 回正
  const fired = runFrames(a, (i) => ({ yaw: 0, pitch: NaN, roll: NaN, geo: 0.6 }), 40)
  assert(fired.length === 0, 'NaN pitch + 静止 geo 不触发')
  const fired2 = runFrames(a, (i) => {
    let geo = 0.6
    if (i >= 4 && i < 10) geo = 0.6 + 0.08 * (i - 4) / 5
    else if (i >= 10 && i < 16) geo = 0.68 - 0.08 * (i - 10) / 5
    return { yaw: 0, pitch: NaN, roll: NaN, geo }
  }, 30, 40 * STEP)
  assert(fired2.includes('nod'), `矩阵坏+几何好仍能 nod（事件:${fired2.join(',') || '无'}）`)
}

console.log('\n[12] 张嘴闸门：3帧确认 + 迟滞，抖动不误触，二次张嘴可再触发')
{
  const gate = createMouthGate(HEAD_CONFIG, () => 0)
  const ev = []
  let t = 0
  for (; t < 100; t += 33) ev.push(gate.push(0.1, t))
  for (; t < 300; t += 33) ev.push(gate.push(0.55, t))
  assert(ev.filter(x => x === 'mouthOpen').length === 1, '张开一次触发一次')
  let jitter = 0
  for (let i = 0; i < 8; i++) { if (gate.push(i % 2 ? 0.5 : 0.42, t += 33) === 'mouthOpen') jitter++ }
  assert(jitter === 0, '保持态抖动（未回落到退出阈值）不重复触发')
  t += 100
  for (let i = 0; i < 8; i++) gate.push(0.1, t += 33)
  let second = false
  for (let i = 0; i < 8; i++) if (gate.push(0.6, t += 33) === 'mouthOpen') second = true
  assert(second, '闭合后再张开可再次触发')
  // 2帧尖峰不触发
  const g2 = createMouthGate(HEAD_CONFIG, () => 0)
  let fired2 = false
  for (let i = 0; i < 30; i++) {
    const score = (i === 10 || i === 11) ? 0.8 : 0.05
    if (g2.push(score, i * 33) === 'mouthOpen') fired2 = true
  }
  assert(!fired2, '2帧尖峰不触发（需3帧确认）')
}

console.log('\n[13] handsUp：双手举过头顶靠拢(倒V拱形) => handsUp；举起全程无 elbowUp 截胡；单手举仍 elbowUp')
{
  function base() {
    const lm = new Array(33).fill(0).map(() => ({ x: 0.5, y: 0.5, visibility: 1 }))
    lm[11] = { x: 0.35, y: 0.4, visibility: 1 }
    lm[12] = { x: 0.65, y: 0.4, visibility: 1 }
    return lm
  }
  // 双手同步上举：腕 0.5 -> 0.02 且向中线靠拢，肘外展
  function raisePose(k) {
    const lm = base()
    lm[13] = { x: 0.18, y: 0.4 - 0.1 * k, visibility: 1 }
    lm[14] = { x: 0.82, y: 0.4 - 0.1 * k, visibility: 1 }
    const wy = 0.5 - 0.48 * k
    lm[15] = { x: 0.5 - 0.12 * (1 - k), y: wy, visibility: 1 }
    lm[16] = { x: 0.5 + 0.12 * (1 - k), y: wy, visibility: 1 }
    return lm
  }
  const an = createArmAnalyzer(ARM_CONFIG, () => 0)
  const fired = []
  for (let i = 0; i <= 12; i++) { const c = an.push(raisePose(i / 12), i * STEP); if (c) fired.push(c) }
  for (let i = 13; i < 30; i++) { const c = an.push(raisePose(1), i * STEP); if (c) fired.push(c) }
  assert(fired.includes('handsUp'), `handsUp 触发（${fired.join(',') || '无'}）`)
  assert(!fired.some(x => x.startsWith('elbowUp')), `举起全程无挥肘截胡（${fired.join(',') || '无'}）`)
  const an2 = createArmAnalyzer(ARM_CONFIG, () => 0)
  const one = base()
  one[14] = { x: 0.70, y: 0.15, visibility: 1 }
  one[16] = { x: 0.68, y: 0.05, visibility: 1 }
  one[13] = { x: 0.30, y: 0.55, visibility: 1 }
  one[15] = { x: 0.30, y: 0.6, visibility: 1 }
  const fired2 = []
  for (let i = 0; i < 15; i++) { const c = an2.push(one, i * STEP); if (c) fired2.push(c) }
  assert(fired2.includes('elbowUp:right') && !fired2.includes('handsUp'), `单手举 => elbowUp:right（${fired2.join(',')}）`)
}

console.log('\n[15] 小快点头：3帧嗑到 6° 再回正 => nod（不需要夸张幅度）')
{
  const a = createHeadAnalyzer({ yaw: 0, pitch: 0, roll: 0 }, 'normal', HEAD_CONFIG, () => 0)
  runFrames(a, () => ({ yaw: 0, pitch: 0, roll: 0 }), 6)
  const seq = [0, 0, 0, 6, 6, 6, 0, 0, 0]
  const fired = runFrames(a, (i) => ({ yaw: 0, pitch: seq[i] ?? 0, roll: 0 }), seq.length, 6 * STEP)
  assert(fired.includes('nod'), `6° 小快点头触发（事件:${fired.join(',') || '无'}）`)
}

console.log('\n[17] 回正震荡免疫：点头后"过冲-6°再落+9°再回正"只算一次；干净回正驻留后可再点')
{
  const a = createHeadAnalyzer(ZERO, 'normal', HEAD_CONFIG, () => 0)
  runFrames(a, () => ({ yaw: 0, pitch: 0, roll: 0 }), 6)
  // 第一次点头(0->15 保持) -> 过冲-6 -> 又落+9(bob) -> 回正停 24 帧
  const bob = [0, 5, 10, 15, 15, 15, -6, -6, -6, 9, 9, 9, ...new Array(24).fill(0)]
  const firedA = runFrames(a, (i) => ({ yaw: 0, pitch: bob[i] ?? 0, roll: 0 }), bob.length, 6 * STEP)
  assert(firedA.filter(x => x === 'nod').length === 1, `bob 全程只算一次（${firedA.filter(x => x === 'nod').length} 次）`)
  // 干净第二次：上抬 4 帧 -> 保持 2 帧 -> 回正（冷却 600ms 已过）
  const t1 = (6 + bob.length) * STEP
  const firedB = runFrames(a, (i) => {
    let pitch = 0
    if (i < 4) pitch = 15 * i / 3
    else if (i < 6) pitch = 15
    return { yaw: 0, pitch, roll: 0 }
  }, 12, t1)
  assert(firedB.includes('nod'), `回正驻留后再点头正常触发（${firedB.join(',') || '无'}）`)
}

console.log('\n[18] 步进循环语义：前进绕回、后退同样绕回（A 退 = D）')
{
  assert(cycleNext(-1, 4) === 0, '首次点头进入 A')
  assert(cycleNext(2, 4) === 3 && cycleNext(3, 4) === 0, 'C->D->A 正向绕回')
  assert(cyclePrev(2, 4) === 1, '后退一步 C->B')
  assert(cyclePrev(0, 4) === 3, 'A 再退绕回 D')
  assert(cyclePrev(-1, 4) === 3, '未进入步进态时后退从 D 开始')
  assert(cyclePrev(3, 4) === 2 && cyclePrev(2, 4) === 1, 'D->C->B 反向绕回')
}

console.log('\n[20] 相对回落：点头后只回到 3°（坐低头位天然偏低）仍能出事件——v6 要求回到 2° 是"点烂头"真凶')
{
  const a = createHeadAnalyzer(ZERO, 'normal', HEAD_CONFIG, () => 0)
  runFrames(a, () => ({ yaw: 0, pitch: 0, roll: 0 }), 6)
  const seq = [0, 8, 14, 14, 6, 3, 3, 3, 3, 3, 3, 3]
  const fired = runFrames(a, (i) => ({ yaw: 0, pitch: seq[i] ?? 3, roll: 0 }), seq.length, 6 * STEP)
  assert(fired.filter(x => x === 'nod').length === 1, `回不到零位也恰好一次 nod（${fired.join(',') || '无'}）`)
}

console.log('\n[21] 保持低头不放：超时评估出一次 nod，且不连发（回落前不再开新口）')
{
  const a = createHeadAnalyzer(ZERO, 'normal', HEAD_CONFIG, () => 0)
  runFrames(a, () => ({ yaw: 0, pitch: 0, roll: 0 }), 6)
  const fired = runFrames(a, (i) => {
    let pitch = 0
    if (i < 3) pitch = 16 * i / 2
    else pitch = 16
    return { yaw: 0, pitch, roll: 0 }
  }, 60, 6 * STEP)
  assert(fired.filter(x => x === 'nod').length === 1, `低头保持 2 秒只出一次（${fired.filter(x => x === 'nod').length} 次）`)
}

console.log('\n[22] 诊断链输出：HUD 能看到判定值（相对俯仰/峰值/开口状态）')
{
  const a = createHeadAnalyzer(ZERO, 'normal', HEAD_CONFIG, () => 0)
  runFrames(a, () => ({ yaw: 0, pitch: 0, roll: 0 }), 4)
  let last = null
  for (let i = 0; i < 6; i++) last = a.push({ yaw: 0, pitch: 12, roll: 0 }, (4 + i) * STEP)
  assert(last && last.debug && Math.abs(last.debug.val - 12) < 6, `debug.val 跟手（得 ${last.debug && last.debug.val}）`)
  assert(last.thresh >= 5 && last.debug.excOpen === true, `阈${last.thresh} 开口${last.debug.excOpen}`)
}

console.log('\n[19] 微笑闸门：3帧确认 + 迟滞，与张嘴互不干扰')
{
  const g = createSmileGate(HEAD_CONFIG, () => 0)
  let t = 0
  const ev = []
  for (; t < 200; t += 33) ev.push(g.push(0.1, t))
  for (; t < 400; t += 33) ev.push(g.push(0.5, t))
  assert(ev.filter(x => x === 'smile').length === 1, '微笑一次触发一次')
  for (; t < 600; t += 33) g.push(0.05, t)
  let second = false
  for (; t < 900; t += 33) if (g.push(0.55, t) === 'smile') second = true
  assert(second, '放松后再笑可再触发')
  assert(!ev.includes('mouthOpen'), '微笑事件不串到张嘴')
}

console.log(`\n========== head/arm 结果：${pass} passed, ${fail} failed ==========`)
process.exit(fail ? 1 : 0)
