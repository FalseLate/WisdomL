/**
 * 头部姿态几何层（纯逻辑，零 DOM 依赖，可被 Node 自测直接引用）
 *
 * 输入：FaceLandmarker 的 4x4 变换矩阵（outputFaceTransformationMatrixes）分解出的
 *       yaw/pitch/roll（弧度），或降级几何法算出的近似角。
 * 设计原则（与 gestureGeometry.js 同一套思路，针对震颤用户做了峰值化）：
 * 1. 进入前必须零点校准：坐姿/摄像头高度差异极大，全部角度相对校准零点计算
 * 2. 点头/摇头用「峰值检测」而非「保持时长」：震颤用户维持不住任何静态姿势，
 *    但越过阈值再回来的动态动作做得到；震颤周期(<150ms)被双峰间隔门排除
 * 3. 单侧扭头用迟滞 enter/exit 双阈值 + 不应期，临界抖动不来回跳
 * 4. 所有角度阈值可按灵敏度档整体缩放（迟钝×1.4 / 标准×1.0 / 敏感×0.7）
 */

export const HEAD_CONFIG = {
  EMA_ALPHA: 0.4,            // 头部角度平滑（yaw/roll）
  PITCH_EMA: 0.65,           // 俯仰用更弱的平滑（α 更大）：0.4 会把 3 帧的小快点头直接衰减掉峰值以下（"点烂头"元凶之一）
  BASELINE_ALPHA: 0.006,     // 自然姿态基线自适应速率（缓慢跟随坐姿漂移）
  BASELINE_BAND: 5,          // 只在距基线 ±5° 内学习：必须小于手势阈值，否则会把动作学掉（v2 的教训）
  BASELINE_FREEZE_MS: 1500,  // 触发任何手势后冻结基线的时间
  YAW_ENTER: 12,             // 单侧扭头进入阈值（度，相对基线）
  YAW_EXIT: 6,               // 扭头复位阈值（迟滞带 6~12）
  COOLDOWN_TURN: 700,        // 扭头触发后不应期 ms
  // ---- 俯仰手势（点头/抬头）v7：小幅+快速的"挥动"检测 ----
  // v6 的两个真机致命点在此修掉：
  //  1) 旧版要求回到 |俯仰|<2° 才评估事件——坐着时头位天然低于基线两三度，
  //     于是 excursion 永远闭不上、超时作废，表现为"点烂头一个都不认"；
  //     改为相对峰值回落评估 + 超时也评估（保持低头不放同样出一次事件）。
  //  2) 旧版只看相邻帧瞬时角速度，33~100ms 的送帧抖动会把速度摊平到门槛以下；
  //     改为"峰值瞬时速度 或 上升到峰值的均速"任一达标即可。
  FLICK_AMP_MIN: 5,          // 幅度阈值下限（度）
  FLICK_AMP_MAX: 14,         // 噪声自适应的上限
  FLICK_NOISE_MULT: 3,       // 阈值 = max(下限, 静止噪声EMA × 此倍数)：每个人自动标定
  FLICK_VEL: 18,             // 峰值瞬时角速度门限（度/秒）
  FLICK_MEAN_VEL: 18,        // 起点→峰值均速门限（度/秒）：抗送帧抖动，慢漂移（<15°/s）被排除
  FLICK_RETURN_FRAC: 0.5,    // 回落到 |峰值| × 此比例（且不低于阈值×0.6）即评估事件
  FLICK_MIN_MS: 80,          // 挥动最短历时
  FLICK_TIMEOUT_MS: 1200,    // 单次挥动最长历时：超时同样评估并出事件（不再作废）
  PITCH_COOLDOWN_MS: 600,    // 两次俯仰手势最小间隔（连点节奏）
  SHAKE_PEAK: 9,             // 摇头：单峰相对基线最小幅值（度）——12° 要求太夸张，中等幅度摇头常被判漏
  SHAKE_RETURN: 5,           // 摇头：两峰间必须回落到的中立带（度）
  SHAKE_PEAK_GAP: 220,       // 摇头：双峰最小间隔 ms（排除震颤高频；正常"否"字头摆约 250~400ms）
  SHAKE_TOTAL_WIN: 1600,     // 摇头：双峰需在此窗口内完成（摇得慢也要算）
  SHAKE_COOLDOWN: 800,       // 摇头触发后不应期 ms
  NEUTRAL: 6,                // 中立带（离屏检测取反用）
  OFFSCREEN_YAW: 35,         // 离屏：|yaw| 超过此角度
  OFFSCREEN_HOLD: 4000,      // 离屏：持续时间 ms
  // ---- 几何俯仰（鼻尖在眼-下巴带中的相对位置）：矩阵 pitch 的冗余信号源 ----
  GEO_EMA: 0.45,             // 几何 pitch 平滑
  GEO_BASE_BAND: 0.02,       // 几何基线学习带（≈4°），同样必须小于手势阈值
  GEO_OFFSCREEN: 0.15,       // 离屏：持续深度低头阈值
  // ---- 嘴部信号（blendshape 迟滞闸门）----
  MOUTH_ENTER: 0.45,         // 张嘴进入阈值
  MOUTH_EXIT: 0.28,          // 张嘴退出阈值（迟滞带防抖）
  MOUTH_FRAMES: 3,           // 连续达标帧数才认定张开
  SMILE_ENTER: 0.22,         // 微笑（mouthSmileLeft/Right 均值）进入阈值：真机轻微微笑常在 0.25~0.5
  SMILE_EXIT: 0.12
}

