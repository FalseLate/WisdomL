<template>
  <div class="stats-view">
    <CyberNavbar title="错因统计" :show-back="true" @back="$router.back()" />

    <div class="page-container">
      <div v-if="loading" class="center-box"><div class="cyber-spinner"></div></div>

      <template v-else>
        <!-- 数字卡 -->
        <div class="kpi-grid">
          <div class="kpi-card">
            <div class="kpi-num">{{ stats.totalWrong || 0 }}</div>
            <div class="kpi-label">错题总数</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-num ok">{{ stats.redoCorrectRate || 0 }}%</div>
            <div class="kpi-label">重做正确率</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-num warn">{{ stats.slow?.ratio || 0 }}%</div>
            <div class="kpi-label">慢题占比</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-num ok">{{ stats.statusDist?.mastered || 0 }}</div>
            <div class="kpi-label">已掌握</div>
          </div>
        </div>

        <!-- 掌握状态 -->
        <div class="panel">
          <div class="panel-title">掌握状态分布</div>
          <div class="status-row">
            <div class="status-chip danger">未订正 {{ stats.statusDist?.unfixed || 0 }}</div>
            <div class="status-chip warn">看过 {{ stats.statusDist?.viewed || 0 }}</div>
            <div class="status-chip primary">复习中 {{ stats.statusDist?.reviewing || 0 }}</div>
            <div class="status-chip ok">已掌握 {{ stats.statusDist?.mastered || 0 }}</div>
          </div>
        </div>

        <!-- 五大错因饼图（无数据时不建图表实例） -->
        <div class="panel">
          <div class="panel-title">五大错因分布<span class="panel-sub">（按标注标签次数，可多选）</span></div>
          <div v-if="errorTypeTotal === 0" class="chart-empty">还没有标注错因，做题后在结果页标注即可统计</div>
          <div v-else ref="pieEl" class="chart"></div>
        </div>

        <!-- 近7天趋势 -->
        <div class="panel">
          <div class="panel-title">近 7 天新增错题趋势</div>
          <div ref="lineEl" class="chart"></div>
        </div>

        <!-- 各题型错误率（无数据时不建图表实例） -->
        <div class="panel">
          <div class="panel-title">各题型错误率</div>
          <div v-if="byTypeTotal === 0" class="chart-empty">暂无答题记录</div>
          <div v-else ref="barEl" class="chart"></div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import * as echarts from 'echarts'
import request from '../utils/request.js'
import { CyberNavbar } from '../components/cyber'
import { mountChart } from '../utils/chartHost.js'
import { appearance } from '../utils/theme.js'

const loading = ref(true)
const stats = ref({})
const pieEl = ref(null)
const lineEl = ref(null)
const barEl = ref(null)
// 图表清理函数（chartHost.mountChart 返回值），卸载时统一调用
let chartTeardowns = []

/* echarts 画在 canvas 上，不跟随 CSS 变量：颜色按主题各给一套。
   深色那版是霓虹配色；浅色必须整体压深，否则亮青/亮紫在白卡片上等于没画。 */
const CHART_COLORS = {
  dark: {
    axisLine: 'rgba(0,240,255,0.3)', axisText: '#9fb3c8', splitLine: 'rgba(255,255,255,0.06)',
    label: '#d6e4f0', pieBorder: '#0a0e1a', line: '#00f0ff', lineFill: 'rgba(0,240,255,0.15)',
    barFrom: '#b14eff', barTo: '#00f0ff',
    pie: ['#00f0ff', '#b14eff', '#ffb020', '#00ff88', '#ff4444']
  },
  light: {
    axisLine: 'rgba(10,101,112,0.35)', axisText: '#4d4d4d', splitLine: 'rgba(0,0,0,0.08)',
    label: '#171717', pieBorder: '#ffffff', line: '#0a6570', lineFill: 'rgba(10,101,112,0.14)',
    barFrom: '#6a1a6c', barTo: '#0a6570',
    pie: ['#0a6570', '#6a1a6c', '#8a6d00', '#0a6b3c', '#b3261e']
  }
}
function cc() { return appearance.theme === 'light' ? CHART_COLORS.light : CHART_COLORS.dark }

const ERROR_LABEL = { audit: '审题性', knowledge: '知识性', math: '数学性', strategy: '策略性', habit: '习惯性' }
const TYPE_LABEL = { single: '单选', multiple: '多选', judge: '判断', subjective: '主观' }

const errorTypeTotal = computed(() => {
  const d = stats.value.errorTypeDist || {}
  return Object.values(d).reduce((s, v) => s + (Number(v) || 0), 0)
})
const byTypeTotal = computed(() => {
  const d = stats.value.byType || {}
  return Object.values(d).reduce((s, v) => s + (v.total || 0), 0)
})

onMounted(async () => {
  try {
    stats.value = (await request.get('/wrong-questions/stats')) || {}
  } catch (e) {
    stats.value = {}
  } finally {
    loading.value = false
  }
  await nextTick()
  // 不在挂载时硬 init：首屏有开场动画（router-view 用 v-show 隐藏），
  // 此时容器 display:none 会让 echarts 把宽度算成 100px。
  // 交给 chartHost：容器可见（有真实布局尺寸）后才初始化，并持续跟随尺寸变化。
  mountAll()
})

