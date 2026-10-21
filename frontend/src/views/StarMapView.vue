<template>
  <div class="starmap">
    <canvas ref="canvasEl" class="stage" role="application"
            aria-label="3D 知识宇宙星图：左键拖空白旋转视角，中键拖拽平移，滚轮缩放，按住星球或星点拖动摆位置，双击星球进入"></canvas>
    <div ref="labelEl" class="labels" aria-hidden="true"></div>
    <div class="vignette" aria-hidden="true"></div>
    <div class="sky-wash" aria-hidden="true"></div>
    <p class="sr-only" aria-live="polite">{{ liveText }}</p>

    <header class="topbar">
      <div class="brand">知识星图</div>
      <nav class="crumbs" aria-label="所在层级">
        <button class="crumb" :class="{ current: !store.scope.value }" type="button" @click="backToRoot">我的星图</button>
        <template v-if="scopeTopic">
          <span class="crumb-sep">›</span>
          <button class="crumb current" type="button">{{ scopeTopic.title }}</button>
        </template>
      </nav>
      <div class="search">
        <span class="search-icon" aria-hidden="true">⌕</span>
        <input v-model="q" type="search" placeholder="搜星球 / 星系 / 知识点，回车飞过去" aria-label="搜索星球、星系、知识点"
               autocomplete="off" @input="onSearch" @keydown="onSearchKey">
        <ul v-if="hits.length" class="results" role="listbox">
          <li v-for="(h, i) in hits" :key="h.key" :class="{ on: i === hitIndex }" role="option" @click="jump(h)">
            {{ h.title }}<span class="from">{{ hitMeta(h) }}</span>
          </li>
        </ul>
      </div>
      <div class="tools">
        <button class="tool" type="button" @click="quick = { kind: 'topic', title: '', galaxyKey: null }">＋新建主题</button>
        <button class="tool" type="button" @click="quick = { kind: 'galaxy', title: '', color: '--accent' }">＋新建星系</button>
        <button class="tool" type="button" :aria-pressed="store.linkMode.value" title="开着时：从一颗拖到另一颗就连线；也可以依次点两颗" @click="toggleLinkMode">{{ store.linkMode.value ? '连线中（Esc 退出）' : '连线' }}</button>
        <button class="tool" type="button" :aria-pressed="store.galaxyMode.value" title="开着时：按住任意一颗属于星系的星球，或按住雾团，整团一起移动" @click="store.toggleGalaxyMode()">星系模式</button>
        <button class="tool" type="button" @click="backToRoot">回到全景</button>
        <button class="tool" type="button" :aria-pressed="store.autoRotate.value" @click="store.toggleAutoRotate()">自动旋转</button>
        <button class="tool" type="button" :aria-pressed="showDisplay" @click="showDisplay = !showDisplay">显示</button>
        <button class="tool" type="button" :title="light ? '当前浅色，点击切换到深色' : '当前深色，点击切换到浅色'" @click="switchTheme">{{ light ? '浅色' : '深色' }}</button>
      </div>
    </header>

    <StarDisplay v-if="showDisplay" :value="displayNow" @change="onDisplay" @close="showDisplay = false" />

    <div v-if="edgeTip" class="edge-tip" role="tooltip" :style="{ left: edgeTip.x + 'px', top: edgeTip.y + 'px' }">
      <div class="edge-tip-kind">
        {{ EDGE_TYPE_LABEL[edgeTip.edge.type] || '连线' }}<template v-if="edgeTip.edge.type === 'ai'"> · {{ edgeTip.edge.rel || '关联' }}</template>
      </div>
      <div class="edge-tip-title">
        {{ nameOfKey(edgeTip.edge.a) }}{{ edgeTip.edge.type === 'ai' ? ' → ' : ' ↔ ' }}{{ nameOfKey(edgeTip.edge.b) }}
      </div>
      <p v-if="edgeTip.edge.type === 'cooc'" class="edge-tip-meta">共现 {{ edgeTip.edge.weight }} 次 · 来自同一道错题的证据</p>
      <p v-else-if="edgeTip.edge.type === 'ai'" class="edge-tip-why">{{ edgeTip.edge.reason || '这条线还没写理由' }}</p>
      <p v-else class="edge-tip-meta">归属关系 · 删线不会把它踢出星球</p>
      <div class="edge-tip-foot">{{ edgeTip.edge.type === 'hier' ? '点击线查看详情' : '光点已暂停 · 点击线查看详情' }}</div>
    </div>

    <StarPanel
      :graph="store.graph.value"
      :node="store.selected.value"
      :edge="store.selectedEdgeObj.value"
      :pending-link="store.pendingLink.value"
      :link-from="store.linkFrom.value"
      :topics="store.topics.value"
      :scope="store.scope.value"
      :unanalyzed="store.unanalyzed.value"
      :analyzing="store.analyzing.value"
      :wrong-pool="store.wrongPool.value"
      :wrong-today="store.wrongToday.value"
      :unanalyzed-questions="store.unanalyzedQuestions.value"
      :point-candidates="store.pointCandidates.value"
      :vetoes="store.vetoes.value"
      @action="onAction"
      @resize="onPanelResize"
    />

    <StarMenu ref="menuEl" @action="onMenuAction" />

    <button v-if="scopeTopic && !quick" class="pill" type="button" @click="quick = { kind: 'point', topicKey: store.scope.value, title: '' }">
      ＋ 在「{{ scopeTopic.title }}」里加知识点
    </button>
    <form v-if="quick" class="quick" @submit.prevent="submitQuick">
      <span class="quick-cap">{{ quickCap }}</span>
      <input ref="quickInputEl" v-model="quick.title" class="field" :placeholder="quickPlaceholder" aria-label="名字" data-autofocus>
      <span v-if="!quick.title?.trim()" class="quick-need">{{ isGalaxyQuick ? '先写星系名' : '先写名字' }}</span>
      <span v-if="isGalaxyQuick" class="quick-colors" role="group" aria-label="星系颜色">
        <button v-for="c in PALETTE" :key="c.token" class="quick-color" :class="{ on: quick.color === c.token }"
                type="button" :style="{ background: `var(${c.token})` }" :aria-label="c.name"
                :aria-pressed="quick.color === c.token" @click="quick.color = c.token"></button>
      </span>
      <button class="btn primary" type="submit">{{ quickSubmitLabel }}</button>
      <button class="btn" type="button" @click="quick = null">取消</button>
    </form>

    <div v-if="galaxyPick" class="galaxy-pick-mask" @click.self="closeGalaxyPick">
      <section class="galaxy-pick" role="dialog" aria-modal="true" aria-labelledby="galaxy-pick-title">
        <header class="gp-head">
          <h3 id="galaxy-pick-title">收星球进「{{ galaxyPick.title }}」</h3>
          <button class="btn" type="button" @click="closeGalaxyPick">关闭</button>
        </header>
        <input v-model="galaxyPickQ" class="field" placeholder="搜星球名字" aria-label="搜星球">
        <p class="gp-tip">一颗星球只能在一个手建星系里。已在别的星系的，要先在它的详情里移出。</p>
        <ul class="gp-list">
          <li v-for="t in galaxyPickTopics" :key="t.key">
            <div class="gp-main">
              <b>{{ t.title }}</b>
              <span>{{ galaxyMetaOf(t) }}</span>
            </div>
            <button v-if="t.galaxyId === galaxyPick.id" class="btn" type="button" disabled>已在本星系</button>
            <button v-else-if="t.galaxyId != null" class="btn blocked" type="button" @click="collectTopic(t)">先移出「{{ galaxyName(t.galaxyId) }}」</button>
            <button v-else class="btn primary" type="button" @click="collectTopic(t)">收进来</button>
          </li>
          <li v-if="!galaxyPickTopics.length" class="gp-empty">没有匹配的星球</li>
        </ul>
      </section>
    </div>

    <aside class="universe-hud" aria-hidden="true">
      <div class="hud-kicker">{{ scopeTopic ? 'PLANET VIEW' : 'KNOWLEDGE UNIVERSE' }}</div>
      <div class="hud-counts">
        <span><b>{{ graph.galaxies.length }}</b>星系</span>
        <span><b>{{ graph.topics.length }}</b>星球</span>
        <span><b>{{ graph.stars.length }}</b>星点</span>
        <span><b>{{ store.stats.value.edges }}</b>连线</span>
      </div>
      <div class="hud-line">{{ scopeTopic ? scopeTopic.title : (store.autoRotate.value ? '自动巡航中' : '自由漫游') }}</div>
    </aside>

    <footer class="legend">
      <span class="lg"><i class="sw sw-galaxy"></i>星系 · 手建雾团 / 同领域成团</span>
      <span class="lg"><i class="sw sw-solid"></i>层级线 · 归进星球</span>
      <span class="lg"><i class="sw sw-solid-thin"></i>错题共现线 · 同一错题一起错</span>
      <span class="lg"><i class="sw sw-dashed"></i>学习关系线 · 先修/依赖</span>
      <span class="lg hint">左键拖 旋转 · 中键拖 平移 · 滚轮 缩放 · Shift+拖 连线 · 双击进星球 · 点/右键雾团 操作 · 星系模式 整团拖</span>
    </footer>

    <div v-if="!store.loading.value && !store.error.value && !graph.nodes.length" class="empty-universe">
      <p class="empty-kicker">YOUR KNOWLEDGE UNIVERSE</p>
      <h2>宇宙还是空的</h2>
      <p>先建一颗主题星球，再从错题或知识点开始点亮它。</p>
      <button class="btn primary" type="button" @click="quick = { kind: 'topic', title: '', galaxyKey: null }">＋ 建第一颗星球</button>
    </div>

    <div v-if="!store.loading.value && store.error.value" class="mask">
      <p>{{ store.error.value }}</p>
      <button class="btn primary" type="button" @click="store.load()">重试</button>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { showConfirmDialog } from 'vant'
