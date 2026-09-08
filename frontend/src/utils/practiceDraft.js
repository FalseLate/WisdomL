/**
 * 双模式统一作答草稿（未提交的选择 / 输入）
 *
 * 作用：试卷模式 PracticeView 与懒人模式 LazyPracticeView 共享同一份未提交答案，
 *      按章节 sectionId 隔离；在 A 模式做了题、切到 B 模式同样能看到未提交的作答。
 *
 * 存储结构：localStorage["practice_draft_{sectionId}"] =
 *   { recordId: number|string|null, answers: { [qid]: { answer, type, ts } } }
 *
 * 边界：
 * - 只存“未提交”的作答；已提交判分结果走 pinia practice store（zhifuxi-practice）持久化，不在此处
 * - 所有读写均 try-catch 兜底：localStorage 不可用（隐私模式/配额满/非法 JSON）时静默降级为内存行为，绝不崩页面
 * - 读取时支持 validQids 白名单过滤，防止换套题后旧草稿串题
 */

const PREFIX = 'practice_draft_'

function getStorage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null
  } catch (e) {
    return null
  }
}

export function draftStorageKey(sectionId) {
  return PREFIX + (sectionId == null ? 'default' : String(sectionId))
}

function emptyStore() {
  return { recordId: null, answers: {} }
}

/**
 * 全量读取某章节草稿
 * @param {string|number} sectionId
 * @param {Array<string|number>} [validQids] 当前套题的合法 qid 集合，传入则过滤掉不属于本套题的旧草稿
 * @returns {{recordId:*, answers:Object}}
 */
export function loadDraftStore(sectionId, validQids) {
  const ls = getStorage()
  if (!ls) return emptyStore()
  try {
    const raw = ls.getItem(draftStorageKey(sectionId))
    if (!raw) return emptyStore()
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return emptyStore()
    const src = parsed.answers && typeof parsed.answers === 'object' ? parsed.answers : {}
    const allow = Array.isArray(validQids) && validQids.length
      ? new Set(validQids.map(v => String(v)))
      : null
    const answers = {}
    for (const k of Object.keys(src)) {
      if (allow && !allow.has(String(k))) continue
      const a = src[k]
      if (a && typeof a.answer === 'string' && a.answer.length > 0) {
        answers[String(k)] = { answer: a.answer, type: a.type || '', ts: a.ts || 0 }
      }
    }
    return { recordId: parsed.recordId ?? null, answers }
  } catch (e) {
    // 非法 JSON 等异常：兜底空草稿，不崩页面
    return emptyStore()
  }
}

/**
 * 整体覆盖写入某章节草稿（保留已存 recordId）
 * @param {Object} answersMap { [qid]: { answer, type, timestamp|ts } }
 * @param {*} [recordId]
 */
export function writeDraftAnswers(sectionId, answersMap, recordId) {
  const ls = getStorage()
  if (!ls) return
  try {
    const cur = loadDraftStore(sectionId, null)
    const answers = {}
    const map = answersMap || {}
    for (const k of Object.keys(map)) {
      const a = map[k]
      if (a && typeof a.answer === 'string' && a.answer.length > 0) {
        answers[String(k)] = {
          answer: a.answer,
          type: a.type || '',
          ts: a.timestamp || a.ts || Date.now()
        }
      }
    }
    const payload = { recordId: recordId ?? cur.recordId ?? null, answers }
    ls.setItem(draftStorageKey(sectionId), JSON.stringify(payload))
  } catch (e) {
    // 配额超限/隐私模式：静默失败，答题流程不受影响
  }
}

/** 写入/更新单条草稿（读-改-写） */
export function saveDraftAnswer(sectionId, qid, answer, type) {
  const ls = getStorage()
  if (!ls || qid == null) return
  try {
    const cur = loadDraftStore(sectionId, null)
    if (answer === '' || answer == null) {
      delete cur.answers[String(qid)]
    } else {
      cur.answers[String(qid)] = { answer: String(answer), type: type || '', ts: Date.now() }
    }
    ls.setItem(draftStorageKey(sectionId), JSON.stringify(cur))
  } catch (e) {
    // 静默降级
  }
}

/** 删除单条草稿（题目提交判分后调用，已提交结果归 pinia 管） */
export function removeDraftAnswer(sectionId, qid) {
  const ls = getStorage()
  if (!ls || qid == null) return
  try {
    const cur = loadDraftStore(sectionId, null)
    if (cur.answers[String(qid)]) {
      delete cur.answers[String(qid)]
      ls.setItem(draftStorageKey(sectionId), JSON.stringify(cur))
    }
  } catch (e) {
    // 静默降级
  }
}

/** 清空整章草稿（“再做一次”时调用） */
export function clearDraftStore(sectionId) {
  const ls = getStorage()
  if (!ls) return
  try {
    ls.removeItem(draftStorageKey(sectionId))
  } catch (e) {
    // 静默降级
  }
}
