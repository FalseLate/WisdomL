/**
 * 知识星图 · 展示账号种子。
 *
 *   node scripts/starmap-showcase-seed.mjs
 *
 * 账号：demo_showcase / Showcase123456
 * 只清空 demo_showcase 自己的星图，不碰其它账号。
 * 覆盖：3 个星系 + 3 个独立星球、空球/单点/多点、合并/钉住/未归类星尘、
 * 红黄绿掌握度、层级/共现/语义三种线、节点大小/发光/纹理、线宽/线色。
 *
 * 注意：note 字段需要数据库已按 backend/src/main/resources/schema.sql 建好/升级
 * 并重新打包后端 jar；当前后端没有该列时脚本能跑，但描述不会返回。
 */
const API = process.env.SEED_API || 'http://localhost:8080/api'
const account = { username: 'demo_showcase', password: 'Showcase123456', nickname: '知识宇宙展示' }

const topics = [
  { key: 'circ', title: '内科学 · 循环系统', color: '--accent', note: '心衰、高血压、心律失常；按“诱因—评估—用药—急救”顺序复习。' },
  { key: 'resp', title: '内科学 · 呼吸系统', color: '--sky-text', note: '慢阻肺、呼衰、肺心病；血气判读是共同底座。' },
  { key: 'gi', title: '内科学 · 消化系统', color: '--emerald-text', note: '溃疡、肝硬化、胰腺炎；急症先止血/禁食，再谈病因。' },
  { key: 'pk', title: '药理学 · 药代动力学', color: '--violet', note: '吸收、分布、代谢、排泄；首过效应和半衰期是高频考点。' },
  { key: 'pd', title: '药理学 · 药效学', color: '--orange', note: '受体、量效关系、不良反应；和药代一起构成用药逻辑。' },
  { key: 'read', title: '英语 · 阅读与语法', color: '--coral-text', note: '从句、长难句、主旨、推理；先抓主干再定位证据。' },
  { key: 'write', title: '英语 · 写作', color: '--indigo', note: '议论文与图表作文；准备可复用的段落骨架。' },
  { key: 'exam', title: '应试习惯', color: '--warning', note: '审题、单位、时间分配；不是知识本身，但会直接丢分。' },
  { key: 'patho', title: '病理生理', color: '--secondary', note: '这颗星球先留空，演示“建了星球还没放知识点”的状态。' },
  { key: 'biochem', title: '生物化学', color: '--success', note: '只放一个知识点，演示单点星球。' }
]

