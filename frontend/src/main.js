import { createApp } from 'vue'
import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import Vant from 'vant'
import 'vant/lib/index.css'
import router from './router'
import './style.css'
import './styles/theme-light.css'
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
