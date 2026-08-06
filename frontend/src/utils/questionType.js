const TYPE_MAP = {
  '主观':'subjective', '简答':'subjective', '简述':'subjective',
  '名词解释':'subjective', '论述':'subjective', '填空':'subjective',
  '问答':'subjective', '案例分析':'subjective', '材料分析':'subjective',
  'essay':'subjective', 'short_answer':'subjective', 'fill':'subjective',
  'blank':'subjective', 'subject':'subjective', 'open':'subjective',
  '单选':'single', '单选题':'single', 'single':'single', '选择':'single', 'choice':'single',
  '多选':'multiple', '多选题':'multiple', '多项选择':'multiple',
  'multiple':'multiple', 'multi':'multiple', 'multi_choice':'multiple',
  '判断':'single', '判断题':'single', 'true/false':'single', 'boolean':'single'
}

const LABELS = { 'single':'单选题', 'multiple':'多选题', 'subjective':'主观题' }
const COLORS = { 'single':'#667eea', 'multiple':'#9944ff', 'subjective':'#ff8c00' }

/** 统一题型分类：传入题目对象，返回 { type, label, color, isSubjective, id } */
export function classify(q) {
  if (!q) return { type:'single', label:'单选题', color:'#667eea', isSubjective:false, id:undefined }
  let raw = q.type || ''
  let t = TYPE_MAP[raw] || (raw.includes('简答')||raw.includes('主观')||raw.includes('简述') ? 'subjective' : null)
  // 英语原文判断
  // 未知类型：通过内容特征判断
  if (!t) {
    if (q.options && typeof q.options === 'object' && Object.keys(q.options).length >= 2) {
      t = 'single'  // 有选项 → 客观题
    } else if (q.category && /简答|主观|简述|名词|论述|填空|问答|案例|材料/.test(q.category)) {
      t = 'subjective'
    } else {
      t = 'subjective'  // 默认主观题（安全降级，不会导致选项丢失）
    }
  }
  if (t !== 'subjective' && t !== 'single' && t !== 'multiple') t = 'subjective'
  // 答案多字母修正：仅当有 options 对象且确实是 single 时才可能升级
  // 题型由后端决定，前端不做自动升级（避免单选误判为多选）
  // 确保 id 字段存在
  const id = q.id || q._id
  return { type:t, label:LABELS[t]||'单选题', color:COLORS[t]||'#667eea', isSubjective:t==='subjective', id }
}
