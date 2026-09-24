/**
 * 手势几何识别纯逻辑模块（不依赖 Vue / 浏览器 DOM，可直接被 Node 单测引用）
 *
 * 设计原则（针对旧版全部误判根因）：
 * 1. 坐标先镜像（x -> 1-x），与用户在前置摄像头里看到的方向一致，左右不再反
 * 2. 四指屈伸用「指尖到手腕距离 / PIP到手腕距离」，旋转不变，手倾斜也成立
 * 3. 所有长度除以掌长 palmSize（手腕->中指根），手离摄像头远近自适应
 * 4. 关键判定全部使用迟滞双阈值（enter/exit），临界状态不来回跳
 * 5. 不使用 z 坐标（MediaPipe 的 z 噪声大），握拳只用 xy 平面归一化距离
 * 6. 滑窗多数投票替代「连续 N 帧完全相同」，单帧抖动不再清空进度
 * 7. 提交用两阶段握拳状态机（握 -> 松 -> 再握），单手握拳绝不会误提交
 */
// MediaPipe Hands 21 个关键点索引
export const LM = {
  WRIST: 0,
  THUMB_CMC: 1, THUMB_MCP: 2, THUMB_IP: 3, THUMB_TIP: 4,
  INDEX_MCP: 5, INDEX_PIP: 6, INDEX_DIP: 7, INDEX_TIP: 8,
  MIDDLE_MCP: 9, MIDDLE_PIP: 10, MIDDLE_DIP: 11, MIDDLE_TIP: 12,
  RING_MCP: 13, RING_PIP: 14, RING_DIP: 15, RING_TIP: 16,
  PINKY_MCP: 17, PINKY_PIP: 18, PINKY_DIP: 19, PINKY_TIP: 20
}
// 四指的 [MCP, PIP, DIP, TIP] 索引
const FINGER_IDS = [
  [LM.INDEX_MCP, LM.INDEX_PIP, LM.INDEX_DIP, LM.INDEX_TIP],
  [LM.MIDDLE_MCP, LM.MIDDLE_PIP, LM.MIDDLE_DIP, LM.MIDDLE_TIP],
  [LM.RING_MCP, LM.RING_PIP, LM.RING_DIP, LM.RING_TIP],
  [LM.PINKY_MCP, LM.PINKY_PIP, LM.PINKY_DIP, LM.PINKY_TIP]
]
// 全部可调参数集中在此（真机实测后只改这里）
export const GESTURE_CONFIG = {
  FPS_INTERVAL: 33,         // 送帧间隔 ms（约 30fps）
  EMA_ALPHA: 0.55,           // 关键点指数平滑系数，越大越跟手、越小越稳
  WINDOW_SIZE: 11,           // 投票窗口帧数
  VOTE_RATIO: 0.65,          // 普通手势：窗口内领先手势占比阈值（11帧需至少8帧）
  FIST_VOTE_RATIO: 0.80,     // 握拳（高危）：占比阈值更严（11帧需至少9帧），防点赞误判
  WARMUP_FRAMES: 8,          // 窗口至少积累多少帧才允许出稳定结果
  PALM_MIN: 0.05,            // 掌长最小值（归一化坐标），小于则判定本帧无效
  EXT_ENTER: 1.12,           // 四指：从弯变伸，距离比需超过此值
  EXT_EXIT: 1.02,            // 四指：从伸变弯，距离比低于此值才算弯（迟滞带 1.02~1.12）
  // 拇指三带（拇指尖到食指根 / 掌长），点赞与握拳靠它彻底分开：
  THUMB_OUT_ENTER: 0.58,     //   > 0.58 = 拇指伸出（点赞）
  THUMB_OUT_EXIT: 0.48,      //   伸出态迟滞收回线
  FIST_THUMB_MAX: 0.45,      //   < 0.45 才算握拳；0.45~0.58 灰区=什么都不触发（安全降级）
  OPEN_ENTER: 1.35,          // 五指张开：拇指尖到小指尖 / 掌长
  OPEN_EXIT: 1.15,           // 张开收回迟滞阈值
  FIST_SCORE: 0.95,          // 握拳度上限：四指尖到掌心平均距离 / 掌长
  LIKE_DIR: 0.12,            // 点赞：拇指尖x与掌心x的绝对偏移阈值（镜像归一化坐标）；难触发可降到0.08
  COOLDOWN_SELECT: 600,      // 选答案手势冷却 ms
  COOLDOWN_NAV: 800,         // 切题手势冷却 ms
  COOLDOWN_CLEAR: 1000,      // 清空手势冷却 ms
  COOLDOWN_SUBMIT: 1500,     // 提交完成后冷却 ms
  ARM_HOLD_MS: 1500,         // 第一握：需保持多久进入待确认
  CONFIRM_HOLD_MS: 600,      // 第二握：需保持多久真正提交
  ARM_WINDOW_MS: 3000        // 待确认窗口：松开后多久内必须完成第二握
}
export function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}
function avgPoint(points) {
  const n = points.length
  let x = 0, y = 0, z = 0
  for (const p of points) { x += p.x; y += p.y; z += p.z }
  return { x: x / n, y: y / n, z: z / n }
}
/**
 * 镜像坐标：前置摄像头画面被 CSS 水平翻转显示，
 * 识别前统一把 x 换成 1-x，保证“拇指朝用户左边 = x 更小”
 */
