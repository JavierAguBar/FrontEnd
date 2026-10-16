<script setup>
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { formatMinutes, monitorState, refreshMonitoring, stationHealth, unreadCount } from '@/services/monitoring'

const statusFilter = ref('all')
const statusLabels = { ok: 'En línea', delayed: 'Con retraso', silent: 'Sin datos', nodata: 'Sin lecturas' }

const counts = computed(() => ({
  total: stationHealth.value.length,
  ok: stationHealth.value.filter(station => station.status === 'ok').length,
  delayed: stationHealth.value.filter(station => station.status === 'delayed').length,
  silent: stationHealth.value.filter(station => station.status === 'silent' || station.status === 'nodata').length,
  sensors: stationHealth.value.filter(station => station.missingSensors.length).length,
}))

const rows = computed(() => stationHealth.value
  .filter(station => {
    if (statusFilter.value === 'all') return true
    if (statusFilter.value === 'silent') return station.status === 'silent' || station.status === 'nodata'
    if (statusFilter.value === 'sensors') return station.missingSensors.length > 0
    return station.status === statusFilter.value
  })
  // Las estaciones con más problemas aparecen primero.
  .sort((left, right) => (right.minutes ?? Infinity) - (left.minutes ?? Infinity)))

function formatDate(date) {
  return date ? date.toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }) : '—'
}
</script>

<template>
  <main class="page-shell">
    <div class="page-heading">
      <div><p class="section-kicker">04 / ADMINISTRACIÓN</p><h1>Monitoreo</h1></div>
      <div class="heading-controls">
        <p>Estado de las estaciones y tiempo desde su último envío de datos.</p>
        <RouterLink class="button" to="/admin/alertas">
          Alertas <span v-if="unreadCount" class="alert-badge">{{ unreadCount }}</span>
        </RouterLink>
        <button class="button button-primary" type="button" :disabled="monitorState.loading" @click="refreshMonitoring">
          {{ monitorState.loading ? 'Actualizando...' : 'Actualizar' }}
        </button>
      </div>
    </div>

    <p v-if="monitorState.demo" class="monitor-demo" role="status">
      Mostrando datos de demostración. {{ monitorState.error }}
    </p>

    <section class="metric-strip monitor-metrics" aria-label="Resumen del estado">
      <div class="metric"><label>Estaciones</label><strong>{{ counts.total }}</strong></div>
      <div class="metric"><label>En línea</label><strong class="text-ok">{{ counts.ok }}</strong></div>
      <div class="metric"><label>Con retraso</label><strong class="text-warn">{{ counts.delayed }}</strong></div>
      <div class="metric"><label>Sin datos</label><strong class="text-bad">{{ counts.silent }}</strong></div>
    </section>

    <div class="monitor-toolbar">
      <label>Mostrar
        <select v-model="statusFilter" class="select">
          <option value="all">Todas las estaciones</option>
          <option value="ok">En línea</option>
          <option value="delayed">Con retraso</option>
          <option value="silent">Sin datos</option>
          <option value="sensors">Con sensores fallando ({{ counts.sensors }})</option>
        </select>
      </label>
      <span v-if="monitorState.updatedAt" class="export-hint">
        Actualizado {{ monitorState.updatedAt.toLocaleTimeString('es-MX') }} · se renueva cada minuto
      </span>
    </div>

    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>ID</th><th>Estación</th><th>Ciudad</th><th>Estado</th><th>Última lectura</th><th>Sin datos desde</th><th>Sensores</th></tr></thead>
        <tbody>
          <tr v-if="monitorState.loading && !rows.length"><td colspan="6" class="loading">Consultando estaciones...</td></tr>
          <tr v-else-if="!rows.length"><td colspan="6" class="empty">No hay estaciones para este filtro.</td></tr>
          <tr v-for="station in rows" v-else :key="station.id">
            <td class="mono">{{ station.id }}</td>
            <td>{{ station.name }}</td>
            <td>{{ station.city || '—' }}</td>
            <td><span class="status-badge" :class="`is-${station.status}`">{{ statusLabels[station.status] }}</span></td>
            <td class="mono">{{ formatDate(station.lastSeen) }}</td>
            <td>{{ formatMinutes(station.minutes) }}</td>
            <td>
              <span v-if="station.missingSensors.length" class="status-badge is-delayed">Sin lectura: {{ station.missingSensors.join(', ') }}</span>
              <span v-else class="export-hint">Completos</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </main>
  <footer class="site-footer"><span>Viento Norte / Monitoreo</span><span>Panel de administración</span></footer>
</template>
