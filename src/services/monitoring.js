import { reactive, computed, watch } from 'vue'
import { getReadingsRange, getStations } from '@/services/api'
import { isAdmin } from '@/services/auth'

const SETTINGS_KEY = 'monitor.settings'
const ALERTS_KEY = 'monitor.alerts'
const POLL_MS = 60 * 1000
const MAX_ALERTS = 200
const SENSORS = [
  { key: 'tempf', label: 'Temperatura' },
  { key: 'humidity', label: 'Humedad' },
  { key: 'windspeedmph', label: 'Viento' },
  { key: 'baromrelin', label: 'Presión' },
]

function load(key, fallback) {
  try {
    return { ...fallback, ...JSON.parse(localStorage.getItem(key)) }
  } catch {
    return fallback
  }
}

const state = reactive({
  stations: [],
  loading: false,
  error: '',
  demo: false,
  updatedAt: null,
  settings: load(SETTINGS_KEY, { warnMinutes: 30, criticalMinutes: 120, desktopNotifications: false }),
  alerts: (() => {
    try {
      const saved = JSON.parse(localStorage.getItem(ALERTS_KEY))
      return Array.isArray(saved) ? saved : []
    } catch {
      return []
    }
  })(),
})

let timer = null

export const stationHealth = computed(() => state.stations)
export const monitorState = state
export const activeAlerts = computed(() => state.alerts.filter(alert => alert.active))
export const unreadCount = computed(() => state.alerts.filter(alert => alert.active && !alert.read).length)

function persistAlerts() {
  localStorage.setItem(ALERTS_KEY, JSON.stringify(state.alerts.slice(0, MAX_ALERTS)))
}

export function saveSettings(settings) {
  Object.assign(state.settings, settings)
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings))
  evaluate(state.stations.map(station => ({ ...station })))
}

/** Clasifica una estación según el tiempo transcurrido desde su última lectura. */
function classify(station, settings, now) {
  const minutes = station.lastSeen ? Math.floor((now - station.lastSeen.getTime()) / 60000) : null
  let status = 'ok'
  if (minutes === null) status = 'nodata'
  else if (minutes >= settings.criticalMinutes) status = 'silent'
  else if (minutes >= settings.warnMinutes) status = 'delayed'
  return { ...station, minutes, status }
}

function describe(station, type) {
  const elapsed = station.minutes === null
    ? 'sin lecturas recientes'
    : `sin enviar datos desde hace ${formatMinutes(station.minutes)}`
  if (type === 'silent') return `${station.name} está ${elapsed}.`
  if (type === 'delayed') return `${station.name} muestra retraso: ${elapsed}.`
  return `${station.name} reporta sensores sin lectura: ${station.missingSensors.join(', ')}.`
}

export function formatMinutes(minutes) {
  if (minutes == null) return '—'
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 48) return `${hours} h ${minutes % 60} min`
  return `${Math.floor(hours / 24)} d`
}

/** Sincroniza las alertas con el estado actual: crea las nuevas y cierra las resueltas. */
function evaluate(stations) {
  const now = Date.now()
  const wanted = new Map()
  for (const station of stations) {
    if (station.status === 'silent' || station.status === 'nodata') wanted.set(`${station.id}:silent`, [station, 'silent', 'critical'])
    else if (station.status === 'delayed') wanted.set(`${station.id}:delayed`, [station, 'delayed', 'warning'])
    if (station.status !== 'nodata' && station.missingSensors.length) wanted.set(`${station.id}:sensors`, [station, 'sensors', 'warning'])
  }

  for (const alert of state.alerts) {
    if (alert.active && !wanted.has(alert.id)) {
      alert.active = false
      alert.resolvedAt = now
    }
  }

  const created = []
  for (const [id, [station, type, severity]] of wanted) {
    const existing = state.alerts.find(alert => alert.id === id && alert.active)
    const message = describe(station, type)
    if (existing) {
      existing.message = message
      continue
    }
    const alert = { id, stationId: station.id, stationName: station.name, type, severity, message, createdAt: now, resolvedAt: null, active: true, read: false }
    state.alerts.unshift(alert)
    created.push(alert)
  }
  state.alerts.splice(MAX_ALERTS)
  persistAlerts()

  if (state.settings.desktopNotifications && 'Notification' in window && Notification.permission === 'granted') {
    for (const alert of created) new Notification(alert.severity === 'critical' ? 'Estación sin datos' : 'Aviso de estación', { body: alert.message })
  }
}

