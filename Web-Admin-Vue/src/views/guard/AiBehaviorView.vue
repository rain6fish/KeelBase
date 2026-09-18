<!-- SPDX-License-Identifier: Apache-2.0 -->
<template>
  <div>
    <PageHeader :title="t('aiBehaviorTitle')" :subtitle="t('aiBehaviorDesc')" />

    <el-card shadow="never">
      <template #header>
        <div class="d-flex justify-space-between align-center">
          <div class="d-flex align-center ga-2">
            <span class="font-weight-medium">{{ t('aiBehaviorSection') }}</span>
            <el-tag size="small" effect="plain">{{ t('aiBehaviorTotal', { n: items.length }) }}</el-tag>
          </div>
          <div class="d-flex align-center ga-2">
            <el-radio-group v-model="scope" size="small" @change="load">
              <el-radio-button value="open">{{ t('aiBehaviorScopeOpen') }}</el-radio-button>
              <el-radio-button value="all">{{ t('aiBehaviorScopeAll') }}</el-radio-button>
            </el-radio-group>
            <el-button plain size="small" :loading="loading" @click="load">
              <template #icon><AppIcon icon="mdi-refresh" /></template>
              {{ t('refresh') }}
            </el-button>
          </div>
        </div>
      </template>

      <div v-if="loading" class="text-medium-emphasis pa-4">{{ t('aiBehaviorLoading') }}</div>
      <div v-else-if="loadError" class="text-error pa-4">{{ loadError }}</div>
      <div v-else-if="items.length === 0" class="text-medium-emphasis pa-4">{{ t('aiBehaviorEmpty') }}</div>

      <template v-else>
        <div v-for="a in items" :key="a.id" class="behavior-row">
          <div class="d-flex justify-space-between align-start ga-3">
            <div class="flex-grow-1">
              <div class="d-flex align-center ga-2 flex-wrap">
                <el-tag :type="a.level === 'critical' ? 'danger' : 'warning'" size="small" effect="dark">
                  {{ a.level === 'critical' ? t('aiBehaviorCritical') : t('aiBehaviorWarning') }}
                </el-tag>
                <span class="font-weight-medium">{{ a.title }}</span>
                <el-tag size="small" effect="plain">{{ a.rule }}</el-tag>
                <el-tag v-if="a.status === 'acknowledged'" size="small" type="info" effect="plain">
                  {{ t('aiBehaviorHandled') }}
                </el-tag>
              </div>
              <div class="text-body-2 mt-1">{{ a.detail }}</div>
              <div class="text-caption text-medium-emphasis mt-1">
                {{ t('aiBehaviorSubject', { kind: subjectLabel(a.subject.kind), id: a.subject.id }) }}
                · {{ formatTime(a.createdAt) }}
              </div>
              <!-- 判定依据：告警要能被自己复算，否则不可辩驳 -->
              <div class="text-caption text-medium-emphasis mt-1">
                {{ t('aiBehaviorEvidence') }}：{{ evidenceText(a) }}
                <template v-if="a.evidence.sampleRowIds?.length">
                  · {{ t('aiBehaviorSamples', { ids: a.evidence.sampleRowIds.join(', ') }) }}
                </template>
              </div>
            </div>
            <el-button
              v-if="a.status === 'open'"
              size="small"
              plain
              :loading="ackingId === a.id"
              :disabled="ackingId !== null"
              @click="onAcknowledge(a)"
            >
              {{ t('aiBehaviorAcknowledge') }}
            </el-button>
          </div>
        </div>
      </template>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import PageHeader from '@/components/PageHeader.vue'
import AppIcon from '@/components/AppIcon.vue'
import { useSnackbarStore } from '@/stores/snackbar'
import { adminApi } from '@/api/admin'
import { formatTime } from '@/utils/format'
import type { BehaviorAlertRow } from '@/types/admin'

const { t } = useI18n()
const snackbar = useSnackbarStore()

const items = ref<BehaviorAlertRow[]>([])
const scope = ref<'open' | 'all'>('open')
const loading = ref(false)
const loadError = ref('')
const ackingId = ref<number | null>(null)

/** 主体类型标签（会话 / 用户）——不直接回显服务端枚举值 */
function subjectLabel(kind: string): string {
  return kind === 'user' ? t('aiBehaviorSubjectUser') : t('aiBehaviorSubjectConversation')
}

/** 可复算依据：数了多少 / 阈值多少 / 窗口多长（样本行号在模板里单独渲染） */
function evidenceText(a: BehaviorAlertRow): string {
  const parts: string[] = [`${a.evidence.count} / ${a.evidence.threshold}`]
  parts.push(t('aiBehaviorWindow', { n: a.evidence.windowMinutes }))
  if (a.evidence.toolName) parts.push(a.evidence.toolName)
  return parts.join(' · ')
}

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    items.value = await adminApi.behaviorAlerts(scope.value)
  } catch {
    loadError.value = t('aiBehaviorLoadFailed')
  } finally {
    loading.value = false
  }
}

async function onAcknowledge(row: BehaviorAlertRow) {
  ackingId.value = row.id
  try {
    await adminApi.acknowledgeBehaviorAlert(row.id)
    snackbar.success(t('aiBehaviorAckDone'))
    await load()
  } catch {
    snackbar.error(t('aiBehaviorAckFailed'))
    await load()
  } finally {
    ackingId.value = null
  }
}

onMounted(() => {
  void load()
})
</script>

<style scoped>
.behavior-row {
  padding: 12px 4px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.behavior-row:last-child {
  border-bottom: none;
}
</style>
