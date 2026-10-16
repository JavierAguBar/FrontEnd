<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { getReadingsRange, getStations } from '@/services/api'
import { isLoggedIn, openAuthDialog } from '@/services/auth'

const PAGE_SIZE = 50
const today = new Date().toISOString().slice(0, 10)
const startDate = ref(today)
const endDate = ref(today)
const stationId = ref('')
const sortOrder = ref('date:desc')
const stations = ref([])
const readings = ref([])
const page = ref(1)
const loading = ref(false)
const errorMessage = ref('')
const loaded = ref(false)
const isSidebarOpen = ref(false)

const COLUMNS = [
  { key: 'date', label: 'Fecha / hora' },
  { key: 'station', label: 'Estación' },
  { key: 'wind', label: 'Viento' },
  { key: 'direction', label: 'Dirección' },
  { key: 'temperature', label: 'Temperatura' },
  { key: 'humidity', label: 'Humedad' },
]
const visibleColumns = ref(COLUMNS.map(column => column.key))
const shownColumns = computed(() => COLUMNS.filter(column => visibleColumns.value.includes(column.key)))
const columnCount = computed(() => Math.max(1, shownColumns.value.length))
const isShown = key => visibleColumns.value.includes(key)

const viewMode = ref('grouped')
const expandedDays = reactive(new Set())
const expandedHours = reactive(new Set())
const numericFields = { wind: 'windspeedmph', direction: 'winddir', temperature: 'tempf', humidity: 'humidity' }
const units = { wind: ' mph', direction: '°', temperature: ' °C', humidity: '%' }
const pad = value => String(value).padStart(2, '0')
const dayKey = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
const hourKey = date => `${dayKey(date)}|${pad(date.getHours())}`

function summarize(readings) {
  const averages = {}
  for (const [column, field] of Object.entries(numericFields)) {
    const values = readings.map(reading => reading[field]).filter(Number.isFinite)
    averages[column] = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
  }
  return { count: readings.length, stations: new Set(readings.map(reading => reading.id_station)).size, averages }
}

function toggleDay(key) {
  if (!expandedDays.delete(key)) expandedDays.add(key)
}

function toggleHour(key) {
  if (!expandedHours.delete(key)) expandedHours.add(key)
}

/** Filas planas día → hora → lectura; solo se incluyen los niveles expandidos. */
const groupedRows = computed(() => {
  const days = new Map()
  for (const reading of filteredReadings.value) {
    const key = dayKey(reading.date)
    if (!days.has(key)) days.set(key, [])
    days.get(key).push(reading)
  }
  const ascending = sortOrder.value === 'date:asc'
  const rows = []
  for (const key of [...days.keys()].sort((a, b) => ascending ? a.localeCompare(b) : b.localeCompare(a))) {
    const dayReadings = days.get(key)
    const open = expandedDays.has(key)
    rows.push({
      type: 'day', key, open,
      label: new Date(`${key}T12:00:00`).toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
      ...summarize(dayReadings),
    })
    if (!open) continue
    const hours = new Map()
    for (const reading of dayReadings) {
      const hKey = hourKey(reading.date)
      if (!hours.has(hKey)) hours.set(hKey, [])
      hours.get(hKey).push(reading)
    }
    for (const hKey of [...hours.keys()].sort((a, b) => ascending ? a.localeCompare(b) : b.localeCompare(a))) {
      const hourReadings = hours.get(hKey)
      const hourOpen = expandedHours.has(hKey)
      rows.push({ type: 'hour', key: hKey, open: hourOpen, label: `${hKey.split('|')[1]}:00 h`, ...summarize(hourReadings) })
      if (hourOpen) for (const reading of hourReadings) rows.push({ type: 'reading', key: `${hKey}|${reading.id_station}|${reading.date.getTime()}`, reading })
    }
  }
  return rows
})

function summaryCell(row, column) {
  if (column === 'station') return `${row.stations} ${row.stations === 1 ? 'estación' : 'estaciones'}`
  if (column === 'date') return ''
  return formatValue(row.averages[column], units[column])
}
/** Muestra u oculta el panel lateral de criterios. */
function toggleSidebar() {
  isSidebarOpen.value = !isSidebarOpen.value
}

const stationNames = computed(() => new Map(
  stations.value.map(station => [Number(station.id_station), station.nombre || `Estación ${station.id_station}`]),
))

