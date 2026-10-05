import { createApp } from 'vue'
import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import Vant from 'vant'
import 'vant/lib/index.css'
import router from './router'
// 主题四层：不变量 → 深色 token → 浅色 token（同权重、靠 data-theme 命中）→ 结构样式（只吃 var）
// → 浅色效果语言层（无文字光晕）。组件里不再允许出现颜色字面量，见 npm run theme:check
import './styles/tokens-shared.css'
import './styles/tokens-dark.css'
import './styles/tokens-light.css'
import './style.css'
import './styles/effects-light.css'
import { initTheme } from './utils/theme.js'
import App from './App.vue'

initTheme()

const app = createApp(App)

// Pinia + 持久化
const pinia = createPinia()
pinia.use(piniaPluginPersistedstate)

app.use(pinia)
app.use(Vant)
app.use(router)
app.mount('#app')
