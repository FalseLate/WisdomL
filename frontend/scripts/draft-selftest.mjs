/**
 * 双模式统一草稿工具 practiceDraft.js 纯逻辑单测（Node 直接运行，无浏览器依赖）
 * 运行：node scripts/draft-selftest.mjs
 */
import {
  draftStorageKey,
  loadDraftStore,
  writeDraftAnswers,
  saveDraftAnswer,
  removeDraftAnswer,
  clearDraftStore
} from '../src/utils/practiceDraft.js'

// ---- mock localStorage ----
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

console.log('\n[1] key 生成')
reset()
assert(draftStorageKey(123) === 'practice_draft_123', '数字 sectionId 转字符串')
assert(draftStorageKey(null) === 'practice_draft_default', '空 sectionId 兜底 default')

console.log('\n[2] 空读取兜底')
reset()
const e0 = loadDraftStore('s1')
assert(e0 && e0.recordId === null && Object.keys(e0.answers).length === 0, '无存储时返回空结构不崩')

console.log('\n[3] 单条写入 + 读取')
reset()
saveDraftAnswer('s1', 1, 'A', 'single')
saveDraftAnswer('s1', '2', 'BC', 'multiple')
const e1 = loadDraftStore('s1')
assert(e1.answers['1']?.answer === 'A', '数字 qid 写入后可按字符串键读出')
assert(e1.answers['2']?.answer === 'BC' && e1.answers['2'].type === 'multiple', '多选答案与题型正确')
assert(e1.answers['1'].ts > 0, '带时间戳')

console.log('\n[4] 空答案等于删除')
reset()
saveDraftAnswer('s1', 1, 'A', 'single')
saveDraftAnswer('s1', 1, '', 'single')
assert(!loadDraftStore('s1').answers['1'], '写入空串后该题草稿被移除')

console.log('\n[5] 整体写入 + recordId 保留')
reset()
writeDraftAnswers('s1', { 1: { answer: 'A', type: 'single' } }, 88)
writeDraftAnswers('s1', { 2: { answer: '对', type: 'subjective' } }) // 不传 recordId
const e2 = loadDraftStore('s1')
assert(e2.recordId === 88, '第二次整体写入保留既有 recordId')
assert(!e2.answers['1'] && e2.answers['2']?.answer === '对', '整体写入覆盖为新答案集合（旧题被替换）')

console.log('\n[6] 白名单过滤（换套题防串题）')
reset()
saveDraftAnswer('s1', 1, 'A')
saveDraftAnswer('s1', 99, 'B')
const e3 = loadDraftStore('s1', [1, 2, 3])
assert(e3.answers['1'] && !e3.answers['99'], '非本套题 qid=99 被过滤')

console.log('\n[7] 删除单条 / 清空整章')
reset()
saveDraftAnswer('s1', 1, 'A')
saveDraftAnswer('s1', 2, 'B')
removeDraftAnswer('s1', 1)
assert(!loadDraftStore('s1').answers['1'] && loadDraftStore('s1').answers['2'], 'removeDraftAnswer 只删目标题')
clearDraftStore('s1')
assert(Object.keys(loadDraftStore('s1').answers).length === 0, 'clearDraftStore 清空整章')

console.log('\n[8] 章节隔离')
reset()
saveDraftAnswer('s1', 1, 'A')
saveDraftAnswer('s2', 1, 'C')
assert(loadDraftStore('s1').answers['1'].answer === 'A', 's1 独立')
assert(loadDraftStore('s2').answers['1'].answer === 'C', 's2 独立，不与 s1 串')

console.log('\n[9] 非法 JSON 兜底')
reset()
localStorage.setItem(draftStorageKey('s1'), '{这不是合法json')
const e4 = loadDraftStore('s1')
assert(e4 && Object.keys(e4.answers).length === 0, '非法 JSON 返回空结构不抛错')
localStorage.setItem(draftStorageKey('s2'), JSON.stringify({ junk: 1 }))
const e5 = loadDraftStore('s2')
assert(e5 && Object.keys(e5.answers).length === 0, '缺 answers 字段也安全兜底')

console.log('\n[10] 非法条目过滤')
reset()
localStorage.setItem(draftStorageKey('s1'), JSON.stringify({
  recordId: 1,
  answers: { 1: { answer: 'A' }, 2: { answer: '' }, 3: null }
}))
const e6 = loadDraftStore('s1')
assert(e6.answers['1'] && !e6.answers['2'] && !e6.answers['3'], '空答案/null 条目被过滤')

console.log(`\n========== draft-selftest: ${pass} passed, ${fail} failed ==========`)
process.exit(fail > 0 ? 1 : 0)
