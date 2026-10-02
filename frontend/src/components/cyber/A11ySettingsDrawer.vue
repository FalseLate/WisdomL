<template>
  <Teleport to="body">
    <div v-if="visible" class="a11y-mask" @click.self="close">
      <div class="a11y-drawer" role="dialog" aria-label="无障碍设置">
        <div class="drawer-head">
          <span class="drawer-title">♿ 无障碍设置</span>
          <span class="drawer-close" @click="close">✕</span>
        </div>
        <div class="drawer-body">
          <section>
            <h4>感知通道（开哪条加载哪个模型，关闭即释放）</h4>
            <label v-for="ch in channels" :key="ch.key" class="row">
              <input type="checkbox" v-model="draft.channels[ch.key]" @change="markDirty" />
              <span>{{ ch.label }}</span>
              <select v-model="draft.sensitivity[ch.key]" :disabled="!draft.channels[ch.key]" @change="markDirty" aria-label="灵敏度">
                <option value="slow">迟钝</option>
                <option value="normal">标准</option>
                <option value="fast">敏感</option>
              </select>
            </label>
            <p class="note">头部：轻快点头=下一选项、微笑=上一选项、张嘴=确认、摇头=撤销；姿态：单臂举肘=命中、双手举过头合拢=交卷。</p>
          </section>

          <section>
            <h4>扫描模式（底部 🎯 按钮或 S 键开关，游标自动走，命中信号选中）</h4>
            <label class="row">停留时长
              <select v-model.number="draft.scan.dwell" @change="markDirty">
                <option :value="800">0.8s</option>
                <option :value="1200">1.2s</option>
                <option :value="1800">1.8s</option>
              </select>
            </label>
          </section>

          <section>
            <h4>动作重映射（一切皆可改）</h4>
            <template v-for="ch in ['hand', 'head', 'arm']" :key="ch">
              <div class="grp">{{ ch }}</div>
              <label v-for="cand in candidates[ch]" :key="cand" class="row map">
                <code>{{ cand }}<em>{{ candLabels[cand] || '' }}</em></code>
                <select v-model="draft.mappings[ch][cand]" @change="markDirty">
                  <option :value="null">— 不映射 —</option>
                  <option v-for="a in actionWords" :key="a" :value="a">{{ a }} · {{ actionLabels[a] }}</option>
                </select>
              </label>
            </template>
          </section>

          <section>
            <h4>ADHD 层（只帮助回到任务，不监控不评判）</h4>
            <label class="row"><input type="checkbox" v-model="draft.adhd.enabled" @change="markDirty" /> 启用（离屏暂停计时/3s撤销/节奏提示）</label>
            <label class="row"><input type="checkbox" v-model="draft.adhd.offscreenPause" @change="markDirty" /> 离屏暂停本题计时（不惩罚、不上报）</label>
            <label class="row"><input type="checkbox" v-model="draft.feedback.tts" @change="markDirty" /> 语音播报选项与确认（TTS）</label>
            <label class="row"><input type="checkbox" v-model="draft.feedback.debug" @change="markDirty" /> HUD 显示判定诊断数值（调手势时再开，平时数字会一直跳）</label>
          </section>

          <div class="drawer-foot">
            <span v-if="dirty" class="dirty-tip">● 有改动未应用</span>
            <button class="cyber-btn primary" :disabled="!dirty" @click="apply">应用设置</button>
            <button class="cyber-btn ghost" @click="restore">恢复默认</button>
          </div>
          <p class="note">改动需点「应用设置」才生效；全部设置仅存于浏览器本地，不上传服务器。</p>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { reactive, ref, watch } from 'vue'
import { showConfirmDialog, showToast } from 'vant'
import { loadSettings, saveSettings, resetSettings, ACTION_WORDS, DEFAULT_MAPPINGS } from '../../a11y/settings.js'

const props = defineProps({ visible: { type: Boolean, default: false } })
const emit = defineEmits(['close'])

const channels = [
  { key: 'hand', label: '手部（伸指/点赞/张开/两阶段握拳）' },
  { key: 'head', label: '头部（点头/微笑/张嘴/摇头/扭头）' },
  { key: 'arm', label: '姿态（举肘/横扫/双手举过头）' }
]
const candidates = {
  hand: Object.keys(DEFAULT_MAPPINGS.hand),
  head: Object.keys(DEFAULT_MAPPINGS.head),
  arm: Object.keys(DEFAULT_MAPPINGS.arm)
}
const actionWords = ACTION_WORDS
// 中文标注：候选=你要比的动作，动作=系统执行的事（select:A 伸1指 -> selectA 选A，本来就是一一对应）
const candLabels = {
  'select:A': '伸1指', 'select:B': '伸2指', 'select:C': '伸3指', 'select:D': '伸4指',
  prev: '点赞偏左', next: '点赞偏右', clear: '五指张开', submit: '两阶段握拳',
  turnLeft: '左扭头', turnRight: '右扭头', nod: '点头', lookUp: '抬头', mouthOpen: '张嘴', smile: '微笑', shake: '摇头',
  'elbowUp:left': '左举肘', 'elbowUp:right': '右举肘', handsUp: '双手举过头', sweep: '横扫'
}
const actionLabels = {
  selectA: '选A', selectB: '选B', selectC: '选C', selectD: '选D',
  prev: '上一题', next: '下一题', clear: '清空本题', confirm: '确认/命中', cancel: '取消',
  submit: '整卷提交', undo: '撤销上一步', optNext: '下一选项', optPrev: '上一选项'
}
const dirty = ref(false)
const draft = reactive(JSON.parse(JSON.stringify(loadSettings())))

