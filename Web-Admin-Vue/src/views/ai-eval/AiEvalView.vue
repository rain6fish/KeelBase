<template>
  <div>
    <PageHeader :title="t('navAiEval')">
      <el-button @click="openCreate">
        <template #icon><AppIcon icon="mdi-plus" /></template>
        {{ t('newEvalCase') }}
      </el-button>
      <el-button @click="onSeed">
        <template #icon><AppIcon icon="mdi-seed" /></template>
        {{ t('seedCases') }}
      </el-button>
      <el-button type="primary" :loading="running" @click="onRun">
        <template #icon><AppIcon icon="mdi-play" /></template>
        {{ t('runEval') }}
      </el-button>
    </PageHeader>

    <!-- 最近报告 -->
    <el-card v-if="report" shadow="never" class="mb-4">
      <template #header>
        <div class="d-flex align-center ga-2">
          <AppIcon icon="mdi-chart-box" color="var(--el-color-primary)" />
          {{ t('lastReport') }}
          <el-tag size="small" type="success" effect="light">{{ t('passed', { n: report.passed }) }}</el-tag>
          <el-tag size="small" type="danger" effect="light">{{ t('failed', { n: report.failed }) }}</el-tag>
          <el-tag size="small" effect="light">{{ t('total') }} {{ report.total }}</el-tag>
        </div>
      </template>
      <el-collapse>
        <el-collapse-item v-for="c in report.cases" :key="c.id">
          <template #title>
            <div class="d-flex align-center ga-2">
              <AppIcon
                :icon="c.ok ? 'mdi-check-circle' : 'mdi-close-circle'"
                :color="c.ok ? 'var(--el-color-success)' : 'var(--el-color-danger)'"
              />
              <span class="text-body-2">{{ c.category }} / {{ c.prompt }}</span>
            </div>
          </template>
          <div class="text-body-2">{{ t('assertType') }}: {{ c.assertType }}</div>
          <div class="text-body-2">{{ t('detail') }}: {{ c.detail }}</div>
          <div v-if="c.actualToolCalls?.length" class="text-body-2">{{ t('actualToolCalls') }}: {{ c.actualToolCalls.join(', ') }}</div>
          <div v-if="c.replyPreview" class="text-body-2">{{ t('replyPreview') }}: {{ c.replyPreview }}</div>
          <div v-if="c.error" class="text-body-2 text-error">{{ t('error') }}: {{ c.error }}</div>
          <div class="text-caption text-medium-emphasis">{{ c.durationMs }}ms</div>
        </el-collapse-item>
      </el-collapse>
    </el-card>

    <AppTable :headers="headers" :items="cases" :loading="loading" :total="cases.length" :items-per-page="cases.length || 1">
      <template #item.enabled="{ item }">
        <StatusChip :status="item.enabled ? 'ok' : 'cancelled'" :label-map="enabledMap" />
      </template>
      <template #item.expected="{ item }">{{ item.expected || '-' }}</template>
      <template #item.createdAt="{ item }">{{ formatTime(item.createdAt) }}</template>
      <template #item.actions="{ item }">
        <el-button text size="small" type="danger" @click="confirmDelete(item)">
          <AppIcon icon="mdi-delete-outline" />
        </el-button>
      </template>
    </AppTable>

    <FormDialog v-model="showCreate" :title="t('newEvalCase')" :loading="saving" @save="onCreate">
      <el-form @submit.prevent="onCreate">
        <el-form-item :label="t('category')">
          <el-input v-model="form.category" required />
        </el-form-item>
        <el-form-item :label="t('prompt')">
          <el-input v-model="form.prompt" type="textarea" :rows="3" required />
        </el-form-item>
        <el-form-item :label="t('expected')">
          <el-input v-model="form.expected" />
        </el-form-item>
      </el-form>
    </FormDialog>

    <ConfirmDialog
      v-model="showDelete"
      :title="t('deleteEvalCase')"
      :content="t('deleteEvalCaseConfirm', { id: pendingDelete?.id || '' })"
      @confirm="onDelete"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import PageHeader from '@/components/PageHeader.vue'
import AppTable from '@/components/AppTable.vue'
import StatusChip from '@/components/StatusChip.vue'
import FormDialog from '@/components/FormDialog.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import { useSnackbarStore } from '@/stores/snackbar'
import { aiEvalApi } from '@/api/aiEval'
import { formatTime } from '@/utils/format'
import type { EvalCase, EvalRunReport } from '@/types/eval'

const { t } = useI18n()
const snackbar = useSnackbarStore()

const cases = ref<EvalCase[]>([])
const report = ref<EvalRunReport | null>(null)
const loading = ref(false)
const running = ref(false)

const headers = computed(() => [
  { key: 'id', title: t('idCol') },
  { key: 'category', title: t('category') },
  { key: 'prompt', title: t('prompt') },
  { key: 'expected', title: t('expected') },
  { key: 'enabled', title: t('statusCol') },
  { key: 'createdAt', title: t('createdAt') },
  { key: 'actions', title: t('actionCol') },
])

const enabledMap = computed(() => ({ ok: t('enabled'), cancelled: t('disabled') }))

async function load() {
  loading.value = true
  try {
    const [c, r] = await Promise.all([aiEvalApi.listCases(), aiEvalApi.report()])
    cases.value = c
    report.value = r
  } catch (err) {
    snackbar.error(err instanceof Error ? err.message : t('loadFailed'))
  } finally {
    loading.value = false
  }
}

// 新建
const showCreate = ref(false)
const saving = ref(false)
const form = ref({ category: '', prompt: '', expected: '' })
function openCreate() {
  form.value = { category: '', prompt: '', expected: '' }
  showCreate.value = true
}
async function onCreate() {
  if (!form.value.category.trim() || !form.value.prompt.trim()) return
  saving.value = true
  try {
    await aiEvalApi.createCase({
      category: form.value.category.trim(),
      prompt: form.value.prompt.trim(),
      expected: form.value.expected || undefined,
    })
    snackbar.success(t('saved'))
    showCreate.value = false
    load()
  } catch (err) {
    snackbar.error(err instanceof Error ? err.message : t('createFailed'))
  } finally {
    saving.value = false
  }
}

// 删除
const showDelete = ref(false)
const pendingDelete = ref<EvalCase | null>(null)
function confirmDelete(item: EvalCase) {
  pendingDelete.value = item
  showDelete.value = true
}
async function onDelete() {
  if (!pendingDelete.value) return
  try {
    await aiEvalApi.removeCase(pendingDelete.value.id)
    snackbar.success(t('deleted'))
    load()
  } catch (err) {
    snackbar.error(err instanceof Error ? err.message : t('deleteFailed'))
  } finally {
    showDelete.value = false
  }
}

async function onSeed() {
  try {
    const res = await aiEvalApi.seed()
    snackbar.success(t('seedDone', { n: res.added }))
    load()
  } catch (err) {
    snackbar.error(err instanceof Error ? err.message : t('seedFailed'))
  }
}

async function onRun() {
  running.value = true
  try {
    report.value = await aiEvalApi.run()
    snackbar.success(t('runDone'))
  } catch (err) {
    snackbar.error(err instanceof Error ? err.message : t('runFailed'))
  } finally {
    running.value = false
  }
}

onMounted(load)
</script>
