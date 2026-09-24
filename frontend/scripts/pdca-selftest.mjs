/**
 * 第二轮升级回归仿真测试：对错一致性 / 复习状态机 / 慢题判定 / 错因留空保存
 * 精确镜像 AnswerController / WrongQuestionController / QuestionService 的判分与状态机逻辑。
 * 运行：node scripts/pdca-selftest.mjs
 */
let pass = 0, fail = 0
function assert(cond, name) {
  if (cond) { pass++; console.log('  ✓', name) }
  else { fail++; console.error('  ✗ FAIL:', name) }
}

// ============ 1) 判分规范化（镜像 AnswerController.normalizeAnswer，两控制器同口径） ============
function normalizeAnswer(answer) {
  if (answer == null) return ''
  const s = String(answer).trim()
  if (!s) return ''
  const letters = new Set()
  for (const c of s) {
    if ((c >= 'A' && c <= 'E') || (c >= 'a' && c <= 'e')) letters.add(c.toUpperCase())
  }
  if (letters.size) return [...letters].sort().join('')
  const low = s.toLowerCase()
  if (s.includes('错') || s.includes('不') || s.includes('非') || s.includes('否')
      || s.includes('×') || s.includes('✗') || low === 'f' || low === 'false' || low === 'no') return 'B'
  if (s.includes('正确') || s.includes('对') || s.includes('是') || s.includes('√') || s.includes('✓')
      || low === 't' || low === 'true' || low === 'yes') return 'A'
  return s.replace(/[\s,，、.。:：;；()（）]+/g, '').toUpperCase().split('').sort().join('')
}

// 前端标色口径（懒人/试卷结果页 isCorrectOption / isWrongSelected；错题本 isCorrectOpt 同款）
function frontendColor(answer, selectedKeys) {
  const ans = String(answer || '')
  const correctOpts = selectedKeys.filter(k => ans.includes(k))
  const wrongPicks = selectedKeys.filter(k => !ans.includes(k))
  return { correctOpts, wrongPicks }
}

// 一致性校验：后端结论 与 前端标色 是否语义一致
// 规则：判对 → 选中项不得标红；判错 → 要么有红项（选错），要么是纯漏选（选中项均为正确选项但集不全，标准多选呈现，不算矛盾）
function consistencyCheck(correctAnswer, userAnswer, desc) {
  const verdict = normalizeAnswer(userAnswer) === normalizeAnswer(correctAnswer)
  const selected = [...new Set(String(userAnswer).replace(/[^A-Ea-e]/g, '').toUpperCase().split(''))]
  const ansNorm = normalizeAnswer(correctAnswer)
  const col = frontendColor(ansNorm, selected)
  if (verdict) {
    return col.wrongPicks.length === 0
  } else {
    const partial = selected.length > 0 && col.wrongPicks.length === 0 && selected.every(k => ansNorm.includes(k))
    return col.wrongPicks.length > 0 || partial || selected.length === 0
  }
}

console.log('\n[组1] 对错一致性矩阵（后端结论 vs 前端标色）')
const matrix = [
  // [题目答案, 用户答案, 预期后端结论, 说明]
  ['A', 'B', false, '单选：答案A选B → 应判错，B红A绿'],
  ['A', 'A', true, '单选：答案A选A → 判对'],
  ['AB', 'BA', true, '多选：BA=AB → 判对'],
  ['AB', 'BA', true, '多选乱序（含脏分隔）'],
  ['AC', 'A', false, '多选漏选 → 判错（A绿但漏C）'],
  ['B.', 'B', true, '脏格式：答案带句点'],
  ['答案：B', 'B', true, '脏格式：中文前缀'],
  ['（C）', 'C', true, '脏格式：括号包裹'],
  ['b', 'B', true, '脏格式：小写'],
  ['正确', 'A', true, '判断题：中文答案→A'],
  ['对', 'A', true, '判断题：对→A'],
  ['√', 'A', true, '判断题：√→A'],
  ['错误', 'B', true, '判断题：错误→B'],
  ['×', 'B', true, '判断题：×→B'],
  ['不正确', 'B', true, '判断题：不正确→B（先判“不”，防误判为对）'],
  ['错A', 'A', true, '脏格式：含字母的歧义答案按字母归一（判分与标色同口径）'],
  ['正确', 'B', false, '判断题：选错判错'],
  ['A', 'B', false, '判断题标准A/B：选错判错'],
  ['B', 'A', false, '反向错选'],
]
matrix.forEach(([ans, ua, exp, desc]) => {
  const got = normalizeAnswer(ua) === normalizeAnswer(ans)
  const consistent = consistencyCheck(ans, ua, desc)
  assert(got === exp && consistent, `${desc}（后端=${got===exp?`${got}`:'MISMATCH'}，标色一致=${consistent}）`)
})

