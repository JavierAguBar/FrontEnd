<script setup>
import { computed, onMounted, ref } from 'vue'
import { getReadingsRange, getStations } from '@/services/api'

const windSpeed = ref('—')
const windDirection = ref('Comprobando lecturas')
const temperature = ref('—')
const humidityNote = ref('Comprobando lecturas')
const windBars = ref(Array.from({ length: 8 }, () => ({ height: '4%', title: '' })))
const temperatureBars = ref(Array.from({ length: 8 }, () => ({ height: '4%', title: '' })))
const metrics = ['wind', 'temperature']
const metricIndex = ref(0)
const metric = computed(() => metrics[metricIndex.value])
const isWind = computed(() => metric.value === 'wind')
const displayValue = computed(() => isWind.value ? windSpeed.value : temperature.value)
const displayUnit = computed(() => isWind.value ? 'm/s' : '°C')
const displaySubtitle = computed(() => isWind.value ? windDirection.value : humidityNote.value)
const chartBars = computed(() => isWind.value ? windBars.value : temperatureBars.value)

/** Alterna entre viento y temperatura; dir = 1 siguiente, -1 anterior. */
function cycleMetric(dir) {
  metricIndex.value = (metricIndex.value + dir + metrics.length) % metrics.length
}
const stationName = ref('Cargando...')
const readingDate = ref('Cargando...')
const summaryNote = ref('Consultando MongoDB')

// Correspondencia de 16 sectores, en el mismo orden usado al cuantizar grados
// de brújula a pasos de 22,5°.
const directionNames = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO']

/** Convierte las últimas velocidades en barras proporcionales para el resumen. */
function buildChart(readings) {
  const orderedReadings = [...readings].reverse()
  const speeds = orderedReadings.map(reading => Number(reading.windspeedmph)).filter(Number.isFinite)
  const maximum = Math.max(...speeds, 0)
  return orderedReadings.map(reading => {
    const speed = Number(reading.windspeedmph)
    return {
      height: Number.isFinite(speed) && maximum > 0 ? `${Math.max(8, speed / maximum * 100)}%` : '4%',
      title: `${reading.date || 'Sin fecha'}: ${Number.isFinite(speed) ? speed.toFixed(2) : '—'} m/s`,
    }
  })
}

// La API entrega la temperatura ya en °C, aunque el campo se llame tempf.
const toCelsius = celsius => celsius

/** Igual que buildChart, pero con la temperatura en °C. */
function buildTemperatureChart(readings) {
  const orderedReadings = [...readings].reverse()
  const values = orderedReadings.map(reading => Number(reading.tempf)).filter(Number.isFinite).map(toCelsius)
  const maximum = Math.max(...values, 0)
  return orderedReadings.map(reading => {
    const value = Number(reading.tempf)
    const celsius = Number.isFinite(value) ? toCelsius(value) : NaN
    return {
      height: Number.isFinite(celsius) && maximum > 0 ? `${Math.max(8, Math.max(celsius, 0) / maximum * 100)}%` : '4%',
      title: `${reading.date || 'Sin fecha'}: ${Number.isFinite(celsius) ? celsius.toFixed(1) : '—'} °C`,
    }
  })
}

