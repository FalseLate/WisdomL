<template>
  <button v-if="collapsed" class="starmap-panel-tab" type="button" aria-label="展开详情面板" @click="setCollapsed(false)">‹ 详情</button>
  <aside v-else class="panel starmap-panel" :class="{ empty: !hasTarget }" :style="{ width: width + 'px' }" aria-label="节点详情">
    <div class="sm-resize" role="separator" aria-orientation="vertical" aria-label="拖动调整面板宽度"
         :aria-valuenow="width" :aria-valuemin="MIN_W" :aria-valuemax="MAX_W" tabindex="0"
         @pointerdown="startResize" @keydown.left.prevent="nudge(16)" @keydown.right.prevent="nudge(-16)"></div>
    <button class="sm-collapse" type="button" title="收起面板" aria-label="收起面板" @click="setCollapsed(true)">›</button>
    <div class="sm-scroll">
    <div v-if="linkFrom" class="link-banner">
      连线中：起点「{{ nameOf(linkFrom) }}」，再点（或拖到）一颗星或一颗大球。
      <button class="btn small" type="button" @click="act('link-cancel')">取消</button>
    </div>

    <!-- 待确认的新连线：先填理由再落地 -->
    <template v-if="pendingLink">
      <h3>给这两颗星连线</h3>
      <p class="sub">{{ nameOf(pendingLink.a) }} ↔ {{ nameOf(pendingLink.b) }}</p>
      <select v-model="link.rel" class="field" aria-label="关系类型">
        <option v-for="r in REL_OPTIONS" :key="r.key" :value="r.key">{{ r.label }}</option>
      </select>
      <input v-model="link.reason" class="field" placeholder="为什么连？这条理由会一直显示在线上" aria-label="连线理由">
      <div class="btns">
        <button class="btn primary" type="button" @click="act('link-confirm', link)">连上</button>
        <button class="btn" type="button" @click="act('link-cancel')">取消</button>
      </div>
      <p class="sub mt">同一对星点可以各连一条反向关系（例如 1→2 先修、2→1 依赖），图上的两条线会自动分开。</p>
    </template>

    <!-- 选中一条线：所有线都能改样式、都能删 -->
    <template v-else-if="edge">
      <h3>这条连线</h3>
      <p class="sub">
        {{ TYPE_LABEL[edge.type] }}<br>
        {{ nameOf(edge.a) }} {{ edge.type === 'ai' ? '→' : '↔' }} {{ nameOf(edge.b) }}<br>
        来源：{{ edge.source }}
      </p>
      <p v-if="edge.type === 'ai'" class="edge-relation">
        关系主张：<b>{{ edge.rel || '关联' }}</b> · 方向 {{ nameOf(edge.a) }} → {{ nameOf(edge.b) }}
      </p>
      <p v-if="edge.type === 'cooc'" class="line-hint">错题证据：同一道错题同时考到这两个知识点，共现 {{ edge.weight }} 次。线越粗，一起错的次数越多；删掉后重算不会再冒出来。</p>
      <p v-else-if="edge.type === 'ai'" class="line-hint">学习关系主张：先修/依赖/关联，不是错题证据。虚线 + 箭头表示方向，颜色区分关系；可以改线型或删除。</p>
      <p v-else class="line-hint">归属关系：这个知识点属于这颗星球。删掉这条线只关掉线，不会把它踢出星球。</p>
      <div v-if="edge.reason" class="block">
        <div class="block-title">理由</div>
        <p class="why">{{ edge.reason }}</p>
        <p v-if="edge.conf != null" class="sub">置信度 {{ Math.round(edge.conf * 100) }}%</p>
      </div>
      <div class="block">
        <div class="block-title">线型</div>
        <div class="btns">
          <button v-for="s in LINE_STYLES" :key="s.key" class="btn" :class="{ on: style.lineStyle === s.key }" type="button"
                  @click="patch({ lineStyle: s.key }, true)">{{ s.label }}</button>
          <button class="btn" :class="{ on: style.arrow }" type="button" @click="patch({ arrow: !style.arrow }, true)">箭头</button>
        </div>
        <div v-if="edge.type !== 'hier'" class="block-title mt">光点方向</div>
        <div v-if="edge.type !== 'hier'" class="btns">
          <button class="btn" :class="{ on: (style.flowDir ?? 1) === 1 }" type="button" @click="patch({ flowDir: 1 }, true)">正向</button>
          <button class="btn" :class="{ on: style.flowDir === -1 }" type="button" @click="patch({ flowDir: -1 }, true)">反向</button>
          <button class="btn" :class="{ on: style.flowDir === 0 }" type="button" @click="patch({ flowDir: 0 }, true)">关闭光点</button>
        </div>
        <p v-if="edge.type !== 'hier'" class="sub mt">鼠标移到线上：光点停住并显示连线理由；点线看完整详情。</p>
        <div class="block-title mt">颜色</div>
        <Swatches :value="style.color" @pick="patch({ color: $event }, true)" />
        <div class="block-title mt">粗细</div>
        <input type="range" class="range" :min="WIDTH_RANGE.min" :max="WIDTH_RANGE.max" :step="WIDTH_RANGE.step"
               :value="style.width" aria-label="线的粗细"
               @input="preview({ width: Number($event.target.value) })"
               @change="patch({ width: Number($event.target.value) }, true)">
        <div class="block-title mt">透明度</div>
        <input type="range" class="range" :min="OPACITY_RANGE.min" :max="OPACITY_RANGE.max" :step="OPACITY_RANGE.step"
               :value="style.opacity ?? 1" aria-label="线的透明度"
               @input="preview({ opacity: Number($event.target.value) })"
               @change="patch({ opacity: Number($event.target.value) }, true)">
        <div class="btns">
          <button class="btn warn" type="button" @click="act('edge-delete', edge)">删除这条线</button>
          <button class="btn" type="button" @click="act('style-reset', edge.styleKey)">恢复默认</button>
          <button class="btn" type="button" @click="act('select', jumpTarget)">跳到另一端</button>
        </div>
      </div>
    </template>

    <!-- 大球 -->
    <template v-else-if="node && node.kind === 'topic'">
      <h3>{{ node.title }}</h3>
      <p class="sub">
        星球 · 我自己建的主题<br>
        {{ node.galaxyTitle ? `所属星系：${node.galaxyTitle}` : '还没有和同领域的主题成团' }} · {{ node.source }}<br>
        {{ node.pin ? '位置：你摆过（已固定）' : '位置：自动排布' }}
      </p>
      <Mastery :node="node" />
      <StarNote :node="node" @save="act('save-note', { key: node.key, note: $event })" />
      <div class="block">
        <div class="block-title">错因分布（汇总球内 {{ node.children.length }} 颗星点）</div>
        <ErrChips :err="node.err" />
      </div>
      <div class="block">
        <div class="block-title">所属星系</div>
        <template v-if="currentManualGalaxy">
          <p class="sub">已归入「{{ currentManualGalaxy.title }}」。一颗星球只能在一个手建星系里。</p>
          <button class="btn" type="button" @click="act('assign-galaxy', { key: node.key, galaxyId: null })">移出手建星系</button>
        </template>
        <template v-else>
          <select v-if="manualGalaxies.length" class="field" aria-label="归入手建星系" value="" @change="onAssignGalaxy">
            <option value="">不归入手建星系（自动成团 / 独立）</option>
            <option v-for="g in manualGalaxies" :key="g.id" :value="g.id">{{ g.title }}</option>
          </select>
          <p v-if="manualGalaxies.length" class="sub mt">
            当前{{ node.galaxyKey ? `自动成团「${node.galaxyTitle}」` : '是独立星球' }}；选一个手建星系会把它收进去。
          </p>
          <p v-else class="sub">还没有手建星系。右键宇宙空白处可以新建。</p>
        </template>
      </div>
      <div v-if="siblingTopics.length" class="block">
        <div class="block-title">同星系的星球</div>
        <div class="chips">
          <button v-for="s in siblingTopics" :key="s.key" class="chip act" type="button"
                  @click="act('select', s.key)">{{ s.title }}</button>
        </div>
      </div>
      <div class="block">
        <div class="block-title">球内知识点</div>
        <div class="chips">
          <button v-for="c in childNodes" :key="c.key" class="chip act" :class="'m-' + masteryClass(c.mastery)" type="button"
                  @click="act('select', c.key)">{{ c.title }}{{ c.hierLine ? '' : '（未连线）' }}</button>
          <span v-if="!childNodes.length" class="sub">还没有星点</span>
        </div>
      </div>
      <div class="block">
        <div class="block-title">这颗大球的颜色（骨架线一起换）</div>
        <Swatches :value="node.color" reset-label="用轮转默认色" @pick="act('node-color', { key: node.key, token: $event })" />
      </div>
      <StarLook :node="node"
                @preview="act('node-preview', { key: node.key, patch: $event })"
                @commit="act('node-commit', { key: node.key, patch: $event })"
                @reset="act('style-reset', node.styleKey)" />
      <CandidateList v-if="pointCandidates.length" :list="pointCandidates" :target="acceptTarget" :topics="topics"
                     @pick-target="targetTopic = $event"
                     @accept="act('candidate-accept', { id: $event, topicKey: acceptTarget })"
                     @reject="act('candidate-reject', $event)" />
      <div class="block">
        <div class="block-title">操作</div>
        <div class="btns">
          <button class="btn primary" type="button" @click="adding = true">＋加知识点</button>
          <button class="btn" type="button" @click="act('enter', node.key)">进入球内</button>
          <button class="btn" type="button" @click="act('link-start', node.key)">从这里连线</button>
          <button class="btn" type="button" @click="startRename">改名</button>
          <button v-if="node.pin" class="btn" type="button" @click="act('unpin', node.key)">取消固定位置</button>
          <button class="btn warn" type="button" @click="act('remove', node.key)">删除主题</button>
        </div>
        <RenameForm v-if="adding" placeholder="知识点名字，回车即加进本主题" @done="commitAddPoint" @cancel="adding = false" />
        <RenameForm v-if="renaming" :value="node.title" @done="commitRename" @cancel="renaming = false" />
      </div>
    </template>

    <!-- 小球 -->
    <template v-else-if="node">
      <h3>{{ node.title }}</h3>
      <p class="sub">小球 · 知识点<br>所属大球：{{ node.topicKey ? nameOf(node.topicKey) : '游离星尘（还没归到任何星球）' }}<br>来源：{{ node.origin }}</p>
      <Mastery :node="node" />
      <StarNote :node="node" @save="act('save-note', { key: node.key, note: $event })" />
      <div class="block">
        <div class="block-title">错因分布</div>
        <ErrChips :err="node.err" />
      </div>
      <div class="block">
        <div class="block-title">挂在哪道错题上 · 共现线和掌握度都看这个</div>
        <p class="sub">挂错题 = 给这个知识点提供证据：掌握度、错因统计、和别的知识点的共现线都从这些题现算。它不会凭空生成知识点，也不会把整道题塞进星图。</p>
        <div v-if="node.wrongList.length" class="wq">
          <div v-for="w in node.wrongList.slice(0, 6)" :key="w.id" class="wq-item">
            {{ w.q }}
            <div class="meta">
              {{ (w.et || []).map(e => ERROR_LABEL[e] || e).join(' / ') || '未标注' }}{{ w.kps > 1 ? ` · 本题同时涉及 ${w.kps} 个知识点` : '' }}
              <button class="linklike" type="button" @click="act('ref-detach', { key: node.key, wrongQuestionId: w.id })">解绑</button>
            </div>
          </div>
        </div>
        <p v-else class="sub">还没挂过错题。挂上之后，同一道题里的知识点会自动连出共现线——不用等 AI。</p>
        <div class="row mt">
          <button class="btn primary" type="button" :disabled="!attachable.length && !attachableToday.length" @click="wrongPicker = true">
            {{ attachable.length || attachableToday.length ? '选择错题挂上' : '没有可挂的错题' }}
          </button>
          <span v-if="selectedWrong" class="sub wq-picked">{{ selectedWrong.txt }}</span>
        </div>
        <div v-if="node.wrongList.length" class="btns">
          <button class="btn" type="button" @click="act('go-wrong-questions')">去错题本复习</button>
        </div>
      </div>
      <div class="block">
        <div class="block-title">与它相连的线</div>
        <div v-for="row in linkRows" :key="row.key" class="link-item" :class="row.cls">
          <div class="kind">{{ row.kind }}</div>
          <button class="chip act" type="button" @click="act('select', row.key)">{{ row.title }}</button>
          <div class="why">{{ row.sub }}</div>
        </div>
        <p v-if="!linkRows.length" class="sub">这颗星还没连过线</p>
      </div>
      <div class="block">
        <div class="block-title">这颗星的颜色</div>
        <Swatches :value="node.color" reset-label="跟随掌握度" @pick="act('node-color', { key: node.key, token: $event })" />
      </div>
      <StarLook :node="node"
                @preview="act('node-preview', { key: node.key, patch: $event })"
                @commit="act('node-commit', { key: node.key, patch: $event })"
                @reset="act('style-reset', node.styleKey)" />
      <div class="block">
        <div class="block-title">归到哪颗大球</div>
        <select class="field" :value="node.topicKey || ''" aria-label="归属主题" @change="act('reparent', { key: node.key, topicKey: $event.target.value || null })">
          <option value="">不归到任何主题</option>
          <option v-for="t in topics" :key="t.key" :value="t.key">{{ t.title }}</option>
        </select>
        <p v-if="node.topicKey" class="sub mt">
          归属与连线是两件事：现在{{ node.hierLine ? '画着' : '没画' }}那条归属线
          <button class="linklike" type="button" @click="act('hier-line', { key: node.key, on: !node.hierLine })">{{ node.hierLine ? '删掉这条线' : '把线画回来' }}</button>
        </p>
      </div>
      <div class="block">
        <div class="block-title">操作</div>
        <div class="btns">
          <button class="btn" type="button" @click="act('link-start', node.key)">从这里连线</button>
          <button class="btn" type="button" @click="act('merge', { key: node.key, on: !node.merged })">{{ node.merged ? '拆分散开' : '合并进大球' }}</button>
          <button v-if="node.pin" class="btn" type="button" @click="act('unpin', node.key)">取消固定位置</button>
          <button class="btn" type="button" @click="startRename">改名</button>
          <button class="btn warn" type="button" @click="act('remove', node.key)">删除这颗星</button>
        </div>
        <RenameForm v-if="renaming" :value="node.title" @done="commitRename" @cancel="renaming = false" />
      </div>
    </template>

    <!-- 什么都没选：入口与提醒都在这 -->
    <template v-else>
      <h3>我的知识星图</h3>
      <p class="sub">这是你自己的知识地图：先建星球，再把知识点写进去。点节点看详情，按住拖动摆位置，双击星球进入内部；右键出菜单。</p>
      <div class="block">
        <div class="block-title">新建主题（大球）</div>
        <div class="btns"><button class="btn primary" type="button" @click="creating = true">＋新建主题</button></div>
        <RenameForm v-if="creating" placeholder="主题名字" @done="commitTopic" @cancel="creating = false" />
      </div>
      <div class="block">
        <div class="block-title">新建知识点 · 自己描述</div>
        <select v-if="topics.length" v-model="newPointTopic" class="field" aria-label="新知识点归属星球">
          <option v-for="t in topics" :key="t.key" :value="t.key">{{ t.title }}</option>
        </select>
        <p v-if="!topics.length" class="sub">先建一颗星球，知识点才有地方放。</p>
        <input v-model="newPointTitle" class="field mt" maxlength="120" placeholder="知识点名字" aria-label="新知识点名字">
        <textarea v-model="newPointNote" class="note-input mt" maxlength="1000"
                  placeholder="一句话描述（可选）：它是什么、什么时候用、易错点在哪"
                  aria-label="新知识点描述"></textarea>
        <div class="btns">
          <button class="btn primary" type="button" :disabled="!topics.length || !newPointTitle.trim()" @click="submitNewPoint">加入星图</button>
        </div>
      </div>
      <div class="block">
        <div class="block-title">让 AI 从错题反推知识点</div>
        <div class="btns">
          <button class="btn primary" type="button" :disabled="analyzing || !unanalyzedQuestions.length" @click="aiPicker = true">自己选错题反推</button>
          <button class="btn" type="button" :disabled="analyzing || !unanalyzed" @click="act('ai-analyze')">{{ analyzing ? '反推中…' : '自动取下一批 15 题' }}</button>
        </div>
        <p class="sub mt">{{ unanalyzed ? `有 ${unanalyzed} 道错题还没反推过。` : '错题都反推过了。' }}自己选最多 15 道；AI 只出候选，你确认才进图。</p>
      </div>
      <CandidateList v-if="pointCandidates.length" :list="pointCandidates" :target="acceptTarget" :topics="topics"
                     @pick-target="targetTopic = $event"
                     @accept="act('candidate-accept', { id: $event, topicKey: acceptTarget })"
                     @reject="act('candidate-reject', $event)" />
      <div class="block">
        <div class="block-title">三种线分别是什么意思</div>
        <div class="mini-legend">
          <span><i class="sw sw-solid"></i>层级线 · 归属：这个知识点为什么在这颗星球</span>
          <span><i class="sw sw-solid-thin"></i>错题共现线 · 证据：同一道错题一起错，粗细=次数</span>
          <span><i class="sw sw-dashed"></i>学习关系线 · 主张：先修/依赖/关联，箭头=方向</span>
        </div>
        <p class="sub mt">共现线是系统从错题现算的；学习关系线是你或 AI 的主张，AI 只出候选，确认才画。</p>
      </div>
      <div v-if="hiddenEdges.length || vetoes.length" class="block">
        <div class="block-title">被我删掉或收起的线（{{ hiddenEdges.length + vetoes.length }}）</div>
        <div v-for="v in vetoes" :key="'v' + v.kind + v.aKey + v.bKey" class="link-item">
          <div class="kind">{{ TYPE_LABEL[v.kind] || v.kind }}</div>
          <div>{{ v.aTitle }} ↔ {{ v.bTitle }}</div>
          <div class="btns"><button class="btn" type="button" @click="act('veto-undo', v)">恢复</button></div>
        </div>
        <div v-for="h in hiddenEdges" :key="h.styleKey" class="link-item">
          <div class="kind">{{ TYPE_LABEL[h.type] }}</div>
          <div>{{ nameOf(h.a) }} ↔ {{ nameOf(h.b) }}</div>
          <div class="btns"><button class="btn" type="button" @click="act('style-reset', h.styleKey)">恢复显示</button></div>
        </div>
      </div>
    </template>
    </div>
  </aside>

  <StarQuestionPicker v-if="wrongPicker"
    title="选一道错题挂到知识点"
    hint="挂错题是给知识点提供证据：掌握度、错因和共现线都会从这道题现算。可以切到“今日复习”只看今天到期的题。"
    :questions="attachable" :today-questions="attachableToday" :show-today="true" :multiple="false" :max="1"
    confirm-label="挂上" @close="wrongPicker = false" @confirm="onPickWrong" />

  <StarQuestionPicker v-if="aiPicker"
    title="选择要反推的错题"
    hint="最多 15 道；AI 会逐题提炼 2～5 个候选知识点，候选不会自动进图，确认后才算。"
    :questions="aiQuestions" :today-questions="[]" :show-today="false" :multiple="true" :max="15"
    confirm-label="开始反推" @close="aiPicker = false" @confirm="onPickAi" />