export const SENSITIVITY_SCALE = { slow: 1.4, normal: 1.0, fast: 0.7 }

/**
 * 从 FaceLandmarker 的变换矩阵提取头部角度
 * 实测+推导钉死的轴语义（mediapipe 面部规范坐标：X=点头轴，Y=扭头轴，Z=滚转轴/脸法线）：
 *  - 扭头(yaw) = atan2(R[1][0], R[0][0])（真机验证跟手）
 *  - 点头(pitch) = asin(-R[1][2])，即"鼻尖法线在相机竖直方向的分量"——
 *    对旋转复合顺序不敏感；此前用 ZYX 分解的 asin(-R[2][0]) 实际读的是扭头轴，
 *    导致点头动作在该值上几乎不动（真机实测：明显低头时旧公式 0.6°，新公式 26.3°）
 *  - roll = atan2(R[2][1], R[2][2])
 * data 布局用平移位置自动判别列主序(12~14)/行主序(3/7/11)。
 * @param {{data?:ArrayLike<number>}|ArrayLike<number>} m Matrix 对象或扁平数组
 * @returns {{yaw:number,pitch:number,roll:number}|null} 弧度，非法数据返回 null
 */
export function eulerAnglesFromMatrix(m) {
  const d = m && m.data ? m.data : m
  if (!d || d.length < 11) return null
  const rightColZero = d[3] === 0 && d[7] === 0 && d[11] === 0
  let r00, r10, r21, r22, noseY
  if (rightColZero) {           // 列主序: R[row][col] = d[col*4+row]
    r00 = d[0]; r10 = d[1]; r21 = d[6]; r22 = d[10]
    noseY = d[9]                // R[1][2] = 鼻尖法线的竖直分量
  } else {                      // 行主序: R[row][col] = d[row*4+col]
    r00 = d[0]; r10 = d[4]; r21 = d[9]; r22 = d[10]
    noseY = d[6]                // R[1][2]
  }
  if (Math.abs(noseY) > 1 || !isFinite(r00) || !isFinite(r10)) return null
  const pitch = Math.asin(Math.max(-1, Math.min(1, -noseY)))
  const yaw = Math.atan2(r10, r00)
  const roll = Math.atan2(r21, r22)
  if (!isFinite(yaw) || !isFinite(pitch) || !isFinite(roll)) return null
  return { yaw, pitch, roll }
}

/**
 * 降级几何法：由面部关键点近似 yaw/pitch（无变换矩阵时使用）
 * yaw: 鼻尖 x 相对两外眼角中点 x，瞳距归一；pitch: 鼻尖 y 相对(眼-下巴)带的比例偏移
 */