import { toast, failToast } from '../starmap/toast.js'
import { appearance, toggleTheme, originFromEvent } from '../utils/theme.js'
import { pollTask } from '../utils/pollTask.js'
import StarPanel from '../components/starmap/StarPanel.vue'
import StarMenu from '../components/starmap/StarMenu.vue'
import StarDisplay from '../components/starmap/StarDisplay.vue'
import { useStarMap } from '../starmap/useStarMap.js'
import { createUniverse } from '../starmap/universe.js'
import { loadDisplay } from '../starmap/display.js'
import { normalizeTitle } from '../starmap/graph.js'
import { PALETTE } from '../starmap/style-lang.js'
import { beginWarp, finishWarp, cancelWarp } from '../starmap/warp.js'

const store = useStarMap()
const router = useRouter()
const graph = computed(() => store.graph.value)
const canvasEl = ref(null)
const labelEl = ref(null)
const menuEl = ref(null)
let renderer = null

function afterPaint() {
  return new Promise(resolve => {
    let done = false
    const finish = () => { if (!done) { done = true; resolve() } }
    requestAnimationFrame(() => requestAnimationFrame(finish))
    // 隐藏标签页会节流 rAF；别让入场遮罩因此一直挂着
    setTimeout(finish, 320)
  })
}

const q = ref('')
const hits = ref([])
const hitIndex = ref(0)
const quick = ref(null)
const quickInputEl = ref(null)
const galaxyPick = ref(null)
const galaxyPickQ = ref('')
const light = computed(() => appearance.theme === 'light')
const isGalaxyQuick = computed(() => quick.value?.kind === 'galaxy' || quick.value?.kind === 'galaxy-edit')
const quickGalaxy = computed(() => (quick.value?.galaxyKey
  ? graph.value.galaxies.find(g => g.key === quick.value.galaxyKey)
  : null))