export function mirrorLandmarks(lm) {
  return lm.map(p => ({ x: 1 - p.x, y: p.y, z: p.z }))
}
/** 关键点时序平滑器（EMA），手丢失后调用 reset 防止再次出现时拖影 */
export function createSmoother(alpha = GESTURE_CONFIG.EMA_ALPHA) {
  let prev = null
  return {
    reset() { prev = null },
    push(lm) {
      if (!prev) {
        prev = lm.map(p => ({ x: p.x, y: p.y, z: p.z }))
        return prev.map(p => ({ ...p }))
      }
      const out = lm.map((p, i) => ({
        x: alpha * p.x + (1 - alpha) * prev[i].x,
        y: alpha * p.y + (1 - alpha) * prev[i].y,
        z: alpha * p.z + (1 - alpha) * prev[i].z
      }))
      prev = out
      return out
    }
  }
}
/**
 * 创建跨帧迟滞状态（手指屈伸/拇指外展/手掌张开都需要记住上一帧状态）
 */
export function createGeoState() {
  return { ext: [false, false, false, false], thumbOut: false, open: false }
}
/**
 * 单帧几何分类
 * @param {Array} lm 镜像+平滑后的 21 关键点
 * @param {Object} state createGeoState() 返回的跨帧状态（会被原地更新）
 * @param {Object} cfg 参数表
 * @returns {{ok:boolean,candidate:string|null,features:Object}}
 *   candidate: 'select:A'..'select:D' | 'clear' | 'prev' | 'next' | 'fist' | null
 */
export function analyzeFrame(lm, state, cfg = GESTURE_CONFIG) {
  const wrist = lm[LM.WRIST]
  const palmSize = dist(wrist, lm[LM.MIDDLE_MCP])
  if (!palmSize || palmSize < cfg.PALM_MIN) {
    return { ok: false, candidate: null, features: null }
  }
  // 掌心：腕+三根掌骨根的平均点
  const palmCenter = avgPoint([lm[0], lm[LM.INDEX_MCP], lm[LM.MIDDLE_MCP], lm[LM.PINKY_MCP]])
  // ===== 四指屈伸（旋转不变：指尖到腕距离 vs PIP到腕距离，迟滞双阈值）=====
  const ext = FINGER_IDS.map((ids, i) => {
    const pip = lm[ids[1]]
    const tip = lm[ids[3]]
    const ratio = dist(tip, wrist) / Math.max(dist(pip, wrist), 1e-6)
    const was = state.ext[i]
    // 已伸直：低于 EXIT 才变弯；未伸直：超过 ENTER 才变伸
    return was ? ratio > cfg.EXT_EXIT : ratio > cfg.EXT_ENTER
  })
  state.ext = ext
  const extCount = ext.reduce((s, v) => s + (v ? 1 : 0), 0)
  // ===== 拇指外展（拇指尖到食指根的归一化距离，迟滞）=====
  const thumbSpread = dist(lm[LM.THUMB_TIP], lm[LM.INDEX_MCP]) / palmSize
  state.thumbOut = state.thumbOut
    ? thumbSpread > cfg.THUMB_OUT_EXIT
    : thumbSpread > cfg.THUMB_OUT_ENTER
  const thumbOut = state.thumbOut
  // ===== 手掌张开度（拇指尖到小指尖的归一化距离，迟滞）=====
  const spread = dist(lm[LM.THUMB_TIP], lm[LM.PINKY_TIP]) / palmSize
  state.open = state.open ? spread > cfg.OPEN_EXIT : spread > cfg.OPEN_ENTER
  const open = state.open
  // ===== 握拳度：四指尖到掌心的平均归一化距离 =====
  const fistScore = FINGER_IDS.reduce((s, ids) => s + dist(lm[ids[3]], palmCenter) / palmSize, 0) / 4
  const features = { palmSize, extCount, thumbSpread, spread, fistScore, thumbOut, open, likeOffset: null }
  const allBent = extCount === 0
  const allExt = extCount === 4

  // ========== 点赞方向：直接对比拇指尖X与掌心X（镜像坐标系：画面左=x小=上一题）==========
  if (allBent && thumbOut) {
    const thumbTipX = lm[LM.THUMB_TIP].x
    const palmCenterX = palmCenter.x
    const offset = thumbTipX - palmCenterX
    features.likeOffset = offset // 透传给 HUD 实时显示，真机调 LIKE_DIR 时直接看这个数

    if (offset > cfg.LIKE_DIR) {
      return { ok: true, candidate: 'next', features }
    }
    if (offset < -cfg.LIKE_DIR) {
      return { ok: true, candidate: 'prev', features }
    }
    return { ok: true, candidate: null, features }
  }

  // 优先级2：五指张开（四指全伸 + 拇指外展 + 张开度足够）-> 清空
  if (allExt && open && thumbOut) return { ok: true, candidate: 'clear', features }
  // 优先级3：四指全伸但拇指内收 -> 选D
  if (allExt) return { ok: true, candidate: 'select:D', features }
  // 优先级4‑6：伸 3/2/1 指 -> 选 C/B/A
  if (extCount === 3) return { ok: true, candidate: 'select:C', features }
  if (extCount === 2) return { ok: true, candidate: 'select:B', features }
  if (extCount === 1) return { ok: true, candidate: 'select:A', features }
  // 优先级7：握拳（四指全弯 + 拇指明确收回且低于硬阈值 + 握拳度足够低）-> 提交候选
  if (allBent && !thumbOut && thumbSpread < cfg.FIST_THUMB_MAX && fistScore < cfg.FIST_SCORE) {
    return { ok: true, candidate: 'fist', features }
  }
  return { ok: true, candidate: null, features }
}

