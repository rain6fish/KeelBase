<template>
  <div>
    <PageHeader :title="req?.title ?? t('apTitle')" :subtitle="req ? t('apStatusLabel', { s: statusLabel(req.status) }) : ''" />

    <v-row v-if="req" class="mb-4">
      <v-col cols="12" md="6">
        <v-card>
          <v-card-title>{{ t('apRequestInfo') }}</v-card-title>
          <v-card-text>
            <p><strong>{{ t('apType') }}:</strong> {{ typeLabel(req.type) }}</p>
            <p><strong>{{ t('apAmount') }}:</strong> ¥{{ req.amount.toFixed(2) }}</p>
            <p><strong>{{ t('apReason') }}:</strong> {{ req.reason }}</p>
            <v-chip size="small" class="mr-2" variant="tonal">{{ statusLabel(req.status) }}</v-chip>
            <v-chip size="small" :color="riskColor(req.riskLevel)" variant="tonal">{{ riskLabel(req.riskLevel) }}</v-chip>
            <v-card v-if="req.aiRecommendation" class="mt-3 pa-3 bg-amber-lighten-4">
              <strong>{{ t('apAiRecommendation') }}:</strong>
              <p class="mb-0 text-body-2">{{ req.aiRecommendation }}</p>
            </v-card>
          </v-card-text>
          <v-card-actions v-if="req.status === 'pending'">
            <v-btn color="primary" :loading="working" prepend-icon="mdi-robot" @click="review">{{ t('apReview') }}</v-btn>
          </v-card-actions>
          <v-card-actions v-else-if="req.status === 'needs_review'">
            <v-btn color="success" :loading="working" prepend-icon="mdi-check" @click="decide('approved')">{{ t('apApprove') }}</v-btn>
            <v-btn color="error" :loading="working" prepend-icon="mdi-close" @click="decide('rejected')">{{ t('apReject') }}</v-btn>
          </v-card-actions>
        </v-card>
      </v-col>
    </v-row>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import PageHeader from '@/components/PageHeader.vue'
import { useSnackbarStore } from '@/stores/snackbar'
import { approvalApi, type ApprovalRequest } from '@/api/approval'

const { t } = useI18n()
const route = useRoute()
const snackbar = useSnackbarStore()
const id = Number(route.params.id)

const req = ref<ApprovalRequest | null>(null)
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
