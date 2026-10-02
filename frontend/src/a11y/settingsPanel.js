/**
 * 全局「无障碍与手势」面板的开关状态。
 * 面板本体只挂在 App.vue 一处，任何页面（设置页、懒人模式）写这个 ref 就能打开，
 * 避免每个页面各自挂一份抽屉、也避免 prop 一层层钻下去。
 */
import { ref } from 'vue'

export const a11yPanelOpen = ref(false)
