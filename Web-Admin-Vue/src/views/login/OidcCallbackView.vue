<!-- SPDX-License-Identifier: Apache-2.0 -->
<template>
  <div class="login-bg d-flex align-center justify-center">
    <el-card class="login-card" shadow="always">
      <div class="text-center pt-4 px-6 py-6">
        <AppLogo :size="44" class="mb-3" />
        <el-alert v-if="error" type="error" :closable="false" class="mb-3">{{ error }}</el-alert>
        <el-button v-if="!error" type="primary" size="large" :loading="loading" class="w-100">
          {{ t('oidcRedirecting') }}
        </el-button>
        <div v-if="error" class="mt-3">
          <el-button link type="primary" @click="router.replace('/login')">{{ t('login') }}</el-button>
        </div>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { homeFor } from '@/router/guards'
import AppLogo from '@/components/AppLogo.vue'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const auth = useAuthStore()

const loading = ref(true)
const error = ref('')

onMounted(async () => {
  const code = typeof route.query.code === 'string' ? route.query.code : ''
  // redirect_uri 必须与登录页构建授权 URL 时一致（OIDC 精确匹配）
  const callback = `${location.origin}${location.pathname}#/auth/oidc/callback`
  if (!code) {
    error.value = t('oidcLoginFailed')
    loading.value = false
    return
  }
  const ok = await auth.oidcLogin(code, callback)
  loading.value = false
  if (ok) {
    router.replace(homeFor(auth.user?.role))
  } else {
    error.value = auth.errorMessage || t('oidcLoginFailed')
  }
})
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
