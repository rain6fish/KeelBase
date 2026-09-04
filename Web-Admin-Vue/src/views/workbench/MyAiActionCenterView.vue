<!-- SPDX-License-Identifier: Apache-2.0 -->
<template>
  <div>
    <PageHeader :title="t('aiCenterTitle')" :subtitle="t('aiCenterDesc')" />

    <!-- 主模块：AI 写操作（副作用锚：状态 → 撤销 → 证据） -->
    <el-card shadow="never" class="mb-4">
      <template #header>
        <div class="d-flex justify-space-between align-center">
          <div class="d-flex align-center ga-2">
            <span class="font-weight-medium">{{ t('aiCenterWritesTitle') }}</span>
            <el-tag v-if="total > 0" size="small" effect="plain">{{ t('aiCenterEffectTotal', { n: total }) }}</el-tag>
          </div>
          <el-button plain size="small" @click="loadEffects">
            <template #icon><AppIcon icon="mdi-refresh" /></template>
            {{ t('refresh') }}
          </el-button>
        </div>
      </template>

      <div v-if="loading" class="text-medium-emphasis pa-4">{{ t('aiCenterLoading') }}</div>
      <div v-else-if="loadError" class="text-error pa-4">{{ loadError }}</div>
      <div v-else-if="effects.length === 0" class="text-medium-emphasis pa-4">{{ t('aiCenterWritesEmpty') }}</div>

      <template v-else>
        <div v-for="e in effects" :key="e.id" class="effect-row">
          <div class="d-flex justify-space-between align-start ga-3">
            <div class="flex-grow-1">
              <div class="d-flex align-center ga-2 flex-wrap">
                <span class="font-weight-medium">{{ labelOf(e.toolName) }}</span>
                <el-tag size="small" effect="plain" :type="e.status === 'revoked' ? 'info' : 'success'">
                  {{ e.status === 'revoked' ? t('statusRevoked') : t('statusExecuted') }}
                </el-tag>
              </div>
              <div class="text-body-2 text-medium-emphasis mt-1">
                {{ e.targetTitle || `#${e.resultId}` }}
                <span class="ms-2">· {{ e.resultType }}</span>
                <span class="ms-2">· {{ t('aiCenterEffectCreated') }} {{ formatTime(e.createdAt) }}</span>
              </div>
            </div>
            <div class="d-flex align-center ga-1 flex-shrink-0">
              <el-button
                v-if="e.status === 'executed'"
                size="small"
                plain
                type="warning"
                :disabled="revokingId === e.id"
                @click="confirmRevoke(e)"
              >
                <template #icon><AppIcon icon="mdi-undo-variant" /></template>
                {{ t('revokeEffect') }}
              </el-button>
              <el-button text size="small" type="primary" @click="openEvidence(e)">
                <template #icon><AppIcon icon="mdi-file-search-outline" /></template>
                {{ t('viewEvidence') }}
              </el-button>
              <el-button text size="small" @click="openHistory(e)">
                <template #icon><AppIcon icon="mdi-history" /></template>
                {{ t('aiCenterHistory') }}
              </el-button>
            </div>
          </div>
        </div>
        <AppPagination :page="page" :limit="limit" :total="total" :loading="loading" class="mt-3" @update:page="onPageChange" />
      </template>
    </el-card>

    <!-- 次模块：最近 AI 会话 → 轨迹回看 -->
    <el-card shadow="never">
      <template #header>
        <div class="d-flex justify-space-between align-center">
          <span class="font-weight-medium">{{ t('aiCenterConvTitle') }}</span>
          <el-button text size="small" type="primary" @click="router.push('/workbench/ai-trace')">
            {{ t('aiCenterConvAll') }}
          </el-button>
        </div>
      </template>

      <div v-if="convLoading" class="text-medium-emphasis pa-4">{{ t('aiCenterLoading') }}</div>
      <div v-else-if="conversations.length === 0" class="text-medium-emphasis pa-4">{{ t('aiCenterConvEmpty') }}</div>
      <template v-else>
        <div v-for="c in conversations" :key="c.id" class="conv-row">
          <div class="d-flex justify-space-between align-center ga-3">
            <div class="flex-grow-1">
              <div class="text-body-2">{{ convTitle(c) }}</div>
              <div class="text-caption text-medium-emphasis mt-1">{{ formatTime(c.lastActivityAt) }}</div>
            </div>
            <el-button text size="small" type="primary" @click="openConversation(c)">
              <template #icon><AppIcon icon="mdi-play-circle-outline" /></template>
              {{ t('aiCenterConvOpen') }}
            </el-button>
          </div>
        </div>
      </template>
    </el-card>

    <!-- 撤销确认 + 对象历史抽屉 -->
    <ConfirmDialog
      v-model="showRevoke"
      :title="t('revokeEffect')"
      :content="t('revokeEffectConfirm', { title: pending?.targetTitle || `#${pending?.resultId}` })"
      @confirm="onRevoke"
    />
    <BusinessHistoryDrawer
      v-model="historyOpen"
      :result-type="historyTarget?.resultType ?? ''"
      :result-id="historyTarget?.resultId ?? 0"
    />
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import PageHeader from '@/components/PageHeader.vue'
import AppPagination from '@/components/AppPagination.vue'
import AppIcon from '@/components/AppIcon.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import BusinessHistoryDrawer from '@/components/BusinessHistoryDrawer.vue'
import { useSnackbarStore } from '@/stores/snackbar'
import { aiTraceApi } from '@/api/aiTrace'
import { formatTime } from '@/utils/format'
import { toolLabel } from '@/utils/toolLabel'
import type { ConversationSummary, MyAiEffect } from '@/types/workbench'

