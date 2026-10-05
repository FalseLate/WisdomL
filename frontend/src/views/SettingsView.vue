<template>
  <div class="settings-view">
    <CyberNavbar title="设置" :show-back="true" @back="$router.back()" />

    <div class="page-container">
      <!-- ===== 外观 ===== -->
      <section class="set-card">
        <h3 class="set-title">外观</h3>
        <div class="set-row">
          <span class="set-label">主题</span>
          <div class="seg" role="radiogroup" aria-label="主题">
            <button
              v-for="t in THEME_OPTIONS" :key="t.value"
              class="seg-btn" :class="{ on: appearance.theme === t.value }"
              role="radio" :aria-checked="appearance.theme === t.value"
              @click="setTheme(t.value, originFromEvent($event))"
            >{{ t.label }}</button>
          </div>
        </div>
        <div class="set-row">
          <span class="set-label">背景粒子</span>
          <div class="seg" role="radiogroup" aria-label="背景粒子">
            <button
              v-for="m in MOTION_OPTIONS" :key="m.value"
              class="seg-btn" :class="{ on: appearance.motion === m.value }"
              role="radio" :aria-checked="appearance.motion === m.value"
              @click="setMotion(m.value)"
            >{{ m.label }}</button>
          </div>
        </div>
        <p class="set-tip">「自动」= 深色用霓虹青粒子，浅色直接关闭粒子（青色在浅底上看不清，还白耗电）。浅色想要背景动效应选「中性」或「霓虹」。</p>
      </section>

      <!-- ===== 无障碍与手势 ===== -->
      <section class="set-card">
        <h3 class="set-title">无障碍与手势</h3>
        <div class="set-row link" @click="a11yPanelOpen = true">
          <span class="set-label">通道开关 / 灵敏度 / 动作重映射</span>
          <span class="set-arrow">›</span>
        </div>
        <ul class="gesture-list">
          <li v-for="g in GESTURE_HELP" :key="g.k">
            <span class="g-k">{{ g.k }}</span>
            <span class="g-v">{{ g.v }}</span>
          </li>
        </ul>
        <button class="set-btn" @click="replayTutorial">重播懒人模式手势教程</button>
      </section>

      <!-- ============================================================
           队友功能请在此并列加 section.set-card（背景、提醒、单词计划…），
           不要再在各页面里私设第二套设置入口；样式一律用 style.css 的 token，
           这样深浅两套主题会自动跟着走。
           ============================================================ -->
    </div>
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router'
import { showToast } from 'vant'
import { CyberNavbar } from '../components/cyber'
import { appearance, setTheme, setMotion, originFromEvent } from '../utils/theme.js'
import { a11yPanelOpen } from '../a11y/settingsPanel.js'

const router = useRouter()

const THEME_OPTIONS = [
  { value: 'dark', label: '深色' },
  { value: 'light', label: '浅色' }
]
const MOTION_OPTIONS = [
  { value: 'auto', label: '自动' },
  { value: 'neon', label: '霓虹' },
  { value: 'calm', label: '中性' },
  { value: 'off', label: '关闭' }
]
const GESTURE_HELP = [
  { k: '点头', v: '切到下一个选项（A→B→C→D→A 循环），小幅快速即可' },
  { k: '微笑', v: '切回上一个选项（A 再笑绕回 D）' },
  { k: '张嘴', v: '确认当前高亮选项' },
  { k: '摇头', v: '撤销上一步（3 秒内）' },
  { k: '左/右扭头', v: '上一题 / 下一题' },
  { k: '伸 1-4 指', v: '直接选 A-D；五指张开清空本题' },
  { k: '两阶段握拳', v: '握拳 1.5 秒 → 张开手 → 再握 0.45 秒 = 整卷交卷（松开后 6 秒内）' },
  { k: '举肘 / 双手过头', v: '命中当前项 / 双手举过头合拢交卷' },
  { k: '键盘兜底', v: '1-4 或 A-D 选择、←→ 切题、Enter 交卷、空格长按确认、S 扫描、U 撤销、Esc 取消' }
]

function replayTutorial() {
  try { localStorage.removeItem('lazy_gesture_tutorial_shown') } catch { /* 隐私模式忽略 */ }
  showToast({ message: '已重置，下次进入懒人模式会重播教程', position: 'bottom' })
  router.push('/lazy-practice')
}
</script>

<style scoped>
.settings-view {
  min-height: 100dvh;
  background: transparent;
}

.set-card {
  background: var(--bg-card);
  border: 1px solid var(--hairline);
  border-radius: var(--radius-card);
  padding: 16px;
  margin-bottom: 14px;
  box-shadow: var(--elev-card);
}

.set-title {
  font-family: var(--font-display);
  font-size: 13px;
  letter-spacing: 2px;
  color: var(--accent);
  margin-bottom: 12px;
}

.set-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 44px;
  flex-wrap: wrap;
}

.set-row.link { cursor: pointer; }
.set-row.link:hover .set-label { color: var(--accent); }

.set-label {
  font-size: 14px;
  color: var(--text-primary);
}

.set-arrow { color: var(--text-muted); font-size: 18px; }

.set-tip {
  font-size: 11px;
  line-height: 1.6;
  color: var(--text-secondary);
  margin-top: 8px;
}

.seg {
  display: inline-flex;
  background: var(--bg-elevated);
  border: 1px solid var(--hairline);
  border-radius: var(--radius-pill);
  padding: 3px;
}

.seg-btn {
  min-width: 56px;
  height: 32px;
  padding: 0 12px;
  border: none;
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.seg-btn.on {
  background: var(--accent);
  color: var(--accent-contrast);
  font-weight: 700;
}

.gesture-list {
  list-style: none;
  margin: 10px 0 14px;
  padding: 0;
}

.gesture-list li {
  display: flex;
  gap: 10px;
  padding: 7px 0;
  border-bottom: 1px dashed var(--hairline);
  font-size: 12px;
  line-height: 1.6;
}

.gesture-list li:last-child { border-bottom: none; }

.g-k {
  flex: none;
  min-width: 84px;
  color: var(--accent);
  font-family: var(--font-display);
  letter-spacing: 1px;
}

.g-v { color: var(--text-secondary); }

.set-btn {
  width: 100%;
  height: 40px;
  background: transparent;
  border: 1px solid var(--accent-border);
  border-radius: var(--radius-button);
  color: var(--accent);
  font-size: 13px;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.set-btn:hover {
  border-color: var(--accent);
  background: var(--accent-soft);
}
</style>
