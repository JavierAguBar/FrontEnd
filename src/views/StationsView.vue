<script setup>
import { computed, onMounted, ref } from 'vue'
import { getStations } from '@/services/api'

const stations = ref([])
const searchTerm = ref('')
const selectedCity = ref('')
const loading = ref(true)
const errorMessage = ref('')

// Las opciones de ciudad se derivan de los datos descargados, sin duplicados.
const cities = computed(() => [...new Set(
  stations.value.map(station => station.city).filter(Boolean),
)].sort((left, right) => left.localeCompare(right, 'es')))

const filteredStations = computed(() => {
  // Aplica conjuntamente la búsqueda de texto y el filtro exacto por ciudad.
  const term = searchTerm.value.trim().toLocaleLowerCase('es')
  return stations.value.filter(station => {
    const searchable = `${station.nombre || ''} ${station.city || ''}`.toLocaleLowerCase('es')
    return searchable.includes(term) && (!selectedCity.value || station.city === selectedCity.value)
  })
})

/** Evita mostrar coordenadas ausentes o no numéricas como valores inválidos. */
function formatCoordinate(value) {
  if (value == null || value === '') return '—'
  const coordinate = Number(value)
  return Number.isFinite(coordinate) ? coordinate.toFixed(4) : '—'
}

onMounted(async () => {
  // El inventario se obtiene una vez al entrar a la vista.
  try {
    const response = await getStations()
    if (!Array.isArray(response)) throw new Error('La API devolvió un formato de estaciones inválido.')
    stations.value = response
  } catch (error) {
    errorMessage.value = `No se pudieron cargar las estaciones: ${error.message}`
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <main class="page-shell">
    <div class="page-heading">
      <div><p class="section-kicker">01 / INVENTARIO</p><h1>Estaciones</h1></div>
      <p>El inventario de puntos de medición conectado al servidor. Filtra por nombre o ciudad.</p>
    </div>
    <div class="toolbar">
      <div class="toolbar-group">
        <input v-model="searchTerm" type="search" placeholder="Buscar estación..." aria-label="Buscar estación" />
        <select v-model="selectedCity" class="select" aria-label="Filtrar por ciudad">
          <option value>Todas las ciudades</option>
          <option v-for="city in cities" :key="city" :value="city">{{ city }}</option>
        </select>
      </div>
      <span class="badge"><strong>{{ filteredStations.length }}</strong>&nbsp; estaciones</span>
    </div>
    <p v-if="errorMessage" class="error" role="alert">{{ errorMessage }}</p>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>ID</th><th>Estación</th><th>Ciudad</th><th>Coordenadas</th><th>Estado</th></tr></thead>
        <tbody>
          <tr v-if="loading"><td colspan="5" class="loading">Cargando estaciones...</td></tr>
          <tr v-else-if="errorMessage"><td colspan="5" class="empty">No fue posible cargar el inventario.</td></tr>
          <tr v-else-if="!filteredStations.length"><td colspan="5" class="empty">No hay estaciones que coincidan.</td></tr>
          <tr v-for="station in filteredStations" v-else :key="station.id_station">
            <td class="mono">{{ station.id_station ?? '—' }}</td>
            <td><strong>{{ station.nombre || `Estación ${station.id_station}` }}</strong></td>
            <td>{{ station.city || 'Sin ciudad' }}</td>
            <td class="mono">{{ formatCoordinate(station.latitude) }}°, {{ formatCoordinate(station.longitude) }}°</td>
            <td><span class="badge">{{ station.status || 'Registrada' }}</span></td>
          </tr>
        </tbody>
      </table>
    </div>
  </main>
  <footer class="site-footer"><span>Viento Norte / Inventario</span><span>GET /api/estaciones/estacion</span></footer>
</template>
