<template>
  <v-main class="d-flex align-center justify-center login-bg">
    <v-card class="login-card" :loading="auth.status === 'loading'">
      <v-card-title class="text-center pt-6 pb-0">
        <v-icon icon="mdi-keel" size="40" color="primary" class="mb-1" />
        <div class="text-h5 font-weight-bold">{{ t('appName') }}</div>
      </v-card-title>
      <v-card-text class="px-8 py-6">
        <div class="text-subtitle-2 mb-4 text-center">{{ t('loginTitle') }}</div>

        <v-alert v-if="errorMessage" type="error" variant="tonal" class="mb-4">
          {{ errorMessage }}
        </v-alert>

        <v-form ref="formRef" @submit.prevent="onSubmit">
          <v-text-field
            v-model="username"
            :label="t('username')"
            :placeholder="t('usernamePlaceholder')"
            prepend-inner-icon="mdi-account-outline"
            autocomplete="username"
            required
          />
          <v-text-field
            v-model="password"
            :label="t('password')"
            :placeholder="t('passwordPlaceholder')"
            prepend-inner-icon="mdi-lock-outline"
            :append-inner-icon="showPwd ? 'mdi-eye-off' : 'mdi-eye'"
            :type="showPwd ? 'text' : 'password'"
            autocomplete="current-password"
            required
            @click:append-inner="showPwd = !showPwd"
            @keyup.enter="onSubmit"
          />
          <v-btn
            type="submit"
            color="primary"
            block
            size="large"
            class="mt-2"
            :loading="auth.status === 'loading'"
          >
            {{ t('login') }}
          </v-btn>
        </v-form>

        <div class="text-caption text-medium-emphasis mt-4 text-center">
          admin / Admin@1234（控制台）· alex / 123456（工作台）
        </div>
      </v-card-text>

      <v-card-actions class="justify-center pb-4">
        <LangToggle />
      </v-card-actions>
    </v-card>
  </v-main>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import type { VForm } from 'vuetify/components'
import { useAuthStore } from '@/stores/auth'
import LangToggle from '@/components/LangToggle.vue'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()
const { t } = useI18n()

const username = ref('')
const password = ref('')
const showPwd = ref(false)
const formRef = ref<VForm | null>(null)
const errorMessage = ref('')

async function onSubmit() {
  if (!username.value || !password.value) {
    errorMessage.value = t('loginFailed')
    return
  }
  const ok = await auth.login(username.value, password.value)
  if (ok) {
    const redirect = route.query.redirect
    router.replace(typeof redirect === 'string' ? redirect : auth.isAdmin ? '/' : '/workbench')
  } else {
    errorMessage.value = auth.errorMessage || t('loginFailed')
  }
}
</script>

<style scoped>
.login-bg {
  background: linear-gradient(135deg, rgb(var(--v-theme-primary)) 0%, rgb(var(--v-theme-background)) 100%);
}
.login-card {
  width: 420px;
  max-width: 92vw;
  border-radius: 12px;
}
</style>
