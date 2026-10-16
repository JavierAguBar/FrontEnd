<script setup>
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { getStations } from '@/services/api'
import { loadExternalScript } from '@/utils/externalScript'

const route = useRoute()
const mapElement = ref(null)
const stations = ref([])
const loading = ref(true)
const mapError = ref('')
let leafletMap = null
const markers = new Map()

/** Centra el mapa y abre el popup del marcador correspondiente. */
function selectStation(station) {
  const marker = markers.get(Number(station.id_station))
  if (!marker || !leafletMap) return
  const position = [Number(station.latitude), Number(station.longitude)]
  leafletMap.setView(position, 14)
  marker.openPopup()
}

/** Inicializa Leaflet, pinta marcadores y ajusta la vista a sus coordenadas. */
function createMap() {
  const leaflet = window.L
  if (!leaflet || !mapElement.value) throw new Error('No se pudo inicializar el mapa.')

  leafletMap = leaflet.map(mapElement.value).setView([18.53, -88.29], 12)
  leaflet.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 18,
  }).addTo(leafletMap)

  const bounds = []
  for (const station of stations.value) {
    const position = [Number(station.latitude), Number(station.longitude)]
    bounds.push(position)

    const marker = leaflet.circleMarker(position, {
      radius: 7,
      color: '#0f5d5b',
      weight: 2,
      fillColor: '#d9ed72',
      fillOpacity: 0.95,
    }).addTo(leafletMap)
    const popup = document.createElement('div')
    const name = document.createElement('strong')
    name.textContent = station.nombre || `Estación ${station.id_station}`
    const city = document.createElement('div')
    city.textContent = station.city || 'Sin ciudad'
    const coordinates = document.createElement('small')
    coordinates.textContent = `${position[0].toFixed(4)}°, ${position[1].toFixed(4)}°`
    popup.append(name, city, coordinates)
    marker.bindPopup(popup)
    markers.set(Number(station.id_station), marker)
  }

  if (bounds.length) leafletMap.fitBounds(bounds, { padding: [30, 30] })
}

onMounted(async () => {
  try {
    // El mapa externo y el inventario son independientes; se cargan a la vez.
    const [, response] = await Promise.all([
      loadExternalScript('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js', 'L'),
      getStations(),
    ])
    if (!Array.isArray(response)) throw new Error('La API devolvió un formato de estaciones inválido.')
    stations.value = response.filter(station =>
      Number.isFinite(Number(station.latitude)) && Number.isFinite(Number(station.longitude)),
    )
    await nextTick()
    createMap()
  } catch (error) {
    mapError.value = `No se pudo cargar el mapa: ${error.message}`
    console.error('No se pudo inicializar el mapa', error)
  } finally {
    loading.value = false
  }
})

watch(
  () => route.name,
  async name => {
    // Leaflet necesita recalcular el tamaño si el mapa se visitó tras estar oculto.
    if (name === 'map' && leafletMap) {
      await nextTick()
      leafletMap.invalidateSize({ pan: false })
    }
  },
)

onUnmounted(() => {
  leafletMap?.remove()
  leafletMap = null
  markers.clear()
})
</script>

<template>
  <main class="page-shell">
    <div class="page-heading">
      <div><p class="section-kicker">00 / DISTRIBUCIÓN</p><h1>Mapa</h1></div>
      <p>Ubicaciones registradas. Selecciona un punto para consultar sus coordenadas.</p>
    </div>
    <div class="map-layout">
      <section class="map-panel"><div ref="mapElement" class="leaflet-map" aria-label="Mapa de estaciones"></div></section>
      <aside class="map-sidebar">
        <h2>Estaciones registradas</h2>
        <div class="map-legend"><span class="legend-dot"></span><span>Ubicación registrada</span></div>
        <ul class="map-list">
          <li v-if="loading">Cargando estaciones...</li>
          <li v-else-if="mapError" class="error" role="alert">{{ mapError }}</li>
          <li v-else-if="!stations.length" class="empty">No hay estaciones con coordenadas disponibles.</li>
          <li v-for="station in stations" v-else :key="station.id_station" class="map-station-item">
            <button
              class="map-station-button"
              type="button"
              @click="selectStation(station)"
            >
              <span>{{ station.nombre || `Estación ${station.id_station}` }}</span>
              <small>{{ station.city || 'Sin ciudad' }}</small>
            </button>
          </li>
        </ul>
      </aside>
    </div>
  </main>
  <footer class="site-footer"><span>Chetuweather / Mapa</span><span>GET /api/estaciones/estacion</span></footer>
</template>
