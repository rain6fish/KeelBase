<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- EASY-5 首启引导：管理员首次进入选择 preset（full/small/lite），应用后按 feature flags 精简功能 -->
<template>
  <el-dialog
    :model-value="visible"
    :title="t('presetTitle')"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    :show-close="false"
    width="560px"
  >
    <p class="preset-desc">{{ t('presetDesc') }}</p>
    <div class="preset-grid">
      <div
        v-for="p in presets"
        :key="p.key"
        class="preset-card"
        :class="{ active: selected === p.key }"
        @click="selected = p.key"
      >
        <h4>{{ t(`presetCard${cap(p.key)}Title`) }}</h4>
        <p>{{ t(`presetCard${cap(p.key)}Desc`) }}</p>
        <ul>
          <li v-for="f in p.features" :key="f">{{ t(f) }}</li>
        </ul>
      </div>
    </div>
    <template #footer>
      <el-button type="primary" :disabled="!selected" @click="apply">{{ t('presetApply') }}</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { settingsApi } from '@/api/settings'

const { t } = useI18n()
const auth = useAuthStore()

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

const presets = [
  { key: 'full' as const, features: ['presetFAll'] },
  { key: 'small' as const, features: ['presetFSmall'] },
  { key: 'lite' as const, features: ['presetFLite'] },
]
const selected = ref<'full' | 'small' | 'lite' | ''>('full')
const visible = ref(false)
let checked = false

/** 仅管理员；已检查过（避免路由切换重复弹窗）则跳过 */
async function maybeCheck() {
  if (!auth.isAdmin || checked) return
  checked = true
  try {
    const rows = await settingsApi.list()
    if (!rows.some((r) => r.key === 'feature_flags_selected')) {
      visible.value = true
    }
  } catch {
    /* GET /settings 仅 admin；非 admin 或失败静默 */
  }
}

watch(() => auth.isAdmin, (v) => { if (v) void maybeCheck() }, { immediate: true })
onUnmounted(() => { checked = false })

async function apply() {
  if (!selected.value) return
  try {
    await settingsApi.applyPreset(selected.value)
    visible.value = false
    window.location.reload()
  } catch {
    /* 应用失败：保留弹窗由用户重试 */
  }
}
</script>

<style scoped>
.preset-desc { color: var(--el-text-color-secondary); margin-bottom: 14px; }
.preset-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.preset-card {
  border: 1px solid var(--el-border-color); border-radius: 10px; padding: 12px; cursor: pointer;
  transition: border-color 0.2s, box-shadow 0.2s;
}
.preset-card.active { border-color: var(--el-color-primary); box-shadow: 0 0 0 1px var(--el-color-primary); }
.preset-card h4 { margin: 0 0 6px; }
.preset-card p { font-size: 12px; color: var(--el-text-color-secondary); margin: 0 0 6px; }
.preset-card ul { margin: 0; padding-left: 16px; font-size: 12px; color: var(--el-text-color-regular); }
</style>