</template>

<script setup>
import { computed, ref, watch, h, onMounted } from 'vue'
import { PALETTE, LINE_STYLES, WIDTH_RANGE, OPACITY_RANGE, REL_OPTIONS, resolveStyle } from '../../starmap/style-lang.js'
import StarLook from './StarLook.vue'
import StarNote from './StarNote.vue'
import StarQuestionPicker from './StarQuestionPicker.vue'

const props = defineProps({
  graph: { type: Object, required: true },
  node: { type: Object, default: null },
  edge: { type: Object, default: null },
  pendingLink: { type: Object, default: null },
  linkFrom: { type: String, default: null },
  topics: { type: Array, default: () => [] },
  scope: { type: String, default: null },
  unanalyzed: { type: Number, default: 0 },
  analyzing: { type: Boolean, default: false },
  unanalyzedQuestions: { type: Array, default: () => [] },
  pointCandidates: { type: Array, default: () => [] },
  vetoes: { type: Array, default: () => [] },
  wrongPool: { type: Array, default: () => [] },
  wrongToday: { type: Array, default: () => [] },
  defaultTopicKey: { type: String, default: null }
})
const emit = defineEmits(['action', 'resize'])

/** 面板宽度：左缘拖拽，范围参考常见 inspector（可点区域 ≥27px，见样式） */
const MIN_W = 300
const MAX_W = 640
const clampW = w => Math.min(MAX_W, Math.max(MIN_W, Math.round(w)))
const width = ref(clampW(Number(localStorage.getItem('starmap.panelW')) || 340))
const collapsed = ref(localStorage.getItem('starmap.panelCollapsed') === '1')
const report = () => emit('resize', collapsed.value ? 0 : width.value)