const quickCap = computed(() => {
  if (!quick.value) return ''
  if (quick.value.kind === 'galaxy') return '新建星系（雾团）'
  if (quick.value.kind === 'galaxy-edit') return '星系设置'
  if (quick.value.kind === 'rename') return '改名'
  if (quick.value.kind === 'topic') return quickGalaxy.value ? `新建星球 · 归入「${quickGalaxy.value.title}」` : '新建星球（主题）'
  return quick.value.topicKey ? '新建知识点' : '新建游离知识点（星尘）'
})
const quickPlaceholder = computed(() => {
  if (!quick.value) return ''
  if (quick.value.kind === 'galaxy' || quick.value.kind === 'galaxy-edit') return '星系名字，比如「内科学」'
  if (quick.value.kind === 'rename') return '新名字'
  if (quick.value.kind === 'topic') return quickGalaxy.value ? '星球名字（自动星系会补上前缀）' : '星球名字，比如「内科学 · 循环系统」'
  return '知识点名字'
})
const quickSubmitLabel = computed(() => {
  if (quick.value?.kind === 'galaxy') return '建星系'
  if (quick.value?.kind === 'galaxy-edit' || quick.value?.kind === 'rename') return '保存'
  if (quick.value?.kind === 'topic') return '建这颗星球'
  return '加进去'
})
const galaxyPickTopics = computed(() => {
  const q = galaxyPickQ.value.trim().toLowerCase()
  return graph.value.topics
    .filter(t => !q || t.title.toLowerCase().includes(q))
    .slice()
    .sort((a, b) => a.title.localeCompare(b.title, 'zh'))
})
const galaxyName = id => graph.value.galaxies.find(g => g.id === id)?.title || '另一个星系'
function galaxyMetaOf(t) {
  const g = t.galaxyKey ? graph.value.galaxies.find(x => x.key === t.galaxyKey) : null
  if (!g) return '未归入任何星系'
  return g.manual ? `已归入「${g.title}」` : `自动成团「${g.title}」`
}
async function collectTopic(t) {
  const g = galaxyPick.value
  if (!g || t.galaxyId === g.id) return
  if (t.galaxyId != null) {
    toast(`「${t.title}」已经在「${galaxyName(t.galaxyId)}」，先把它移出那个星系`)
    return
  }
  await store.setTopicGalaxy(t.key, g.id)
}
function closeGalaxyPick() {
  galaxyPick.value = null
  galaxyPickQ.value = ''
}
const showDisplay = ref(false)
const displayNow = ref(loadDisplay())
const edgeTip = ref(null)
const EDGE_TYPE_LABEL = { hier: '层级线 · 归属', cooc: '错题共现线 · 证据', ai: '学习关系线 · 主张' }

function onEdgeHover(styleKey, at) {
  if (!styleKey || !at) { edgeTip.value = null; return }
  const edge = store.graph.value.edges.find(e => e.styleKey === styleKey)
  if (!edge) { edgeTip.value = null; return }
  edgeTip.value = {
    edge,
    x: Math.min(window.innerWidth - 304, at.x + 16),
    y: Math.min(window.innerHeight - 150, at.y + 16)
  }
}
watch(() => store.selectedEdge.value, v => { if (v) edgeTip.value = null })

function onDisplay(patch) {
  displayNow.value = { ...displayNow.value, ...patch }
  renderer?.setDisplay(patch)
}
function onPanelResize(width) {
  renderer?.setSideInset(window.innerWidth > 760 && width ? width + 12 : 0)
}
function onKey(ev) {
  if (ev.key !== 'Escape') return
  if (galaxyPick.value) { closeGalaxyPick(); return }
  if (store.linkMode.value) store.setLinkMode(false)
}
const scopeTopic = computed(() => (store.scope.value ? store.graph.value.byKey.get(store.scope.value) : null))
const nameOfKey = key => store.graph.value.byKey.get(key)?.title || '未命名'
const liveText = computed(() => {
  if (store.pendingLink.value) return `待确认连线：${nameOfKey(store.pendingLink.value.a)} 与 ${nameOfKey(store.pendingLink.value.b)}`
  if (store.selectedEdgeObj.value) return `已选中连线：${store.selectedEdgeObj.value.source || '连线'}`
  return store.selected.value ? `已选中：${store.selected.value.title}` : '知识星图全景'
})
const switchTheme = ev => toggleTheme(originFromEvent(ev))

const topicNameOf = node => (node.topicKey
  ? store.graph.value.byKey.get(node.topicKey)?.title || ''
  : node.kind === 'star' ? '游离星尘' : '未归类')
