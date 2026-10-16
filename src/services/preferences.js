import { watch } from 'vue'
import { apiGet, apiPost } from '@/services/api'
import { isLoggedIn } from '@/services/auth'
import { QUANTITIES, selectedUnits } from '@/services/units'

// Valores guardados en la colección `usuarios` ↔ claves de unidad de la interfaz.
const PREFERENCE_KEYS = { speed: 'viento', temperature: 'temperatura', pressure: 'presion', rain: 'lluvia' }
const TO_STORED = { rain: { in: 'in/hr', mm: 'mm/hr' }, temperature: { c: 'C', f: 'F', k: 'K' } }
const FROM_STORED = { rain: { 'in/hr': 'in', 'mm/hr': 'mm' }, temperature: { C: 'c', F: 'f', K: 'k' } }

const toStored = (quantity, unit) => TO_STORED[quantity]?.[unit] ?? unit
const fromStored = (quantity, value) => FROM_STORED[quantity]?.[value] ?? String(value ?? '').toLowerCase()

/** Aplica las preferencias del usuario como unidades iniciales. */
export function applyPreferences(preferences = {}) {
  for (const [quantity, key] of Object.entries(PREFERENCE_KEYS)) {
    const unit = fromStored(quantity, preferences[key])
    if (QUANTITIES[quantity].units[unit]) selectedUnits[quantity] = unit
  }
}

export const fetchPreferences = () => apiGet('/preferencias')

/** Guarda unidades y notificaciones en el perfil del usuario. */
export async function savePreferences({ units, notificaciones }) {
  const body = Object.fromEntries(
    Object.entries(PREFERENCE_KEYS).map(([quantity, key]) => [key, toStored(quantity, units[quantity])]),
  )
  if (typeof notificaciones === 'boolean') body.notificaciones = notificaciones
  const response = await apiPost('/preferencias', body)
  applyPreferences(response.preferences)
  return response.preferences
}

// Al iniciar sesión (o cargar la página con sesión activa) las preferencias
// del perfil fijan las unidades iniciales.
watch(isLoggedIn, async loggedIn => {
  if (!loggedIn) return
  try {
    applyPreferences(await fetchPreferences())
  } catch {
    // Sin preferencias disponibles se conservan las unidades locales.
  }
}, { immediate: true })