function startResize(ev) {
  ev.preventDefault()
  const x0 = ev.clientX
  const w0 = width.value
  const move = e => { width.value = clampW(w0 + (x0 - e.clientX)); report() }
  const up = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    document.body.style.cursor = ''
    localStorage.setItem('starmap.panelW', String(width.value))
  }
  document.body.style.cursor = 'col-resize'
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}
function nudge(d) {
  width.value = clampW(width.value + d)
  localStorage.setItem('starmap.panelW', String(width.value))
  report()
}
function setCollapsed(on) {
  collapsed.value = on
  localStorage.setItem('starmap.panelCollapsed', on ? '1' : '0')
  report()
}
onMounted(report)
// 选中了东西但面板收着：自动展开，否则用户点了星却什么都看不到
watch(() => !!(props.node || props.edge || props.pendingLink), has => { if (has && collapsed.value) setCollapsed(false) })

const ERROR_LABEL = { audit: '审题性', knowledge: '知识性', math: '数学性', strategy: '策略性', habit: '习惯性' }
const TYPE_LABEL = { hier: '层级线 · 归属', cooc: '错题共现线 · 证据', ai: '学习关系线 · 主张' }

const act = (type, payload) => emit('action', { type, payload })
const nameOf = key => props.graph.byKey.get(key)?.title || '?'
const hasTarget = computed(() => !!(props.node || props.edge || props.pendingLink))
const hiddenEdges = computed(() => props.graph.hiddenEdges || [])
const masteryClass = m => (m == null ? 'none' : m >= 0.75 ? 'good' : m >= 0.45 ? 'warn' : 'bad')

