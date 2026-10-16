<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import AuthDialog from './AuthDialog.vue'
import { isAdmin, isLoggedIn, isResearcher, logout, openAuthDialog, username } from '@/services/auth'
import { unreadCount } from '@/services/monitoring'

const router = useRouter()

function signOut() {
  logout()
  // Estaciones solo es accesible para investigadores.
  const { name, meta } = router.currentRoute.value
  if (name === 'stations' || meta.adminOnly || meta.authOnly) router.push('/')
}

const menuOpen = ref(false)
const userMenu = ref(null)
const closeMenuOutside = event => {
  if (menuOpen.value && !userMenu.value?.contains(event.target)) menuOpen.value = false
}

const connectionState = ref(null)
const connectionLabel = computed(() => {
  // El estado se inicializa con la primera respuesta de la capa API.
  if (connectionState.value === null) return 'Comprobando API'
  // Es el estado de respuesta API expuesto por services/api.js, no una prueba
  // independiente que este componente realice contra el servidor MongoDB.
  return connectionState.value ? 'MongoDB conectado' : 'API sin conexión'
})

function updateConnectionStatus(event) {
  connectionState.value = Boolean(event.detail?.connected)
}

onMounted(() => {
  window.addEventListener('api-status', updateConnectionStatus)
  document.addEventListener('click', closeMenuOutside)
})
onUnmounted(() => {
  window.removeEventListener('api-status', updateConnectionStatus)
  document.removeEventListener('click', closeMenuOutside)
})
</script>

<template>
  <header class="topbar">
    <RouterLink class="brand" to="/"><span class="brand-mark">VN</span><span>Chetuweather</span></RouterLink>
    <nav class="nav-links" aria-label="Navegación principal">
      <RouterLink to="/" active-class="active" exact-active-class="active">Inicio</RouterLink>
      <RouterLink to="/mapa" active-class="active">Mapa</RouterLink>
      <RouterLink v-if="isResearcher" to="/estaciones" active-class="active">Estaciones</RouterLink>
      <RouterLink to="/resultados" active-class="active">Resultados</RouterLink>
      <RouterLink to="/graficas" active-class="active">Gráficas</RouterLink>
      <RouterLink v-if="isAdmin" to="/admin/monitoreo" active-class="active">Monitoreo</RouterLink>
    </nav>
    <div class="header-actions">
      <RouterLink v-if="isAdmin" class="alert-bell" :class="{ 'has-alerts': unreadCount }" to="/admin/alertas" :aria-label="`Alertas: ${unreadCount} sin leer`" title="Alertas">
        <span aria-hidden="true">🔔</span><span class="alert-bell-text">Alertas</span><span v-if="unreadCount" class="alert-badge">{{ unreadCount }}</span>
      </RouterLink>
      <template v-if="isLoggedIn">
        <div ref="userMenu" class="user-menu">
          <button class="button user-menu-button" type="button" aria-haspopup="menu" :aria-expanded="menuOpen" @click="menuOpen = !menuOpen">
            <span class="user-menu-name">{{ username }}</span> <span aria-hidden="true">▾</span>
          </button>
          <div v-if="menuOpen" class="user-menu-list" role="menu">
            <RouterLink to="/configuracion" role="menuitem" @click="menuOpen = false">Configuración</RouterLink>
            <button type="button" role="menuitem" @click="menuOpen = false; signOut()">Cerrar sesión</button>
          </div>
        </div>
      </template>
      <template v-else>
        <button class="button" type="button" @click="openAuthDialog('login')">Ingresar</button>
        <button class="button button-primary" type="button" @click="openAuthDialog('register')">Registrarse</button>
      </template>
      <span class="status-pill" :class="{ 'is-offline': connectionState === false }">
        <i></i>{{ connectionLabel }}
      </span>
    </div>
  </header>

  <AuthDialog />

  <slot />
</template>