function demoStations() {
  const minutesAgo = value => new Date(Date.now() - value * 60000)
  return [
    { id: 1, name: 'Estación Centro', city: 'Chetumal', lastSeen: minutesAgo(4), missingSensors: [] },
    { id: 2, name: 'Estación Bahía', city: 'Chetumal', lastSeen: minutesAgo(12), missingSensors: [] },
    { id: 3, name: 'Estación Norte', city: 'Calderitas', lastSeen: minutesAgo(48), missingSensors: [] },
    { id: 4, name: 'Estación Sur', city: 'Xul-Ha', lastSeen: minutesAgo(8), missingSensors: ['Viento'] },
    { id: 5, name: 'Estación Universidad', city: 'Chetumal', lastSeen: minutesAgo(380), missingSensors: [] },
    { id: 6, name: 'Estación Laguna', city: 'Bacalar', lastSeen: null, missingSensors: [] },
  ]
}

/** Calcula la última lectura de cada estación con las lecturas de ayer y hoy. */
async function fetchStations() {
  const today = new Date()
  const yesterday = new Date(today.getTime() - 86400000)
  const iso = date => date.toISOString().slice(0, 10)
  const [stations, readings] = await Promise.all([
    getStations(),
    getReadingsRange({ startDate: iso(yesterday), endDate: iso(today) }).catch(error => {
      if (error.status === 404) return []
      throw error
    }),
  ])
  const latest = new Map()
  for (const reading of readings) {
    const current = latest.get(reading.id_station)
    if (!current || reading.date > current.date) latest.set(reading.id_station, reading)
  }
  return stations.map(station => {
    const id = Number(station.id_station)
    const reading = latest.get(id)
    return {
      id,
      name: station.nombre || `Estación ${id}`,
      city: station.city || '',
      lastSeen: reading?.date ?? null,
      missingSensors: reading ? SENSORS.filter(sensor => !Number.isFinite(reading[sensor.key])).map(sensor => sensor.label) : [],
    }
  })
}

export async function refreshMonitoring() {
  state.loading = true
  state.error = ''
  let raw
  try {
    raw = await fetchStations()
    state.demo = false
  } catch (error) {
    // Sin API se muestran datos de demostración, claramente señalados en pantalla.
    state.error = `No se pudo consultar la API: ${error.message}`
    state.demo = true
    raw = demoStations()
  } finally {
    state.loading = false
  }
  const now = Date.now()
  const stations = raw.map(station => classify(station, state.settings, now))
  state.stations = stations
  state.updatedAt = new Date()
  // Las alertas de demostración no se mezclan con las reales.
  if (!state.demo) evaluate(stations)
}

export function startMonitoring() {
  if (timer) return
  refreshMonitoring()
  timer = setInterval(refreshMonitoring, POLL_MS)
}

export function stopMonitoring() {
  clearInterval(timer)
  timer = null
}

/** Mantiene el sondeo activo solo mientras haya un administrador con sesión. */
watch(isAdmin, admin => (admin ? startMonitoring() : stopMonitoring()), { immediate: true })

export function markAllRead() {
  state.alerts.forEach(alert => { alert.read = true })
  persistAlerts()
}

export function markRead(id) {
  const alert = state.alerts.find(item => item.id === id && item.active)
  if (alert) alert.read = true
  persistAlerts()
}

export function clearResolved() {
  state.alerts = state.alerts.filter(alert => alert.active)
  persistAlerts()
}

export async function enableDesktopNotifications() {
  if (!('Notification' in window)) return false
  const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission()
  saveSettings({ desktopNotifications: permission === 'granted' })
  return permission === 'granted'
}