watch(() => props.visible, (v) => {
  if (v) {
    Object.assign(draft, JSON.parse(JSON.stringify(loadSettings())))
    dirty.value = false
  }
})

function markDirty() { dirty.value = true }

// Vant 弹层默认 z-index 2000，会被抽屉遮罩（9500）压住：看得见点不着，
// 点它等于点遮罩又会再弹一个确认框 -> 死锁。统一抬到遮罩之上，并挡住重复弹窗。
const DIALOG_CLASS = 'a11y-confirm'
const confirming = ref(false)

function apply() {
  saveSettings(JSON.parse(JSON.stringify(draft)))
  dirty.value = false
  showToast({ message: '设置已生效', position: 'bottom', duration: 1500, className: 'a11y-toast' })
}

function restore() {
  if (confirming.value) return
  confirming.value = true
  showConfirmDialog({
    title: '恢复默认设置',
    message: '通道开关、灵敏度与全部动作重映射都会被重置为默认值。',
    confirmButtonText: '恢复默认',
    cancelButtonText: '取消',
    theme: 'roundButton',
    className: DIALOG_CLASS
  }).then(() => {
    resetSettings()
    Object.assign(draft, JSON.parse(JSON.stringify(loadSettings())))
    dirty.value = false
    showToast({ message: '已恢复默认设置', position: 'bottom', duration: 1500, className: 'a11y-toast' })
  }).catch(() => {}).finally(() => { confirming.value = false })
}

function close() {
  if (confirming.value) return
  if (!dirty.value) { emit('close'); return }
  confirming.value = true
  showConfirmDialog({
    title: '有未应用的改动',
    message: '现在关闭会丢弃这些改动，确定？',
    confirmButtonText: '丢弃并关闭',
    cancelButtonText: '继续编辑',
    theme: 'roundButton',
    className: DIALOG_CLASS
  }).then(() => emit('close')).catch(() => {}).finally(() => { confirming.value = false })
}
</script>

<style scoped>
.a11y-mask {
  position: fixed;
  inset: 0;
  background: var(--scrim);
  backdrop-filter: blur(4px);
  z-index: 9500;
  display: flex;
  justify-content: flex-end;
}
.a11y-drawer {
  width: min(420px, 94vw);
  height: 100%;
  background: var(--surface-solid);
  border-left: 1px solid var(--hairline);
  box-shadow: -8px 0 40px rgba(0, 0, 0, 0.35);
  display: flex;
  flex-direction: column;
}
.drawer-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 18px;
  border-bottom: 1px solid var(--hairline);
}
.drawer-title {
  font-family: 'Orbitron', 'Courier New', monospace;
  color: var(--accent);
  letter-spacing: 2px;
  text-shadow: 0 0 8px rgba(0, 245, 255, 0.5);
}
.drawer-close { cursor: pointer; color: var(--text-muted); font-size: 16px; }
.drawer-close:hover { color: var(--danger); }
.drawer-body { overflow-y: auto; padding: 12px 18px 24px; flex: 1; }
section { margin-bottom: 18px; }
h4 {
  margin: 8px 0;
  color: var(--accent);
  font-size: 13px;
  font-weight: 600;
  border-left: 3px solid var(--accent);
  padding-left: 8px;
}
.row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 8px 0;
  color: var(--text-primary);
  font-size: 13px;
}
.row select, .row input[type="number"] { margin-left: auto; }
.row.map code { min-width: 150px; color: var(--text-muted); font-size: 12px; }
.row.map code em { font-style: normal; color: var(--accent); margin-left: 8px; }
.grp { color: var(--secondary); font-size: 11px; margin-top: 8px; font-family: monospace; text-transform: uppercase; }
select {
  background: var(--bg-elevated);
  color: var(--text-primary);
  border: 1px solid var(--hairline);
  border-radius: 4px;
  padding: 3px 6px;
  font-size: 12px;
}
input[type="checkbox"] { accent-color: var(--accent); width: 15px; height: 15px; }
.drawer-foot { display: flex; align-items: center; gap: 12px; margin: 12px 0; flex-wrap: wrap; }
.cyber-btn {
  padding: 6px 16px;
  background: var(--accent-soft);
  border: 1px solid var(--accent-border);
  color: var(--accent);
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}
.cyber-btn:hover { background: var(--accent-soft); }
.cyber-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  background: var(--bg-hover);
}
.cyber-btn.ghost {
  background: transparent;
  border-color: var(--secondary-border);
  color: #ff66ff;
}
.cyber-btn.ghost:hover { background: var(--secondary-soft); }
.dirty-tip { color: var(--warning); font-size: 12px; margin-right: auto; }
.note { color: var(--text-muted); font-size: 11px; line-height: 1.6; }
</style>

<style>
/* 非 scoped：Vant 弹层挂在 body 上，必须压过抽屉遮罩（z-index 9500）才能点到 */
.a11y-confirm.van-dialog {
  z-index: 10500 !important;
  background: var(--surface-solid);
  border: 1px solid var(--accent-border);
  color: var(--text-primary);
}
.a11y-confirm .van-dialog__header { color: var(--accent); letter-spacing: 1px; }
.a11y-confirm .van-dialog__message { color: var(--text-secondary); }
.a11y-confirm .van-dialog__confirm,
.a11y-confirm .van-dialog__confirm:active { color: var(--accent); }
.a11y-confirm .van-dialog__cancel,
.a11y-confirm .van-dialog__cancel:active { color: #ff66ff; }
.a11y-confirm.van-hairline--top::after { border-top-color: var(--hairline); }
.a11y-toast { z-index: 10500 !important; }
</style>