const filteredReadings = computed(() => {
  // Ordena una copia para no mutar el arreglo reactivo original.
  const result = readings.value.filter(reading =>
    !stationId.value || reading.id_station === Number(stationId.value),
  )
  const [field, direction] = sortOrder.value.split(':')
  return result.sort((left, right) => {
    const leftValue = left[field]
    const rightValue = right[field]
    const comparison = field === 'date'
      ? leftValue - rightValue
      : (Number(leftValue) || 0) - (Number(rightValue) || 0)
    return direction === 'asc' ? comparison : -comparison
  })
})

const pageCount = computed(() => Math.max(1, Math.ceil(filteredReadings.value.length / PAGE_SIZE)))
// La paginación se aplica después de estación y orden para mantener la tabla
// y sus métricas coherentes con los filtros seleccionados.
const visibleReadings = computed(() => {
  const start = (page.value - 1) * PAGE_SIZE
  return filteredReadings.value.slice(start, start + PAGE_SIZE)
})
const speedValues = computed(() => filteredReadings.value
  .map(reading => reading.windspeedmph)
  .filter(Number.isFinite))
const averageSpeed = computed(() => speedValues.value.length
  ? speedValues.value.reduce((sum, speed) => sum + speed, 0) / speedValues.value.length
  : null)
const minimumSpeed = computed(() => speedValues.value.length ? Math.min(...speedValues.value) : null)
const maximumSpeed = computed(() => speedValues.value.length ? Math.max(...speedValues.value) : null)

function stationName(id) {
  return stationNames.value.get(id) || `Estación ${id}`
}

function formatDate(value) {
  return value.toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })
}

function formatValue(value, suffix = '') {
  return Number.isFinite(value) ? `${value.toFixed(1)}${suffix}` : '—'
}

const csvValue = {
  date: reading => reading.date.toISOString(),
  station: reading => stationName(reading.id_station),
  wind: reading => reading.windspeedmph,
  direction: reading => reading.winddir,
  temperature: reading => reading.tempf,
  humidity: reading => reading.humidity,
}

