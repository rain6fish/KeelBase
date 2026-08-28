<template>
  <el-drawer v-model="open" :title="t('copilotTitle')" size="420px" @closed="onClosed">
    <!-- 对话区 -->
    <div ref="scrollRef" class="copilot-chat flex-grow-1 mb-3">
      <div v-if="!items.length" class="text-medium-emphasis pa-2">
        {{ t('copilotHint', { name: customerName }) }}
      </div>
      <div v-for="(m, i) in items" :key="i" class="mb-2">
        <!-- 用户消息 -->
        <div v-if="m.kind === 'user'" class="d-flex justify-end">
          <div class="pa-2 copilot-bubble copilot-user">{{ m.content }}</div>
        </div>

        <!-- AI 文本（流式累加） -->
        <div v-else-if="m.kind === 'ai'" class="d-flex justify-start">
          <div class="pa-2 copilot-bubble copilot-ai">{{ m.content }}</div>
        </div>

        <!-- 工具卡：读/写徽标 + 摘要 + 结果 -->
        <div v-else-if="m.kind === 'tool'" class="pa-2" style="border-left: 3px solid var(--el-color-primary); border-radius: 4px; background: var(--el-fill-color-light)">
          <div class="d-flex align-center ga-1">
            <AppIcon :icon="m.toolStart.isWrite ? 'mdi-pencil' : 'mdi-magnify'" :color="m.toolStart.isWrite ? 'var(--el-color-primary)' : 'var(--el-text-color-secondary)'" size="16" />
            <el-tag :type="m.toolStart.isWrite ? 'primary' : 'info'" size="small" effect="plain">{{ m.toolStart.isWrite ? t('writeOp') : t('readOp') }}</el-tag>
            <span class="text-caption font-weight-medium">{{ toolLabelText(m.toolStart.name) }}</span>
          </div>
          <div v-if="m.toolStart.isWrite && m.toolStart.summary" class="text-caption text-medium-emphasis mt-1">{{ m.toolStart.summary }}</div>
          <div v-if="m.toolEnd" class="text-caption mt-1" :class="m.toolEnd.success ? 'text-success' : 'text-error'">
            {{ m.toolEnd.success ? t('toolDone') : (m.toolEnd.error || t('toolFailed')) }}
          </div>
        </div>

        <!-- 确认卡：批准/拒绝后显示结果 -->
        <div v-else-if="m.kind === 'confirmation'" class="d-flex justify-start">
          <AiConfirmationCard
            v-if="m.status === 'pending'"
            :confirmation="m.confirmation"
            @approved="(trust) => onApprove(m, trust)"
            @rejected="() => onReject(m)"
          />
          <div v-else class="pa-2 copilot-bubble copilot-ai" :class="m.result?.approved ? 'text-success' : 'text-error'">
            {{ m.result?.approved ? t('approved') : t('rejected') }}
          </div>
        </div>

        <!-- 错误/提示 -->
        <div v-else-if="m.kind === 'notice'" class="text-error text-body-2 pa-1">{{ m.content }}</div>
      </div>
      <div v-if="loading" class="text-caption text-medium-emphasis pa-2">{{ t('thinking') }}</div>
    </div>

    <!-- 预置问题（AI Copilot：让业务用户一键问） -->
    <div class="d-flex flex-wrap ga-1 mb-2">
      <el-button v-for="q in quickQuestions" :key="q.key" size="small" plain :disabled="loading" @click="sendQuick(q)">
        {{ q.label }}
      </el-button>
    </div>

    <!-- 输入区 -->
    <div class="d-flex ga-2">
      <el-input
        v-model="input"
        :placeholder="t('copilotPlaceholder')"
        :disabled="loading"
        @keyup.enter="send(input)"
      />
      <el-button type="primary" :loading="loading" @click="send(input)">
        <template #icon><AppIcon icon="mdi-send" /></template>
      </el-button>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSnackbarStore } from '@/stores/snackbar'
import AppIcon from '@/components/AppIcon.vue'
import AiConfirmationCard from '@/components/AiConfirmationCard.vue'
import { streamChat, confirmTool, type AiConfirmation, type AiToolEnd, type AiToolStart } from '@/utils/streamChat'
import { toolLabel } from '@/utils/toolLabel'

const props = defineProps<{
  modelValue: boolean
  customerName: string
  customerId: number
}>()
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  /** D1 闭环：AI 写操作执行成功 → 父组件刷新业务数据 + 钻取治理轨迹 */
  (e: 'executed', payload: { resultType: string; resultId: number }): void
}>()

const { t, tm } = useI18n()
/** 工具名人类标签（D2 feature 命名空间），未命中回退原始名 */
const toolLabelText = (name: string) => toolLabel(tm('feature') as Record<string, string> | undefined, name)
const snackbar = useSnackbarStore()
const scrollRef = ref<HTMLElement>()
const items = ref<CopilotItem[]>([])
const input = ref('')
const loading = ref(false)
const conversationId = ref<string | undefined>()
const abortCtrl = ref<AbortController | null>(null)

type CopilotItem =
  | { kind: 'user'; content: string }
  | { kind: 'ai'; content: string }
  | { kind: 'tool'; toolStart: AiToolStart; toolEnd?: AiToolEnd }
  | { kind: 'confirmation'; confirmation: AiConfirmation; status: 'pending' | 'decided'; result?: { approved: boolean } }
  | { kind: 'notice'; content: string }

const open = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

/** AI Copilot 预置问题：围绕当前客户（本人数据作用域） */
const quickQuestions = computed(() => [
  { key: 'risk', label: t('copilotQRisk') },
  { key: 'orders', label: t('copilotQOrders') },
  { key: 'followup', label: t('copilotQFollowup') },
])

