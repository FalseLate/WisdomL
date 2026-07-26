import { createApp } from 'vue'
import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import Vant from 'vant'
import 'vant/lib/index.css'
import router from './router'
import './style.css'
import App from './App.vue'

const app = createApp(App)

// Pinia + 持久化
const pinia = createPinia()
pinia.use(piniaPluginPersistedstate)

app.use(pinia)
app.use(Vant)
app.use(router)
app.mount('#app')
