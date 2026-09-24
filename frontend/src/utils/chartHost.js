/**
 * 图表宿主：解决「容器还没布局就 echarts.init → 图表被永久钉成 100px 宽」的问题。
 *
 * 真实踩坑（E2E 回归报告 P2-2）：
 *   App.vue 的开场动画期间，页面容器是 <router-view v-show="!showSplash" />，
 *   组件在 Splash 结束前就已经挂载，此刻容器处于 display:none。
 *   这时 echarts.init 会让 zrender 去读 getComputedStyle(el).width，
 *   而未布局元素拿到的是字符串 "100%"，parseFloat("100%") === 100，
 *   于是图表被固定成 100px 宽（高度写的是 260px 绝对值，所以反而是正常的）。
 *   又因为 Splash 结束（元素由 display:none 变可见）不会触发 window.resize，
 *   错误尺寸一直保留，必须手动改窗口大小才恢复。
 *
 * 这里的做法：
 *   1. 只在容器有真实布局尺寸（clientWidth / clientHeight > 0）时才初始化；
 *   2. 用 ResizeObserver 跟随容器尺寸变化（Splash 收尾、窗口缩放、字体回流、
 *      父容器变化都能覆盖），回调内用 requestAnimationFrame 节流；
 *   3. 幂等初始化，重复挂载不会产生第二个实例（避免 echarts 的
 *      "There is a chart instance already initialized on the dom" 警告与泄漏）；
 *   4. 返回清理函数，组件卸载时断开监听并销毁实例。
 *
 * 注意：option 只在首次初始化时写入。若需要「不重新挂载就更新数据」，
 * 先调用清理函数再重新 mountChart 即可。
 */
import * as echartsLib from 'echarts'

/**
 * @param {HTMLElement|null} el 图表容器（容器不存在时直接降级为空操作）
 * @param {() => object} buildOption 返回 ECharts option 的工厂函数
 * @param {{ echarts?: object }} [opts] 可选注入 echarts 实例（按需引入 / 测试替身场景）
 * @returns {() => void} 清理函数
 */
export function mountChart(el, buildOption, opts = {}) {
  if (!el) return () => {}
  const echarts = opts.echarts || echartsLib
  let chart = null
  let raf = 0

  const draw = () => {
    raf = 0
    // 容器不可见（display:none 或尺寸为 0）：这一帧不初始化，等 ResizeObserver 下次回调
    if (el.clientWidth <= 0 || el.clientHeight <= 0) return
    if (!chart) {
      chart = echarts.getInstanceByDom(el) || echarts.init(el)
      chart.setOption(buildOption(), true)
      return
    }
    chart.resize()
  }

  const schedule = () => {
    // 同一帧内可能被多次触发（ResizeObserver 抖动），只处理一次
    if (raf) return
    raf = requestAnimationFrame(draw)
  }

  schedule()

  let observer = null
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(schedule)
    observer.observe(el)
  } else {
    // 老浏览器兜底：至少窗口缩放时能自我纠正
    window.addEventListener('resize', schedule)
  }

  return function unmount() {
    if (raf) {
      cancelAnimationFrame(raf)
      raf = 0
    }
    if (observer) observer.disconnect()
    else window.removeEventListener('resize', schedule)
    if (chart) {
      chart.dispose()
      chart = null
    }
  }
}