watch(open, (v) => {
  if (v) {
    items.value = []
    conversationId.value = undefined
    input.value = ''
    abortCtrl.value = null
    loading.value = false
  }
})

function onClosed() {
  abortCtrl.value?.abort()
  abortCtrl.value = null
  loading.value = false
}

function customerContext(): string {
  return `当前客户「${props.customerName}」（ID ${props.customerId}）`
}

function sendQuick(q: { key: string; label: string }) {
  const message = `${customerContext()}。${q.label}`
  send(message)
}

function scrollBottom() {
  void nextTick(() => {
    const el = scrollRef.value
    // jsdom 无 scrollTo：防御（测试环境不抛 unhandled rejection）
    if (el && typeof el.scrollTo === 'function') el.scrollTo({ top: el.scrollHeight })
  })
}

/** 工具名 → 副作用 resultType（对齐后端 ai.service.ts 的映射） */
function resultTypeFor(toolName: string): string {
  if (toolName === 'create_followup_task') return 'crm_task'
  if (toolName === 'create_project_task') return 'pm_task'
  if (toolName === 'create_event') return 'event'
  if (toolName === 'submit_approval_request') return 'app_request'
  return 'todo'
}

async function send(raw: string) {
  const message = raw.trim()
  if (!message || loading.value) return
  items.value.push({ kind: 'user', content: message })
  input.value = ''
  loading.value = true

  // 上一轮未完成流中止（正常情况下 onClosed 已 abort）
  abortCtrl.value?.abort()
  const ctrl = new AbortController()
  abortCtrl.value = ctrl

  let aiIndex = -1
  let executed: { resultType: string; resultId: number } | null = null
  let pendingConfirmation: CopilotItem & { kind: 'confirmation' } | null = null

  const pushAi = () => {
    if (aiIndex === -1) {
      items.value.push({ kind: 'ai', content: '' })
      aiIndex = items.value.length - 1
    }
  }

  try {
    await streamChat({
      message,
      conversationId: conversationId.value,
      signal: ctrl.signal,
      onEvent: (ev) => {
        switch (ev.type) {
          case 'text': {
            pushAi()
            const item = items.value[aiIndex]
            if (item && item.kind === 'ai') item.content += ev.content
            scrollBottom()
            break
          }
          case 'tool_start': {
            items.value.push({ kind: 'tool', toolStart: ev.toolStart })
            scrollBottom()
            break
          }
          case 'confirmation_request': {
            pendingConfirmation = { kind: 'confirmation', confirmation: ev.confirmation, status: 'pending' }
            items.value.push(pendingConfirmation)
            scrollBottom()
            break
          }
          case 'confirmation_decision': {
            const d = ev.confirmationDecision
            if (pendingConfirmation) {
              pendingConfirmation.status = 'decided'
              pendingConfirmation.result = { approved: d.approved }
              pendingConfirmation = null
            }
            // 批准且带 resultId → 记住执行结果，待 tool_end 确认后通知父组件
            if (d.approved && d.resultId !== undefined) {
              executed = { resultType: resultTypeFor(d.toolName), resultId: d.resultId }
            }
            scrollBottom()
            break
          }
          case 'tool_end': {
            // 确认卡在工具卡之后入列 → 按工具名反查匹配的工具卡，附加结束态
            const match = [...items.value].reverse().find(
              (it) => it.kind === 'tool' && it.toolStart.name === ev.toolEnd.name,
            )
            if (match && match.kind === 'tool') match.toolEnd = ev.toolEnd
            // 写操作成功 → D1 闭环：通知父组件刷新 + 钻取治理轨迹
            if (ev.toolEnd.success && executed) {
              emit('executed', executed)
              executed = null
            }
            scrollBottom()
            break
          }
          case 'done': {
            conversationId.value = ev.conversationId
            break
          }
          case 'error': {
            if (ev.error) items.value.push({ kind: 'notice', content: ev.error })
            break
          }
        }
      },
      onEnd: () => {
        loading.value = false
        scrollBottom()
      },
      onError: (err) => {
        items.value.push({ kind: 'notice', content: err.message || t('loadFailed') })
        loading.value = false
        scrollBottom()
      },
    })
  } catch {
    // streamChat 内部已回调 onError；此处兜底
    loading.value = false
  } finally {
    abortCtrl.value = null
    loading.value = false // 中止/onEnd 缺失时兜底，防 loading 卡死
  }
}

async function onApprove(item: CopilotItem & { kind: 'confirmation' }, trustTool: boolean) {
  item.status = 'decided'
  item.result = { approved: true } // 乐观显示，等服务器 confirmation_decision 收敛
  try {
    await confirmTool(item.confirmation.token, 'approve', trustTool)
  } catch {
    snackbar.error(t('confirmFailed'))
    item.status = 'pending'
    item.result = undefined
  }
}

async function onReject(item: CopilotItem & { kind: 'confirmation' }) {
  item.status = 'decided'
  item.result = { approved: false }
  try {
    await confirmTool(item.confirmation.token, 'reject')
  } catch {
    snackbar.error(t('confirmFailed'))
    item.status = 'pending'
    item.result = undefined
  }
}
</script>

<style scoped>
.copilot-chat {
  overflow-y: auto;
  min-height: 240px;
  max-height: 46vh;
}
.copilot-bubble {
  border-radius: 8px;
  max-width: 78%;
  white-space: pre-wrap;
}
.copilot-user {
  background: var(--el-color-primary-light-9);
}
.copilot-ai {
  background: var(--el-fill-color-light);
}
</style>