const childNodes = computed(() => (props.node?.children || []).map(k => props.graph.byKey.get(k)).filter(Boolean))
const manualGalaxies = computed(() => (props.graph.galaxies || []).filter(g => g.manual))
const currentManualGalaxy = computed(() => manualGalaxies.value.find(g => g.id === props.node?.galaxyId) || null)
function onAssignGalaxy(ev) {
  const id = ev.target.value
  ev.target.value = ''
  if (id) act('assign-galaxy', { key: props.node.key, galaxyId: Number(id) })
}
const siblingTopics = computed(() => {
  if (!props.node?.galaxyKey) return []
  return props.graph.topics.filter(t => t.galaxyKey === props.node.galaxyKey && t.key !== props.node.key)
})
const style = computed(() => (props.edge
  ? {
      lineStyle: props.edge.lineStyle,
      color: props.edge.color,
      width: props.edge.width ?? 1,
      opacity: props.edge.opacity,
      arrow: !!props.edge.arrow,
      flowDir: props.edge.flowDir ?? 1
    }
  : resolveStyle('ai')))
const jumpTarget = computed(() => {
  if (!props.edge) return null
  const inScope = key => {
    if (!props.scope) return false
    const node = props.graph.byKey.get(key)
    if (!node) return false
    return key === props.scope || node.topicKey === props.scope
  }
  if (inScope(props.edge.a) && !inScope(props.edge.b)) return props.edge.b
  if (inScope(props.edge.b) && !inScope(props.edge.a)) return props.edge.a
  return props.edge.b
})
const linkRows = computed(() => (props.node ? (props.graph.adj.get(props.node.key) || []).map(nb => {
  const other = props.graph.byKey.get(nb.key)
  if (!other) return null
  const e = props.graph.edges.find(x => x.a === props.node.key && x.b === nb.key || x.b === props.node.key && x.a === nb.key)
  return {
    key: nb.key,
    title: other.title,
    cls: nb.type,
    kind: TYPE_LABEL[nb.type] + (nb.type === 'ai' && e?.rel ? ` · ${e.rel}` : ''),
    sub: nb.type === 'hier' ? '归属关系（可删可改）'
      : nb.type === 'cooc' ? `共现 ${e?.weight || 1} 次 · 来自错题记录`
        : (e?.reason || '') + (e?.conf != null ? ` · 置信度 ${Math.round(e.conf * 100)}%` : '')
  }
}).filter(Boolean) : []))