export function createVoter(
  size = GESTURE_CONFIG.WINDOW_SIZE,
  ratio = GESTURE_CONFIG.VOTE_RATIO,
  warmup = GESTURE_CONFIG.WARMUP_FRAMES,
  fistRatio = GESTURE_CONFIG.FIST_VOTE_RATIO
) {
  const buf = []
  return {
    push(candidate) {
      buf.push(candidate)
      if (buf.length > size) buf.shift()
      const counts = {}
      for (const c of buf) {
        if (c) counts[c] = (counts[c] || 0) + 1
      }
      let leader = null
      let best = 0
      for (const k of Object.keys(counts)) {
        if (counts[k] > best) { best = counts[k]; leader = k }
      }
      const r = leader ? best / buf.length : 0
      const warmed = buf.length >= warmup
      const need = leader === 'fist' ? fistRatio : ratio
      return {
        stable: warmed && r >= need ? leader : null,
        ratio: leader ? r : 0,
        leader,
        warmed
      }
    },
    reset() { buf.length = 0 }
  }
}
/**
 * 两阶段握拳提交状态机
 * idle：第一握保持 ARM_HOLD_MS -> submit‑arm（待确认）
 * 待确认：必须先松手，再在 ARM_WINDOW_MS 内第二握保持 CONFIRM_HOLD_MS -> submit
 */
export function createSubmitArmer(cfg = GESTURE_CONFIG, now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())) {
  let phase = 'idle'
  let t1 = 0
  let tArmed = 0
  let t2 = 0
  function reset() {
    phase = 'idle'
    t1 = 0
    tArmed = 0
    t2 = 0
  }
  function frame(stableKey, nowMs = now()) {
    const isFist = stableKey === 'fist'
    let event = null
    if (phase === 'idle') {
      if (isFist) { phase = 'arm1'; t1 = nowMs }
    } else if (phase === 'arm1') {
      if (!isFist) {
        reset()
      } else if (nowMs - t1 >= cfg.ARM_HOLD_MS) {
        phase = 'armed'
        tArmed = nowMs
        event = 'submit-arm'
      }
    } else if (phase === 'armed') {
      if (!isFist) {
        if (stableKey) reset()
        else { phase = 'arm2'; t2 = 0 }
      } else if (nowMs - tArmed >= cfg.ARM_WINDOW_MS) {
        reset()
      }
    } else if (phase === 'arm2') {
      if (nowMs - tArmed >= cfg.ARM_WINDOW_MS) {
        reset()
      } else if (isFist) {
        if (!t2) t2 = nowMs
        if (nowMs - t2 >= cfg.CONFIRM_HOLD_MS) {
          event = 'submit'
          reset()
        }
      } else if (stableKey) {
        reset()
      } else {
        t2 = 0
      }
    }
    let progress = 0
    if (phase === 'arm1') progress = Math.min(99, (nowMs - t1) / cfg.ARM_HOLD_MS * 100)
    else if (phase === 'armed') progress = 100
    else if (phase === 'arm2') progress = t2 ? Math.min(99, (nowMs - t2) / cfg.CONFIRM_HOLD_MS * 100) : 0
    return { event, phase, progress }
  }
  return { frame, reset, getPhase: () => phase }
}
/**
 * 把内部候选 key 转成对外手势事件对象
 */
export function candidateToGesture(key) {
  if (!key) return null
  if (key.startsWith('select:')) {
    return { type: 'select', data: { option: key.slice('select:'.length) } }
  }
  if (key === 'clear' || key === 'prev' || key === 'next') return { type: key }
  return null
}