const points = [
  { key: 'hf_cause', topic: 'circ', title: '心衰的病因与诱因', note: '诱因≠病因：感染、心律失常、容量负荷过重是诱因；冠心病、高血压是病因。', pin: null },
  { key: 'nyha', topic: 'circ', title: 'NYHA 心功能分级', note: '按活动耐量分 I–IV 级；Ⅲ 级是“明显受限”。' },
  { key: 'quad', topic: 'circ', title: '慢性心衰四联用药', note: 'ACEI/ARB + β 阻滞剂 + MRA + SGLT2i。' },
  { key: 'acute_hf', topic: 'circ', title: '急性左心衰抢救流程', note: '端坐位、吸氧、利尿、扩血管，必要时强心。', merged: true },
  { key: 'htn', topic: 'circ', title: '高血压诊断与分级', note: '诊室 ≥140/90；家庭血压阈值更低。' },
  { key: 'dig_tox', topic: 'circ', title: '洋地黄中毒的识别', note: '黄视、心律失常、恶心；低钾会加重。' },
  { key: 'af_anticoag', topic: 'circ', title: '房颤的抗凝选择', note: '先做 CHA₂DS₂-VASc；出血风险高时选 NOAC 或调整剂量。', pin: { x: 18, y: 5, z: -9 }, color: '--violet' },
  { key: 'mi_ecg', topic: 'circ', title: '心肌梗死的心电图演变', note: '超急性 T 波 → ST 抬高 → Q 波形成。' },
  { key: 'copd', topic: 'resp', title: 'COPD 分级与吸入药', note: '按 FEV1 和症状分组；LAMA/LABA 是基础。' },
  { key: 'blood_gas', topic: 'resp', title: '呼吸衰竭的血气判读', note: '先看 PaO₂，再看 PaCO₂；Ⅰ 型 vs Ⅱ 型。' },
  { key: 'cor_pulm', topic: 'resp', title: '慢性肺源性心脏病', note: '慢阻肺长期缺氧 → 肺动脉高压 → 右心衰。' },
  { key: 'pneumo', topic: 'resp', title: '气胸的识别与处理', note: '突发胸痛+呼吸困难；张力性气胸先穿刺减压。' },
  { key: 'asthma', topic: 'resp', title: '支气管哮喘的长期控制', note: 'ICS 是控制药，SABA 是缓解药。', pin: { x: -16, y: 7, z: 10 } },
  { key: 'pe', topic: 'resp', title: '肺栓塞的筛查', note: '先 Wells 评分，再 D-二聚体/CTPA。' },
  { key: 'chest_tube', topic: 'resp', title: '胸腔闭式引流的护理', note: '水封瓶低于胸壁，防倒吸。' },
  { key: 'ulcer', topic: 'gi', title: '消化性溃疡的根除方案', note: '质子泵抑制剂 + 两种抗生素 + 铋剂。' },
  { key: 'ascites', topic: 'gi', title: '肝硬化腹水的处理', note: '限钠、利尿、放腹水；警惕自发性腹膜炎。' },
  { key: 'pancreatitis', topic: 'gi', title: '急性胰腺炎的诊断', note: '淀粉酶/脂肪酶 + 影像；重症看器官衰竭。' },
  { key: 'ugib', topic: 'gi', title: '上消化道出血的急救', note: 'ABC 优先，抑酸、内镜、必要时输血。' },
  { key: 'ibd', topic: 'gi', title: '炎症性肠病的鉴别', note: '溃疡性结肠炎连续、直肠起病；克罗恩跳跃性。' },
  { key: 'he', topic: 'gi', title: '肝性脑病的分期', note: '从性格改变到昏迷；找诱因比降氨更关键。' },
  { key: 'first_pass', topic: 'pk', title: '首过效应', note: '口服药经肝代谢后进入体循环的量减少。' },
  { key: 'half_life', topic: 'pk', title: '半衰期与稳态浓度', note: '约 5 个半衰期达到稳态。' },
  { key: 'enzyme', topic: 'pk', title: '肝药酶诱导与抑制', note: '利福平诱导、红霉素抑制；影响合并用药浓度。' },
  { key: 'bioavail', topic: 'pk', title: '生物利用度', note: 'AUC 比值；首过效应直接影响。' },
  { key: 'receptor', topic: 'pd', title: '受体激动与拮抗', note: '激动剂有内在活性，拮抗剂没有。', merged: true },
  { key: 'dose_response', topic: 'pd', title: '量效关系', note: '效价强度 vs 最大效能；别混。' },
  { key: 'adr', topic: 'pd', title: '不良反应类型', note: 'A 型可预测、B 型不可预测；停药后处理不同。' },
  { key: 'relative_clause', topic: 'read', title: '定语从句关系词选择', note: '先看先行词，再看从句缺什么成分。' },
  { key: 'long_sentence', topic: 'read', title: '长难句主干提取', note: '先找谓语，再剥从句和插入语。' },
  { key: 'main_idea', topic: 'read', title: '阅读主旨题定位', note: '看首尾段和各段首句，别用细节当主旨。' },
  { key: 'vocab', topic: 'read', title: '熟词僻义', note: '按上下文取义，不按第一义项硬套。' },
  { key: 'reference', topic: 'read', title: '指代题回指', note: '往前找最近、性数一致的先行词。' },
  { key: 'inference', topic: 'read', title: '推理题的证据边界', note: '答案必须由原文推出，不能过度脑补。' },
  { key: 'essay', topic: 'write', title: '议论文三段式', note: '观点—论据—让步/结论；每段一个中心。' },
  { key: 'chart', topic: 'write', title: '图表作文描述', note: '先总趋势，再关键数据，最后解释。' },
  { key: 'audit_miss', topic: 'exam', title: '审题漏条件', note: '圈出“最、首选、错误、除了”。', color: '--orange' },
  { key: 'unit_convert', topic: 'exam', title: '单位换算', note: 'mg↔g、mmol↔mg 先写换算再算数。' },
  { key: 'time_budget', topic: 'exam', title: '时间分配', note: '先易后难，单题超时先标记跳过。' },
  { key: 'tca', topic: 'biochem', title: '三羧酸循环的限速酶', note: '异柠檬酸脱氢酶；别和糖酵解限速酶混。', pin: { x: 9, y: 4, z: 7 }, color: '--success' },
  { key: 'diuretic_resist', topic: null, title: '利尿剂抵抗的处理', note: '先查依从性、钠摄入和肾灌注，再考虑加量或联合。' },
  { key: 'abbrev', topic: null, title: '医嘱缩写速记', note: 'qd/bid/tid、qod、prn；先确认再执行。' }
]