const hitMeta = h => (h.isGalaxy
  ? `星系 · ${h.topics} 星球`
  : h.kind === 'topic' ? '星球' : topicNameOf(h))

function onSearch() {
  hits.value = store.search(q.value)
  hitIndex.value = 0
}

function onSearchKey(ev) {
  if (ev.key === 'ArrowDown') { hitIndex.value = Math.min(hits.value.length - 1, hitIndex.value + 1); ev.preventDefault() }
  else if (ev.key === 'ArrowUp') { hitIndex.value = Math.max(0, hitIndex.value - 1); ev.preventDefault() }
  else if (ev.key === 'Enter') {
    ev.preventDefault()
    const hit = hits.value[hitIndex.value] || hits.value[0]
    if (hit) jump(hit)
    else toast('星图里没有这个名字：可以先建一颗')
  } else if (ev.key === 'Escape') {
    q.value = ''
    hits.value = []
  }
}

function jump(hit) {
  const key = typeof hit === 'string' ? hit : hit.key
  const isGalaxy = typeof hit === 'object' && hit.isGalaxy
  hits.value = []
  q.value = ''
  if (isGalaxy) {
    store.jumpToGalaxy(key)
    return
  }
  store.jumpTo(key)
}

function backToRoot() {
  store.backToRoot()
}

async function submitQuick() {
  const title = (quick.value?.title || '').trim()
  if (!title) {
    toast(quick.value?.kind === 'galaxy' ? '先给星系起个名字' : '先给它起个名字')
    quickInputEl.value?.focus()
    return
  }
  if (quick.value.kind === 'galaxy') {
    const pin = quick.value.world || null
    await store.createGalaxy({ title, color: quick.value.color || '--accent', pin })
    quick.value = null
    // 从顶栏建的空星系可能落在当前视野外，回全景把它框进来；右键点在哪就留在哪
    if (!pin) store.backToRoot()
    return
  }
  if (quick.value.kind === 'galaxy-edit') {
    await store.updateGalaxy(quick.value.id, { title, color: quick.value.color || null })
    quick.value = null
    return
  }
  if (quick.value.kind === 'topic') {
    const g = quickGalaxy.value
    let finalTitle = title
    let galaxyId = null
    if (g?.manual) galaxyId = g.id
    // 自动星系靠标题前缀成团：没写分隔符就替用户补上
    else if (g) finalTitle = /^(.{1,24}?)[\s]*[·•｜|:：/—–]/.test(title) ? title : `${g.title} · ${title}`
    await store.createTopic(finalTitle, '', galaxyId)
    quick.value = null
    return
  }
  if (quick.value.kind === 'rename') {
    await store.renameNode(quick.value.key, title)
    quick.value = null
    return
  }
  const { topicKey } = quick.value
  // 游离星尘：用右键处的世界坐标当钉子，下次打开还在原地
  const pin = topicKey ? null : quick.value.world || null
  const res = await store.createPoint(topicKey, title, false, '', pin)
  if (res?.id) store.select(`P${res.id}`)
  if (res?.duplicate) {
    const dup = res.duplicate
    try {
      await showConfirmDialog({
        title: '这个名字你已经有了',
        message: `已存在「${dup.title}」（${topicNameOf(dup) || '未归类'}）。去用已有的那颗，还是再建一颗同名的？`,
        confirmButtonText: '用已有的',
        cancelButtonText: '仍然新建'
      })
      store.select(dup.key)
    } catch {
      await store.createPoint(topicKey, title, true, '', pin)
    }
  }
  quick.value = null
}

async function onAction(ev) {
  const { type } = ev
  // 面板传的是键字符串，菜单传的是 { key }，这里统一
  const payload = ev.payload?.key !== undefined && typeof ev.payload === 'object' ? ev.payload.key : ev.payload
  const full = ev.payload
  switch (type) {
    case 'select': store.select(full, { fly: true }); break
    case 'rename': await store.renameNode(full.key, full.title); break
    case 'assign-galaxy': await store.setTopicGalaxy(full.key, full.galaxyId); break
    case 'node-color': await store.setNodeColor(full.key, full.token); break
    case 'merge': await store.setMerged(full.key, full.on); break
    case 'reparent': await store.reparent(full.key, full.topicKey); break
    case 'hier-line': await store.setHierLine(full.key, full.on); break
    case 'remove': await store.removeNode(payload); break
    case 'create-topic': quick.value = { kind: 'topic', title: '' }; break
    case 'create-point': await addInto(full.topicKey, full.title, full.note); break
    case 'save-note': await store.setNote(full.key, full.note); break
    case 'enter': store.enterTopic(payload); break
    case 'link-start': case 'link-from': startLink(payload || store.selectedKey.value); break
    case 'link-cancel': store.setLinkMode(false); store.pendingLink.value = null; break
    case 'link-confirm': {
      const { a, b } = store.pendingLink.value
      await store.createEdge({ fromKey: a, toKey: b, rel: full.rel, reason: full.reason })
      store.pendingLink.value = null
      break
    }
    case 'edge-preview': store.previewStyle(full.key, full.patch); break
    case 'edge-commit': await store.commitStyle('edge', full.key, full.style); break
    case 'node-preview': store.previewNodeStyle(full.key, full.patch); break
    case 'node-commit': await store.commitNodeStyle(full.key, full.patch); break
    case 'style-reset': await store.resetStyle(payload); break
    case 'edge-delete': await store.deleteEdge(full); break
    case 'veto-undo': await store.undoVeto(full); break
    case 'candidate-accept': await store.acceptPointCandidate(full.id, full.topicKey); break
    case 'candidate-reject': await store.rejectPointCandidate(payload); break
    case 'ref-attach': await store.attachRef(full.key, full.wrongQuestionId); break
    case 'ref-detach': await store.detachRef(full.key, full.wrongQuestionId); break
    case 'ai-analyze': await runAnalyze(); break
    case 'ai-analyze-selected': await runAnalyze(full); break
    case 'unpin': await store.unpinNode(payload); break
    case 'go-wrong-questions': router.push('/wrong-questions'); break
    default: break
  }
}

