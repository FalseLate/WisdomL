const TYPE_MAP = {
  '主观':'subjective', '简答':'subjective', '简述':'subjective',
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
  if (!t) t = raw
  if (t !== 'subjective' && t !== 'single' && t !== 'multiple') t = 'single'
  // 答案多字母修正：single但答案有多个字母→multiple（仅当答案是无分隔符的纯字母）
  if (t === 'single' && q.answer) {
    const letters = q.answer.replace(/[^A-Za-z]/g, '')
    if (letters.length > 1) t = 'multiple'
  }
  // 确保 id 字段存在
  const id = q.id || q._id
  return { type:t, label:LABELS[t]||'单选题', color:COLORS[t]||'#667eea', isSubjective:t==='subjective', id }
}