// option 只在首次 init 时写入（见 chartHost 注释），换主题时重挂一次才能取到新配色
function mountAll() {
  chartTeardowns.forEach(fn => fn && fn())
  chartTeardowns = [
    mountChart(pieEl.value, pieOption, { echarts }),
    mountChart(lineEl.value, lineOption, { echarts }),
    mountChart(barEl.value, barOption, { echarts })
  ]
}

watch(() => appearance.theme, () => { nextTick(mountAll) })

onUnmounted(() => {
  chartTeardowns.forEach(fn => fn && fn())
  chartTeardowns = []
})

function baseGrid() {
  return { left: 40, right: 16, top: 30, bottom: 30, containLabel: true }
}
function axisStyle() {
  const c = cc()
  return {
    axisLine: { lineStyle: { color: c.axisLine } },
    axisLabel: { color: c.axisText, fontSize: 11 },
    splitLine: { lineStyle: { color: c.splitLine } }
  }
}

function pieOption() {
  const c = cc()
  const d = stats.value.errorTypeDist || {}
  const data = Object.keys(ERROR_LABEL).map((k, i) => ({
    name: ERROR_LABEL[k], value: Number(d[k] || 0),
    itemStyle: { color: c.pie[i] }
  }))
  return {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'item', confine: true },
    legend: { bottom: 0, textStyle: { color: c.axisText, fontSize: 11 } },
    series: [{
      type: 'pie', radius: ['42%', '66%'], center: ['50%', '44%'],
      label: { color: c.label, fontSize: 11 },
      itemStyle: { borderColor: c.pieBorder, borderWidth: 2 },
      data
    }]
  }
}

function lineOption() {
  const c = cc()
  const ax = axisStyle()
  const d = stats.value.trend7 || {}
  const keys = Object.keys(d)
  return {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis', confine: true },
    grid: baseGrid(),
    xAxis: { type: 'category', data: keys, ...ax },
    yAxis: { type: 'value', minInterval: 1, ...ax },
    series: [{
      type: 'line', smooth: true, data: keys.map(k => d[k]),
      symbolSize: 7,
      lineStyle: { color: c.line, width: 2 },
      itemStyle: { color: c.line },
      areaStyle: { color: c.lineFill }
    }]
  }
}

function barOption() {
  const c = cc()
  const ax = axisStyle()
  const d = stats.value.byType || {}
  const keys = Object.keys(d)
  return {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis', confine: true, valueFormatter: v => v + '%' },
    grid: baseGrid(),
    xAxis: { type: 'category', data: keys.map(k => TYPE_LABEL[k] || k), ...ax },
    yAxis: { type: 'value', max: 100, axisLabel: { formatter: '{value}%', color: ax.axisLabel.color, fontSize: 11 }, axisLine: ax.axisLine, splitLine: ax.splitLine },
    series: [{
      type: 'bar', barWidth: '46%',
      data: keys.map(k => Number(d[k]?.rate) || 0),
      itemStyle: {
        borderRadius: [6, 6, 0, 0],
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: c.barFrom }, { offset: 1, color: c.barTo }
        ])
      },
      label: { show: true, position: 'top', color: c.label, fontSize: 11, formatter: '{c}%' }
    }]
  }
}
</script>

<style scoped>
.stats-view { min-height: 100dvh; background: var(--bg-base); }
.page-container { padding: 16px; max-width: 560px; margin: 0 auto; }
.center-box { display: flex; justify-content: center; padding: 60px 0; }

.kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; margin-bottom: 14px; }
.kpi-card {
  background: var(--bg-card); border: 1px solid var(--accent-border);
  border-radius: 12px; padding: 14px; text-align: center;
}
.kpi-num { font-size: 24px; font-weight: 800; color: var(--accent); }
.kpi-num.ok { color: var(--success); }
.kpi-num.warn { color: var(--warning); }
.kpi-label { font-size: 12px; color: var(--text-secondary); margin-top: 4px; }

.panel {
  background: var(--bg-card); border: 1px solid var(--accent-border);
  border-radius: 12px; padding: 14px; margin-bottom: 14px;
}
.panel-title { font-size: 14px; font-weight: 700; color: var(--text-primary); margin-bottom: 10px; }
.panel-sub { font-size: 11px; color: var(--text-secondary); font-weight: 400; margin-left: 6px; }

.status-row { display: flex; gap: 8px; flex-wrap: wrap; }
.status-chip { font-size: 12px; padding: 6px 12px; border-radius: 999px; border: 1px solid; }
.status-chip.danger { color: var(--danger); border-color: var(--danger-border); }
.status-chip.warn { color: var(--warning); border-color: var(--warning-border); }
.status-chip.primary { color: var(--accent); border-color: var(--accent-border); }
.status-chip.ok { color: var(--success); border-color: var(--success-border); }

.chart { width: 100%; height: 260px; }
.chart-empty { font-size: 12px; color: var(--text-secondary); text-align: center; padding: 10px 0; }
</style>