async function addInto(topicKey, title, note = '') {
  const res = await store.createPoint(topicKey, title, false, note)
  if (res?.duplicate) {
    toast(`已有「${res.duplicate.title}」，要合并的话在它的详情里点删除再选合并`)
    return
  }
  // 新点建完直接选中，用户可以马上补描述
  if (res?.id) store.select(`P${res.id}`)
  else if (topicKey) store.select(topicKey)
}

function startLink(key) {
  if (!key || !store.graph.value.byKey.has(key)) { toast('先选中一颗星或一颗大球'); return }
  store.setLinkMode(true)
  store.linkFrom.value = key
  toast('再点一颗（或从它拖到另一颗）就连上；Esc 退出')
}

function toggleLinkMode() {
  if (store.linkMode.value) { store.setLinkMode(false); return }
  store.setLinkMode(true)
  if (store.selectedKey.value) store.linkFrom.value = store.selectedKey.value
  toast(store.linkFrom.value ? '起点已选好，点（或拖到）另一颗' : '从一颗拖到另一颗，或依次点两颗')
}

async function runAnalyze(questionIds = null) {
  store.analyzing.value = true
  try {
    const taskId = await store.analyze(questionIds)
    if (!taskId) return
    toast('AI 正在反推知识点…')
    const res = await pollTask(taskId, { intervalMs: 2500, maxMs: 480000 })
    const out = res?.result || {}
    toast(`反推完成：新增 ${out.candidates || 0} 条候选，失败 ${out.failed || 0} 题`)
    await store.load()
  } catch (e) {
    failToast(e?.message || '反推失败')
  } finally {
    store.analyzing.value = false
    store.refreshUnanalyzed()
  }
}

async function onMenuAction(ev) {
  const { type, payload } = ev
  const node = payload?.key ? store.graph.value.byKey.get(payload.key) : null
  const galaxy = payload?.galaxyKey ? store.graph.value.galaxies.find(g => g.key === payload.galaxyKey) : null
  if (type === 'create-galaxy') {
    quick.value = { kind: 'galaxy', title: '', color: '--accent', world: payload.world || null }
    return
  }
  if (type === 'create-topic') { quick.value = { kind: 'topic', title: '', galaxyKey: null }; return }
  if (type === 'create-topic-in-galaxy' && galaxy) {
    quick.value = { kind: 'topic', title: '', galaxyKey: galaxy.key }
    return
  }
  if (type === 'create-free-point') {
    quick.value = { kind: 'point', topicKey: null, title: '', world: payload.world || null }
    return
  }
  if (type === 'collect-topics' && galaxy?.manual) {
    galaxyPick.value = galaxy
    galaxyPickQ.value = ''
    return
  }
  if (type === 'edit-galaxy' && galaxy?.manual) {
    quick.value = { kind: 'galaxy-edit', id: galaxy.id, title: galaxy.title, color: galaxy.color || '--accent' }
    return
  }
  if (type === 'delete-galaxy' && galaxy?.manual) {
    try {
      await showConfirmDialog({
        title: `删除星系「${galaxy.title}」？`,
        message: '雾团会消失，里面的星球都会保留：有标题前缀的回到自动成团，没有的变成独立星球。',
        confirmButtonText: '删除星系',
        cancelButtonText: '取消'
      })
      await store.deleteGalaxy(galaxy.id)
    } catch { /* 取消 */ }
    return
  }
  if (type === 'add-point') {
    quick.value = { kind: 'point', topicKey: payload.key || store.scope.value, title: '' }
    return
  }
  if (type === 'reset-view') { store.clearSelection(); store.backToRoot(); return }
  if (type === 'unpin-all') { store.unpinAll(); return }
  if (type === 'panel') { store.select(payload.key); return }
  if (type === 'edge-open') { store.selectEdge(payload.key); return }
  if (type === 'edge-delete') {
    const edge = store.graph.value.edges.find(e => e.styleKey === payload.key)
    if (edge) store.deleteEdge(edge)
    return
  }
  // 菜单只知道"点的是谁"，开关类动作要按它当前的状态取反
  if (type === 'rename' && node) { quick.value = { kind: 'rename', key: node.key, title: node.title }; return }
  if (type === 'merge' && node) { store.setMerged(node.key, !node.merged); return }
  if (type === 'hier-line' && node) { store.setHierLine(node.key, !node.hierLine); return }
  onAction(ev)
}

watch(() => appearance.theme, () => renderer?.sync())

