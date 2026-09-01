<!-- SPDX-License-Identifier: Apache-2.0 -->
<template>
  <div class="login-bg d-flex align-center justify-center">
    <el-card class="login-card" shadow="always">
      <div class="text-center pt-4">
        <AppLogo :size="40" class="mb-1" />
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

        <template v-if="hasEnterpriseSso">
          <el-divider><span class="text-caption text-medium-emphasis">{{ t('enterpriseSso') }}</span></el-divider>
          <el-button plain size="large" class="w-100" @click="onEnterpriseSso">
            {{ t('enterpriseSso') }}
          </el-button>
        </template>

        <div class="text-caption text-medium-emphasis mt-4 text-center">
          <!-- 密码经命名插值传入：i18n message 不含 @（vue-i18n 会把 @ 当 linked message 语法），避免登录页编译崩溃 -->
          {{ t('demoAccountsHint', { alexPw: 'Alex@2026$Demo', adminPw: 'Admin@2026$KeelBase' }) }}
        </div>
      </div>
      <div class="text-center pb-4">
        <LangToggle />
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { authApi } from '@/api/auth'
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
const hasEnterpriseSso = ref(false)

onMounted(async () => {
  // 登录页访问统计（IP/OS/浏览器/时间 → 服务端文件）；失败静默不影响登录
  try {
    await authApi.loginStats()
  } catch {
    // 统计失败忽略
  }
  try {
    const cfg = await authApi.oauthProviders()
    const enterprise = (cfg.groups?.enterprise as Array<{ id?: string }> | undefined) ?? []
    hasEnterpriseSso.value = enterprise.some((p) => p.id === 'oidc')
  } catch {
    // providers 端点不可用时不显示企业 SSO 入口，不影响账号密码登录
  }
})

async function onEnterpriseSso() {
  try {
    // hash 路由回调：IdP 需将 redirect_uri 精确注册（OIDC redirect_uri 必须一致）
    const callback = `${location.origin}${location.pathname}#/auth/oidc/callback`
    const { url } = await authApi.oidcUrl(callback)
    location.href = url
  } catch {
    errorMessage.value = t('oidcLoginFailed')
  }
}

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
    radial-gradient(1200px 600px at 70% -10%, var(--keel-glow, rgba(109, 40, 217, 0.25)) 0%, transparent 60%),
    linear-gradient(135deg, var(--keel-brand-gradient-from, var(--el-color-primary)) 0%, var(--el-bg-color-page) 100%);
}
.login-card {
  width: 420px;
  max-width: 92vw;
  border-radius: var(--keel-radius-md);
}
</style>