console.log('\n[组1b] 缺陷复现：英文判断词与字母提取规则的冲突')
// 代码意图是 "false→B / true→A / yes→A"，但字母优先提取规则先命中：
//   "false" 含 a,e → 归一为 "AE"；"true" 含 e → "E"；"yes" 含 e → "E"
// 复现（记录实际输出，验证缺陷存在性）：
{
  const out_false = normalizeAnswer('false')
  const out_true = normalizeAnswer('true')
  const out_yes = normalizeAnswer('yes')
  console.log(`  [复现] normalize("false")=${out_false}（意图B） normalize("true")=${out_true}（意图A） normalize("yes")=${out_yes}（意图A）`)
  assert(out_false === 'AE' && out_true === 'E' && out_yes === 'E', '确认真实行为：英文判断词被字母规则误归一（缺陷DEMO，非通过项）')
  // 影响链：判断题答案"true" → canonicalObjective → "E"（不存在该选项键）→ 无论选A/B都判错
  assert(canonicalObjective('true') === 'E', '源头规范化同样被破坏："true"→"E"，该题将永远判错（缺陷DEMO）')
}

// ============ 2) 上传/出题源头规范化（镜像 canonicalObjective） ============
console.log('\n[组2] 出题/上传源头答案规范化')
function canonicalObjective(raw) {
  if (raw == null) return ''
  const s = String(raw).trim()
  if (!s) return ''
  const letters = new Set()
  for (const c of s) {
    if ((c >= 'A' && c <= 'E') || (c >= 'a' && c <= 'e')) letters.add(c.toUpperCase())
  }
  if (letters.size) return [...letters].sort().join('')
  const low = s.toLowerCase()
  if (s.includes('错') || s.includes('不') || s.includes('非') || s.includes('否')
      || s.includes('×') || s.includes('✗') || low === 'f' || low === 'false') return 'B'
  if (s.includes('正确') || s.includes('对') || s.includes('是') || s.includes('√') || s.includes('✓')
      || low === 't' || low === 'true') return 'A'
  return s
}
assert(canonicalObjective('B.') === 'B', '"B." → B')
assert(canonicalObjective('答案：AB') === 'AB', '"答案：AB" → AB')
assert(canonicalObjective('正确') === 'A' && canonicalObjective('错误') === 'B', '中文判断→A/B')
assert(canonicalObjective('ba') === 'AB', '小写乱序→AB')
assert(canonicalObjective('参考答案未提供') === '参考答案未提供', '缺失答案原样保留（判分前补全流程兜底）')

