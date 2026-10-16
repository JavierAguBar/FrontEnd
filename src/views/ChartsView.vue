<script setup>
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { getReadingsRange, getStations } from '@/services/api'
import { loadExternalScript } from '@/utils/externalScript'
import { isLoggedIn, openAuthDialog } from '@/services/auth'

const today = new Date().toISOString().slice(0, 10)
// Sin sesión solo se consultan los últimos 7 días (hoy incluido).
const oldestGuestDate = (() => {
  const date = new Date(`${today}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() - 6)
  return date.toISOString().slice(0, 10)
})()
const minDate = computed(() => isLoggedIn.value ? undefined : oldestGuestDate)
const startDate = ref(today)
const endDate = ref(today)
const metric = ref('windspeedmph')
const stationId = ref('')
const stations = ref([])
const readings = ref([])
const loading = ref(false)
const loaded = ref(false)
const errorMessage = ref('')
const chartCanvas = ref(null)
const chartType = ref('line')
const stationColors = reactive({})
const chartStationIds = ref([])
const chartTypes = {
  line: 'Líneas',
  area: 'Área',
  bar: 'Barras',
  points: 'Puntos',
}
let chart = null

const metrics = {
  windspeedmph: { label: 'Velocidad del viento', unit: 'mph' },
  tempf: { label: 'Temperatura', unit: '°C' },
  humidity: { label: 'Humedad exterior', unit: '%' },
  windgustmph: { label: 'Ráfaga de viento', unit: 'mph' },
  baromrelin: { label: 'Presión relativa', unit: 'inHg' },
  hourlyrainin: { label: 'Lluvia por hora', unit: 'in' },
}
// Paleta cíclica: permite distinguir estaciones incluso si se consultan más
// series que colores definidos.
const colors = ['#0f5d5b', '#d86b48', '#628b35', '#477b9a', '#a34c67', '#8a741f', '#6d58a4', '#338d8c']
const metricInfo = computed(() => metrics[metric.value])
const metricValues = computed(() => readings.value
  .map(reading => reading[metric.value])
  .filter(Number.isFinite))
const average = computed(() => metricValues.value.length
  ? metricValues.value.reduce((sum, value) => sum + value, 0) / metricValues.value.length
  : null)
const minimum = computed(() => metricValues.value.length ? Math.min(...metricValues.value) : null)
const maximum = computed(() => metricValues.value.length ? Math.max(...metricValues.value) : null)

function formatValue(value) {
  return Number.isFinite(value) ? `${value.toLocaleString('es-MX', { maximumFractionDigits: 1 })} ${metricInfo.value.unit}` : '—'
}

function stationLabel(id) {
  const station = stations.value.find(item => Number(item.id_station) === id)
  return station?.nombre || `Estación ${id}`
}

/** Agrupa lecturas por estación/intervalo y recrea la instancia Chart.js. */
function renderChart() {
  if (!chartCanvas.value || !window.Chart) return
  if (chart) chart.destroy()

  const daySpan = Math.floor(
    (new Date(`${endDate.value}T00:00:00Z`) - new Date(`${startDate.value}T00:00:00Z`)) / 86400000,
  ) + 1
  const bucketSize = daySpan > 2 ? 60 * 60 * 1000 : 10 * 60 * 1000
  const grouped = new Map()

  for (const reading of readings.value) {
    // Intervalos largos usan una hora para limitar puntos; periodos cortos
    // mantienen resolución de diez minutos.
    const value = reading[metric.value]
    if (!Number.isFinite(value)) continue
    const bucket = Math.floor(reading.date.getTime() / bucketSize) * bucketSize
    const key = `${reading.id_station}:${bucket}`
    const current = grouped.get(key) || {
      stationId: reading.id_station,
      bucket,
      total: 0,
      count: 0,
      min: Infinity,
      max: -Infinity,
    }
    current.total += value
    current.count += 1
    current.min = Math.min(current.min, value)
    current.max = Math.max(current.max, value)
    grouped.set(key, current)
  }

  const groupedReadings = [...grouped.values()]
  const buckets = [...new Set(groupedReadings.map(item => item.bucket))].sort((left, right) => left - right)
  const stationIds = [...new Set(groupedReadings.map(item => item.stationId))]
  const byStationAndBucket = new Map(groupedReadings.map(item => [`${item.stationId}:${item.bucket}`, item]))
  const labels = buckets.map(value => new Date(value).toLocaleString('es-MX', {
    ...(daySpan > 2 ? { day: 'numeric', month: 'short', hour: '2-digit' } : { hour: '2-digit', minute: '2-digit' }),
  }))
  chartStationIds.value = stationIds
  const isBar = chartType.value === 'bar'
  const datasets = stationIds.map((id, index) => {
    // El color elegido por el usuario se conserva entre consultas.
    if (!stationColors[id]) stationColors[id] = colors[index % colors.length]
    const color = stationColors[id]
    return {
      label: stationLabel(id),
      data: buckets.map(bucket => {
        const item = byStationAndBucket.get(`${id}:${bucket}`)
        return item ? item.total / item.count : null
      }),
      borderColor: color,
      backgroundColor: color,
      borderWidth: isBar ? 1 : 2,
      pointRadius: chartType.value === 'points' ? 3 : (buckets.length > 48 ? 0 : 2),
      showLine: chartType.value !== 'points',
      fill: chartType.value === 'area',
      tension: 0.25,
      spanGaps: true,
    }
  })

  chart = new window.Chart(chartCanvas.value, {
    type: isBar ? 'bar' : 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { intersect: false, mode: 'index' },
      plugins: { legend: { display: stationIds.length > 1 } },
      scales: {
        x: { grid: { display: false }, ticks: { maxTicksLimit: 10, maxRotation: 0 } },
        y: { title: { display: true, text: metricInfo.value.unit } },
      },
    },
  })
}

/** Cambia el color de una estación y redibuja la gráfica. */
function setStationColor(id, color) {
  stationColors[id] = color
  renderChart()
}

/** Comprueba el intervalo, obtiene lecturas y actualiza métricas y gráfica. */
async function loadChartData() {
  errorMessage.value = ''
  loaded.value = false
  const daySpan = Math.floor(
    (new Date(`${endDate.value}T00:00:00Z`) - new Date(`${startDate.value}T00:00:00Z`)) / 86400000,
  ) + 1
  if (!startDate.value || !endDate.value || daySpan < 1) {
    errorMessage.value = 'Indica un rango de fechas válido.'
    return
  }
  if (!isLoggedIn.value && startDate.value < oldestGuestDate) {
    errorMessage.value = 'Sin iniciar sesión solo puedes consultar los últimos 7 días.'
    return
  }
  if (daySpan > 31) {
    errorMessage.value = 'El rango máximo de consulta es de 31 días.'
    return
  }

  loading.value = true
  try {
    const queriedReadings = await getReadingsRange({
      startDate: startDate.value,
      endDate: endDate.value,
      stationIds: stationId.value ? [stationId.value] : [],
    })
    readings.value = stationId.value
      ? queriedReadings.filter(reading => reading.id_station === Number(stationId.value))
      : queriedReadings
    loaded.value = true
    renderChart()
  } catch (error) {
    if (error.status === 404) {
      readings.value = []
      loaded.value = true
      chartStationIds.value = []
      if (chart) {
        chart.destroy()
        chart = null
      }
    } else {
      errorMessage.value = `No se pudieron cargar las lecturas: ${error.message}`
    }
  } finally {
    loading.value = false
  }
}

/** Aplica uno de los periodos rápidos disponibles y consulta sus lecturas. */
async function setPeriod(period) {
  if (period === 'today') {
    startDate.value = today
    endDate.value = today
  } else {
    const start = new Date(`${today}T00:00:00Z`)
    start.setUTCDate(start.getUTCDate() - 6)
    startDate.value = start.toISOString().slice(0, 10)
    endDate.value = today
  }
  await loadChartData()
}

// Al cerrar sesión se ajusta el rango consultado al límite de invitados.
watch(isLoggedIn, loggedIn => {
  if (!loggedIn && startDate.value < oldestGuestDate) {
    startDate.value = oldestGuestDate
    if (endDate.value < oldestGuestDate) endDate.value = today
  }
})

onMounted(async () => {
  try {
    await loadExternalScript('https://cdn.jsdelivr.net/npm/chart.js@4.4.9/dist/chart.umd.min.js', 'Chart')
    stations.value = await getStations()
    await loadChartData()
  } catch (error) {
    errorMessage.value = `No se pudo inicializar la gráfica: ${error.message}`
  }
})

onUnmounted(() => {
  if (chart) chart.destroy()
})
</script>

<template>
  <main class="page-shell graph-page">
    <div class="page-heading">
      <div><p class="section-kicker">03 / HISTORIAL</p><h1>Gráficas</h1></div>
      <p>Compara las mediciones meteorológicas por estación y periodo.</p>
    </div>

    <div class="graph-periods" role="group" aria-label="Periodo de consulta">
      <button class="graph-period" type="button" :disabled="loading" @click="setPeriod('today')">Hoy</button>
      <button class="graph-period" type="button" :disabled="loading" @click="setPeriod('week')">Últimos 7 días</button>
    </div>
    <section class="toolbar graph-filters" aria-label="Filtros de gráficas">
      <label>Medición
        <select v-model="metric" class="select" @change="renderChart">
          <option v-for="(info, key) in metrics" :key="key" :value="key">{{ info.label }}</option>
        </select>
      </label>
      <label>Tipo de gráfica
        <select v-model="chartType" class="select" @change="renderChart">
          <option v-for="(label, key) in chartTypes" :key="key" :value="key">{{ label }}</option>
        </select>
      </label>
      <label>Estación
        <select v-model="stationId" class="select">
          <option value="">Todas las estaciones</option>
          <option v-for="station in stations" :key="station.id_station" :value="String(station.id_station)">
            {{ station.nombre || `Estación ${station.id_station}` }} · {{ station.city || 'Sin ciudad' }}
          </option>
        </select>
      </label>
      <label>Desde<input v-model="startDate" type="date" :min="minDate" :max="endDate || today" /></label>
      <label>Hasta<input v-model="endDate" type="date" :min="startDate" :max="today" /></label>
      <button class="button button-primary" type="button" :disabled="loading" @click="loadChartData">
        {{ loading ? 'Consultando...' : 'Consultar' }}
      </button>
    </section>

    <p v-if="!isLoggedIn" class="graph-limit-note">
      Sin iniciar sesión solo puedes ver datos de los últimos 7 días.
      <button class="text-link" type="button" @click="openAuthDialog('login')">Ingresar</button>
    </p>

    <section class="metric-strip graph-summary" aria-label="Resumen de mediciones">
      <div class="metric"><label>Promedio del periodo</label><strong>{{ formatValue(average) }}</strong></div>
      <div class="metric"><label>Mínimo registrado</label><strong>{{ formatValue(minimum) }}</strong></div>
      <div class="metric"><label>Máximo registrado</label><strong>{{ formatValue(maximum) }}</strong></div>
    </section>

    <section class="graph-panel" aria-label="Gráfica de mediciones">
      <div class="graph-panel-heading">
        <div><h2>{{ metricInfo.label }} · {{ metricInfo.unit }}</h2><p>Promedio por intervalo de 10 minutos (una hora para rangos mayores a 2 días).</p></div>
        <span class="graph-count"><strong>{{ readings.length.toLocaleString('es-MX') }}</strong> lecturas</span>
      </div>
      <div class="graph-chart-wrap"><canvas ref="chartCanvas" aria-label="Serie histórica de mediciones" role="img"></canvas></div>
      <p v-if="loading" class="graph-message" aria-live="polite">Cargando mediciones...</p>
      <p v-else-if="errorMessage" class="graph-message error" role="alert">{{ errorMessage }}</p>
      <p v-else-if="loaded && !metricValues.length" class="graph-message" aria-live="polite">No hay mediciones disponibles para este periodo y métrica.</p>
      <div class="graph-legend" aria-label="Leyenda de la gráfica"><span><i class="legend-average"></i>Promedio por intervalo</span></div>
      <div v-if="chartStationIds.length" class="station-colors" aria-label="Colores de las estaciones">
        <label v-for="id in chartStationIds" :key="id" class="station-color">
          <input type="color" :value="stationColors[id]" :aria-label="`Color de ${stationLabel(id)}`" @input="setStationColor(id, $event.target.value)" />
          <span>{{ stationLabel(id) }}</span>
        </label>
      </div>
    </section>
  </main>
  <footer class="site-footer"><span>Viento Norte / Gráficas</span><span>GET /api/estaciones/rango</span></footer>
</template>
