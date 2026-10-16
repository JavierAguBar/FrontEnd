import { computed, reactive } from 'vue'
import { apiGet, apiPost } from '@/services/api'

const ACCESS_KEY = 'auth.accessToken'
const REFRESH_KEY = 'auth.refreshToken'
const EMAIL_KEY = 'auth.email'
const USERNAME_KEY = 'auth.username'

/** Lee el payload de un JWT sin validarlo; la API valida la firma en cada petición. */
function decodeToken(token) {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(decodeURIComponent(escape(atob(payload))))
  } catch {
    return null
  }
}

function readSession() {
  const token = localStorage.getItem(ACCESS_KEY)
  const payload = token ? decodeToken(token) : null
  // Un token ausente, ilegible o vencido equivale a no haber iniciado sesión.
  if (!payload || (payload.exp && payload.exp * 1000 < Date.now())) {
    localStorage.removeItem(ACCESS_KEY)
    localStorage.removeItem(REFRESH_KEY)
    localStorage.removeItem(EMAIL_KEY)
    localStorage.removeItem(USERNAME_KEY)
    return null
  }
  return payload
}

const state = reactive({ session: readSession(), email: localStorage.getItem(EMAIL_KEY) || '', username: localStorage.getItem(USERNAME_KEY) || '', dialogMode: null })

export const isLoggedIn = computed(() => Boolean(state.session))
export const session = computed(() => state.session)
const roleName = () => String(state.session?.nombrerol || '').toLowerCase()
export const isAdmin = computed(() => roleName() === 'administrador')
// Investigadores y administradores acceden a Estaciones.
export const isResearcher = computed(() => roleName() === 'investigador' || isAdmin.value)
export const userEmail = computed(() => state.email)
export const username = computed(() => state.username || state.email)

/** Obtiene el nombre de usuario del perfil; el token solo trae el rol. */
async function loadProfile() {
  try {
    const profile = await apiGet('/cuenta/perfil')
    state.username = profile.username
    localStorage.setItem(USERNAME_KEY, profile.username)
  } catch {
    // Se muestra el correo mientras no haya perfil disponible.
  }
}
if (state.session) loadProfile()
export const authDialogMode = computed(() => state.dialogMode)

export function openAuthDialog(mode = 'login') {
  state.dialogMode = mode
}

export function closeAuthDialog() {
  state.dialogMode = null
}

function saveTokens({ access_token: access, refresh_token: refresh }) {
  localStorage.setItem(ACCESS_KEY, access)
  if (refresh) localStorage.setItem(REFRESH_KEY, refresh)
  state.session = readSession()
}

/** Inicia sesión con correo o nombre de usuario. */
export async function login(email, password) {
  const username = email.trim()
  saveTokens(await apiPost('/login', { username, password }))
  localStorage.setItem(EMAIL_KEY, username)
  state.email = username
  state.username = ''
  await loadProfile()
}

/** Registra un usuario normal con su correo y abre su sesión. */
export async function register({ email, name, lastname, password }) {
  const correo = email.trim().toLowerCase()
  await apiPost('/signup', { correo, username: correo, name: name.trim(), lastname: lastname.trim(), password })
  await login(correo, password)
}

export function logout() {
  localStorage.removeItem(ACCESS_KEY)
  localStorage.removeItem(REFRESH_KEY)
  localStorage.removeItem(EMAIL_KEY)
  localStorage.removeItem(USERNAME_KEY)
  state.email = ''
  state.username = ''
  state.session = null
}