/** Descarga en CSV las lecturas filtradas con las columnas visibles; solo para usuarios registrados. */
function exportCsv() {
  if (!isLoggedIn.value) {
    openAuthDialog('login')
    return
  }
  const escapeCell = value => {
    const text = value == null ? '' : String(value)
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
  }
  const rows = [
    shownColumns.value.map(column => escapeCell(column.label)).join(','),
    ...filteredReadings.value.map(reading =>
      shownColumns.value.map(column => escapeCell(csvValue[column.key](reading))).join(',')),
  ]
  const url = URL.createObjectURL(new Blob(['\ufeff' + rows.join('\n')], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `lecturas_${startDate.value}_a_${endDate.value}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

/** Valida el rango, consulta la API y reinicia la página de resultados. */
async function loadReadings() {
  errorMessage.value = ''
  page.value = 1

  if (!startDate.value || !endDate.value) {
    errorMessage.value = 'Selecciona ambas fechas para consultar las lecturas.'
    return
  }
  const dayCount = Math.floor(
    (new Date(`${endDate.value}T00:00:00Z`) - new Date(`${startDate.value}T00:00:00Z`)) / 86400000,
  ) + 1
  if (dayCount < 1) {
    errorMessage.value = 'La fecha inicial no puede ser posterior a la fecha final.'
    return
  }
  if (dayCount > 31) {
    errorMessage.value = 'El rango máximo de consulta es de 31 días.'
    return
  }

  loading.value = true
  try {
    readings.value = await getReadingsRange({
      startDate: startDate.value,
      endDate: endDate.value,
      stationIds: stationId.value ? [stationId.value] : [],
    })
    loaded.value = true
  } catch (error) {
    if (error.status === 404) {
      readings.value = []
      loaded.value = true
    } else {
      errorMessage.value = `No se pudieron cargar las lecturas: ${error.message}`
    }
  } finally {
    loading.value = false
  }
}

/** Restablece valores iniciales y vuelve a consultar el día actual. */
function clearFilters() {
  startDate.value = today
  endDate.value = today
  stationId.value = ''
  sortOrder.value = 'date:desc'
  visibleColumns.value = COLUMNS.map(column => column.key)
  loadReadings()
}

onMounted(async () => {
  try {
    stations.value = await getStations()
  } catch (error) {
    errorMessage.value = `No se pudieron cargar las estaciones: ${error.message}`
  }
  await loadReadings()
})
</script>

<template>
  <main class="page-shell results-page">
    <div class="page-heading">
      <div class="heading-left">
        <button
          class="button filter-toggle-btn"
          type="button"
          :class="{ 'button-primary': !isSidebarOpen }"
          @click="toggleSidebar"
          aria-label="Alternar panel de filtros"
        >
          <span>Filtros</span>
          <span class="filter-icon">⚙</span>
        </button>
        <div><p class="section-kicker">02 / OBSERVACIONES</p><h1>Resultados</h1></div>
      </div>
      <div class="heading-controls">
        <p>Lecturas meteorológicas consultadas desde las rutas disponibles de la API.</p>
      </div>
    </div>

    <div class="results-layout" :class="{ 'sidebar-collapsed': !isSidebarOpen }">
      <!-- Panel de filtros delgado a la izquierda (sticky) -->
      <aside v-show="isSidebarOpen" class="results-sidebar" aria-label="Filtros de consulta">
        <div class="sidebar-sticky-content">
          <div class="sidebar-header">
            <h3>Filtros</h3>
            <button class="button-icon-close" type="button" @click="toggleSidebar" title="Ocultar filtros">✕</button>
          </div>

          <form class="sidebar-form" @submit.prevent="loadReadings">
            <div class="form-group">
              <label for="filter-start">Desde</label>
              <input id="filter-start" v-model="startDate" type="date" :max="endDate || today" />
            </div>

            <div class="form-group">
              <label for="filter-end">Hasta</label>
              <input id="filter-end" v-model="endDate" type="date" :min="startDate" :max="today" />
            </div>

            <div class="form-group">
              <label for="filter-station">Estación</label>
              <select id="filter-station" v-model="stationId" class="select">
                <option value="">Todas las estaciones</option>
                <option v-for="station in stations" :key="station.id_station" :value="String(station.id_station)">
                  {{ station.nombre || `Estación ${station.id_station}` }} · {{ station.city || 'Sin ciudad' }}
                </option>
              </select>
            </div>

            <div class="form-group">
              <label for="filter-order">Ordenar por</label>
              <select id="filter-order" v-model="sortOrder" class="select">
                <option value="date:desc">Fecha: más recientes</option>
                <option value="date:asc">Fecha: más antiguas</option>
                <option value="windspeedmph:desc">Viento: máximo primero</option>
                <option value="windspeedmph:asc">Viento: mínimo primero</option>
                <option value="tempf:desc">Temperatura: máxima primero</option>
                <option value="tempf:asc">Temperatura: mínima primero</option>
              </select>
            </div>

            <fieldset class="form-group column-picker-group">
              <legend>Datos a mostrar</legend>
              <label v-for="column in COLUMNS" :key="column.key" class="check-row">
                <input v-model="visibleColumns" type="checkbox" :value="column.key" />
                <span>{{ column.label }}</span>
              </label>
            </fieldset>

            <div class="sidebar-actions">
              <button class="button button-primary btn-block" type="submit" :disabled="loading">
                {{ loading ? 'Consultando...' : 'Consultar' }}
              </button>
              <button class="button btn-block" type="button" :disabled="loading" @click="clearFilters">
                Limpiar
              </button>
            </div>
          </form>
        </div>
      </aside>

      <!-- Panel grande de resultados a la derecha -->
      <section class="results-main-content">
        <div class="metric-strip result-metrics">
          <div class="metric"><label>Lecturas encontradas</label><strong>{{ filteredReadings.length.toLocaleString('es-MX') }}</strong></div>
          <div class="metric"><label>Velocidad promedio</label><strong>{{ formatValue(averageSpeed, ' mph') }}</strong></div>
          <div class="metric"><label>Origen</label><strong>MongoDB</strong></div>
        </div>
        <div class="extremes-strip">
          <div><span>Velocidad mínima</span><strong>{{ formatValue(minimumSpeed, ' mph') }}</strong></div>
          <div><span>Velocidad máxima</span><strong>{{ formatValue(maximumSpeed, ' mph') }}</strong></div>
        </div>

        <p v-if="errorMessage" class="error" role="alert">{{ errorMessage }}</p>
        <div class="results-export">
          <button class="button" type="button" :disabled="!filteredReadings.length" @click="exportCsv">
            {{ isLoggedIn ? 'Exportar CSV' : '🔒 Exportar CSV' }}
          </button>
          <span v-if="!isLoggedIn" class="export-hint">Ingresa para exportar los datos.</span>
        </div>
        <div class="results-export">
          <div class="filter-actions" role="group" aria-label="Vista de resultados">
            <button class="button" :class="{ 'button-primary': viewMode === 'grouped' }" type="button" :aria-pressed="viewMode === 'grouped'" @click="viewMode = 'grouped'">Agrupada</button>
            <button class="button" :class="{ 'button-primary': viewMode === 'table' }" type="button" :aria-pressed="viewMode === 'table'" @click="viewMode = 'table'">Tabla</button>
          </div>
          <span v-if="viewMode === 'grouped'" class="export-hint">Haz clic en un día u hora para expandirlo. Los valores de las filas resumen son promedios.</span>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th v-for="column in shownColumns" :key="column.key">{{ column.label }}</th></tr></thead>
            <tbody>
              <tr v-if="loading"><td :colspan="columnCount" class="loading">Consultando lecturas...</td></tr>
              <template v-else-if="viewMode === 'grouped' && groupedRows.length">
                <template v-for="row in groupedRows" :key="row.key">
                  <tr v-if="row.type !== 'reading'" :class="row.type === 'day' ? 'result-group-row' : 'result-hour-row'">
                    <template v-for="(column, index) in shownColumns" :key="column.key">
                      <td v-if="index === 0">
                        <button class="result-expand" :class="{ 'result-expand-hour': row.type === 'hour' }" type="button" :aria-expanded="row.open" @click="row.type === 'day' ? toggleDay(row.key) : toggleHour(row.key)">
                          <span class="result-chevron">{{ row.open ? '▾' : '▸' }}</span>
                          <strong>{{ row.label }}</strong>
                          <span>{{ row.count.toLocaleString('es-MX') }} lecturas</span>
                        </button>
                      </td>
                      <td v-else :title="'Promedio'">{{ summaryCell(row, column.key) }}</td>
                    </template>
                  </tr>
                  <tr v-else class="result-reading-row">
                    <td v-if="isShown('date')" class="mono">{{ formatDate(row.reading.date) }}</td>
                    <td v-if="isShown('station')">{{ stationName(row.reading.id_station) }}</td>
                    <td v-if="isShown('wind')">{{ formatValue(row.reading.windspeedmph, ' mph') }}</td>
                    <td v-if="isShown('direction')">{{ formatValue(row.reading.winddir, '°') }}</td>
                    <td v-if="isShown('temperature')">{{ formatValue(row.reading.tempf, ' °C') }}</td>
                    <td v-if="isShown('humidity')">{{ formatValue(row.reading.humidity, '%') }}</td>
                  </tr>
                </template>
              </template>
              <tr v-else-if="!visibleReadings.length">
                <td :colspan="columnCount" class="empty">{{ loaded ? 'No hay lecturas para los filtros seleccionados.' : 'Selecciona un periodo para consultar.' }}</td>
              </tr>
              <tr v-for="reading in visibleReadings" v-else-if="viewMode === 'table'" :key="`${reading.id_station}-${reading.date.toISOString()}`">
                <td v-if="isShown('date')" class="mono">{{ formatDate(reading.date) }}</td>
                <td v-if="isShown('station')">{{ stationName(reading.id_station) }}</td>
                <td v-if="isShown('wind')">{{ formatValue(reading.windspeedmph, ' mph') }}</td>
                <td v-if="isShown('direction')">{{ formatValue(reading.winddir, '°') }}</td>
                <td v-if="isShown('temperature')">{{ formatValue(reading.tempf, ' °C') }}</td>
                <td v-if="isShown('humidity')">{{ formatValue(reading.humidity, '%') }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-if="viewMode === 'table'" class="pagination-bar" aria-label="Paginación de lecturas">
          <button class="button" type="button" :disabled="page <= 1" @click="page--">← Anterior</button>
          <span aria-live="polite">Página {{ page }} de {{ pageCount }}</span>
          <button class="button" type="button" :disabled="page >= pageCount" @click="page++">Siguiente →</button>
        </div>
      </section>
    </div>
  </main>
  <footer class="site-footer"><span>Viento Norte / Resultados</span><span>GET /api/estaciones/rango</span></footer>
</template>
