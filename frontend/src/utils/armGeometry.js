/**
 * 姿态（上身）几何层：挥肘 / 横扫（纯逻辑，零 DOM 依赖）
 * 数据源：PoseLandmarker 33 点。索引：肩 11/12，肘 13/14，腕 15/16。
 * 归一化用肩宽（对应手部 palmSize 思路），人离摄像头远近自适应。
 * 注意：MediaPipe 的 y 轴向下为正，"肘高于肩"即 elbow.y < shoulder.y。
 */

export const ARM_CONFIG = {
  ELBOW_ABOVE_MARGIN: 0.10,  // 肘相对肩再高出 0.1 肩宽才算"挥肘"
  ELBOW_HOLD_MS: 300,        // 需持续时间
  ELBOW_COOLDOWN_MS: 900,
  SWEEP_DX: 0.15,            // 腕相对肩中点横向越线阈值（肩宽归一）
  SWEEP_WINDOW_MS: 600,      // 往返横扫完成窗口
  SWEEP_COOLDOWN_MS: 1000,
  VISIBLE_MIN: 0.5,          // 关键点 visibility 低于此的帧不计
  HANDS_UP_ABOVE: 0.9,       // handsUp：双腕须高于同侧肩 0.9 肩宽（约头顶）
  HANDS_CLOSE_DX: 0.6,       // handsUp：双腕水平距离 ≤0.6 肩宽（两手靠拢，不要求交叉）
  HANDS_UP_HOLD_MS: 400,
  HANDS_UP_COOLDOWN_MS: 2000,
  BOTH_UP_MARGIN: 0.1        // 双腕都超过肩线 0.1 肩宽 => 进入双手姿态域，屏蔽单臂挥肘
}

export const POSE_LM = {
  L_SHOULDER: 11, R_SHOULDER: 12,
  L_ELBOW: 13, R_ELBOW: 14,
  L_WRIST: 15, R_WRIST: 16
}

function shoulderWidth(lm, cfg) {
  const a = lm[POSE_LM.L_SHOULDER], b = lm[POSE_LM.R_SHOULDER]
  const w = Math.hypot(a.x - b.x, a.y - b.y)
  return w > 0.02 ? w : 0
}

/**
 * 创建上身分析器（注入时钟便于自测）
 * @returns {push(lm, nowMs?)=>string|null} 'elbowUp:left'|'elbowUp:right'|'sweep'|null
 */