export function anglesFromLandmarks(lm) {
  const NOSE = 1, LEFT_EYE = 33, RIGHT_EYE = 263, CHIN = 152
  const eyeMid = { x: (lm[LEFT_EYE].x + lm[RIGHT_EYE].x) / 2, y: (lm[LEFT_EYE].y + lm[RIGHT_EYE].y) / 2 }
  const ipd = Math.hypot(lm[LEFT_EYE].x - lm[RIGHT_EYE].x, lm[LEFT_EYE].y - lm[RIGHT_EYE].y) || 1e-6
  const yaw = Math.atan2(lm[NOSE].x - eyeMid.x, ipd) * 2
  const faceLen = Math.abs(lm[CHIN].y - eyeMid.y) || 1e-6
  const pitch = ((lm[NOSE].y - eyeMid.y) / faceLen) * 0.9
  return { yaw, pitch: -pitch, roll: 0 }
}

const DEG = 180 / Math.PI

/**
 * 几何俯仰回退（无变换矩阵时用）：鼻尖在眼中点下方的距离 / 瞳距。
 * 注意：不能用 (鼻-眼)/(下巴-眼) 归一——低头时分子分母同比压缩会自我抵消（实测不敏感）。
 * @param {Array} lm faceLandmarks[0]
 * @returns {number|null}
 */
export function geometricPitchRatio(lm) {
  const NOSE = 1, LEFT_EYE = 33, RIGHT_EYE = 263
  if (!lm || !lm[NOSE]) return null
  const eyeY = (lm[LEFT_EYE].y + lm[RIGHT_EYE].y) / 2
  const ipd = Math.hypot(lm[LEFT_EYE].x - lm[RIGHT_EYE].x, lm[LEFT_EYE].y - lm[RIGHT_EYE].y)
  if (!ipd || ipd < 0.02) return null
  const r = (lm[NOSE].y - eyeY) / ipd
  return r > -2 && r < 2 ? r : null
}

/**
 * 张嘴闸门：jawOpen blendshape 分数 -> 'mouthOpen' 瞬时事件（迟滞 + N帧确认）
 */
export function createMouthGate(cfg = HEAD_CONFIG, now = () => performance.now()) {
  return createFaceSignalGate('mouthOpen', () => cfg.MOUTH_ENTER, () => cfg.MOUTH_EXIT, cfg.MOUTH_FRAMES, now)
}

/**
 * 微笑闸门：mouthSmile 均值 -> 'smile' 瞬时事件（零颈部负担的循环信号）
 */
export function createSmileGate(cfg = HEAD_CONFIG, now = () => performance.now()) {
  return createFaceSignalGate('smile', () => cfg.SMILE_ENTER, () => cfg.SMILE_EXIT, cfg.MOUTH_FRAMES, now)
}

function createFaceSignalGate(event, enterFn, exitFn, frames, now) {
  let open = false
  let run = 0
  return {
    get isOpen() { return open },
    push(score, nowMs = now()) {
      if (score == null || !isFinite(score)) { run = 0; return null }
      if (!open) {
        if (score > enterFn()) {
          if (++run >= frames) { open = true; run = 0; return event }
        } else run = 0
      } else if (score < exitFn()) {
        open = false
      }
      return null
    }
  }
}

/**
 * 头部手势分析器（核心状态机，注入时钟便于自测）
 * @param {{yaw:number,pitch:number,roll:number}} zero 校准零点（度）
 * @param {'slow'|'normal'|'fast'} sensitivity
 * @param {()=>number} now
 * @returns {push(deg, nowMs?)=>{candidate:string|null, angles:{yaw,pitch,roll}, offscreen:boolean}}
 *   candidate: 'turnLeft' | 'turnRight' | 'nod' | 'lookUp' | 'shake' | null
 */
