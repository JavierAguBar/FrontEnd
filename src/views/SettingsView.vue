<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { apiGet, apiPost } from '@/services/api'
import { userEmail } from '@/services/auth'
import { QUANTITIES, selectedUnits } from '@/services/units'
import { fetchPreferences, savePreferences } from '@/services/preferences'
import { session } from '@/services/auth'

const units = reactive({ ...selectedUnits })
const notificaciones = ref(true)
const prefsMessage = reactive({ text: '', error: false })
const savingPrefs = ref(false)

const ROLE_OPTIONS = { 1: 'Administrador', 2: 'Registrado', 3: 'Investigador' }
const currentRole = computed(() => session.value?.nombrerol || '—')
const currentRoleId = computed(() => Number(session.value?.rol))
const requestableRoles = computed(() => Object.entries(ROLE_OPTIONS).filter(([id]) => Number(id) !== currentRoleId.value))
const requestedRole = ref('')
const reason = ref('')
const lastRequest = ref(null)
const roleMessage = reactive({ text: '', error: false })
const sendingRole = ref(false)

const passwords = reactive({ actual: '', nueva: '', repetir: '' })
const passwordMessage = reactive({ text: '', error: false })
const savingPassword = ref(false)

const setMessage = (target, text, error = false) => Object.assign(target, { text, error })

async function submitPreferences() {
  savingPrefs.value = true
  setMessage(prefsMessage, '')
  try {
    await savePreferences({ units: { ...units }, notificaciones: notificaciones.value })
    setMessage(prefsMessage, 'Preferencias guardadas.')
  } catch (error) {
    setMessage(prefsMessage, `No se pudieron guardar: ${error.message}`, true)
  } finally {
    savingPrefs.value = false
  }
}

async function loadRequest() {
  try {
    const request = await apiGet('/cuenta/solicitud-rol')
    lastRequest.value = request.estado ? request : null
  } catch {
    lastRequest.value = null
  }
}

async function submitRoleRequest() {
  sendingRole.value = true
  setMessage(roleMessage, '')
  try {
    await apiPost('/cuenta/solicitud-rol', { id_rol: Number(requestedRole.value), motivo: reason.value })
    reason.value = ''
    requestedRole.value = ''
    setMessage(roleMessage, 'Solicitud enviada. Un administrador la revisará.')
    await loadRequest()
  } catch (error) {
    setMessage(roleMessage, error.message, true)
  } finally {
    sendingRole.value = false
  }
}

async function submitPassword() {
  setMessage(passwordMessage, '')
  if (passwords.nueva !== passwords.repetir) {
    setMessage(passwordMessage, 'Las contraseñas nuevas no coinciden.', true)
    return
  }
  savingPassword.value = true
  try {
    await apiPost('/cuenta/password', { actual: passwords.actual, nueva: passwords.nueva })
    Object.assign(passwords, { actual: '', nueva: '', repetir: '' })
    setMessage(passwordMessage, 'Contraseña actualizada.')
  } catch (error) {
    setMessage(passwordMessage, error.message, true)
  } finally {
    savingPassword.value = false
  }
}

onMounted(async () => {
  try {
    const preferences = await fetchPreferences()
    notificaciones.value = preferences.notificaciones !== false
  } catch {
    // Se mantienen los valores por defecto.
  }
  Object.assign(units, selectedUnits)
  await loadRequest()
})
</script>

<template>
  <main class="page-shell settings-page">
    <div class="page-heading">
      <div><p class="section-kicker">CUENTA</p><h1>Configuración</h1></div>
      <p>{{ userEmail }} · Rol: {{ currentRole }}</p>
    </div>

    <div class="settings-grid">
      <section class="settings-card" aria-labelledby="prefs-title">
        <h2 id="prefs-title">Preferencias</h2>
        <p class="export-hint">Estas unidades se usan al iniciar sesión en Resultados y Gráficas.</p>
        <form class="settings-form" @submit.prevent="submitPreferences">
          <label v-for="(quantity, key) in QUANTITIES" :key="key">{{ quantity.label }}
            <select v-model="units[key]" class="select">
              <option v-for="(unit, unitKey) in quantity.units" :key="unitKey" :value="unitKey">{{ unit.label }}</option>
            </select>
          </label>
          <label class="check-row"><input v-model="notificaciones" type="checkbox" /> Recibir notificaciones</label>
          <button class="button button-primary" type="submit" :disabled="savingPrefs">{{ savingPrefs ? 'Guardando...' : 'Guardar preferencias' }}</button>
          <p v-if="prefsMessage.text" :class="prefsMessage.error ? 'error' : 'export-hint'" role="status">{{ prefsMessage.text }}</p>
        </form>
      </section>

      <section class="settings-card" aria-labelledby="role-title">
        <h2 id="role-title">Cambio de rol</h2>
        <p class="export-hint">Rol actual: <strong>{{ currentRole }}</strong></p>
        <p v-if="lastRequest" class="export-hint">
          Última solicitud: {{ ROLE_OPTIONS[lastRequest.id_rol_solicitado] }} · {{ lastRequest.estado }}
        </p>
        <form class="settings-form" @submit.prevent="submitRoleRequest">
          <label>Rol solicitado
            <select v-model="requestedRole" class="select" required>
              <option value="" disabled>Selecciona un rol</option>
              <option v-for="[id, name] in requestableRoles" :key="id" :value="id">{{ name }}</option>
            </select>
          </label>
          <label>Motivo
            <textarea v-model="reason" rows="3" maxlength="500" placeholder="Explica por qué necesitas este rol"></textarea>
          </label>
          <button class="button button-primary" type="submit" :disabled="sendingRole || lastRequest?.estado === 'pendiente'">
            {{ sendingRole ? 'Enviando...' : 'Solicitar cambio' }}
          </button>
          <p v-if="roleMessage.text" :class="roleMessage.error ? 'error' : 'export-hint'" role="status">{{ roleMessage.text }}</p>
        </form>
      </section>

      <section class="settings-card" aria-labelledby="password-title">
        <h2 id="password-title">Contraseña</h2>
        <form class="settings-form" @submit.prevent="submitPassword">
          <label>Contraseña actual<input v-model="passwords.actual" type="password" required autocomplete="current-password" /></label>
          <label>Nueva contraseña<input v-model="passwords.nueva" type="password" required minlength="6" autocomplete="new-password" /></label>
          <label>Repetir nueva contraseña<input v-model="passwords.repetir" type="password" required minlength="6" autocomplete="new-password" /></label>
          <button class="button button-primary" type="submit" :disabled="savingPassword">{{ savingPassword ? 'Guardando...' : 'Cambiar contraseña' }}</button>
          <p v-if="passwordMessage.text" :class="passwordMessage.error ? 'error' : 'export-hint'" role="status">{{ passwordMessage.text }}</p>
        </form>
      </section>
    </div>
  </main>
</template>