async function initStarMap() {
  await nextTick()
  renderer = createUniverse({
    canvas: canvasEl.value,
    labelHost: labelEl.value,
    sideInset: window.innerWidth > 760 ? 342 : 0,
    onPick: key => (key ? store.select(key) : store.selectedEdge.value ? store.selectEdge(null) : store.clearSelection()),
    onPickEdge: key => store.selectEdge(key),
    onPickGalaxy: (galaxy, x, y) => {
      const g = store.graph.value.galaxies.find(item => item.key === galaxy)
      if (!g) return
      menuEl.value.open({ kind: 'empty', node: null, edge: null, galaxy: g, scope: null, world: null, x, y })
    },
    onHoverEdge: onEdgeHover,
    onEnterTopic: key => store.enterTopic(key),
    onPlaceNode: (key, place) => store.placeNode(key, place),
    onPlaceGalaxy: (galaxyKey, members) => store.placeGalaxy(galaxyKey, members),
    onLinkDrop: (from, to) => store.proposeLink(from, to),
    onDropStarOnTopic: (starKey, topicKey) => store.reparent(starKey, topicKey),
    onContext: ({ node, edge, galaxy, world, x, y }) => {
      const kind = edge ? 'edge' : node ? store.graph.value.byKey.get(node).kind : 'empty'
      // 球内不弹星系菜单：雾团本来就被藏起来了，避免对着星球内部误建到别的星系
      const g = !scopeTopic.value && galaxy ? store.graph.value.galaxies.find(x => x.key === galaxy) || null : null
      menuEl.value.open({
        kind,
        node: node ? store.graph.value.byKey.get(node) : null,
        edge: edge ? store.graph.value.edges.find(e => e.styleKey === edge) : null,
        galaxy: g,
        scope: scopeTopic.value ? { key: scopeTopic.value.key, title: scopeTopic.value.title } : null,
        world,
        x,
        y
      })
    }
  })
  store.attach(renderer)
  renderer.setDisplay(displayNow.value)
  window.addEventListener('keydown', onKey)
  await store.load()
  store.refreshUnanalyzed()
  store.loadWrongPool()
  if (import.meta.env.DEV) window.__starmap = { store, renderer, normalizeTitle }
}

onMounted(async () => {
  beginWarp()
  try {
    await initStarMap()
  } catch (e) {
    store.error.value = e?.message || '星图初始化失败'
  } finally {
    await afterPaint()
    finishWarp()
  }
})

onUnmounted(() => {
  cancelWarp()
  window.removeEventListener('keydown', onKey)
  renderer?.dispose()
  renderer = null
  delete window.__starmap
})
</script>

<style>
/* Vant 的 toast 挂在 body 上，scoped 样式管不到：提示不许吃掉画布上的点击 */
.van-toast.starmap-toast { pointer-events: none; top: 70px !important; }
</style>

<style scoped>
/* 全局粒子层是 fixed z-index:1，不给一层更高的层级会被它盖住点击 */
.starmap { position: fixed; inset: 0; z-index: 2; background: var(--bg-base); overflow: hidden; }
.stage { position: absolute; inset: 0; width: 100%; height: 100%; display: block; touch-action: none; cursor: grab; }
.stage.grabbing { cursor: grabbing; }
.stage.pickable { cursor: pointer; }
.stage.linking, .stage.linking.pickable { cursor: crosshair; }
.vignette {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 3;
  background: radial-gradient(ellipse at 42% 42%, transparent 40%, var(--scrim) 132%);
  opacity: 0.45;
}
:root[data-theme="light"] .vignette { opacity: 0.24; }
.sky-wash {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 2;
  opacity: 0;
  background-image:
    radial-gradient(ellipse at 38% 36%, var(--accent-soft), transparent 54%),
    radial-gradient(var(--grid-line) 1px, transparent 1px);
  background-size: auto, 28px 28px;
}
:root[data-theme="light"] .sky-wash { opacity: 0.75; }
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}
.labels { position: absolute; inset: 0; pointer-events: none; z-index: 10; }
.labels :deep(.star-label) {
  position: absolute;
  left: 0;
  top: 0;
  padding: 2px 8px;
  border-radius: var(--radius-pill);
  font-size: 11px;
  line-height: 1.5;
  white-space: nowrap;
  color: var(--text-secondary);
  background: var(--surface-bar);
  border: 1px solid var(--hairline);
  box-shadow: var(--elev-card);
  opacity: 0;
  transition: opacity var(--transition-fast);
}
.labels :deep(.star-label.show) { opacity: 1; }
.labels :deep(.star-label.topic) {
  display: inline-flex;
  align-items: baseline;
  gap: 7px;
  padding-left: 15px;
  font-family: var(--font-body);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--accent);
  border-color: var(--accent-border);
  background: var(--surface-bar);
}
.labels :deep(.star-label.topic .meta) {
  font-family: var(--font-body);
  font-size: 9px;
  font-weight: 400;
  letter-spacing: 0.02em;
  color: var(--text-muted);
}
.labels :deep(.star-label.topic::before) {
  content: '';
  position: absolute;
  left: 7px;
  top: 50%;
  width: 4px;
  height: 4px;
  margin-top: -2px;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 6px var(--accent);
}
.labels :deep(.star-label.pick) { color: var(--text-primary); border-color: var(--accent-border); }
.labels :deep(.galaxy-label) {
  position: absolute;
  left: 0;
  top: 0;
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--accent-border);
  background: var(--surface-bar);
  box-shadow: var(--elev-card);
  font-family: var(--font-display);
  font-size: 10px;
  letter-spacing: 0.14em;
  white-space: nowrap;
  color: var(--accent);
  opacity: 0;
  transition: opacity var(--transition-normal);
}
.labels :deep(.galaxy-label.show) { opacity: 1; }
.labels :deep(.stardust-label) {
  position: absolute;
  left: 0;
  top: 0;
  padding: 2px 8px;
  border: 1px dashed var(--hairline);
  border-radius: var(--radius-pill);
  font-size: 10px;
  letter-spacing: 0.08em;
  white-space: nowrap;
  color: var(--text-muted);
  background: var(--surface-bar);
  opacity: 0;
  transition: opacity var(--transition-fast);
}
.labels :deep(.stardust-label.show) { opacity: 0.85; }