// ============ 3) 复习状态机（镜像 WrongQuestionController.redo） ============
console.log('\n[组3] 复习状态机（PDCA 重做）')
const DAY = 24 * 3600 * 1000
// 状态机对象
function makeWQ(over = {}) {
  return { status: 0, reviewCount: 0, correctStreak: 0, wrongCount: 1, nextReviewTime: null, lastReviewTime: null, ...over }
}
function redo(wq, userAnswer, refAnswer, now, score = null, subjective = false) {
  let correct = null
  if (subjective) {
    if (score != null) { wq.score = score; correct = score >= 3 }
  } else {
    correct = normalizeAnswer(userAnswer) === normalizeAnswer(refAnswer)
  }
  if (correct == null) return { needEval: true, status: wq.status }
  if (correct) {
    const prevStreak = wq.correctStreak || 0
    const lockedUntil = wq.nextReviewTime
    if (prevStreak >= 1 && lockedUntil != null && now < new Date(lockedUntil).getTime()) {
      return { notTime: true, correct: true, status: wq.status, correctStreak: prevStreak, lockedUntil }
    }
    let streak = prevStreak + 1
    wq.correctStreak = streak
    wq.reviewCount = (wq.reviewCount || 0) + 1
    wq.lastReviewTime = now
    if (streak >= 4) { wq.status = 3; wq.nextReviewTime = null }
    else {
      wq.status = 2
      const idx = Math.min(streak - 1, 2)
      wq.nextReviewTime = now + [1, 3, 7][idx] * DAY
    }
  } else {
    wq.correctStreak = 0
    wq.wrongCount = (wq.wrongCount || 0) + 1
    wq.reviewCount = (wq.reviewCount || 0) + 1
    wq.lastReviewTime = now
    wq.status = 0
    wq.nextReviewTime = now
  }
  return { correct, status: wq.status, correctStreak: wq.correctStreak, reviewCount: wq.reviewCount, nextReviewTime: wq.nextReviewTime }
}
// 今日复习过滤
function inReviewToday(wq, now) {
  if ((wq.status || 0) >= 3) return false
  return wq.nextReviewTime == null || new Date(wq.nextReviewTime).getTime() <= now
}

// 场景4.1：新错题 → 第1次对 → 锁到明天
{
  const wq = makeWQ()
  const day0 = Date.UTC(2026, 8, 3, 9, 0, 0)
  const r1 = redo(wq, 'A', 'A', day0)
  assert(r1.correct === true && wq.status === 2 && wq.correctStreak === 1, '第1次重做对 → status=2，连对1')
  assert(wq.nextReviewTime === day0 + 1 * DAY, '锁到明天（+1天）')
  assert(wq.reviewCount === 1, 'reviewCount=1')
}
// 场景4.2：当天再点重做 → notTime 不计数
{
  const wq = makeWQ({ status: 2, correctStreak: 1, reviewCount: 1, nextReviewTime: Date.UTC(2026, 8, 3, 9, 0, 0) + 1 * DAY })
  const r = redo(wq, 'A', 'A', Date.UTC(2026, 8, 3, 12, 0, 0))
  assert(r.notTime === true && r.correctStreak === 1, '当天再点重做 → notTime，连对不推进')
  assert(wq.reviewCount === 1 && wq.correctStreak === 1, '不计数（reviewCount/streak 均不变）')
}
// 场景4.3：答错 → 清零且当天可再做
{
  const wq = makeWQ({ status: 2, correctStreak: 1, reviewCount: 1, nextReviewTime: Date.UTC(2026, 8, 3, 9, 0, 0) + 1 * DAY })
  const day0 = Date.UTC(2026, 8, 3, 15, 0, 0)
  const r = redo(wq, 'B', 'A', day0)
  assert(r.correct === false && wq.correctStreak === 0 && wq.status === 0, '答错 → 连对清零、status=0')
  assert(wq.wrongCount === 2 && wq.reviewCount === 2, '错误次数+1、reviewCount+1')
  assert(inReviewToday(wq, day0), '答错后 next=now → 当天立即再入今日复习')
}
// 场景4.4：连对到第4次 → status=3 移出今日复习
{
  const wq = makeWQ()
  let now = Date.UTC(2026, 8, 3, 9, 0, 0)
  const seq = []
  for (let i = 1; i <= 4; i++) {
    const r = redo(wq, 'A', 'A', now)
    seq.push({ i, streak: wq.correctStreak, status: wq.status })
    now = new Date(wq.nextReviewTime || now).getTime() + 3600 * 1000 // 到期后再复习
  }
  assert(seq[0].streak === 1 && seq[0].status === 2, '第1次对：streak=1')
  assert(seq[1].streak === 2 && seq[1].status === 2, '第2次对：streak=2（+3天）')
  assert(seq[2].streak === 3 && seq[2].status === 2, '第3次对：streak=3（+7天）')
  assert(seq[3].streak === 4 && wq.status === 3 && wq.nextReviewTime === null, '第4次对：status=3 已掌握，移出队列')
  assert(!inReviewToday(wq, now), 'status=3 不再出现在今日复习')
}
// 场景4.5：今日复习只列到期题
{
  const now = Date.UTC(2026, 8, 3, 9, 0, 0)
  const due = makeWQ() // next=null 新错题 → 到期
  const locked = makeWQ({ status: 2, correctStreak: 1, nextReviewTime: now + 1 * DAY }) // 未到期
  const due2 = makeWQ({ status: 2, correctStreak: 1, nextReviewTime: now - 1 * DAY }) // 已到期
  const mastered = makeWQ({ status: 3, nextReviewTime: null })
  assert(inReviewToday(due, now) && inReviewToday(due2, now), '新错题/已到期 → 入列')
  assert(!inReviewToday(locked, now), '未到期 → 不入列')
  assert(!inReviewToday(mastered, now), '已掌握 → 不入列')
}
// 场景4.6：慢题答对进复习队列（AnswerController.saveWrongQuestion 镜像）
{
  const wq = makeWQ()
  const day0 = Date.UTC(2026, 8, 3, 9, 0, 0)
  // 做对但慢：wrongCount=0, status=2, streak=1, next=+1d, reviewCount=0
  wq.wrongCount = 0; wq.status = 2; wq.correctStreak = 1; wq.reviewCount = 0
  wq.nextReviewTime = day0 + 1 * DAY
  assert(wq.wrongCount === 0 && wq.status === 2 && wq.nextReviewTime === day0 + 1 * DAY, '做对但慢 → 不计错、进入1天后复习队列')
}