export function createHeadAnalyzer(zero, sensitivity = 'normal', cfg = HEAD_CONFIG, now = () => performance.now()) {
  const k = SENSITIVITY_SCALE[sensitivity] ?? 1
  let ema = null
  // 自适应基线：缓慢跟随用户自然坐姿头位（替代手动零点校准）
  const base = { ...zero }
  let emaGeo = null
  let baseGeo = 0
  let geoInit = false
  let lastGestureAt = -Infinity
  // 扭头迟滞
  let turnSide = 0          // -1 左 / +1 右 / 0 中立
  let lastTurnAt = -Infinity
  // 俯仰挥动检测状态
  let exc = null            // {sign, peak, peakAbs, vel, t0, tPeak}
  let armed = true          // 触发后必须先回落到回落带内才允许开下一次（保持姿势不连发）
  let prevVal = null
  let prevT = 0
  let noise = 0             // 静止噪声 EMA（度）
  let lastPitchAt = -Infinity
  // 每帧判定值（HUD 诊断用：到底是哪一道门把动作拦住了，一眼可见）
  const lastDebug = { val: 0, peak: 0, vel: 0, meanVel: 0, excOpen: false, geoDeg: 0 }
  // 摇头峰序列
  const peaks = []          // {t, sign, mag}
  let lastShakeAt = -Infinity
  // 离屏
  let offT0 = 0

  function push(deg, nowMs = now()) {
    if (!deg || !isFinite(deg.yaw)) {
      // 非法帧：清空平滑状态，绝不让 NaN 污染 EMA
      ema = null; geoInit = false
      return { candidate: null, angles: null, offscreen: false }
    }
    // pitch/roll 缺失（矩阵解析失败）时用几何俯仰反推占位，yaw 仍走矩阵
    const hasMatrix = isFinite(deg.pitch)
    deg = {
      yaw: deg.yaw,
      pitch: hasMatrix ? deg.pitch : (deg.geo != null ? deg.geo / 0.005 : 0),
      roll: isFinite(deg.roll) ? deg.roll : 0,
      geo: deg.geo,
      hasMatrix
    }
    // EMA 平滑（度）；首帧同时作为基线初值（当前姿态即零点，无需等待收敛）
    if (!ema) {
      ema = { ...deg }
      base.yaw = deg.yaw; base.pitch = deg.pitch; base.roll = deg.roll
    }
    else {
      const a = cfg.EMA_ALPHA
      ema = {
        yaw: a * deg.yaw + (1 - a) * ema.yaw,
        pitch: cfg.PITCH_EMA * deg.pitch + (1 - cfg.PITCH_EMA) * ema.pitch,
        roll: a * deg.roll + (1 - a) * ema.roll
      }
    }
    const nearBase = Math.abs(ema.yaw - base.yaw) < cfg.BASELINE_BAND &&
      Math.abs(ema.pitch - base.pitch) < cfg.BASELINE_BAND &&
      Math.abs(ema.roll - base.roll) < cfg.BASELINE_BAND &&
      nowMs - lastGestureAt > cfg.BASELINE_FREEZE_MS
    if (nearBase) {
      const b = cfg.BASELINE_ALPHA
      base.yaw += (ema.yaw - base.yaw) * b
      base.pitch += (ema.pitch - base.pitch) * b
      base.roll += (ema.roll - base.roll) * b
    }
    const yaw = ema.yaw - base.yaw
    const pitch = ema.pitch - base.pitch
    const roll = ema.roll - base.roll
    // ===== 几何俯仰通道（矩阵缺失时的降级源；geo 缺失时按 1°≈0.005 比例反推）=====
    const rawGeo = deg.geo != null && isFinite(deg.geo) ? deg.geo : deg.pitch * 0.005
    if (!geoInit) { emaGeo = rawGeo; baseGeo = rawGeo; geoInit = true }
    else {
      const ga = cfg.GEO_EMA
      emaGeo = ga * rawGeo + (1 - ga) * emaGeo
    }
    const geoNearBase = Math.abs(emaGeo - baseGeo) < cfg.GEO_BASE_BAND &&
      nowMs - lastGestureAt > cfg.BASELINE_FREEZE_MS
    if (geoNearBase) baseGeo += (emaGeo - baseGeo) * cfg.BASELINE_ALPHA
    const relGeo = emaGeo - baseGeo
    const geoDeg = relGeo / 0.005
    // ===== 俯仰判定单源：矩阵 pitch 优先（真机已验证跟手），仅矩阵不可用时用几何。
    //       此前"取更极端者"会让两个信号逐帧切换，峰值/速度序列被打断。=====
    const pitchVal = deg.hasMatrix === false ? geoDeg : pitch
    let vel = 0
    if (prevVal != null && nowMs > prevT) vel = (pitchVal - prevVal) / (nowMs - prevT) * 1000
    prevVal = pitchVal; prevT = nowMs
    const ampTh = Math.min(cfg.FLICK_AMP_MAX, Math.max(cfg.FLICK_AMP_MIN, noise * cfg.FLICK_NOISE_MULT)) * k
    const angles = { yaw, pitch, roll, geo: relGeo }
    let candidate = null

    // ===== 摇头（优先判定：双峰模式先占用，抑制期间的单侧扭头）=====
    prunePeaks(nowMs)
    const signed = yawPeak(nowMs, yaw)
    if (signed) candidate = 'shake'

    // ===== 单侧扭头（带不应期，且刚判过摇头不开新口）=====
    if (!candidate && nowMs - lastShakeAt > cfg.SHAKE_COOLDOWN) {
      const enter = cfg.YAW_ENTER * k, exit = cfg.YAW_EXIT * k
      if (turnSide === 0) {
        if (yaw < -enter && nowMs - lastTurnAt > cfg.COOLDOWN_TURN) { turnSide = -1; candidate = 'turnLeft'; lastTurnAt = nowMs }
        else if (yaw > enter && nowMs - lastTurnAt > cfg.COOLDOWN_TURN) { turnSide = 1; candidate = 'turnRight'; lastTurnAt = nowMs }
      } else if (Math.abs(yaw) < exit) {
        turnSide = 0
      }
    }

    // ===== 俯仰挥动手势（点头/抬头：小幅+快速，慢漂移被速度门过滤）=====
    if (!candidate) candidate = pitchFsm(pitchVal, vel, ampTh, nowMs)
    lastDebug.val = pitchVal
    lastDebug.vel = vel
    lastDebug.geoDeg = geoDeg
    lastDebug.excOpen = !!exc

    // ===== 离屏检测（供 ADHD 层，不产生动作）=====
    const isOff = Math.abs(yaw) > cfg.OFFSCREEN_YAW || relGeo > cfg.GEO_OFFSCREEN
    if (!isOff) offT0 = 0
    else if (!offT0) offT0 = nowMs
    const offscreen = offT0 && nowMs - offT0 >= cfg.OFFSCREEN_HOLD

    if (candidate) lastGestureAt = nowMs
    lastDebug.val = +pitchVal.toFixed(1)
    lastDebug.vel = +vel.toFixed(1)
    lastDebug.excOpen = !!exc
    lastDebug.geoDeg = +geoDeg.toFixed(1)
    return { candidate, angles, offscreen, thresh: ampTh, debug: { ...lastDebug } }
  }

  // 记录越过的 yaw 极值：方向翻转且幅值达标时入峰表
  let runExt = { sign: 0, mag: 0 }
  function yawPeak(nowMs, yaw) {
    const th = cfg.SHAKE_PEAK * k
    const sign = yaw > cfg.SHAKE_RETURN * k ? 1 : yaw < -cfg.SHAKE_RETURN * k ? -1 : 0
    if (sign !== 0) {
      if (Math.abs(yaw) > Math.abs(runExt.mag)) runExt = { sign, mag: yaw }
      const prevOpp = runExt.sign === 1 ? -1 : 1
      if (sign !== runExt.sign && Math.abs(runExt.mag) >= th) {
        // 极值已反向确认，落峰
        peaks.push({ t: nowMs, sign: runExt.sign, mag: runExt.mag })
        runExt = { sign, mag: yaw }
      }
    }
    // 回到中立带说明上一个极值已结束
    if (sign === 0 && Math.abs(runExt.mag) >= th) {
      peaks.push({ t: nowMs, sign: runExt.sign, mag: runExt.mag })
      runExt = { sign: 0, mag: 0 }
    } else if (sign === 0) {
      runExt = { sign: 0, mag: 0 }
    }
    if (peaks.length >= 2) {
      const [a, b] = peaks.slice(-2)
      if (
        a.sign !== b.sign &&
        Math.abs(a.mag) >= th && Math.abs(b.mag) >= th &&
        b.t - a.t >= cfg.SHAKE_PEAK_GAP &&
        b.t - a.t <= cfg.SHAKE_TOTAL_WIN &&
        nowMs - lastShakeAt > cfg.SHAKE_COOLDOWN
      ) {
        peaks.length = 0
        runExt = { sign: 0, mag: 0 }
        lastShakeAt = nowMs
        return 'shake'
      }
    }
    return null
  }

  function prunePeaks(nowMs) {
    while (peaks.length && nowMs - peaks[0].t > cfg.SHAKE_TOTAL_WIN) peaks.shift()
  }

  // 俯仰挥动 FSM v7：越过自适应幅度阈值即开口，回落到峰值的一半（或超时）即评估出事件。
  // 事件条件：幅度达标 且（峰值瞬时角速度 或 起势均速 任一达标）——慢速低头/疲劳下沉被排除，
  // 有意的小快"嗑头"轻抬就能触发；保持低头不放也只在超时那一刻出一次事件。
  function pitchFsm(val, vel, ampTh, nowMs) {
    if (!exc) {
      // 静止噪声学习：只在接近中立且无 excursion 时更新
      if (Math.abs(val) < cfg.FLICK_AMP_MIN) noise += (Math.abs(val) - noise) * 0.002
      // 重新武装只看"回落到阈值以下"：坐姿头位天然偏离基线两三度也能连点
      if (!armed && Math.abs(val) <= ampTh * 0.9) armed = true
      if (armed && Math.abs(val) > ampTh) {
        exc = { sign: Math.sign(val), peak: val, peakAbs: Math.abs(val), vel, t0: nowMs, tPeak: nowMs }
        lastDebug.peak = exc.peak
      }
      return null
    }
    if (Math.abs(val) > exc.peakAbs) {
      exc.peak = val; exc.peakAbs = Math.abs(val); exc.tPeak = nowMs
    }
    if (Math.abs(vel) > Math.abs(exc.vel)) exc.vel = vel
    lastDebug.peak = exc.peak
    const riseMs = Math.max(1, exc.tPeak - exc.t0)
    lastDebug.meanVel = exc.peakAbs / riseMs * 1000
    const outOfTime = nowMs - exc.t0 > cfg.FLICK_TIMEOUT_MS
    // 回落判定用"相对峰值"而不是"回到绝对零位"：坐低头位偏两三度也能正常闭口
    const fallBand = Math.max(1.5, Math.min(ampTh * 0.6, exc.peakAbs * cfg.FLICK_RETURN_FRAC))
    const fellBack = Math.abs(val) <= fallBand && nowMs - exc.t0 >= cfg.FLICK_MIN_MS
    if (!fellBack && !outOfTime) return null
    const kSpeed = k <= 1 ? k : 1 / k   // 迟钝档只放宽幅度，速度门反而要更低（残障用户动作慢）
    const fired = exc.peakAbs >= ampTh &&
      (Math.abs(exc.vel) >= cfg.FLICK_VEL * kSpeed || lastDebug.meanVel >= cfg.FLICK_MEAN_VEL * kSpeed) &&
      nowMs - lastPitchAt > cfg.PITCH_COOLDOWN_MS
    const sign = exc.sign
    exc = null
    armed = fellBack   // 超时时头还抬着：不重新回落就不再开下一次，避免保持姿势连发
    lastDebug.peak = 0; lastDebug.meanVel = 0
    if (fired) {
      lastPitchAt = nowMs
      return sign > 0 ? 'nod' : 'lookUp'
    }
    return null
  }

  return { push }
}