/** Carga estaciones y lecturas recientes en paralelo para la portada. */
async function loadHomeSummary() {
  try {
    const today = new Date().toISOString().slice(0, 10)
    const [readings, stations] = await Promise.all([
      getReadingsRange({ startDate: today, endDate: today }),
      getStations(),
    ])
    const stationNames = new Map(stations.map(station => [Number(station.id_station), station.nombre]))
    readings.sort((left, right) => right.date - left.date)
    const latestByStation = new Map()
    // Las lecturas llegan ordenadas de más reciente a más antigua; conservar
    // la primera velocidad válida por estación produce el resumen actual.
    for (const reading of readings) {
      if (!latestByStation.has(reading.id_station) && Number.isFinite(reading.windspeedmph)) {
        latestByStation.set(reading.id_station, reading)
      }
    }
    const latestReadings = [...latestByStation.values()].slice(0, 8)
    const latest = latestReadings[0]
    windBars.value = buildChart(latestReadings)
    temperatureBars.value = buildTemperatureChart(latestReadings)

    if (!latest) {
      windSpeed.value = '—'
      windDirection.value = 'Sin lecturas disponibles'
      temperature.value = '—'
      humidityNote.value = 'Sin lecturas disponibles'
      stationName.value = 'Sin estación'
      readingDate.value = 'Sin fecha'
      summaryNote.value = 'Sin lecturas disponibles'
      return
    }

    const degrees = Number(latest.winddir)
    const normalized = ((degrees % 360) + 360) % 360
    const speed = Number(latest.windspeedmph)
    windSpeed.value = Number.isFinite(speed) ? speed.toFixed(1) : '—'
    windDirection.value = Number.isFinite(degrees)
      ? `${directionNames[Math.round(normalized / 22.5) % directionNames.length]} · ${degrees.toFixed(0)}°`
      : 'Sin rumbo disponible'
    const temperatureF = Number(latest.tempf)
    const humidity = Number(latest.humidity)
    temperature.value = Number.isFinite(temperatureF) ? toCelsius(temperatureF).toFixed(1) : '—'
    humidityNote.value = Number.isFinite(humidity) ? `Humedad · ${humidity.toFixed(0)}%` : 'Sin humedad disponible'
    stationName.value = stationNames.get(latest.id_station) || `Estación ${latest.id_station}`
    readingDate.value = latest.date.toLocaleString('es-MX')
    summaryNote.value = `Última lectura · ${stationName.value}`
  } catch (error) {
    console.error('No se pudo cargar el resumen meteorológico', error)
    windSpeed.value = '—'
    windDirection.value = 'API sin conexión'
    temperature.value = '—'
    humidityNote.value = 'API sin conexión'
    stationName.value = 'Sin datos'
    readingDate.value = 'API desconectada'
    summaryNote.value = 'No se pudo consultar MongoDB'
    windBars.value = Array.from({ length: 8 }, () => ({ height: '4%', title: '' }))
    temperatureBars.value = Array.from({ length: 8 }, () => ({ height: '4%', title: '' }))
  }
}

onMounted(loadHomeSummary)
</script>

<template>
  <main class="welcome-shell">
    <section class="welcome-copy">
      <p class="eyebrow">MONITOREO METEOROLÓGICO · CHETUMAL</p>
      <h1>El clima<br /><em>en Chetumal</em></h1>
      <p class="lead">Consulta el pulso de tus estaciones, compara lecturas y encuentra patrones en un solo lugar.</p>
      <div class="welcome-actions">
        <RouterLink class="button button-primary" to="/estaciones">Ver estaciones <span>↗</span></RouterLink>
        <RouterLink class="text-link" to="/resultados">Explorar resultados <span>→</span></RouterLink>
      </div>
    </section>
    <section class="welcome-visual" aria-label="Resumen del sistema">
      <div class="wind-orbit orbit-one"></div>
      <div class="wind-orbit orbit-two"></div>
      <div class="wind-orbit orbit-three"></div>
      <div class="visual-card">
        <div class="visual-card-top"><span>LECTURA EN TIEMPO REAL · {{ isWind ? 'VIENTO' : 'TEMPERATURA' }}</span><b>●</b></div>
        <div class="metric-switch">
          <button class="metric-arrow" type="button" aria-label="Ver dato anterior" @click="cycleMetric(-1)">‹</button>
          <div class="wind-value">{{ displayValue }} <small>{{ displayUnit }}</small></div>
          <button class="metric-arrow" type="button" aria-label="Ver dato siguiente" @click="cycleMetric(1)">›</button>
        </div>
        <div class="wind-direction"><span v-if="isWind" class="direction-arrow">↗</span> {{ displaySubtitle }}</div>
        <div class="mini-chart">
          <span v-for="(bar, index) in chartBars" :key="index" :style="{ height: bar.height }" :title="bar.title"></span>
        </div>
        <div class="visual-footer"><span>{{ stationName }}</span><span>{{ readingDate }}</span></div>
      </div>
      <div class="coordinate-note">{{ summaryNote }}</div>
    </section>
  </main>
  <footer class="site-footer"><span>Viento Norte</span><span>Lectura más reciente desde MongoDB</span></footer>
</template>