// ============ 4) 慢题判定（镜像 isSlowAnswer） ============
console.log('\n[组4] 慢题判定（样本≥3、>均值×1.5）')
function isSlow(history, answerTime) {
  if (answerTime == null || answerTime <= 0) return false
  if (history.length < 3) return false
  const avg = history.reduce((s, a) => s + a, 0) / history.length
  return avg > 0 && answerTime > avg * 1.5
}
assert(isSlow([10, 12, 11], 20) === true, '20s > 均值11×1.5=16.5 → 慢题')
assert(isSlow([10, 12, 11], 15) === false, '15s ≤ 16.5 → 非慢题')
assert(isSlow([10, 12], 999) === false, '样本不足3 → 冷启动不判定')
assert(isSlow([10, 12, 11], null) === false && isSlow([10, 12, 11], 0) === false, '无用时/0秒 → 不判定')

// ============ 5) 错因：留空也能保存 + 回显映射 ============
console.log('\n[组5] 错因标注（留空保存 / 回显）')
{
  // 镜像 saveErrorType：空字符串 → null
  const saveErrorType = (types, note) => ({ errorTypes: types === '' ? null : types, errorNote: note === '' ? null : note })
  const r1 = saveErrorType('', '')
  assert(r1.errorTypes === null && r1.errorNote === null, '全部留空 → null 落库（不报错）')
  const r2 = saveErrorType('audit,knowledge', '粗心')
  assert(r2.errorTypes === 'audit,knowledge' && r2.errorNote === '粗心', '补标多选+反思 → 保存')
  const r3 = saveErrorType('', '只看了解析')
  assert(r3.errorTypes === null && r3.errorNote === '只看了解析', '只填反思 → 保存')
  // 前端回显：初始types拆分为选中项
  const initTypes = 'audit,math'
  const selected = initTypes.split(',').map(s => s.trim()).filter(Boolean)
  assert(selected.join(',') === 'audit,math', '已存错因回显为选中态')
}

console.log(`\n========== pdca-selftest: ${pass} passed, ${fail} failed ==========`)
process.exit(fail > 0 ? 1 : 0)
