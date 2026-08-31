<template>
  <div>
    <PageHeader :title="req?.title ?? t('apTitle')" :subtitle="req ? t('apStatusLabel', { s: statusLabel(req.status) }) : ''">
      <el-button v-if="req" text size="small" @click="openHistory('app_request', req.id)">
        <template #icon><AppIcon icon="mdi-history" /></template>
        {{ t('bhOpen') }}
      </el-button>
    </PageHeader>

    <el-row v-if="req" :gutter="16" class="mb-4">
      <el-col :xs="24" :md="12">
        <el-card shadow="never">
          <template #header>{{ t('apRequestInfo') }}</template>
          <div>
            <p><strong>{{ t('apType') }}:</strong> {{ typeLabel(req.type) }}</p>
            <p><strong>{{ t('apAmount') }}:</strong> ¥{{ req.amount.toFixed(2) }}</p>
            <p><strong>{{ t('apReason') }}:</strong> {{ req.reason }}</p>
            <div class="d-flex ga-2 flex-wrap">
              <el-tag size="small" effect="light">{{ statusLabel(req.status) }}</el-tag>
              <el-tag size="small" :type="{ green: 'success', amber: 'warning', orange: 'warning', red: 'danger', grey: 'info' }[riskColor(req.riskLevel)] ?? 'info'" effect="light">{{ riskLabel(req.riskLevel) }}</el-tag>
            </div>
            <el-alert v-if="req.aiRecommendation" type="warning" :closable="false" class="mt-3">
              <template #title><strong>{{ t('apAiRecommendation') }}:</strong></template>
              {{ req.aiRecommendation }}
            </el-alert>
          </div>
          <div v-if="req.status === 'pending'" class="mt-3">
            <el-button type="primary" :loading="working" @click="review">
              <template #icon><AppIcon icon="mdi-robot" /></template>
              {{ t('apReview') }}
            </el-button>
          </div>
          <div v-else-if="req.status === 'needs_review'" class="mt-3 d-flex ga-2">
            <el-button type="success" :loading="working" @click="decide('approved')">
              <template #icon><AppIcon icon="mdi-check" /></template>
              {{ t('apApprove') }}
            </el-button>
            <el-button type="danger" :loading="working" @click="decide('rejected')">
              <template #icon><AppIcon icon="mdi-close" /></template>
              {{ t('apReject') }}
            </el-button>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- §22.16 A-2 业务实体行为史 -->
    <BusinessHistoryDrawer
      v-model="historyOpen"
      :result-type="historyTarget?.resultType ?? ''"
      :result-id="historyTarget?.resultId ?? 0"
    />
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import PageHeader from '@/components/PageHeader.vue'
import BusinessHistoryDrawer from '@/components/BusinessHistoryDrawer.vue'
import { useSnackbarStore } from '@/stores/snackbar'
import { approvalApi, type ApprovalRequest } from '@/api/approval'

const { t } = useI18n()
const route = useRoute()
const snackbar = useSnackbarStore()
const id = Number(route.params.id)

const req = ref<ApprovalRequest | null>(null)
// §22.16 A-2 业务实体行为史
const historyOpen = ref(false)
const historyTarget = ref<{ resultType: string; resultId: number } | null>(null)
function openHistory(resultType: string, resultId: number) {
  historyTarget.value = { resultType, resultId }
  historyOpen.value = true
}
const working = ref(false)

function statusLabel(s: string) {
  return {
    pending: t('apStatusPending'),
    needs_review: t('apStatusNeedsReview'),
    approved: t('apStatusApproved'),
    rejected: t('apStatusRejected'),
    auto_approved: t('apStatusAutoApproved'),
  }[s] ?? s
}
function typeLabel(type: string) {
  return { reimbursement: t('apTypeReimbursement'), purchase: t('apTypePurchase'), leave: t('apTypeLeave') }[type] ?? type
}
function riskLabel(l: string) {
  return { low: t('crmRiskLow'), medium: t('crmRiskMedium'), high: t('crmRiskHigh'), critical: t('crmRiskCritical') }[l] ?? l
}
function riskColor(l: string) {
  return { low: 'green', medium: 'amber', high: 'orange', critical: 'red' }[l] ?? 'grey'
}

async function load() {
  try {
    req.value = await approvalApi.getRequest(id)
  } catch {
    snackbar.error(t('loadFailed'))
  }
}

async function review() {
  working.value = true
  try {
    req.value = await approvalApi.review(id)
    snackbar.success(t('apReviewed'))
  } catch {
    snackbar.error(t('saveFailed'))
  } finally {
    working.value = false
  }
}

async function decide(decision: 'approved' | 'rejected') {
  working.value = true
  try {
    req.value = await approvalApi.decide(id, decision)
    snackbar.success(t('apDecided'))
  } catch {
    snackbar.error(t('saveFailed'))
  } finally {
    working.value = false
  }
}

onMounted(load)
</script>
