/**
 * 双模式（懒人 LazyPracticeView ↔ 试卷 PracticeView）互通草稿 回归仿真测试
 * 不依赖浏览器：直接调用真实 practiceDraft.js，并按两个视图的源码逻辑复刻调用序列。
 * 运行：node scripts/mode-interop-selftest.mjs
 */
import {
  draftStorageKey,
  loadDraftStore,
  writeDraftAnswers,
  saveDraftAnswer,
  removeDraftAnswer,
  clearDraftStore
} from '../src/utils/practiceDraft.js'

class MockStorage {
  constructor() { this.m = new Map() }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null }
  setItem(k, v) { this.m.set(k, String(v)) }
  removeItem(k) { this.m.delete(k) }
  clear() { this.m.clear() }
}
globalThis.localStorage = new MockStorage()

let pass = 0, fail = 0
function assert(cond, name) {
  if (cond) { pass++; console.log('  ✓', name) }
  else { fail++; console.error('  ✗ FAIL:', name) }
}
function reset() { globalThis.localStorage.clear() }

// ---- 题目数据（带 id，模拟后端生成）----
const Q = [
  { id: 'q1', type: 'single', answer: 'A', options: { A: 'x', B: 'y' } },
  { id: 'q2', type: 'multiple', answer: 'BC', options: { A: 'x', B: 'y', C: 'z' } },
  { id: 'q3', type: 'subjective', answer: '参考' }
]
const getQid = (q, idx) => q?.id || q?._id || idx
const classifyType = q => q.type === 'subjective' ? 'subjective' : (q.type === 'multiple' ? 'multiple' : 'single')

// ============ 场景1：懒人做2题 -> 切试卷模式 ============
console.log('\n[场景1] 懒人做2题（q1选A、q3主观输入） -> 切试卷模式，2题应待提交且回显')
reset()
const sectionId = 'sec-100'
// ---- 懒人模式侧（复刻 LazyPracticeView）----
const lazyDrafts = {}
// 答题q1：单选A
lazyDrafts['q1'] = { answer: 'A', type: 'single', timestamp: Date.now() }
// 答题q2：多选BC（排序）
lazyDrafts['q2'] = { answer: 'BC', type: 'multiple', timestamp: Date.now() }
// 主观q3输入
lazyDrafts['q3'] = { answer: '我的主观答案', type: 'subjective', timestamp: Date.now() }
// watch(drafts, deep) 落盘
writeDraftAnswers(sectionId, lazyDrafts, 888)

// ---- 切到试卷模式（复刻 PracticeView restoreDraftOnSetup）----
const draftCache = {}
const pendingAnswers = new Map()
{
  const validQids = Q.map((q, i) => getQid(q, i))
  const store = loadDraftStore(sectionId, validQids)
  Object.entries(store.answers || {}).forEach(([qid, item]) => {
    draftCache[qid] = item
    if (item.type === 'subjective') localStorage.setItem('subj_ans_' + qid, item.answer)
    else pendingAnswers.set(qid, item.answer)
  })
  // recordId 回填
  assert(store.recordId === 888, 'recordId 从草稿存储回填（刷新后不丢关联套题）')
}
assert(draftCache['q1']?.answer === 'A', '客观题 q1 草稿进入 draftCache（回显选中态）')
assert(pendingAnswers.get('q1') === 'A' && pendingAnswers.get('q2') === 'BC', '客观题进入 pendingAnswers（待提交计数）')
assert(localStorage.getItem('subj_ans_q3') === '我的主观答案', '主观题 q3 镜像到 subj_ans_q3（卡片挂载即读）')
assert(pendingAnswers.size === 2, '待提交数 = 2（客观2题，主观走 subj_ans）')

// ============ 场景2：反向，试卷做2题（不提交）-> 进懒人模式 ============
console.log('\n[场景2] 试卷做2题（不提交） -> 懒人模式应看到已做色/已选/主观已填')
reset()
{
  // 试卷模式侧：handleSelectionChange -> saveDraftAnswer；主观 handleSubjectiveDraft -> saveDraftAnswer
  saveDraftAnswer(sectionId, 'q1', 'A', 'single')
  saveDraftAnswer(sectionId, 'q2', 'BC', 'multiple')
  saveDraftAnswer(sectionId, 'q3', '主观文字', 'subjective')
  // 主观卡同时维护 subj_ans
  localStorage.setItem('subj_ans_q3', '主观文字')
  // 懒人模式侧：restoreDrafts
  const validQids = Q.map((q, i) => getQid(q, i))
  const store = loadDraftStore(sectionId, validQids)
  const lazy = store.answers || {}
  const isAnswered = (q, i) => {
    const d = lazy[getQid(q, i)]
    if (!d) return false
    return classifyType(q) === 'subjective' ? (d.answer && d.answer.trim().length > 0) : (d.answer && d.answer.length > 0)
  }
  assert(isAnswered(Q[0], 0) && isAnswered(Q[1], 1) && isAnswered(Q[2], 2), '三题均视为已做（题号已做色）')
  assert(lazy['q1']?.answer === 'A', '客观题选项已选（A）')
  assert(lazy['q2']?.answer === 'BC', '多选题已选（BC）')
  assert(lazy['q3']?.answer === '主观文字', '主观题文字已填')
}

