<template>
  <div v-if="visible" ref="rootEl" class="menu" role="menu" :style="{ left: x + 'px', top: y + 'px' }" @contextmenu.prevent>
    <template v-if="kind === 'empty'">
      <template v-if="scope">
        <div class="cap">在「{{ scope.title }}」里</div>
        <button class="item" type="button" @click="pick('add-point')">＋新建知识点（这颗星球）</button>
        <button class="item" type="button" @click="pick('reset-view')">回到全景</button>
      </template>
      <template v-else-if="galaxy">
        <div class="cap">星系「{{ galaxy.title }}」</div>
        <button class="item" type="button" @click="pick('create-topic-in-galaxy')">＋新建星球，归入这个星系</button>
        <template v-if="galaxy.manual">
          <button class="item" type="button" @click="pick('collect-topics')">＋收一颗已有星球进来…</button>
          <button class="item" type="button" @click="pick('edit-galaxy')">改名 / 换颜色</button>
          <div class="sep"></div>
          <button class="item danger" type="button" @click="pick('delete-galaxy')">删除这个星系（星球保留）</button>
        </template>
        <p v-else class="note">自动星系按标题前缀成团，新星球会自动进来，不能手动收。</p>
        <div class="sep"></div>
        <button class="item" type="button" @click="pick('reset-view')">回到全景</button>
        <button class="item" type="button" @click="pick('unpin-all')">全部重排（取消我摆的位置）</button>
      </template>
      <template v-else>
        <div class="cap">在宇宙空白处</div>
        <button class="item" type="button" @click="pick('create-galaxy')">＋新建星系</button>
        <button class="item" type="button" @click="pick('create-topic')">＋新建星球（主题）</button>
        <button class="item" type="button" @click="pick('create-free-point')">＋新建游离知识点（星尘）</button>
        <div class="sep"></div>
        <button class="item" type="button" @click="pick('reset-view')">回到全景</button>
        <button class="item" type="button" @click="pick('unpin-all')">全部重排（取消我摆的位置）</button>
      </template>
    </template>

    <template v-else-if="kind === 'topic'">
      <div class="cap">{{ target?.title }}</div>
      <button class="item" type="button" @click="pick('enter')">进入这颗大球</button>
      <button class="item" type="button" @click="pick('add-point')">＋在这里加知识点</button>
      <button class="item" type="button" @click="pick('link-from')">从这里连线</button>
      <button class="item" type="button" @click="pick('rename')">改名</button>
      <button class="item" type="button" @click="pick('panel')">换颜色 / 看详情</button>
      <button v-if="target?.pin" class="item" type="button" @click="pick('unpin')">取消固定位置</button>
      <div class="sep"></div>
      <button class="item danger" type="button" @click="pick('remove')">删除这颗大球</button>
    </template>

    <template v-else-if="kind === 'star'">
      <div class="cap">{{ target?.title }}</div>
      <button class="item" type="button" @click="pick('link-from')">从这里连线</button>
      <button class="item" type="button" @click="pick('rename')">改名</button>
      <button class="item" type="button" @click="pick('merge')">{{ target?.merged ? '拆分散开' : '合并进大球' }}</button>
      <button class="item" type="button" @click="pick('hier-line')">{{ target?.hierLine ? '删掉与主题的连线' : '把与主题的连线画回来' }}</button>
      <button class="item" type="button" @click="pick('panel')">换颜色 / 看详情</button>
      <button v-if="target?.pin" class="item" type="button" @click="pick('unpin')">取消固定位置</button>
      <div class="sep"></div>
      <button class="item danger" type="button" @click="pick('remove')">删除这颗星</button>
    </template>

    <template v-else-if="kind === 'edge'">
      <div class="cap">这条连线</div>
      <button class="item" type="button" @click="pick('edge-open')">改线型 / 颜色 / 粗细</button>
      <button class="item danger" type="button" @click="pick('edge-delete')">删除这条线</button>
    </template>
  </div>
</template>

<script setup>
import { nextTick, onMounted, onUnmounted, ref } from 'vue'

const emit = defineEmits(['action'])

const visible = ref(false)
const kind = ref('empty')
const target = ref(null)
const scope = ref(null)
const galaxy = ref(null)
const world = ref(null)
const x = ref(0)
const y = ref(0)
const rootEl = ref(null)

/**
 * at = { kind, node, edge, galaxy, scope, world, x, y }
 * 菜单不只看“点到谁”，还看“在哪个层级”：宇宙空白 / 星系雾团 / 星球内部。
 */
function open(at) {
  kind.value = at.kind
  target.value = at.node || at.edge || null
  scope.value = at.scope || null
  galaxy.value = at.galaxy || null
  world.value = at.world || null
  x.value = at.x
  y.value = at.y
  visible.value = true
  nextTick(() => {
    const r = rootEl.value?.getBoundingClientRect()
    if (!r) return
    x.value = Math.max(8, Math.min(at.x, window.innerWidth - r.width - 8))
    y.value = Math.max(8, Math.min(at.y, window.innerHeight - r.height - 8))
  })
}

function close() { visible.value = false }

function pick(type) {
  emit('action', {
    type,
    payload: {
      key: target.value?.key || target.value?.styleKey,
      title: target.value?.title,
      galaxyKey: galaxy.value?.key || null,
      galaxyTitle: galaxy.value?.title || null,
      galaxyId: galaxy.value?.id ?? null,
      galaxyManual: !!galaxy.value?.manual,
      world: world.value
    }
  })
  close()
}

function onPointerDown(ev) {
  if (!visible.value) return
  if (rootEl.value?.contains(ev.target)) return
  close()
}
function onKeyDown(ev) { if (ev.key === 'Escape') close() }
function onWheel() { if (visible.value) close() }

onMounted(() => {
  // 捕获阶段：点到画布/面板/顶栏的任何地方都先收菜单，再让原操作继续
  window.addEventListener('pointerdown', onPointerDown, true)
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('wheel', onWheel, { capture: true, passive: true })
  window.addEventListener('resize', close)
})
onUnmounted(() => {
  window.removeEventListener('pointerdown', onPointerDown, true)
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('wheel', onWheel, { capture: true })
  window.removeEventListener('resize', close)
})

defineExpose({ open, close, isOpen: () => visible.value })
</script>

<style scoped>
.menu {
  position: absolute;
  min-width: 210px;
  padding: 6px;
  background: var(--surface-solid);
  border: 1px solid var(--accent-border);
  border-radius: var(--radius-button);
  box-shadow: var(--hud-shadow);
  z-index: 40;
  font-size: 13px;
}
.cap { padding: 6px 10px 2px; font-size: 11px; color: var(--text-muted); }
.sep { height: 1px; margin: 4px 2px; background: var(--hairline); }
.item {
  display: block;
  width: 100%;
  text-align: left;
  height: 32px;
  padding: 0 10px;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-primary);
  font: inherit;
  cursor: pointer;
}
.item:hover { background: var(--bg-hover); color: var(--accent); }
.item.danger { color: var(--danger); }
.note { margin: 4px 10px 2px; font-size: 11px; line-height: 1.5; color: var(--text-muted); }
</style>
