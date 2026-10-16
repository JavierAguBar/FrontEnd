import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import './assets/CSS/site.css'

// Punto de arranque de la SPA: monta la aplicación raíz con navegación e
// integra los estilos compartidos antes de renderizar el elemento #app.
createApp(App).use(router).mount('#app')