const renaming = ref(false)
const creating = ref(false)
const adding = ref(false)
const newPointTopic = ref('')
const newPointTitle = ref('')
const newPointNote = ref('')
watch(() => props.topics, list => {
  if (!list?.length) { newPointTopic.value = ''; return }
  if (!list.some(t => t.key === newPointTopic.value)) newPointTopic.value = list[0].key
}, { immediate: true })
function submitNewPoint() {
  const title = newPointTitle.value.trim()
  if (!newPointTopic.value || !title) return
  act('create-point', { topicKey: newPointTopic.value, title, note: newPointNote.value.trim() })
  newPointTitle.value = ''
  newPointNote.value = ''
}
const link = ref({ rel: '关联', reason: '' })
watch(() => props.pendingLink, v => { if (v) link.value = { rel: '关联', reason: '' } })

/** AI 候选收进哪颗大球：没手选就用当前所在/选中的那颗，再没有就用第一颗 */
const targetTopic = ref(null)
const acceptTarget = computed(() => {
  const wanted = targetTopic.value || props.defaultTopicKey || null
  return wanted && props.topics.some(t => t.key === wanted) ? wanted : null
})
// 换选中节点时清掉上一轮手动选的收件星球，避免候选被带到不相干的球里
watch(() => props.node?.key, () => { targetTopic.value = null })

