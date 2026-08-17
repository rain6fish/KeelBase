<template>
  <div>
    <PageHeader :title="detail?.project.name ?? t('pmTitle')" :subtitle="subtitle" />

    <v-row v-if="detail" class="mb-4">
      <v-col cols="12" md="4">
        <v-card class="h-100">
          <v-card-title>{{ t('pmProjectInfo') }}</v-card-title>
          <v-card-text>
            <p v-if="detail.project.description">{{ detail.project.description }}</p>
            <v-chip size="small" class="mr-2" variant="tonal">{{ statusLabel(detail.project.status) }}</v-chip>
            <v-chip size="small" :color="riskColor(detail.project.riskLevel)" variant="tonal">{{ riskLabel(detail.project.riskLevel) }}</v-chip>
            <p class="mt-2 text-body-2">{{ detail.memberCount }} {{ t('pmMembers') }}</p>
            <v-divider class="my-3" />
            <v-btn color="primary" :loading="analyzing" prepend-icon="mdi-chart-line" @click="analyze">{{ t('crmAnalyzeRisk') }}</v-btn>
            <template v-if="analysis">
              <p class="mt-3 mb-0" :style="{ color: riskColor(analysis.level) }">
                <strong>{{ t('crmRiskLevel') }}: {{ riskLabel(analysis.level) }}</strong>
              </p>
              <p v-for="(r, i) in analysis.reasons" :key="i" class="mb-0 text-body-2">• {{ r }}</p>
            </template>
          </v-card-text>
        </v-card>
      </v-col>

      <v-col cols="12" md="8">
        <v-row>
          <v-col cols="12">
            <v-card>
              <v-card-title class="d-flex align-center">
                {{ t('pmMilestones') }}
                <v-spacer />
                <v-btn size="small" variant="tonal" prepend-icon="mdi-plus" @click="openAdd('milestone')">{{ t('pmAddMilestone') }}</v-btn>
              </v-card-title>
              <v-list dense>
                <v-list-item v-for="m in detail.milestones" :key="m.id">
                  <template #title>{{ m.title }}</template>
                  <template #subtitle>{{ m.status }} · {{ m.dueDate || '-' }}</template>
                </v-list-item>
                <v-list-item v-if="!detail.milestones.length">{{ t('pmNoMilestones') }}</v-list-item>
              </v-list>
            </v-card>
          </v-col>

          <v-col cols="12">
            <v-card>
              <v-card-title class="d-flex align-center">
                {{ t('pmTasks') }}
                <v-spacer />
                <v-btn size="small" variant="tonal" prepend-icon="mdi-plus" @click="openAdd('task')">{{ t('pmAddTask') }}</v-btn>
              </v-card-title>
              <v-list dense>
                <v-list-item v-for="tk in detail.tasks" :key="tk.id">
                  <template #title>
                    <span :class="{ 'text-decoration-line-through': tk.status === 'completed', 'text-grey': tk.status === 'completed' }">{{ tk.title }}</span>
                  </template>
                  <template #append>
                    <v-btn v-if="tk.status !== 'completed'" icon="mdi-check-circle" size="small" variant="text" color="success" @click="completeTask(tk.id)" />
                  </template>
                </v-list-item>
                <v-list-item v-if="!detail.tasks.length">{{ t('pmNoTasks') }}</v-list-item>
              </v-list>
            </v-card>
          </v-col>

          <v-col cols="12">
            <v-card>
              <v-card-title>{{ t('pmRisks') }}</v-card-title>
              <v-list dense>
                <v-list-item v-for="r in detail.risks" :key="r.id">
                  <template #title>{{ riskLabel(r.level) }} · {{ r.reason }}</template>
                </v-list-item>
                <v-list-item v-if="!detail.risks.length">{{ t('pmNoRisks') }}</v-list-item>
              </v-list>
            </v-card>
          </v-col>
        </v-row>
      </v-col>
    </v-row>

    <v-dialog v-model="showAdd" max-width="420">
      <v-card>
        <v-card-title>{{ addTitle }}</v-card-title>
        <v-card-text>
          <v-text-field v-model="addValue" :label="addHint" />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="showAdd = false">{{ t('cancel') }}</v-btn>
          <v-btn color="primary" :loading="saving" @click="onAdd">{{ t('save') }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import PageHeader from '@/components/PageHeader.vue'
import { useSnackbarStore } from '@/stores/snackbar'
import { pmApi, type PmProjectDetail, type PmRiskAnalysis } from '@/api/pm'

const { t } = useI18n()
const route = useRoute()
const snackbar = useSnackbarStore()
const id = Number(route.params.id)

const detail = ref<PmProjectDetail | null>(null)
const analysis = ref<PmRiskAnalysis | null>(null)
const analyzing = ref(false)
const showAdd = ref(false)
const saving = ref(false)
const addType = ref('task')
const addValue = ref('')

const subtitle = computed(() => detail.value ? `${detail.value.tasks.length} ${t('pmTasks')} · ${detail.value.milestones.length} ${t('pmMilestones')}` : '')
const addTitle = computed(() => ({ milestone: t('pmAddMilestone'), task: t('pmAddTask') })[addType.value] ?? '')
const addHint = computed(() => addType.value === 'milestone' ? t('pmMilestoneTitleHint') : t('pmTaskTitleHint'))

function statusLabel(s: string) {
  return { planned: t('pmStatusPlanned'), active: t('pmStatusActive'), on_hold: t('pmStatusOnHold'), completed: t('pmStatusCompleted') }[s] ?? s
}
function riskLabel(l: string) {
  return { low: t('crmRiskLow'), medium: t('crmRiskMedium'), high: t('crmRiskHigh'), critical: t('crmRiskCritical') }[l] ?? l
}
function riskColor(l: string) {
  return { low: 'green', medium: 'amber', high: 'orange', critical: 'red' }[l] ?? 'grey'
}

async function load() {
  try {
    detail.value = await pmApi.detail(id)
  } catch {
    snackbar.error(t('loadFailed'))
  }
}

async function analyze() {
  analyzing.value = true
  try {
    analysis.value = await pmApi.analyze(id)
    snackbar.success(t('crmAnalysisDone'))
  } catch {
    snackbar.error(t('loadFailed'))
  } finally {
    analyzing.value = false
  }
}

function openAdd(type: string) {
  addType.value = type
  addValue.value = ''
  showAdd.value = true
}

async function onAdd() {
  const value = addValue.value.trim()
  if (!value) return
  saving.value = true
  try {
    if (addType.value === 'milestone') {
      await pmApi.createMilestone(id, { title: value })
    } else {
      await pmApi.createTask({ projectId: id, title: value })
    }
    showAdd.value = false
    snackbar.success(t('crmCreated'))
    load()
  } catch {
    snackbar.error(t('saveFailed'))
  } finally {
    saving.value = false
  }
}

async function completeTask(taskId: number) {
  try {
    await pmApi.completeTask(taskId)
    snackbar.success(t('crmTaskCompleted'))
    load()
  } catch {
    snackbar.error(t('saveFailed'))
  }
}

onMounted(load)
</script>
