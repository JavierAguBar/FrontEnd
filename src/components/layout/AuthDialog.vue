<script setup>
import { computed, ref, watch } from 'vue'
import { authDialogMode, closeAuthDialog, login, openAuthDialog, register } from '@/services/auth'

const email = ref('')
const password = ref('')
const name = ref('')
const lastname = ref('')
const errorMessage = ref('')
const submitting = ref(false)
const dialog = ref(null)

const isRegister = computed(() => authDialogMode.value === 'register')

watch(authDialogMode, mode => {
  errorMessage.value = ''
  password.value = ''
  if (mode && !dialog.value.open) dialog.value.showModal()
  if (!mode && dialog.value.open) dialog.value.close()
})

async function submit() {
  errorMessage.value = ''
  submitting.value = true
  try {
    if (isRegister.value) {
      await register({ email: email.value, name: name.value, lastname: lastname.value, password: password.value })
    } else {
      await login(email.value, password.value)
    }
    password.value = ''
    closeAuthDialog()
  } catch (error) {
    errorMessage.value = error.status === 401
      ? 'Usuario/correo o contraseña incorrectos.'
      : `No se pudo completar la operación: ${error.message}`
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <dialog ref="dialog" class="auth-dialog" aria-labelledby="auth-title" @close="closeAuthDialog" @click.self="closeAuthDialog">
    <form class="auth-form" @submit.prevent="submit">
      <div class="auth-heading">
        <h2 id="auth-title">{{ isRegister ? 'Crear cuenta' : 'Ingresar' }}</h2>
        <button class="button-icon-close" type="button" aria-label="Cerrar" @click="closeAuthDialog">✕</button>
      </div>
      <template v-if="isRegister">
        <label>Nombre<input v-model="name" type="text" required autocomplete="given-name" /></label>
        <label>Apellidos<input v-model="lastname" type="text" required autocomplete="family-name" /></label>
      </template>
      <label>{{ isRegister ? 'Correo electrónico' : 'Correo o usuario' }}<input v-model="email" :type="isRegister ? 'email' : 'text'" required :autocomplete="isRegister ? 'email' : 'username'" /></label>
      <label>Contraseña<input v-model="password" type="password" required :minlength="isRegister ? 6 : undefined" :autocomplete="isRegister ? 'new-password' : 'current-password'" /></label>
      <p v-if="errorMessage" class="error auth-error" role="alert">{{ errorMessage }}</p>
      <button class="button button-primary btn-block" type="submit" :disabled="submitting">
        {{ submitting ? 'Enviando...' : (isRegister ? 'Registrarme' : 'Ingresar') }}
      </button>
      <p class="auth-switch">
        <template v-if="isRegister">¿Ya tienes cuenta? <button type="button" @click="openAuthDialog('login')">Ingresar</button></template>
        <template v-else>¿No tienes cuenta? <button type="button" @click="openAuthDialog('register')">Registrarme</button></template>
      </p>
    </form>
  </dialog>
</template>
