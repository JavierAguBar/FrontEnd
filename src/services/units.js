import { reactive, watch } from 'vue'

const STORAGE_KEY = 'preferences.units'

/**
 * Magnitudes convertibles. La API entrega unidades del SI (m/s, °C, hPa, mm),
 * que son la unidad `base`; `fromBase` convierte hacia la unidad elegida.
 */
export const QUANTITIES = {
  speed: {
    label: 'Viento',
    base: 'ms',
    units: {
      ms: { label: 'm/s', fromBase: v => v, decimals: 1 },
      mph: { label: 'mph', fromBase: v => v / 0.44704, decimals: 1 },
      kmh: { label: 'km/h', fromBase: v => v * 3.6, decimals: 1 },
      kn: { label: 'kn', fromBase: v => v / 0.514444, decimals: 1 },
    },
  },
  temperature: {
    label: 'Temperatura',
    base: 'c',
    units: {
      c: { label: '°C', fromBase: v => v, decimals: 1 },
      f: { label: '°F', fromBase: v => v * 9 / 5 + 32, decimals: 1 },
      k: { label: 'K', fromBase: v => v + 273.15, decimals: 1 },
    },
  },
  pressure: {
    label: 'Presión',
    base: 'hpa',
    units: {
      hpa: { label: 'hPa', fromBase: v => v, decimals: 1 },
      inhg: { label: 'inHg', fromBase: v => v / 33.8639, decimals: 2 },
      mmhg: { label: 'mmHg', fromBase: v => v * 0.750062, decimals: 1 },
    },
  },
  rain: {
    label: 'Lluvia',
    base: 'mm',
    units: {
      mm: { label: 'mm', fromBase: v => v, decimals: 1 },
      in: { label: 'in', fromBase: v => v / 25.4, decimals: 2 },
    },
  },
}

function loadSaved() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}
  } catch {
    return {}
  }
}

const saved = loadSaved()
export const selectedUnits = reactive(Object.fromEntries(
  Object.entries(QUANTITIES).map(([key, quantity]) => [
    key,
    quantity.units[saved[key]] ? saved[key] : quantity.base,
  ]),
))

watch(selectedUnits, () => localStorage.setItem(STORAGE_KEY, JSON.stringify(selectedUnits)), { deep: true })

/** Convierte un valor en unidad base a la unidad elegida; conserva los nulos. */
export function convert(quantity, value) {
  if (!Number.isFinite(value)) return value
  return QUANTITIES[quantity].units[selectedUnits[quantity]].fromBase(value)
}

export const unitLabel = quantity => QUANTITIES[quantity].units[selectedUnits[quantity]].label
export const unitDecimals = quantity => QUANTITIES[quantity].units[selectedUnits[quantity]].decimals
