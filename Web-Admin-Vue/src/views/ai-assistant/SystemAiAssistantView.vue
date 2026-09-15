<!-- SPDX-License-Identifier: Apache-2.0 -->
<template>
  <div class="d-flex flex-column" style="height: calc(100vh - 64px)">
    <PageHeader :title="t('navSystemAssistant')" :subtitle="t('assHint')" />

    <el-card shadow="never" class="flex-grow-1 d-flex flex-column" style="min-height: 0">
      <!-- 消息区 -->
      <div ref="scrollRef" class="flex-grow-1 overflow-auto pa-3" style="min-height: 320px">
        <div v-if="!items.length" class="text-medium-emphasis text-center mt-8 pa-4">
          {{ t('assWelcome') }}
        </div>

        <div v-for="(m, i) in items" :key="i" class="mb-3">
          <!-- 用户 -->
          <div v-if="m.kind === 'user'" class="d-flex justify-end">
            <div class="pa-3 rounded" style="background: var(--el-color-primary); color: #fff; maxWidth: 80%; white-space: pre-wrap">{{ m.content }}</div>
          </div>

          <!-- AI 文本 -->
          <div v-else-if="m.kind === 'ai'" class="d-flex justify-start">
            <div class="pa-3 rounded" style="background: var(--el-fill-color-light); maxWidth: 80%; white-space: pre-wrap">
              {{ m.content }}
              <div v-if="m.navigateTo" class="mt-2">
                <el-button size="small" type="primary" text @click="go(m.navigateTo!)">
                  {{ t('assNavigate') }} → {{ m.navigateTo }}
                </el-button>
              </div>
            </div>
          </div>

          <!-- 工具卡 -->
          <div v-else-if="m.kind === 'tool'" class="pa-2" style="border-left: 3px solid var(--el-color-primary); border-radius: 4px; background: var(--el-fill-color-light)">
            <div class="d-flex align-center ga-1">
              <AppIcon :icon="m.toolStart.isWrite ? 'mdi-pencil' : 'mdi-magnify'" :color="m.toolStart.isWrite ? 'var(--el-color-primary)' : 'var(--el-text-color-secondary)'" size="16" />
              <el-tag :type="m.toolStart.isWrite ? 'primary' : 'info'" size="small" effect="plain">{{ m.toolStart.isWrite ? t('writeOp') : t('readOp') }}</el-tag>
              <span class="text-caption font-weight-medium">{{ m.toolStart.name }}</span>
            </div>
            <div v-if="m.toolStart.isWrite && m.toolStart.summary" class="text-caption text-medium-emphasis mt-1">{{ m.toolStart.summary }}</div>
            <div v-if="m.toolEnd" class="text-caption mt-1" :class="m.toolEnd.success ? 'text-success' : 'text-error'">
              {{ m.toolEnd.success ? t('toolDone') : (m.toolEnd.error || t('toolFailed')) }}
            </div>
          </div>

          <!-- 确认卡 -->
          <div v-else-if="m.kind === 'confirmation'" class="d-flex justify-start">
            <AiConfirmationCard
              v-if="m.status === 'pending'"
              :confirmation="m.confirmation"
              @approved="(trust) => onApprove(m, trust)"
              @rejected="() => onReject(m)"
            />
            <div v-else class="pa-3 rounded" :class="m.result?.approved ? 'text-success' : 'text-error'" style="background: var(--el-fill-color-light)">
              {{ m.result?.approved ? t('approved') : t('rejected') }}
            </div>
          </div>

          <!-- 错误/提示 -->
          <div v-else-if="m.kind === 'notice'" class="text-error text-body-2 pa-1">{{ m.content }}</div>
        </div>

        <div v-if="sending" class="text-medium-emphasis">{{ t('assThinking') }}</div>
      </div>

      <!-- 输入区 -->
      <div class="d-flex align-start ga-2 pt-3">
        <el-input
          v-model="input"
          type="textarea"
          :rows="2"
          :placeholder="t('assPlaceholder')"
          resize="none"
          :disabled="sending"
          @keydown.enter.exact.prevent="send"
        />
        <div class="d-flex flex-column ga-1">
          <el-button type="primary" :loading="sending" @click="send">{{ t('send') }}</el-button>
          <el-button size="small" text :disabled="sending" @click="newChat">{{ t('assNewChat') }}</el-button>
        </div>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import PageHeader from '@/components/PageHeader.vue'
import AppIcon from '@/components/AppIcon.vue'
import AiConfirmationCard from '@/components/AiConfirmationCard.vue'
import { useSnackbarStore } from '@/stores/snackbar'
import { streamChat, confirmTool, type AiConfirmation, type AiToolEnd, type AiToolStart } from '@/utils/streamChat'