const { t, tm } = useI18n()
const snackbar = useSnackbarStore()
const router = useRouter()

const effects = ref<MyAiEffect[]>([])
const total = ref(0)
const page = ref(1)
const limit = 20
const loading = ref(false)
const loadError = ref('')

const conversations = ref<ConversationSummary[]>([])
const convLoading = ref(false)

const revokingId = ref<number | null>(null)
const showRevoke = ref(false)
const pending = ref<MyAiEffect | null>(null)

const historyOpen = ref(false)
const historyTarget = ref<{ resultType: string; resultId: number } | null>(null)

/** D2 人类工具标签：feature 命名空间未命中回退原始 toolName */
function labelOf(name: string): string {
  return toolLabel(tm('feature') as Record<string, string> | undefined, name)
}

async function loadEffects() {
  loading.value = true
  loadError.value = ''
  try {
    const res = await aiTraceApi.myEffects(page.value, limit)
    effects.value = res.items
    total.value = res.total
  } catch (err) {
    loadError.value = err instanceof Error ? err.message : t('loadFailed')
  } finally {
    loading.value = false
  }
}

async function loadConversations() {
  convLoading.value = true
  try {
    const list = await aiTraceApi.conversations()
    conversations.value = list.slice(0, 8)
  } catch {
    conversations.value = []
  } finally {
    convLoading.value = false
  }
}

function onPageChange(p: number) {
  page.value = p
  void loadEffects()
}

/** 查看完整证据 → Business Action Detail（B4 治理视图：Who/Why/Approval/Effect/Integrity） */
function openEvidence(e: MyAiEffect) {
  void router.push({ name: 'workbench-action-detail', params: { resultType: e.resultType, resultId: String(e.resultId) } })
}

/** 对象历史 → A-2 BusinessHistoryDrawer（同业务对象的跨来源行为史） */
function openHistory(e: MyAiEffect) {
  historyTarget.value = { resultType: e.resultType, resultId: e.resultId }
  historyOpen.value = true
}

/** 会话轨迹 → AiTraceView 并定位到该会话 */
function openConversation(c: ConversationSummary) {
  void router.push({ path: '/workbench/ai-trace', query: { conv: c.id } })
}

function confirmRevoke(e: MyAiEffect) {
  pending.value = e
  showRevoke.value = true
}

async function onRevoke() {
  const target = pending.value
  if (!target) return
  showRevoke.value = false
  revokingId.value = target.id
  try {
    await aiTraceApi.revokeEffect(target.id)
    snackbar.success(t('aiTraceRevoked'))
    await loadEffects()
  } catch (err) {
    snackbar.error(err instanceof Error ? err.message : t('aiTraceRevokeFailed'))
  } finally {
    revokingId.value = null
    pending.value = null
  }
}

function convTitle(c: ConversationSummary): string {
  const first = c.messages.find((m) => m.role === 'user' && m.content?.trim())
  if (first) return first.content.length > 50 ? `${first.content.slice(0, 50)}…` : first.content
  return t('conversation') + (c.id.length > 10 ? ` ${c.id.slice(0, 10)}…` : c.id)
}

onMounted(() => {
  void loadEffects()
  void loadConversations()
})
</script>

<style scoped>
.effect-row {
  padding: 12px 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.effect-row:last-child {
  border-bottom: none;
}
.conv-row {
  padding: 10px 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.conv-row:last-child {
  border-bottom: none;
}
</style>
