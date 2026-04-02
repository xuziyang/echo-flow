import { createApp } from 'vue'
import { createPinia } from 'pinia'
import './style.css'
import './assets/ui-shared.css'
import App from './App.vue'

const app = createApp(App)
app.use(createPinia())
app.mount('#app')