.topbar {
  position: absolute;
  top: 0; left: 0; right: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  background: var(--surface-bar);
  border-bottom: 1px solid var(--nav-bar-border);
  box-shadow: var(--bar-shadow);
  backdrop-filter: blur(10px);
  z-index: 20;
  flex-wrap: wrap;
}
.brand { font-family: var(--font-display); font-size: 15px; font-weight: 700; letter-spacing: 2px; color: var(--accent); white-space: nowrap; }
.crumbs { display: flex; align-items: center; gap: 4px; font-size: 13px; min-width: 0; }
.crumb {
  padding: 4px 10px;
  border-radius: var(--radius-pill);
  border: 1px solid transparent;
  background: transparent;
  color: var(--text-secondary);
  font: inherit;
  cursor: pointer;
  white-space: nowrap;
}
.crumb:hover { color: var(--accent); border-color: var(--accent-border); }
.crumb.current { color: var(--accent); background: var(--accent-soft); cursor: default; }
.crumb-sep { color: var(--text-muted); }
.search { position: relative; margin-left: auto; }
.search-icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-52%);
  color: var(--text-muted);
  font-size: 17px;
  line-height: 1;
  pointer-events: none;
}
.search input {
  width: 210px;
  height: 34px;
  padding: 0 12px 0 30px;
  background: var(--bg-card);
  border: 1px solid var(--accent-border);
  border-radius: var(--radius-pill);
  color: var(--text-primary);
  font: inherit;
  font-size: 13px;
}
.search input::placeholder { color: var(--text-muted); }
.search input:focus { outline: none; border-color: var(--accent); box-shadow: var(--accent-glow); }
.results {
  position: absolute;
  top: 38px; left: 0; right: 0;
  max-height: 42vh;
  overflow: auto;
  margin: 0; padding: 4px;
  list-style: none;
  background: var(--surface-solid);
  border: 1px solid var(--accent-border);
  border-radius: var(--radius-button);
  box-shadow: var(--elev-card);
}
.results li { padding: 8px 10px; border-radius: var(--radius-sm); font-size: 13px; cursor: pointer; }
.results li:hover, .results li.on { background: var(--bg-hover); color: var(--accent); }
.results .from { color: var(--text-muted); font-size: 11px; margin-left: 6px; }
.tools { display: flex; gap: 6px; flex-wrap: wrap; }
.tool {
  height: 32px;
  padding: 0 12px;
  background: var(--bg-card);
  border: 1px solid var(--accent-border);
  border-radius: var(--radius-pill);
  color: var(--text-secondary);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.tool:hover { color: var(--accent); border-color: var(--accent); }
.tool[aria-pressed="true"] { color: var(--accent); border-color: var(--accent); background: var(--accent-soft); box-shadow: var(--accent-glow); }

.pill {
  position: absolute;
  left: 50%;
  bottom: 96px;
  transform: translateX(-50%);
  height: 38px;
  padding: 0 18px;
  border-radius: var(--radius-pill);
  background: var(--surface-bar);
  border: 1px solid var(--accent);
  color: var(--accent);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
  box-shadow: var(--accent-glow);
  backdrop-filter: blur(8px);
  z-index: 22;
}
.quick {
  position: absolute;
  left: 50%;
  bottom: 96px;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--surface-bar);
  border: 1px solid var(--accent-border);
  border-radius: var(--radius-card);
  box-shadow: var(--elev-card);
  z-index: 23;
}
.quick-cap { font-size: 12px; color: var(--text-secondary); white-space: nowrap; }
.quick .field { width: 180px; height: 30px; }
.quick-need { font-size: 11px; color: var(--danger); white-space: nowrap; }
.quick-colors { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
.quick-color {
  width: 18px;
  height: 18px;
  padding: 0;
  border: 1px solid var(--hairline);
  border-radius: 50%;
  cursor: pointer;
}
.quick-color.on { outline: 2px solid var(--text-primary); outline-offset: 2px; }
.galaxy-pick-mask {
  position: absolute;
  inset: 0;
  z-index: 46;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--scrim);
  backdrop-filter: blur(2px);
}
.galaxy-pick {
  display: flex;
  flex-direction: column;
  width: min(520px, 92vw);
  max-height: 72vh;
  padding: 16px;
  background: var(--surface-solid);
  border: 1px solid var(--accent-border);
  border-radius: var(--radius-card);
  box-shadow: var(--hud-shadow);
}
.gp-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.gp-head h3 { margin: 0; font-family: var(--font-display); font-size: 15px; color: var(--text-primary); }
.gp-tip { margin: 10px 0 8px; font-size: 11px; line-height: 1.5; color: var(--text-muted); }
.gp-list { flex: 1; min-height: 0; margin: 4px 0 0; padding: 0; overflow: auto; list-style: none; }
.gp-list li { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 9px 2px; border-top: 1px solid var(--hairline); }
.gp-main { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.gp-main b { font-size: 13px; font-weight: 500; color: var(--text-primary); }
.gp-main span { font-size: 11px; color: var(--text-muted); }
.gp-empty { justify-content: center; color: var(--text-muted); font-size: 12px; }
.btn.blocked { color: var(--warning); border-color: var(--warning); }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.btn {
  height: 30px;
  padding: 0 12px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--accent-border);
  background: var(--bg-card);
  color: var(--text-secondary);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.btn.primary { color: var(--accent-contrast); background: linear-gradient(135deg, var(--accent), var(--accent-deep)); border-color: transparent; }
.field {
  height: 30px;
  padding: 0 10px;
  background: var(--bg-elevated);
  border: 1px solid var(--accent-border);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  font: inherit;
  font-size: 12px;
}
.legend {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  bottom: 10px;
  display: flex;
  flex-wrap: wrap;
  gap: 10px 16px;
  padding: 8px 12px;
  background: var(--surface-bar);
  border: 1px solid var(--nav-bar-border);
  border-radius: var(--radius-card);
  box-shadow: var(--elev-card);
  font-size: 11px;
  color: var(--text-secondary);
  z-index: 20;
  max-width: min(760px, calc(100% - 24px));
}
.lg { display: inline-flex; align-items: center; gap: 6px; }
.lg.hint { color: var(--text-muted); }
.sw { display: inline-block; width: 26px; height: 0; border-top: 2px solid var(--accent); }
.sw-solid { border-top-width: 3px; }
.sw-solid-thin { border-top-color: rgb(var(--emerald-rgb) / 0.75); }
.sw-dashed { border-top-style: dashed; border-top-color: var(--secondary); }
.sw-galaxy {
  width: 9px;
  height: 9px;
  border: 1px solid var(--accent);
  border-radius: 50%;
  box-shadow: 0 0 8px var(--accent-soft);
}
.edge-tip {
  position: absolute;
  z-index: 19;
  width: min(288px, calc(100vw - 32px));
  padding: 9px 11px;
  background: var(--surface-solid);
  border: 1px solid var(--accent-border);
  border-radius: var(--radius-button);
  box-shadow: var(--hud-shadow);
  pointer-events: none;
  font-size: 11px;
  line-height: 1.6;
  color: var(--text-secondary);
}
.edge-tip-kind {
  font-family: var(--font-display);
  font-size: 9px;
  letter-spacing: 0.1em;
  color: var(--accent);
}
.edge-tip-title { margin-top: 2px; color: var(--text-primary); font-weight: 600; font-size: 12px; }
.edge-tip-why { margin: 5px 0 0; color: var(--text-secondary); }
.edge-tip-meta { margin: 5px 0 0; color: var(--emerald-text); }
.edge-tip-foot { margin-top: 6px; padding-top: 5px; border-top: 1px solid var(--hairline); color: var(--text-muted); font-size: 10px; }
.universe-hud {
  position: absolute;
  left: 14px;
  bottom: 14px;
  z-index: 16;
  pointer-events: none;
  min-width: 172px;
  max-width: 230px;
  padding: 9px 12px 8px;
  background: var(--surface-bar);
  border: 1px solid var(--hairline);
  border-radius: var(--radius-card);
  box-shadow: var(--elev-card);
  backdrop-filter: blur(10px);
  font-size: 10px;
  color: var(--text-muted);
}
.hud-kicker {
  margin-bottom: 5px;
  font-family: var(--font-display);
  font-size: 9px;
  letter-spacing: 0.18em;
  color: var(--accent);
}
.hud-counts { display: flex; flex-wrap: wrap; gap: 4px 11px; }
.hud-counts b {
  margin-right: 2px;
  font-family: var(--font-display);
  font-size: 11px;
  color: var(--text-primary);
}
.hud-line {
  margin-top: 5px;
  padding-top: 5px;
  border-top: 1px solid var(--hairline);
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.empty-universe {
  position: absolute;
  left: 50%;
  top: 46%;
  transform: translate(-50%, -50%);
  z-index: 15;
  width: min(340px, calc(100% - 40px));
  padding: 22px 24px;
  text-align: center;
  background: var(--surface-bar);
  border: 1px solid var(--accent-border);
  border-radius: var(--radius-card);
  box-shadow: var(--elev-card);
  backdrop-filter: blur(12px);
}
.empty-kicker {
  margin: 0 0 8px;
  font-family: var(--font-display);
  font-size: 9px;
  letter-spacing: 0.22em;
  color: var(--accent);
}
.empty-universe h2 {
  margin: 0 0 8px;
  font-family: var(--font-display);
  font-size: 20px;
  color: var(--text-primary);
}
.empty-universe p:not(.empty-kicker) {
  margin: 0 0 14px;
  font-size: 12px;
  line-height: 1.7;
  color: var(--text-secondary);
}
.mask {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  background: var(--bg-base);
  color: var(--text-secondary);
  font-size: 13px;
  z-index: 30;
}
@media (max-width: 900px) {
  .universe-hud { display: none; }
}
@media (max-width: 760px) {
  .topbar { padding: 8px 10px; gap: 6px; row-gap: 6px; }
  .brand { display: none; }
  .crumbs { order: 1; flex: 0 0 auto; }
  .search { order: 2; flex: 1 1 130px; margin-left: 0; }
  .search input { width: 100%; }
  .tools {
    order: 3;
    width: 100%;
    flex-wrap: nowrap;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .tools::-webkit-scrollbar { display: none; }
  .tool { flex: 0 0 auto; }
  .legend { display: none; }
  .pill { bottom: calc(46vh + 14px); }
  .quick { bottom: calc(46vh + 14px); flex-wrap: wrap; width: 92vw; }
}
</style>
