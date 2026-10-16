// La URL puede definirse en el build de Vite o por configuración global antes
// de cargar la aplicación; el valor por defecto es para desarrollo local.
const configuredBase = import.meta.env.VITE_API_BASE_URL || window.APP_CONFIG?.apiBase
const API_BASE = (configuredBase || 'http://localhost:5000/api').replace(/\/+$/, '')

export class ApiError extends Error {
  /** Error HTTP que conserva el estado y el cuerpo recibido del backend. */
  constructor(message, { status, detail, payload } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
    this.payload = payload
  }
}

function notifyConnection(connected) {
  // El layout escucha este evento para actualizar el indicador del encabezado.
  window.dispatchEvent(new CustomEvent('api-status', { detail: { connected } }))
}

const TOKEN_KEY = 'auth.accessToken'

/** Cabecera Authorization con el token de la sesión, si existe. */
function authHeaders() {
  const token = localStorage.getItem(TOKEN_KEY)
  return token ? { Authorization: `Bearer ${token}` } : {}
}

/** Envía un cuerpo JSON por POST sin notificar el estado de conexión del encabezado. */
export async function apiPost(path, body) {
  const endpoint = path.startsWith('/') ? path : `/${path}`
  const response = await fetch(`${API_BASE}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
  })
  let payload
  try {
    payload = await response.json()
  } catch {
    payload = undefined
  }
  if (!response.ok) {
    const detail = Array.isArray(payload?.detail) ? payload.detail.map(item => item.msg).join(', ') : payload?.detail
    throw new ApiError(detail || `HTTP ${response.status}`, { status: response.status, detail, payload })
  }
  return payload
}

/** Ejecuta una petición GET y mantiene el error HTTP accesible al consumidor. */
export async function apiGet(path, { signal } = {}) {
  const endpoint = path.startsWith('/') ? path : `/${path}`
  try {
    const response = await fetch(`${API_BASE}${endpoint}`, { signal, headers: authHeaders() })
    // Una respuesta HTTP inferior a 500 indica que respondió la API; esto no
    // equivale a comprobar directamente la disponibilidad de MongoDB.
    notifyConnection(response.status < 500)
    if (!response.ok) {
      let payload
      try {
        payload = await response.json()
      } catch {
        payload = undefined
      }
      const detail = payload?.detail
      const message = detail || payload?.error || `HTTP ${response.status}`
      throw new ApiError(message, { status: response.status, detail, payload })
    }

    const data = await response.json()
    notifyConnection(true)
    return data
  } catch (error) {
    if (!(error instanceof ApiError) || error.status >= 500) notifyConnection(false)
    throw error
  }
}

/** Obtiene el inventario de estaciones desde la ruta pública del backend. */
export function getStations(options) {
  return apiGet('/estaciones/estacion', options)
}

/** Centraliza columnas y filtro de estaciones para las búsquedas por fecha. */
function buildRangeParameters({ startDate, endDate, stationIds = [] }) {
  const parameters = new URLSearchParams({
    columnas: 'date,id_station,viento,temperatura,humedad,presion,lluvia,sistema',
  })
  if (stationIds.length) parameters.set('estaciones', stationIds.join(','))
  return { parameters, startDate, endDate }
}

/**
 * Adapta el documento meteorológico al modelo usado por las vistas Vue.
 * Los códigos numéricos corresponden al catálogo de parámetros del equipo.
 */
function normalizeReading(reading) {
  const dateValue = reading.date?.$date ?? reading.date
  const date = dateValue?.$numberLong
    ? new Date(Number(dateValue.$numberLong))
    : new Date(dateValue)
  const numberAt = (group, key) => {
    const value = reading[group]?.[key]
    return value == null || value === '' ? null : Number(value)
  }

  return {
    ...reading,
    date,
    id_station: Number(reading.id_station),
    tempf: numberAt('temperatura', '11'),
    tempinf: numberAt('temperatura', '13'),
    dewPoint: numberAt('temperatura', '15'),
    dewPointin: numberAt('temperatura', '16'),
    feelsLike: numberAt('temperatura', '17'),
    feelsLikein: numberAt('temperatura', '18'),
    humidity: numberAt('humedad', '12'),
    humidityin: numberAt('humedad', '14'),
    windspeedmph: numberAt('viento', '21'),
    windgustmph: numberAt('viento', '22'),
    maxdailygust: numberAt('viento', '23'),
    winddir: numberAt('viento', '24'),
    winddir_avg10m: numberAt('viento', '25'),
    hourlyrainin: numberAt('lluvia', '31'),
    eventrainin: numberAt('lluvia', '32'),
    dailyrainin: numberAt('lluvia', '33'),
    weeklyrainin: numberAt('lluvia', '34'),
    monthlyrainin: numberAt('lluvia', '35'),
    yearlyrainin: numberAt('lluvia', '36'),
    totalrainin: numberAt('lluvia', '37'),
    baromrelin: numberAt('presion', '41'),
    baromabsin: numberAt('presion', '42'),
    battout: numberAt('sistema', '51'),
  }
}

/** Usa la ruta de día para una fecha única y la de rango para varios días. */
export async function getReadingsRange({ startDate, endDate, stationIds = [] }, options) {
  if (!startDate || !endDate) throw new Error('Debes indicar las fechas inicial y final.')
  if (startDate > endDate) throw new Error('La fecha inicial no puede ser posterior a la fecha final.')

  const { parameters } = buildRangeParameters({ startDate, endDate, stationIds })
  const singleDay = startDate === endDate
  parameters.set(singleDay ? 'day' : 'fechaInicio', startDate)
  if (singleDay) {
    const query = await apiGet(`/estaciones/busqueda?${parameters}`, options)
    return query.map(normalizeReading).filter(reading => Number.isFinite(reading.date.getTime()))
  }

  parameters.set('fechaFin', endDate)
  const query = await apiGet(`/estaciones/rango?${parameters}`, options)
  return query.map(normalizeReading).filter(reading => Number.isFinite(reading.date.getTime()))
}
