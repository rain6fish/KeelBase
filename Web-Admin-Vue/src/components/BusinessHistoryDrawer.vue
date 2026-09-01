<!-- SPDX-License-Identifier: Apache-2.0 -->
<template>
  <el-drawer
    :model-value="modelValue"
    size="560px"
    :title="t('businessHistoryTitle')"
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
  >
    <div v-if="loading" class="text-medium-emphasis pa-4">{{ t('governanceLoading') }}</div>
    <template v-else-if="data">
      <!-- §22.16 A-2 目标实体当前状态卡 -->
      <div v-if="data.target.exists" class="mb-4 pa-3" style="background: var(--el-fill-color-light); border-radius: 8px">
        <div class="d-flex justify-space-between mb-1">
          <span class="text-caption text-medium-emphasis">{{ t('bhTarget') }}</span>
          <span class="text-body-2">{{ data.target.title || `#${resultId}` }}</span>
        </div>
        <div v-if="data.target.status" class="d-flex justify-space-between mb-1">
          <span class="text-caption text-medium-emphasis">{{ t('bhStatus') }}</span>
          <span class="text-body-2">{{ data.target.status }}</span>
        </div>
        <div v-if="data.target.deletedAt" class="text-error text-caption mt-1">{{ t('bhDeleted') }}</div>
      </div>
      <div v-else class="mb-4 pa-3 text-medium-emphasis text-caption" style="background: var(--el-fill-color-light); border-radius: 8px">
        {{ t('bhTargetMissing') }}
      </div>

      <!-- 聚合行为史时间线（AI 副作用 + AI 决策轨迹 + REST 写） -->
      <div v-if="data.events.length" class="text-body-2 font-weight-medium mb-2">{{ t('bhTimeline') }}</div>
      <el-timeline v-if="data.events.length">
        <el-timeline-item v-for="e in data.events" :key="e.id" :color="timelineColor(e.source)">
          <div class="d-flex align-center ga-2 flex-wrap">
            <el-tag size="small" effect="plain" :type="sourceTagType(e.source)">{{ t(sourceKey(e.source)) }}</el-tag>
            <span class="text-caption text-medium-emphasis">{{ formatTime(e.time) }}</span>
          </div>
          <div class="mt-1 text-body-2">
            <!-- AI 决策轨迹：业务事件主标签 + 工具 + 证据 popover -->
            <template v-if="e.source === 'ai-trace'">
              <span class="font-weight-medium">{{ e.businessEvent || e.toolName || e.action || '-' }}</span>
              <span v-if="e.toolName" class="text-medium-emphasis ms-1">· {{ e.toolName }}</span>
              <el-popover v-if="e.evidence" placement="top" :width="380" trigger="click">
                <template #reference>
                  <el-link type="primary" class="ms-2">{{ t('bhEvidence') }}</el-link>
                </template>
                <pre class="text-caption" style="white-space:pre-wrap;margin:0">{{ formatEvidence(e.evidence) }}</pre>
              </el-popover>
            </template>
            <!-- AI 副作用：业务事件/工具名 -->
            <span v-else-if="e.source === 'ai-side-effect'" class="font-weight-medium">{{ e.businessEvent || e.toolName || '-' }}</span>
            <!-- REST 写：method + path + action + changes popover -->
            <template v-else>
              <span class="font-weight-medium">{{ e.method }} {{ e.path }}</span>
              <span class="text-medium-emphasis ms-1">· {{ e.action }}</span>
              <el-popover v-if="e.changes" placement="top" :width="380" trigger="click">
                <template #reference>
                  <el-link type="primary" class="ms-2">{{ t('bhChanges') }}</el-link>
                </template>
                <pre class="text-caption" style="white-space:pre-wrap;margin:0">{{ formatEvidence(e.changes) }}</pre>
              </el-popover>
            </template>
          </div>
          <FieldDiff v-if="e.source !== 'rest-write' && (e.before || e.after)" :before="e.before" :after="e.after" class="mt-1" />
        </el-timeline-item>
      </el-timeline>
      <div v-else class="text-medium-emphasis">{{ t('bhEmpty') }}</div>
    </template>
  </el-drawer>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import FieldDiff from '@/components/FieldDiff.vue'
import { aiToolsApi } from '@/api/aiTools'
import { formatTime } from '@/utils/format'
import type { BusinessHistoryResponse } from '@/types/admin'

/** §22.16 A-2 业务实体行为史：按实体聚合 AI 副作用 / AI 决策轨迹 / REST 写操作，时间线展示 */
const props = defineProps<{ modelValue: boolean; resultType: string; resultId: number }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()

const { t } = useI18n()
const data = ref<BusinessHistoryResponse | null>(null)
const loading = ref(false)

async function load() {
  if (!props.resultType || !props.resultId) return
  loading.value = true
  data.value = null
  try {
    data.value = await aiToolsApi.entityHistory(props.resultType, props.resultId)
  } catch {
    data.value = null
  } finally {
    loading.value = false
  }
}

watch(() => props.modelValue, (open) => { if (open) void load() })
onMounted(() => { if (props.modelValue) void load() })

function sourceKey(s: string): string {
  if (s === 'ai-side-effect') return 'bhSourceAIEffect'
  if (s === 'ai-trace') return 'bhSourceAITrace'
  return 'bhSourceREST'
}
function sourceTagType(s: string): 'warning' | 'primary' | 'success' {
  if (s === 'rest-write') return 'warning'
  if (s === 'ai-side-effect') return 'success'
  return 'primary'
}
function timelineColor(s: string): string {
  if (s === 'rest-write') return 'var(--el-color-warning)'
  if (s === 'ai-side-effect') return 'var(--el-color-success)'
  return 'var(--el-color-primary)'
}
function formatEvidence(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return raw
  }
}
</script>
