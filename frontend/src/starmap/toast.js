import { showToast, showFailToast } from 'vant'

/**
 * 星图是全屏画布，Vant 默认的居中提示正好盖在图中央、还会吃掉一次点击。
 * 统一挪到顶栏下方，并让它不挡鼠标（点提示下面那颗星应该照样能点）。
 */
const at = msg => ({ message: msg, position: 'top', className: 'starmap-toast' })

export const toast = msg => showToast(at(msg))
export const failToast = msg => showFailToast(at(msg))