const questions = [
  { key: 'q_hf', stem: '慢性心衰最常见的诱因是（单选）', answer: 'B', userAnswer: 'C', options: ['A 感染', 'B 呼吸道感染', 'C 心律失常', 'D 过度劳累'], points: ['hf_cause', 'nyha', 'quad'], et: ['knowledge'], note: '诱因和病因混了' },
  { key: 'q_dig', stem: '洋地黄中毒最典型的心电图表现是（单选）', answer: 'A', userAnswer: 'D', options: ['A 室性期前收缩', 'B ST 抬高', 'C Q 波', 'D P 波高尖'], points: ['dig_tox', 'af_anticoag'], et: ['knowledge'] },
  { key: 'q_acute', stem: '急性左心衰伴血压下降首选措施是（单选）', answer: 'A', userAnswer: 'C', options: ['A 端坐位+吸氧+利尿', 'B 先补液', 'C 观察', 'D 只用口服药'], points: ['acute_hf', 'quad', 'hf_cause'], et: ['strategy'], redo: true },
  { key: 'q_htn', stem: '高血压合并心衰，首选哪类降压药（单选）', answer: 'A', userAnswer: 'B', options: ['A ACEI/ARB', 'B α 阻滞剂', 'C 短效硝苯地平', 'D 不用药'], points: ['htn', 'hf_cause', 'mi_ecg'], et: ['knowledge'] },
  { key: 'q_mi', stem: '急性心梗超急性期的心电图改变是（单选）', answer: 'B', userAnswer: 'A', options: ['A Q 波', 'B 高尖 T 波', 'C ST 回落', 'D T 波倒置'], points: ['mi_ecg', 'dig_tox'], et: ['knowledge'], redo: true },
  { key: 'q_copd', stem: 'COPD 稳定期的核心吸入药是（单选）', answer: 'A', userAnswer: 'D', options: ['A LAMA/LABA', 'B 抗生素', 'C 口服激素', 'D 镇咳药'], points: ['copd', 'blood_gas'], et: ['knowledge'] },
  { key: 'q_cor', stem: '肺心病患者血气提示 Ⅱ 型呼衰，最可能的机制是（单选）', answer: 'A', userAnswer: 'B', options: ['A 肺泡通气不足', 'B 弥散障碍', 'C 分流', 'D 贫血'], points: ['cor_pulm', 'blood_gas', 'copd'], et: ['knowledge', 'strategy'], redo: true },
  { key: 'q_pneumo', stem: '张力性气胸的首选处理是（单选）', answer: 'A', userAnswer: 'C', options: ['A 立即穿刺减压', 'B 先拍 CT', 'C 观察', 'D 口服止痛'], points: ['pneumo', 'chest_tube', 'blood_gas'], et: ['strategy'] },
  { key: 'q_asthma', stem: '哮喘长期控制药物是（单选）', answer: 'B', userAnswer: 'A', options: ['A SABA', 'B ICS', 'C 抗生素', 'D 镇咳药'], points: ['asthma', 'copd'], et: ['knowledge'], redo: true },
  { key: 'q_pe', stem: '怀疑肺栓塞时最先做的是（单选）', answer: 'A', userAnswer: 'D', options: ['A Wells 评分', 'B 直接溶栓', 'C 胸片', 'D 观察'], points: ['pe', 'blood_gas'], et: ['strategy'] },
  { key: 'q_ulcer', stem: '幽门螺杆菌根除方案通常包含（单选）', answer: 'A', userAnswer: 'C', options: ['A PPI+两种抗生素+铋剂', 'B 单用 PPI', 'C 只用抗生素', 'D 只用铋剂'], points: ['ulcer', 'ugib', 'he'], et: ['knowledge'] },
  { key: 'q_ascites', stem: '肝硬化腹水患者发热，最需要警惕（单选）', answer: 'B', userAnswer: 'D', options: ['A 低钾', 'B 自发性腹膜炎', 'C 贫血', 'D 便秘'], points: ['ascites', 'he'], et: ['knowledge'], redo: true },
  { key: 'q_panc', stem: '急性胰腺炎诊断最有价值的是（单选）', answer: 'A', userAnswer: 'C', options: ['A 脂肪酶+影像', 'B 血糖', 'C 血常规', 'D 尿常规'], points: ['pancreatitis', 'ulcer'], et: ['knowledge'] },
  { key: 'q_ibd', stem: '溃疡性结肠炎与克罗恩病的关键区别是（单选）', answer: 'A', userAnswer: 'B', options: ['A 连续/跳跃性病变', 'B 年龄', 'C 性别', 'D 血压'], points: ['ibd', 'ascites'], et: ['knowledge'], redo: true },
  { key: 'q_pk', stem: '首过效应主要影响（单选）', answer: 'A', userAnswer: 'D', options: ['A 口服生物利用度', 'B 半衰期', 'C 分布容积', 'D 排泄'], points: ['first_pass', 'bioavail', 'half_life'], et: ['knowledge'] },
  { key: 'q_half', stem: '按一级动力学，约几个半衰期达到稳态（单选）', answer: 'C', userAnswer: 'A', options: ['A 1 个', 'B 2 个', 'C 5 个', 'D 10 个'], points: ['half_life', 'enzyme', 'bioavail'], et: ['math'], redo: true },
  { key: 'q_receptor', stem: '拮抗剂的特点是（单选）', answer: 'B', userAnswer: 'A', options: ['A 有内在活性', 'B 无内在活性', 'C 一定不可逆', 'D 只作用于酶'], points: ['receptor', 'dose_response', 'adr'], et: ['knowledge'] },
  { key: 'q_adr', stem: 'B 型不良反应的特点是（单选）', answer: 'A', userAnswer: 'C', options: ['A 不可预测', 'B 剂量相关', 'C 一定轻微', 'D 只发生在肝'], points: ['adr', 'receptor'], et: ['knowledge'], redo: true },
  { key: 'q_read', stem: 'The book ___ covers are torn. 关系词选（单选）', answer: 'B', userAnswer: 'A', options: ['A which', 'B whose', 'C who', 'D where'], points: ['relative_clause', 'long_sentence', 'main_idea'], et: ['knowledge'] },
  { key: 'q_infer', stem: '阅读推理题的正确选项应当（单选）', answer: 'A', userAnswer: 'D', options: ['A 有原文证据', 'B 越绝对越好', 'C 靠常识', 'D 选最长'], points: ['main_idea', 'inference', 'vocab'], et: ['strategy'] },
  { key: 'q_write', stem: '图表作文第一段通常先写（单选）', answer: 'A', userAnswer: 'C', options: ['A 总趋势', 'B 个人故事', 'C 结论', 'D 无关背景'], points: ['essay', 'chart'], et: ['strategy'], redo: true },
  { key: 'q_exam', stem: '题干出现“最、首选、错误”时最应该（单选）', answer: 'B', userAnswer: 'D', options: ['A 跳过', 'B 圈出限定词', 'C 先写答案', 'D 只看选项'], points: ['audit_miss', 'unit_convert', 'time_budget'], et: ['audit'] },
  { key: 'q_tca', stem: '三羧酸循环的限速酶是（单选）', answer: 'C', userAnswer: 'A', options: ['A 己糖激酶', 'B 磷酸果糖激酶', 'C 异柠檬酸脱氢酶', 'D 丙酮酸激酶'], points: ['tca', 'half_life'], et: ['knowledge'], redo: true },
  { key: 'q_dust', stem: '利尿剂抵抗时最先确认的是（单选）', answer: 'A', userAnswer: 'C', options: ['A 依从性和钠摄入', 'B 直接加倍', 'C 停药', 'D 换中药'], points: ['diuretic_resist', 'abbrev'], et: ['strategy'] }
]

