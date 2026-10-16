import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '@/views/HomeView.vue'
import MapView from '@/views/MapView.vue'
import StationsView from '@/views/StationsView.vue'
import ResultsView from '@/views/ResultsView.vue'
import ChartsView from '@/views/ChartsView.vue'
import AdminMonitorView from '@/views/AdminMonitorView.vue'
import AdminAlertsView from '@/views/AdminAlertsView.vue'
import { isAdmin, isResearcher, openAuthDialog } from '@/services/auth'

// Las rutas históricas en HTML redirigen a las vistas SPA actuales para que
// enlaces antiguos sigan llevando a la pantalla equivalente.
const routes = [
  { path: '/', name: 'home', component: HomeView },
  { path: '/mapa', name: 'map', component: MapView },
  { path: '/Mapa/index.html', redirect: '/mapa' },
  { path: '/estaciones', name: 'stations', component: StationsView, meta: { researcherOnly: true } },
  { path: '/Tablas/estaciones.html', redirect: '/estaciones' },
  { path: '/resultados', name: 'results', component: ResultsView },
  { path: '/Tablas/resultados.html', redirect: '/resultados' },
  { path: '/admin/monitoreo', name: 'admin-monitor', component: AdminMonitorView, meta: { adminOnly: true } },
  { path: '/admin/alertas', name: 'admin-alerts', component: AdminAlertsView, meta: { adminOnly: true } },
  { path: '/graficas', name: 'charts', component: ChartsView },
  { path: '/graficas/graficas.html', redirect: '/graficas' },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

// Estaciones queda reservada a investigadores; los demás vuelven al inicio.
router.beforeEach(to => {
  if (to.meta.adminOnly && !isAdmin.value) {
    openAuthDialog('login')
    return { name: 'home' }
  }
  if (to.meta.researcherOnly && !isResearcher.value) {
    openAuthDialog('login')
    return { name: 'home' }
  }
})

const pageTitles = {
  home: 'Viento Norte | Inicio',
  map: 'Viento Norte | Mapa',
  stations: 'Chetuweather | Estaciones',
  results: 'Chetuweather | Resultados',
  charts: 'Viento Norte | Gráficas',
  'admin-monitor': 'Chetuweather | Monitoreo',
  'admin-alerts': 'Chetuweather | Alertas',
}

// Actualiza el título del navegador tras cada navegación completada.
router.afterEach(to => {
  document.title = pageTitles[to.name] || 'Viento Norte'
})

export default router