/** 手动挂错题：已经挂过的不再出现在下拉里 */
const pickQ = ref(null)
const wrongPicker = ref(false)
const aiPicker = ref(false)
const attachable = computed(() => {
  const taken = new Set((props.node?.wrongList || []).map(w => w.id))
  return props.wrongPool.filter(w => !taken.has(w.id))
})
const attachableToday = computed(() => {
  const taken = new Set((props.node?.wrongList || []).map(w => w.id))
  return props.wrongToday.filter(w => !taken.has(w.id))
})
const selectedWrong = computed(() => props.wrongPool.find(w => w.id === pickQ.value) || null)
const aiQuestions = computed(() => (props.unanalyzedQuestions || []).map(q => ({
  id: q.id,
  txt: q.txt,
  meta: [q.type === 'subjective' ? '主观题' : q.type === 'judge' ? '判断题' : '选择题', q.errorTypes].filter(Boolean).join(' · ')
})))
function onPickWrong(ids) {
  pickQ.value = ids[0] || null
  wrongPicker.value = false
  if (pickQ.value) attachQuestion()
}
function onPickAi(ids) {
  aiPicker.value = false
  if (ids.length) act('ai-analyze-selected', ids)
}
function attachQuestion() {
  if (!pickQ.value || !props.node) return
  act('ref-attach', { key: props.node.key, wrongQuestionId: pickQ.value })
  pickQ.value = null
}

function commitAddPoint(title) {
  if (title) act('create-point', { topicKey: props.node.key, title })
  adding.value = false
}
function startRename() { renaming.value = true }
function commitRename(title) {
  if (title) act('rename', { key: props.node.key, title })
  renaming.value = false
}
function commitTopic(title) {
  if (title) act('create-topic', title)
  creating.value = false
}
/** 拖动只预览（不写库、不重渲染），松手或点击才提交 */
function preview(patch) { if (props.edge) act('edge-preview', { key: props.edge.styleKey, patch }) }
function patch(patch, commit) {
  if (!props.edge) return
  if (commit) act('edge-commit', { key: props.edge.styleKey, style: patch })
  else preview(patch)
}

// 小组件用渲染函数就近定义，避免为三行模板各开一个文件
const Swatches = {
  props: { value: { type: String, default: null }, resetLabel: { type: String, default: '' } },
  emits: ['pick'],
  setup(p, { emit: e }) {
    return () => h('div', { class: 'swatches' }, [
      ...PALETTE.map(s => h('button', {
        class: ['swatch', p.value === s.token ? 'on' : ''], style: { background: `var(${s.token})` },
        type: 'button', title: s.name, 'aria-label': s.name, onClick: () => e('pick', s.token)
      })),
      p.resetLabel ? h('button', {
        class: 'swatch reset', type: 'button', onClick: () => e('pick', null)
      }, p.resetLabel) : null
    ])
  }
}
/** AI 反推的候选：收进哪颗大球由用户点定，不收就永远不进图 */
const CandidateList = {
  props: {
    list: { type: Array, default: () => [] },
    target: { type: String, default: null },
    topics: { type: Array, default: () => [] }
  },
  emits: ['pick-target', 'accept', 'reject'],
  setup(p, { emit: e }) {
    return () => h('div', { class: 'block' }, [
      h('div', { class: 'block-title' }, `AI 反推的知识点候选（${p.list.length}）· 还没进图`),
      h('p', { class: 'sub' }, '这些是已经反推过、还没确认进图的候选；AI 不负责分星球，选中目标后才画归属线。'),
      p.topics.length
        ? h('select', {
            class: 'field', value: p.target || '', 'aria-label': '收进哪颗大球',
            onChange: ev => e('pick-target', ev.target.value || null)
          }, [
            h('option', { value: '' }, '未归类（先收进星图，之后可改）'),
            ...p.topics.map(t => h('option', { value: t.key, selected: t.key === p.target }, `收进「${t.title}」`))
          ])
        : h('p', { class: 'sub' }, '还没有大球：先建一个主题，收进来的知识点才连得上归属线。'),
      ...p.list.map(c => h('div', { class: 'link-item ai' }, [
        h('div', { class: 'kind' }, c.title),
        h('div', { class: 'why' }, c.reason || 'AI 没给理由'),
        h('div', { class: 'sub' }, `模型自评置信度 ${Math.round((c.conf ?? 0) * 100)}%（未校准，不是准确率）· 依据这道错题：${c.qText || '（题干没记录）'}`),
        h('div', { class: 'btns' }, [
          h('button', { class: 'btn primary', type: 'button', onClick: () => e('accept', c.id) }, p.target ? '收进这颗球' : '收进星图（未归类）'),
          h('button', { class: 'btn', type: 'button', onClick: () => e('reject', c.id) }, '忽略')
        ])
      ]))
    ])
  }
}
const Mastery = {
  props: { node: { type: Object, required: true } },
  setup(p) {
    return () => {
      const m = p.node.mastery
      const cls = m == null ? 'none' : m >= 0.75 ? 'good' : m >= 0.45 ? 'warn' : 'bad'
      return h('div', { class: 'mastery' }, [
        h('div', { class: 'row' }, [
          h('div', { class: 'gauge' }, [h('i', { class: `bg-${cls}`, style: { width: `${m == null ? 0 : Math.round(m * 100)}%` } })]),
          h('span', { class: `num m-${cls}` }, m == null ? '—' : `${Math.round(m * 100)}%`)
        ]),
        h('div', { class: 'sub' }, `${p.node.total} 题 / 错 ${p.node.wrong} 题${p.node.total ? '' : ' · 还没有做题记录'}`)
      ])
    }
  }
}
const ErrChips = {
  props: { err: { type: Object, default: () => ({}) } },
  setup(p) {
    return () => {
      const list = Object.keys(ERROR_LABEL).map(code => ({ code, n: p.err[code] || 0 })).filter(x => x.n > 0).sort((a, b) => b.n - a.n)
      if (!list.length) return h('div', { class: 'sub' }, '暂无错因标注')
      return h('div', { class: 'chips' }, list.map(x => h('span', { class: 'chip on' }, `${ERROR_LABEL[x.code]} × ${x.n}`)))
    }
  }
}
const RenameForm = {
  props: { value: { type: String, default: '' }, placeholder: { type: String, default: '新名字' } },
  emits: ['done', 'cancel'],
  setup(p, { emit: e }) {
    const text = ref(p.value || '')
    watch(() => p.value, v => { text.value = v || '' })
    return () => h('form', {
      class: 'row mt', onSubmit: ev => { ev.preventDefault(); e('done', text.value.trim()) }
    }, [
      h('input', { class: 'field', value: text.value, placeholder: p.placeholder, 'aria-label': p.placeholder, onInput: ev => { text.value = ev.target.value } }),
      h('button', { class: 'btn primary', type: 'submit' }, '保存'),
      h('button', { class: 'btn', type: 'button', onClick: () => e('cancel') }, '取消')
    ])
  }
}
</script>