const semanticEdges = [
  { from: 'hf_cause', to: 'quad', rel: '先修', reason: '先分清诱因和病因，才能理解四联用药的启动顺序。' },
  { from: 'dig_tox', to: 'af_anticoag', rel: '依赖', reason: '抗凝前要排除洋地黄中毒导致的心律失常。' },
  { from: 'copd', to: 'blood_gas', rel: '依赖', reason: 'COPD 分级要看 FEV1，呼衰判读要看血气。' },
  { from: 'first_pass', to: 'dose_response', rel: '关联', reason: '药代决定到达靶点的量，药效决定反应强度。' },
  { from: 'relative_clause', to: 'long_sentence', rel: '先修', reason: '先会拆从句，才能提主干。' },
  { from: 'audit_miss', to: 'main_idea', rel: '关联', reason: '审题漏条件会直接导致主旨题选偏。' }
]

const nodeStyles = [
  { type: 'topic', key: 'circ', style: { size: 1.8, glow: 1.25, pattern: 'banded' } },
  { type: 'topic', key: 'resp', style: { size: 0.75, glow: 1.0, pattern: 'cloudy' } },
  { type: 'topic', key: 'write', style: { size: 2.2, glow: 1.35, pattern: 'smooth' } },
  { type: 'topic', key: 'patho', style: { size: 1.35, glow: 0.8, pattern: 'smooth' } },
  { type: 'point', key: 'hf_cause', style: { size: 2.2, glow: 1.45 } },
  { type: 'point', key: 'tca', style: { size: 1.8, glow: 1.2 } },
  { type: 'point', key: 'diuretic_resist', style: { size: 0.6, glow: 0.9 } }
]