export function createArmAnalyzer(cfg = ARM_CONFIG, now = () => performance.now()) {
  let holdStart = { left: 0, right: 0 }
  let lastElbowAt = { left: -Infinity, right: -Infinity }
  let sweepStart = { t: 0, dir: 0 }
  let lastSweepAt = -Infinity
  let handsT0 = 0
  let lastHandsAt = -Infinity

  function push(lm, nowMs = now()) {
    const sw = shoulderWidth(lm, cfg)
    if (!sw) return null
    const vis = i => (lm[i].visibility ?? 1) >= cfg.VISIBLE_MIN
    let candidate = null

    // ===== 双手姿态域判定（变身图：双臂举过头、两手在头顶靠拢成倒V拱形）=====
    const lw = lm[POSE_LM.L_WRIST], rw = lm[POSE_LM.R_WRIST]
    const ls = lm[POSE_LM.L_SHOULDER], rs = lm[POSE_LM.R_SHOULDER]
    const wristsVis = vis(POSE_LM.L_WRIST) && vis(POSE_LM.R_WRIST)
    // 双腕都过肩线一点 => 双手姿态域（举起过程中就进入，屏蔽单臂挥肘防截胡）
    const bothUp = wristsVis &&
      ls.y - lw.y > cfg.BOTH_UP_MARGIN * sw && rs.y - rw.y > cfg.BOTH_UP_MARGIN * sw
    const handsUpPose = bothUp &&
      ls.y - lw.y > cfg.HANDS_UP_ABOVE * sw && rs.y - rw.y > cfg.HANDS_UP_ABOVE * sw &&
      Math.abs(lw.x - rw.x) <= cfg.HANDS_CLOSE_DX * sw
    if (handsUpPose) {
      if (!handsT0) handsT0 = nowMs
      else if (nowMs - handsT0 >= cfg.HANDS_UP_HOLD_MS &&
               nowMs - lastHandsAt > cfg.HANDS_UP_COOLDOWN_MS) {
        candidate = 'handsUp'
        lastHandsAt = nowMs
        handsT0 = 0
      }
    } else handsT0 = 0

    // ===== 挥肘/举腕（仅单臂姿态；双手姿态域整体跳过，避免变身被识别成左右挥肘）=====
    for (const [side, sh, el, wr] of bothUp ? [] : [['left', POSE_LM.L_SHOULDER, POSE_LM.L_ELBOW, POSE_LM.L_WRIST],
                                      ['right', POSE_LM.R_SHOULDER, POSE_LM.R_ELBOW, POSE_LM.R_WRIST]]) {
      if (vis(sh) && vis(el)) {
        const elbowUp = lm[sh].y - lm[el].y > cfg.ELBOW_ABOVE_MARGIN * sw
        const wristUp = vis(wr) && lm[sh].y - lm[wr].y > cfg.ELBOW_ABOVE_MARGIN * sw
        if (elbowUp || wristUp) {
          if (!holdStart[side]) holdStart[side] = nowMs
          else if (nowMs - holdStart[side] >= cfg.ELBOW_HOLD_MS &&
                   nowMs - lastElbowAt[side] > cfg.ELBOW_COOLDOWN_MS) {
            lastElbowAt[side] = nowMs
            holdStart[side] = 0
            if (!candidate) candidate = `elbowUp:${side}`
          }
        } else holdStart[side] = 0
      } else holdStart[side] = 0
    }

    // ===== 横扫：取可见性更好的腕，相对肩中点 x 在窗口内往返越线 =====
    if (!candidate) {
      let wrist = -1
      if (vis(POSE_LM.L_WRIST) && vis(POSE_LM.R_WRIST)) {
        wrist = lm[POSE_LM.L_WRIST].visibility >= lm[POSE_LM.R_WRIST].visibility
          ? POSE_LM.L_WRIST : POSE_LM.R_WRIST
      } else if (vis(POSE_LM.L_WRIST)) wrist = POSE_LM.L_WRIST
      else if (vis(POSE_LM.R_WRIST)) wrist = POSE_LM.R_WRIST
      if (wrist > 0 && (vis(POSE_LM.L_SHOULDER) && vis(POSE_LM.R_SHOULDER))) {
        const cx = (lm[POSE_LM.L_SHOULDER].x + lm[POSE_LM.R_SHOULDER].x) / 2
        const cy = (lm[POSE_LM.L_SHOULDER].y + lm[POSE_LM.R_SHOULDER].y) / 2
        // 高度门：横扫是"手在肩线附近横向摆"，举过头顶不算（避免与挥肘/举手互串）
        const heightOk = Math.abs(lm[wrist].y - cy) < 0.5 * sw
        const dx = (lm[wrist].x - cx) / sw
        const dir = !heightOk ? 0 : dx > cfg.SWEEP_DX ? 1 : dx < -cfg.SWEEP_DX ? -1 : 0
        if (dir !== 0 && nowMs - lastSweepAt > cfg.SWEEP_COOLDOWN_MS) {
          if (!sweepStart.dir || (nowMs - sweepStart.t > cfg.SWEEP_WINDOW_MS)) {
            sweepStart = { t: nowMs, dir }
          } else if (dir !== sweepStart.dir &&
                     nowMs - sweepStart.t <= cfg.SWEEP_WINDOW_MS) {
            lastSweepAt = nowMs
            sweepStart = { t: 0, dir: 0 }
            candidate = 'sweep'
          } else if (dir !== sweepStart.dir) {
            sweepStart = { t: nowMs, dir }
          }
        }
      }
    }
    return candidate
  }

  return { push }
}
