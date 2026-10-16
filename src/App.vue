<script setup>
import { ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import AppLayout from './components/layout/AppLayout.vue'
import HomeView from './views/HomeView.vue'
import MapView from './views/MapView.vue'
import StationsView from './views/StationsView.vue'
import ResultsView from './views/ResultsView.vue'
import ChartsView from './views/ChartsView.vue'
import AdminMonitorView from './views/AdminMonitorView.vue'
import AdminAlertsView from './views/AdminAlertsView.vue'

const route = useRoute()
const views = {
  home: HomeView,
  map: MapView,
  stations: StationsView,
  results: ResultsView,
  charts: ChartsView,
  'admin-monitor': AdminMonitorView,
  'admin-alerts': AdminAlertsView,
}
// Se conserva montada cada vista que se visitó; esto preserva su estado local
// al navegar entre secciones sin crear la vista antes de que se use.
const visitedViews = ref([])

watch(
  () => route.name,
  name => {
    // Registra una ruta solo una vez y evita acumular instancias duplicadas.
    if (name && views[name] && !visitedViews.value.includes(name)) {
      visitedViews.value.push(name)
    }
  },
  { immediate: true, flush: 'sync' },
)
</script>

<template>
  <AppLayout>
    <div
      v-for="name in visitedViews"
      :key="name"
      class="route-view"
      v-show="route.name === name"
    >
      <component :is="views[name]" />
    </div>
  </AppLayout>
</template>