const edgeStyles = [
  { target: 'cooc', pair: ['hf_cause', 'quad'], style: { width: 2.2, color: '--orange', lineStyle: 'solid' } },
  { target: 'cooc', pair: ['copd', 'blood_gas'], style: { width: 1.8, color: '--sky-text', lineStyle: 'dotted' } },
  { target: 'hier', pair: ['circ', 'hf_cause'], style: { width: 2.0 } },
  { target: 'custom', pair: ['dig_tox', 'af_anticoag'], style: { color: '--violet', width: 2.4, lineStyle: 'dashed' } }
]
const hiddenPair = ['ibd', 'ascites']
const vetoPair = ['pneumo', 'chest_tube']

let token = ''
async function call(path, method = 'GET', body) {
  const res = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined
  })
  const text = await res.text()
  let json = null
  try { json = text ? JSON.parse(text) : null } catch { json = { raw: text } }
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text.slice(0, 160)}`)
  return json
}

async function login() {
  await call('/auth/register', 'POST', account).catch(() => null)
  const r = await call('/auth/login', 'POST', { username: account.username, password: account.password })
  if (!r?.token) throw new Error('登录失败：' + JSON.stringify(r))
  token = r.token
}

async function clear() {
  const g = await call('/starmap/graph')
  for (const p of g.points || []) await call(`/starmap/point/${p.id}`, 'DELETE')
  for (const t of g.topics || []) await call(`/starmap/topic/${t.id}`, 'DELETE')
  for (const gx of g.galaxies || []) if (gx.manual) await call(`/starmap/galaxy/${gx.id}`, 'DELETE')
  for (const v of g.vetoes || []) {
    const params = { kind: v.kind, aKey: v.aKey, bKey: v.bKey }
    if (v.aPoint != null) params.aPoint = v.aPoint
    if (v.bPoint != null) params.bPoint = v.bPoint
    await call('/starmap/edge/veto?' + new URLSearchParams(params), 'DELETE')
  }
  for (const key of Object.keys(g.styles || {})) {
    await call('/starmap/style?targetKey=' + encodeURIComponent(key), 'DELETE')
  }
  // 展示账号自己的错题本也清空，重复播种才不会叠加掌握度
  const wrongs = await call('/wrong-questions').catch(() => [])
  for (const w of wrongs || []) await call(`/wrong-questions/${w.id}`, 'DELETE')
  return (g.points || []).length + (g.topics || []).length + (wrongs || []).length
}

const pair = (a, b) => (a < b ? [a, b] : [b, a])

async function main() {
  await login()
  const cleared = await clear()
  const topicId = {}
  const pointId = {}

  for (const t of topics) {
    const r = await call('/starmap/topic', 'POST', { title: t.title, note: t.note || '' })
    topicId[t.key] = r.id
    const patch = {}
    if (t.color) patch.color = t.color
    if (t.note) patch.note = t.note
    if (Object.keys(patch).length) await call(`/starmap/topic/${r.id}`, 'PUT', patch)
  }

  for (const p of points) {
    const r = await call('/starmap/point', 'POST', {
      title: p.title,
      topicId: p.topic ? topicId[p.topic] : null,
      note: p.note || ''
    })
    pointId[p.key] = r.id
    const patch = {}
    if (p.color) patch.color = p.color
    if (p.merged) patch.merged = 1
    if (p.pin) patch.pin = p.pin
    if (p.note) patch.note = p.note
    if (Object.keys(patch).length) await call(`/starmap/point/${r.id}`, 'PUT', patch)
  }

  // 错题 → 错题本 → 挂知识点；这是掌握度和共现线的唯一事实源
  for (const q of questions) {
    await call('/check', 'POST', {
      question: {
        id: 'showcase_' + q.key,
        type: 'single',
        stem: q.stem,
        options: q.options,
        answer: q.answer,
        explanation: '展示账号题'
      },
      userAnswer: q.userAnswer,
      answerTime: 45
    })
  }
  const wrongList = await call('/wrong-questions')
  const byStem = new Map((wrongList || []).map(w => {
    let stem = ''
    try { stem = JSON.parse(w.questionContent).stem } catch { stem = w.questionContent || '' }
    return [stem, w.id]
  }))
  let refCount = 0
  for (const q of questions) {
    const qid = byStem.get(q.stem)
    if (!qid) continue
    for (const key of q.points) {
      await call(`/starmap/point/${pointId[key]}/ref`, 'POST', { wrongQuestionId: qid })
      refCount++
    }
  }
  for (const q of questions) {
    if (!q.et?.length) continue
    await call('/wrong-questions/error-type', 'POST', {
      questionId: 'showcase_' + q.key,
      errorTypes: q.et.join(','),
      errorNote: q.note || ''
    })
  }
  let redone = 0
  for (const q of questions) {
    if (!q.redo) continue
    const qid = byStem.get(q.stem)
    if (!qid) continue
    await call(`/wrong-questions/${qid}/redo`, 'POST', { userAnswer: q.answer, answerTime: 30 })
    redone++
  }

  const edgeByPair = new Map()
  for (const e of semanticEdges) {
    const r = await call('/starmap/edge', 'POST', {
      from: pointId[e.from], to: pointId[e.to], fromKind: 'point', toKind: 'point',
      rel: e.rel, reason: e.reason
    })
    edgeByPair.set(`${e.from}|${e.to}`, r.id)
  }

  for (const s of nodeStyles) {
    const id = s.type === 'topic' ? topicId[s.key] : pointId[s.key]
    const targetKey = `${s.type}|${id}`
    await call('/starmap/style', 'PUT', { targetType: s.type, targetKey, style: s.style })
  }
  for (const s of edgeStyles) {
    let targetKey
    if (s.target === 'cooc') {
      const [lo, hi] = pair(pointId[s.pair[0]], pointId[s.pair[1]])
      targetKey = `cooc|${lo}|${hi}`
    } else if (s.target === 'hier') {
      targetKey = `hier|${topicId[s.pair[0]]}|${pointId[s.pair[1]]}`
    } else {
      targetKey = `custom|${edgeByPair.get(`${s.pair[0]}|${s.pair[1]}`)}`
    }
    await call('/starmap/style', 'PUT', { targetType: 'edge', targetKey, style: s.style })
  }

  const [hlo, hhi] = pair(pointId[hiddenPair[0]], pointId[hiddenPair[1]])
  await call('/starmap/style', 'PUT', { targetType: 'edge', targetKey: `cooc|${hlo}|${hhi}`, style: { hidden: true } })
  const [vlo, vhi] = pair(pointId[vetoPair[0]], pointId[vetoPair[1]])
  await call('/starmap/edge/veto', 'POST', { kind: 'cooc', aPoint: vlo, bPoint: vhi, aKind: 'point', bKind: 'point' })

  const g = await call('/starmap/graph')
  const hasNote = (g.points || []).some(p => p.note)
  console.log(`展示账号：${account.username} / ${account.password}（清空旧数据 ${cleared} 条）`)
  console.log(`大球 ${g.topics.length} · 小球 ${g.points.length} · 语义线 ${(g.edges || []).length}`)
  console.log(`星系：内科学 / 药理学 / 英语；空球：病理生理；星尘：${(g.points || []).filter(p => p.topicId == null).length} 个`)
  console.log(`错题 ${questions.length} 道 · 知识点挂接 ${refCount} 条 · 重做 ${redone} 道 · 隐藏 ${hiddenPair.join('↔')} · 否决 ${vetoPair.join('↔')}`)
  if (!hasNote) console.log('注意：当前后端还没有 note 字段。按 schema.sql 完成数据库升级并重打后端 jar 后，重跑本脚本即可带出描述。')
  console.log('打开 /knowledge-universe，用上面账号登录查看。')
}

main().catch(e => { console.error('展示数据播种失败：', e.message); process.exit(1) })