type AssistantItem =
  | { kind: 'user'; content: string }
  | { kind: 'ai'; content: string; navigateTo?: string }
  | { kind: 'tool'; toolStart: AiToolStart; toolEnd?: AiToolEnd }
  | { kind: 'confirmation'; confirmation: AiConfirmation; status: 'pending' | 'decided'; result?: { approved: boolean } }
  | { kind: 'notice'; content: string }

const { t } = useI18n()
const router = useRouter()
const snackbar = useSnackbarStore()

const items = ref<AssistantItem[]>([])
const input = ref('')
const sending = ref(false)
const conversationId = ref<string | null>(null)
const scrollRef = ref<HTMLElement | null>(null)
const abortCtrl = ref<AbortController | null>(null)

async function scrollBottom() {
  await nextTick()
  if (scrollRef.value) scrollRef.value.scrollTop = scrollRef.value.scrollHeight
}

function newChat() {
  abortCtrl.value?.abort()
  abortCtrl.value = null
  items.value = []
  conversationId.value = null
  input.value = ''
  sending.value = false
}

onUnmounted(() => {
  abortCtrl.value?.abort()
  abortCtrl.value = null
})

async function send() {
  const text = input.value.trim()
  if (!text || sending.value) return
  input.value = ''
  items.value.push({ kind: 'user', content: text })
  sending.value = true
  await scrollBottom()

  abortCtrl.value?.abort()
  const ctrl = new AbortController()
  abortCtrl.value = ctrl

  let aiIndex = -1
  let pendingConfirmation: AssistantItem & { kind: 'confirmation' } | null = null
  const pushAi = () => {
    if (aiIndex === -1) {
      items.value.push({ kind: 'ai', content: '' })
      aiIndex = items.value.length - 1
    }
  }

  try {
    // 管理端系统助手：SSE 流式 + 写确认通道（/admin/ai/chat/stream）
    await streamChat({
      endpoint: '/admin/ai/chat/stream',
      message: text,
      conversationId: conversationId.value ?? undefined,
      signal: ctrl.signal,
      onEvent: (ev) => {
        switch (ev.type) {
          case 'text': {
            pushAi()
            const item = items.value[aiIndex]
            if (item && item.kind === 'ai') item.content += ev.content
            void scrollBottom()
            break
          }
          case 'navigate': {
            pushAi()
            const item = items.value[aiIndex]
            if (item && item.kind === 'ai') item.navigateTo = ev.route
            void scrollBottom()
            break
          }
          case 'tool_start': {
            items.value.push({ kind: 'tool', toolStart: ev.toolStart })
            void scrollBottom()
            break
          }
          case 'confirmation_request': {
            pendingConfirmation = { kind: 'confirmation', confirmation: ev.confirmation, status: 'pending' }
            items.value.push(pendingConfirmation)
            void scrollBottom()
            break
          }
          case 'confirmation_decision': {
            const d = ev.confirmationDecision
            if (pendingConfirmation) {
              pendingConfirmation.status = 'decided'
              pendingConfirmation.result = { approved: d.approved }
              pendingConfirmation = null
            }
            void scrollBottom()
            break
          }
          case 'tool_end': {
            const match = [...items.value].reverse().find(
              (it) => it.kind === 'tool' && it.toolStart.name === ev.toolEnd.name,
            )
            if (match && match.kind === 'tool') match.toolEnd = ev.toolEnd
            void scrollBottom()
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
        sending.value = false
        void scrollBottom()
      },
      onError: (err) => {
        items.value.push({ kind: 'notice', content: err.message || t('assLoadFailed') })
        sending.value = false
        void scrollBottom()
      },
    })
  } catch {
    sending.value = false
  } finally {
    abortCtrl.value = null
    sending.value = false
  }
}

async function onApprove(item: AssistantItem & { kind: 'confirmation' }, trustTool: boolean) {
  item.status = 'decided'
  item.result = { approved: true }
  try {
    await confirmTool(item.confirmation.token, 'approve', trustTool)
  } catch {
    snackbar.error(t('confirmFailed'))
    item.status = 'pending'
    item.result = undefined
  }
}

async function onReject(item: AssistantItem & { kind: 'confirmation' }) {
  item.status = 'decided'
  item.result = { approved: false }
  try {
    await confirmTool(item.confirmation.token, 'decline')
  } catch {
    snackbar.error(t('confirmFailed'))
    item.status = 'pending'
    item.result = undefined
  }
}

function go(route: string) {
  router.push(route)
}
</script>
