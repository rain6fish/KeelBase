<template>
  <div class="login-bg d-flex align-center justify-center">
    <el-card class="login-card" shadow="always">
      <div class="text-center pt-4">
        <AppLogo :size="44" class="mb-1" />
        <div class="text-h5 font-weight-bold">{{ t('appName') }}</div>
        <div class="text-caption text-medium-emphasis mt-1">{{ t('appTagline') }}</div>
      </div>
      <div class="px-6 py-4">
        <div class="text-subtitle-2 mb-4 text-center">{{ t('loginTitle') }}</div>

        <el-alert v-if="errorMessage" type="error" :closable="false" class="mb-4">
          {{ errorMessage }}
        </el-alert>

        <el-form @submit.prevent="onSubmit">
          <el-input
            v-model="username"
            :placeholder="t('usernamePlaceholder')"
            autocomplete="username"
            class="mb-3"
          >
            <template #prefix><AppIcon icon="mdi-account-outline" /></template>
          </el-input>
          <el-input
            v-model="password"
            :placeholder="t('passwordPlaceholder')"
            :type="showPwd ? 'text' : 'password'"
            autocomplete="current-password"
            @keyup.enter="onSubmit"
          >
            <template #prefix><AppIcon icon="mdi-lock-outline" /></template>
            <template #suffix>
              <el-button link @click="showPwd = !showPwd">
                <AppIcon :icon="showPwd ? 'mdi-eye-off' : 'mdi-eye'" />
              </el-button>
            </template>
          </el-input>
          <el-button
            type="primary"
            native-type="submit"
            size="large"
            class="mt-3 w-100"
            :loading="auth.status === 'loading'"
          >
            {{ t('login') }}
          </el-button>
        </el-form>

        <div class="text-caption text-medium-emphasis mt-4 text-center">
          admin / Admin@1234（控制台）· alex / 123456（工作台）
        </div>
      </div>
      <div class="text-center pb-4">
        <LangToggle />
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import LangToggle from '@/components/LangToggle.vue'
import AppLogo from '@/components/AppLogo.vue'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()
const { t } = useI18n()

const username = ref('')
const password = ref('')
const showPwd = ref(false)
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
  min-height: 100vh;
  background:
    radial-gradient(1200px 600px at 70% -10%, var(--keel-glow, rgba(79, 70, 229, 0.25)) 0%, transparent 60%),
    linear-gradient(135deg, var(--keel-brand-gradient-from, var(--el-color-primary)) 0%, var(--el-bg-color-page) 100%);
}
.login-card {
  width: 420px;
  max-width: 92vw;
  border-radius: var(--keel-radius-md);
}
</style>
