<template>
  <div>
    <PageHeader :title="detail?.project.name ?? t('pmTitle')" :subtitle="subtitle">
      <el-button type="primary" plain @click="showCopilot = true">
        <template #icon><AppIcon icon="mdi-robot-outline" /></template>
        {{ t('copilotTitle') }}
      </el-button>
    </PageHeader>

    <el-row v-if="detail" :gutter="16" class="mb-4">
      <el-col :xs="24" :md="8">
        <el-card shadow="never" class="h-100">
          <template #header>{{ t('pmProjectInfo') }}</template>
          <div>
            <p v-if="detail.project.description">{{ detail.project.description }}</p>
            <div class="d-flex ga-2 flex-wrap">
              <el-tag size="small" effect="light">{{ statusLabel(detail.project.status) }}</el-tag>
              <el-tag size="small" :type="{ green: 'success', amber: 'warning', orange: 'warning', red: 'danger', grey: 'info' }[riskColor(detail.project.riskLevel)] ?? 'info'" effect="light">{{ riskLabel(detail.project.riskLevel) }}</el-tag>
            </div>
            <p class="mt-2 text-body-2">{{ detail.memberCount }} {{ t('pmMembers') }}</p>
            <el-divider class="my-3" />
            <el-button type="primary" :loading="analyzing" @click="analyze">
              <template #icon><AppIcon icon="mdi-chart-line" /></template>
              {{ t('crmAnalyzeRisk') }}
            </el-button>
            <template v-if="analysis">
              <p class="mt-3 mb-0" :style="{ color: riskColor(analysis.level) }">
                <strong>{{ t('crmRiskLevel') }}: {{ riskLabel(analysis.level) }}</strong>
              </p>
              <p v-for="(r, i) in analysis.reasons" :key="i" class="mb-0 text-body-2">• {{ r }}</p>
            </template>
          </div>
        </el-card>
      </el-col>

      <el-col :xs="24" :md="16">
        <el-row :gutter="16">
          <el-col :span="24">
            <el-card shadow="never">
              <template #header>
                <div class="d-flex align-center justify-space-between">
                  <span>{{ t('pmMilestones') }}</span>
                  <el-button size="small" plain @click="openAdd('milestone')">
                    <template #icon><AppIcon icon="mdi-plus" /></template>
                    {{ t('pmAddMilestone') }}
                  </el-button>
                </div>
              </template>
              <div v-for="m in detail.milestones" :key="m.id" class="py-1">
                <div class="text-body-2">{{ m.title }}</div>
                <div class="text-caption text-medium-emphasis">{{ m.status }} · {{ m.dueDate || '-' }}</div>
              </div>
              <div v-if="!detail.milestones.length" class="text-medium-emphasis">{{ t('pmNoMilestones') }}</div>
            </el-card>
          </el-col>

          <el-col :span="24">
            <el-card shadow="never">
              <template #header>
                <div class="d-flex align-center justify-space-between">
                  <span>{{ t('pmTasks') }}</span>
                  <el-button size="small" plain @click="openAdd('task')">
                    <template #icon><AppIcon icon="mdi-plus" /></template>
                    {{ t('pmAddTask') }}
                  </el-button>
                </div>
              </template>
              <div v-for="tk in detail.tasks" :key="tk.id" class="d-flex align-center justify-space-between py-1">
                <span :class="{ 'text-decoration-line-through text-medium-emphasis': tk.status === 'completed' }">{{ tk.title }}</span>
                <el-button
                  v-if="tk.status !== 'completed'"
                  circle
                  text
                  type="success"
                  size="small"
                  :title="t('crmTaskCompleted')"
                  @click="completeTask(tk.id)"
                >
                  <AppIcon icon="mdi-check-circle" />
                </el-button>
              </div>
              <div v-if="!detail.tasks.length" class="text-medium-emphasis">{{ t('pmNoTasks') }}</div>
            </el-card>
          </el-col>

          <el-col :span="24">
            <el-card shadow="never">
              <template #header>{{ t('pmRisks') }}</template>
              <div v-for="r in detail.risks" :key="r.id" class="py-1 text-body-2">{{ riskLabel(r.level) }} · {{ r.reason }}</div>
              <div v-if="!detail.risks.length" class="text-medium-emphasis">{{ t('pmNoRisks') }}</div>
            </el-card>
          </el-col>
        </el-row>
      </el-col>
    </el-row>

    <!-- AI Copilot：当前项目上下文 AI 助手（P0） -->
    <PmCopilotDrawer
      v-model="showCopilot"
      :project-name="detail?.project.name ?? ''"
      :project-id="Number(route.params.id)"
    />

    <el-dialog v-model="showAdd" :width="420" :title="addTitle">
      <el-form-item :label="addHint">
        <el-input v-model="addValue" />
      </el-form-item>
      <template #footer>
        <div class="d-flex justify-end ga-2">
          <el-button @click="showAdd = false">{{ t('cancel') }}</el-button>
          <el-button type="primary" :loading="saving" @click="onAdd">{{ t('save') }}</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import PageHeader from '@/components/PageHeader.vue'
import PmCopilotDrawer from '@/components/PmCopilotDrawer.vue'
import { useSnackbarStore } from '@/stores/snackbar'
import { pmApi, type PmProjectDetail, type PmRiskAnalysis } from '@/api/pm'

const { t } = useI18n()
const route = useRoute()
const snackbar = useSnackbarStore()
const id = Number(route.params.id)

const detail = ref<PmProjectDetail | null>(null)
const analysis = ref<PmRiskAnalysis | null>(null)
const analyzing = ref(false)
const showCopilot = ref(false)
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