<style>
/* 面板里的色块、进度条、表单都是渲染函数写的子组件，拿不到 scoped 的 data-v 属性，
   所以整块用非 scoped 写，并统一挂 .starmap-panel 前缀避免漏到别的页面 */
.starmap-panel {
  position: absolute;
  top: 62px;
  right: 12px;
  width: 340px;
  max-height: calc(100% - 150px);
  display: flex;
  flex-direction: column;
  background: var(--surface-bar);
  border: 1px solid var(--nav-bar-border);
  border-radius: var(--radius-card);
  box-shadow: var(--elev-card);
  backdrop-filter: blur(12px);
  z-index: 18;
  font-size: 13px;
  /* 原生下拉框的弹出列表跟着系统配色走：不声明就是白底浅字，深色下看不清 */
  color-scheme: dark;
}
:root[data-theme="light"] .starmap-panel { color-scheme: light; }
.starmap-panel .sm-scroll { flex: 1; min-height: 0; overflow: auto; padding: 14px 16px 14px 18px; }
.starmap-panel select.field { cursor: pointer; }
.starmap-panel select.field option { background-color: var(--surface-solid); color: var(--text-primary); }
.starmap-panel select.field option:disabled { color: var(--text-muted); }
/* 左缘拖拽手柄：看得见的只有 3px，能抓的有 14px */
.starmap-panel .sm-resize {
  position: absolute;
  left: -7px;
  top: 0;
  bottom: 0;
  width: 14px;
  cursor: col-resize;
  z-index: 3;
  touch-action: none;
}
.starmap-panel .sm-resize::after {
  content: '';
  position: absolute;
  left: 5px;
  top: 50%;
  width: 3px;
  height: 44px;
  margin-top: -22px;
  border-radius: var(--radius-pill);
  background: var(--accent-border);
  transition: background var(--transition-fast);
}
.starmap-panel .sm-resize:hover::after, .starmap-panel .sm-resize:focus-visible::after { background: var(--accent); }
.starmap-panel .sm-collapse {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: 1px solid var(--accent-border);
  background: var(--bg-card);
  color: var(--text-secondary);
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  z-index: 3;
}
.starmap-panel .sm-collapse:hover { color: var(--accent); border-color: var(--accent); }
.starmap-panel h3 { padding-right: 30px; }
.starmap-panel-tab {
  position: absolute;
  top: 74px;
  right: 0;
  height: 36px;
  padding: 0 12px 0 14px;
  border-radius: var(--radius-pill) 0 0 var(--radius-pill);
  border: 1px solid var(--accent-border);
  border-right: 0;
  background: var(--surface-bar);
  color: var(--accent);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  z-index: 18;
  backdrop-filter: blur(10px);
}
.starmap-panel h3 { margin: 0 0 4px; font-size: 15px; font-family: var(--font-display); color: var(--text-primary); }
.starmap-panel .sub { color: var(--text-muted); font-size: 11px; margin: 0 0 8px; line-height: 1.6; }
.starmap-panel .block { margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--hairline); }
.starmap-panel .block-title { font-size: 11px; letter-spacing: 1px; color: var(--text-secondary); margin-bottom: 8px; }
.starmap-panel .mt { margin-top: 8px; }
.starmap-panel .row { display: flex; align-items: center; gap: 8px; }
.starmap-panel .row > .btn { flex: 0 0 auto; white-space: nowrap; }
.starmap-panel .gauge { flex: 1; height: 8px; border-radius: var(--radius-pill); background: var(--bg-hover); overflow: hidden; }
.starmap-panel .gauge i { display: block; height: 100%; border-radius: var(--radius-pill); }
.starmap-panel .num { font-family: var(--font-display); font-weight: 700; }
.starmap-panel .m-good { color: var(--success); }
.starmap-panel .m-warn { color: var(--warning); }
.starmap-panel .m-bad { color: var(--danger); }
.starmap-panel .m-none { color: var(--text-muted); }
.starmap-panel .bg-good { background: var(--success); }
.starmap-panel .bg-warn { background: var(--warning); }
.starmap-panel .bg-bad { background: var(--danger); }
.starmap-panel .bg-none { background: var(--text-muted); }
.starmap-panel .chips { display: flex; flex-wrap: wrap; gap: 6px; }
.starmap-panel .chip {
  padding: 3px 9px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--accent-border);
  background: var(--bg-card);
  color: var(--text-secondary);
  font-size: 11px;
  font-family: inherit;
}
.starmap-panel .chip.on { color: var(--danger); border-color: var(--danger); background: var(--danger-soft); }
.starmap-panel button.chip.act { cursor: pointer; }
.starmap-panel button.chip.act:hover { color: var(--accent); border-color: var(--accent); }
.starmap-panel .wq { display: flex; flex-direction: column; gap: 6px; max-height: 150px; overflow: auto; }
.starmap-panel .wq-item {
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  background: var(--bg-elevated);
  border: 1px solid var(--hairline);
  font-size: 12px;
  color: var(--text-secondary);
}
.starmap-panel .wq-item .meta { font-size: 11px; color: var(--text-muted); margin-top: 3px; }
.starmap-panel .link-item { padding: 8px 10px; border-radius: var(--radius-sm); background: var(--bg-elevated); border: 1px solid var(--hairline); font-size: 12px; margin-bottom: 6px; }
.starmap-panel .link-item .kind { font-size: 10px; letter-spacing: 1px; color: var(--text-secondary); margin-bottom: 4px; }
.starmap-panel .link-item.hier .kind { color: var(--accent); }
.starmap-panel .link-item.cooc .kind { color: var(--emerald-text); }
.starmap-panel .link-item.ai .kind { color: var(--secondary); }
.starmap-panel .link-item .why { color: var(--text-secondary); margin-top: 3px; line-height: 1.6; }
.starmap-panel .btns { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.starmap-panel .btn {
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
.starmap-panel .btn:hover { color: var(--accent); border-color: var(--accent); }
.starmap-panel .btn.on { color: var(--accent); border-color: var(--accent); background: var(--accent-soft); }
.starmap-panel .btn.primary { color: var(--accent-contrast); background: linear-gradient(135deg, var(--accent), var(--accent-deep)); border-color: transparent; box-shadow: var(--btn-primary-shadow); }
.starmap-panel .btn.warn { color: var(--danger); border-color: var(--danger-border); }
.starmap-panel .btn.small { height: 22px; padding: 0 8px; margin-left: 6px; }
.starmap-panel .btn[disabled] { color: var(--text-muted); border-color: var(--hairline); background: transparent; cursor: default; }
.starmap-panel .field {
  width: 100%;
  height: 30px;
  padding: 0 10px;
  background: var(--bg-elevated);
  border: 1px solid var(--accent-border);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  font: inherit;
  font-size: 12px;
}
.starmap-panel .field:focus { outline: none; border-color: var(--accent); }
.starmap-panel .note-input {
  width: 100%;
  min-height: 72px;
  padding: 8px 10px;
  resize: vertical;
  background: var(--bg-elevated);
  border: 1px solid var(--accent-border);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  font: inherit;
  font-size: 12px;
  line-height: 1.65;
}
.starmap-panel .note-input:focus { outline: none; border-color: var(--accent); }
.starmap-panel .note-input::placeholder { color: var(--text-muted); }
.starmap-panel .note-foot { display: flex; align-items: center; justify-content: space-between; margin-top: 6px; color: var(--text-muted); font-size: 10px; }
.starmap-panel .line-hint {
  margin: 0 0 8px;
  padding: 7px 9px;
  border-left: 2px solid var(--accent-border);
  background: var(--bg-elevated);
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  font-size: 11px;
  line-height: 1.7;
}
.starmap-panel .edge-relation {
  margin: 0 0 8px;
  padding: 7px 9px;
  border: 1px solid var(--accent-border);
  background: var(--accent-soft);
  border-radius: var(--radius-sm);
  color: var(--accent);
  font-size: 11px;
  line-height: 1.7;
}
.starmap-panel .edge-relation b { color: var(--text-primary); font-weight: 600; }
.starmap-panel .range { width: 100%; accent-color: var(--accent); }
.starmap-panel .swatches { display: flex; flex-wrap: wrap; gap: 6px; }
.starmap-panel .swatch {
  width: 22px;
  height: 22px;
  padding: 0;
  border-radius: 50%;
  border: 1px solid var(--hairline);
  cursor: pointer;
}
.starmap-panel .swatch:hover { transform: scale(1.12); }
.starmap-panel .swatch.on { box-shadow: var(--ring-cycle); border-color: var(--accent); }
.starmap-panel .swatch.reset {
  width: auto;
  height: 22px;
  border-radius: var(--radius-pill);
  padding: 0 10px;
  background: var(--bg-card);
  color: var(--text-secondary);
  font-size: 11px;
}
.starmap-panel .link-banner {
  margin-bottom: 10px;
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  background: var(--accent-soft);
  border: 1px solid var(--accent-border);
  color: var(--accent);
  font-size: 12px;
}
.starmap-panel .linklike { border: 0; background: none; color: var(--accent); font: inherit; font-size: 11px; cursor: pointer; padding: 0; text-decoration: underline; }
.starmap-panel .mini-legend { display: flex; flex-direction: column; gap: 8px; font-size: 11px; color: var(--text-secondary); }
.starmap-panel .mini-legend span { display: inline-flex; align-items: center; gap: 8px; }
.starmap-panel .sw { display: inline-block; width: 26px; height: 0; border-top: 2px solid var(--accent); }
.starmap-panel .sw-solid { border-top-width: 3px; }
.starmap-panel .sw-solid-thin { border-top-color: rgb(var(--emerald-rgb) / 0.75); }
.starmap-panel .sw-dashed { border-top-style: dashed; border-top-color: var(--secondary); }

@media (max-width: 760px) {
  .starmap-panel {
    top: auto;
    left: 8px;
    right: 8px;
    bottom: 8px;
    width: auto !important;
    max-height: 46vh;
  }
  .starmap-panel .sm-resize { display: none; }
}
</style>