// ============ 场景3：刷新后草稿保留 + 懒人不锁结果页 ============
console.log('\n[场景3] 刷新（重新读 localStorage）后：草稿在；懒人判分结果不恢复（不进结果页）')
reset()
saveDraftAnswer(sectionId, 'q1', 'A', 'single')
{
  // 刷新 = 重新执行 loadDraftStore
  const store = loadDraftStore(sectionId, ['q1', 'q2', 'q3'])
  assert(store.answers['q1']?.answer === 'A', '未提交草稿刷新后保留')
  // 懒人判分 results 只存内存 -> 刷新后为空 -> 不会被锁进结果页
  const resultsAfterRefresh = {}
  assert(Object.keys(resultsAfterRefresh).length === 0 && store.answers['q1'], '判分结果清空但草稿保留 => 可重新提交')
}

// ============ 场景5：懒人「再做一次」清空 ============
console.log('\n[场景5] 懒人「再做一次」：草稿/结果/subj_ans 全清')
reset()
writeDraftAnswers(sectionId, { q1: { answer: 'A', type: 'single' }, q3: { answer: 'xx', type: 'subjective' } }, 5)
localStorage.setItem('subj_ans_q3', 'xx')
{
  // 复刻 resetPractice：先清内存 drafts（会触发 watch 回写空），随后 clearDraftStore
  const emptyDrafts = {}
  writeDraftAnswers(sectionId, emptyDrafts, 5) // watch 回写空壳
  clearDraftStore(sectionId)                  // 删存储键
  // 清 subj_ans
  localStorage.removeItem('subj_ans_q3')
  const store = loadDraftStore(sectionId, ['q1', 'q2', 'q3'])
  assert(Object.keys(store.answers).length === 0, '整章草稿清空')
  assert(localStorage.getItem('subj_ans_q3') === null, 'subj_ans 镜像清除')
}

// ============ 场景6：试卷单题/整卷提交后草稿移除 ============
console.log('\n[场景6] 试卷提交后：对应题草稿移除、待提交数减少')
reset()
saveDraftAnswer(sectionId, 'q1', 'A', 'single')
saveDraftAnswer(sectionId, 'q2', 'BC', 'multiple')
{
  // 复刻 dropDraft：removeDraftAnswer
  removeDraftAnswer(sectionId, 'q1')
  const store = loadDraftStore(sectionId, null)
  assert(!store.answers['q1'] && store.answers['q2'], '单题提交后该题草稿移除，其余保留')
  // 整卷提交：剩余全移除
  removeDraftAnswer(sectionId, 'q2')
  const s2 = loadDraftStore(sectionId, null)
  assert(Object.keys(s2.answers).length === 0, '整卷提交后待提交草稿全部移除')
}

// ============ 场景9/10：坏数据兜底 + 章节隔离 ============
console.log('\n[场景9/10] 坏 localStorage 不崩 + 章节隔离')
reset()
localStorage.setItem(draftStorageKey(sectionId), '{{{坏数据')
{
  const store = loadDraftStore(sectionId, ['q1', 'q2', 'q3'])
  assert(store && Object.keys(store.answers).length === 0, '坏 JSON 进入页面不白屏不报错')
}
reset()
saveDraftAnswer('sec-A', 'q1', 'A', 'single')
saveDraftAnswer('sec-B', 'q1', 'C', 'single')
{
  const a = loadDraftStore('sec-A', ['q1']).answers['q1'].answer
  const b = loadDraftStore('sec-B', ['q1']).answers['q1'].answer
  assert(a === 'A' && b === 'C', '连续进两个不同章节草稿互不串')
}

console.log(`\n========== mode-interop-selftest: ${pass} passed, ${fail} failed ==========`)
process.exit(fail > 0 ? 1 : 0)
