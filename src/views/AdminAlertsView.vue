<script setup>
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import {
  clearResolved, enableDesktopNotifications, markAllRead, markRead, monitorState, saveSettings, unreadCount,
} from '@/services/monitoring'

const filter = ref('active')
const warnMinutes = ref(monitorState.settings.warnMinutes)
const criticalMinutes = ref(monitorState.settings.criticalMinutes)
const settingsMessage = ref('')
const desktopSupported = 'Notification' in window

const typeLabels = { silent: 'Sin datos', delayed: 'Retraso', sensors: 'Sensores' }
const alerts = computed(() => monitorState.alerts.filter(alert =>
  filter.value === 'all' || (filter.value === 'active' ? alert.active : !alert.active)))

function formatDate(value) {
  return value ? new Date(value).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }) : '—'
}

function applySettings() {
  const warn = Number(warnMinutes.value)
  const critical = Number(criticalMinutes.value)
  if (!Number.isInteger(warn) || !Number.isInteger(critical) || warn < 1 || critical <= warn) {
    settingsMessage.value = 'El límite crítico debe ser mayor que el de aviso, en minutos enteros.'
    return
  }
  saveSettings({ warnMinutes: warn, criticalMinutes: critical })
  settingsMessage.value = 'Umbrales guardados.'
}

async function toggleDesktop() {
  if (monitorState.settings.desktopNotifications) saveSettings({ desktopNotifications: false })
  else if (!await enableDesktopNotifications()) settingsMessage.value = 'El navegador no concedió permiso para notificar.'
}
</script>

<template>
  <main class="page-shell">
    <div class="page-heading">
      <div><p class="section-kicker">05 / ADMINISTRACIÓN</p><h1>Alertas</h1></div>
      <div class="heading-controls">
        <p>Avisos cuando una estación falla o deja de enviar datos.</p>
        <RouterLink class="button" to="/admin/monitoreo">← Monitoreo</RouterLink>
      </div>
    </div>

    <p v-if="monitorState.demo" class="monitor-demo" role="status">
      La API no responde: las alertas reales se generarán cuando haya conexión.
    </p>

    <div class="alerts-layout">
      <aside class="alerts-settings results-sidebar">
        <div class="sidebar-sticky-content">
          <div class="sidebar-header"><h3>Configuración</h3></div>
          <form class="sidebar-form" @submit.prevent="applySettings">
            <div class="form-group">
              <label for="warn-minutes">Aviso tras (min sin datos)</label>
              <input id="warn-minutes" v-model="warnMinutes" type="number" min="1" step="1" />
            </div>
            <div class="form-group">
              <label for="critical-minutes">Crítico tras (min sin datos)</label>
              <input id="critical-minutes" v-model="criticalMinutes" type="number" min="2" step="1" />
            </div>
            <button class="button button-primary btn-block" type="submit">Guardar umbrales</button>
            <button v-if="desktopSupported" class="button btn-block" type="button" @click="toggleDesktop">
              {{ monitorState.settings.desktopNotifications ? 'Desactivar avisos del navegador' : 'Activar avisos del navegador' }}
            </button>
            <p v-if="settingsMessage" class="export-hint" role="status">{{ settingsMessage }}</p>
          </form>
        </div>
      </aside>

      <section class="alerts-list-wrap">
        <div class="monitor-toolbar">
          <label>Ver
            <select v-model="filter" class="select">
              <option value="active">Activas</option>
              <option value="resolved">Resueltas</option>
              <option value="all">Todas</option>
            </select>
          </label>
          <button class="button" type="button" :disabled="!unreadCount" @click="markAllRead">Marcar todo como leído</button>
          <button class="button" type="button" @click="clearResolved">Borrar resueltas</button>
        </div>

        <p v-if="!alerts.length" class="empty alerts-empty">No hay alertas en esta vista.</p>
        <ul v-else class="alerts-list">
          <li v-for="alert in alerts" :key="alert.id + alert.createdAt" class="alert-item"
              :class="[`is-${alert.severity}`, { 'is-unread': alert.active && !alert.read, 'is-resolved': !alert.active }]">
            <div>
              <strong>{{ alert.stationName }} <span class="mono">(ID {{ alert.stationId }})</span></strong>
              <span class="status-badge" :class="alert.severity === 'critical' ? 'is-silent' : 'is-delayed'">{{ typeLabels[alert.type] }}</span>
              <p>{{ alert.message }}</p>
              <small>
                Desde {{ formatDate(alert.createdAt) }}
                <template v-if="!alert.active"> · resuelta {{ formatDate(alert.resolvedAt) }}</template>
              </small>
            </div>
            <button v-if="alert.active && !alert.read" class="button" type="button" @click="markRead(alert.id)">Marcar leída</button>
          </li>
        </ul>
      </section>
    </div>
  </main>
  <footer class="site-footer"><span>Viento Norte / Alertas</span><span>Panel de administración</span></footer>
</template>
