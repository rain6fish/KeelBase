<!-- SPDX-License-Identifier: Apache-2.0 -->
<template>
  <el-drawer
    :model-value="modelValue"
    :size="'min(600px, 92vw)'"
    direction="rtl"
    :with-header="false"
    class="ai-assistant-drawer"
    @update:model-value="emit('update:modelValue', $event)"
    @open="onOpen"
    @closed="onClosed"
  >
    <div class="d-flex flex-column" style="height: 100%">
      <!-- 头部 -->
      <div class="d-flex align-center justify-space-between drawer-header px-4 py-3">
        <div class="d-flex align-center ga-2">
          <div class="ai-avatar d-flex align-center justify-center">
            <AppIcon icon="mdi-robot-happy-outline" size="22" />
          </div>
          <div>
            <div class="font-weight-bold">{{ auth.isAdmin ? t('navSystemAssistant') : t('aiAssistant') }}</div>
            <div class="text-caption text-medium-emphasis">{{ auth.isAdmin ? t('assHint') : t('aiAssistantHint') }}</div>
          </div>
        </div>
        <div class="d-flex ga-1">
          <el-button circle size="small" :title="view === 'list' ? t('assBackToList') : t('assHistory')" @click="toggleView">
            <AppIcon :icon="view === 'list' ? 'mdi-message-processing-outline' : 'mdi-history'" />
          </el-button>
          <el-button circle size="small" :title="t('assNewChat')" @click="newChat">
            <AppIcon icon="mdi-plus" />
          </el-button>
        </div>
      </div>

      <!-- 主体 -->
      <div ref="bodyRef" class="flex-grow-1 overflow-auto px-4 pb-2">
        <!-- 历史列表 -->
        <template v-if="view === 'list'">
          <div v-if="historyLoading" class="text-center pa-6 text-medium-emphasis">{{ t('loading') }}</div>
          <div v-else-if="!conversations.length" class="text-center pa-6 text-medium-emphasis">{{ t('assNoHistory') }}</div>
          <div v-else>
            <div
              v-for="c in conversations"
              :key="c.id"
              class="history-item d-flex align-center ga-2"
              @click="openConversation(c.id)"
            >
              <div class="flex-grow-1 overflow-hidden">
                <div class="text-body-2 text-truncate">{{ previewTitle(c) }}</div>
                <div class="text-caption text-medium-emphasis">{{ formatTime(c.lastActivityAt) }}</div>
              </div>
              <el-button text size="small" type="danger" :title="t('delete')" @click.stop="requestDelete(c)">
                <AppIcon icon="mdi-delete-outline" />
              </el-button>
            </div>
          </div>
        </template>

        <!-- 聊天 -->
        <template v-else>
          <el-alert
            v-if="aiNotReady"
            :title="t('aiNotReadyTitle')"
            type="warning"
            :closable="false"
            class="mb-3 ai-not-ready"
          >
            <div class="text-caption">{{ t('aiNotReadyBody') }}</div>
          </el-alert>
          <div v-if="!items.length" class="text-center text-medium-emphasis pa-6">{{ t('assWelcome') }}</div>

          <div v-for="(m, i) in items" :key="i" class="mb-3">
            <!-- 用户 -->
            <div v-if="m.kind === 'user'" class="d-flex justify-content-end">
              <div class="pa-3 msg-bubble user-bubble">{{ m.content }}</div>
            </div>

            <!-- AI 文本 -->
            <div v-else-if="m.kind === 'ai'" class="d-flex justify-content-start">
              <div class="pa-3 msg-bubble assistant-bubble">
                <div style="white-space: pre-wrap">{{ m.content }}</div>
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
            <div v-else-if="m.kind === 'confirmation'" class="d-flex justify-content-start">
              <AiConfirmationCard
                v-if="m.status === 'pending'"
                :confirmation="m.confirmation"
                @approved="(trust) => onApprove(m, trust)"
                @rejected="() => onReject(m)"
              />
              <div v-else class="pa-3 msg-bubble assistant-bubble" :class="m.result?.approved ? 'text-success' : 'text-error'">
                {{ m.result?.approved ? t('approved') : t('rejected') }}
              </div>
            </div>

            <!-- 错误/提示 -->
            <div v-else-if="m.kind === 'notice'" class="text-error text-body-2 pa-1">{{ m.content }}</div>
          </div>

          <div v-if="sending" class="text-medium-emphasis pa-2">{{ t('assThinking') }}</div>
        </template>
      </div>

      <!-- 输入区 -->
      <div v-if="view === 'chat'" class="d-flex align-start ga-2 px-4 py-3 drawer-footer">
        <el-input
          v-model="input"
          type="textarea"
          :rows="2"
          :placeholder="t('assPlaceholder')"
          resize="none"
          :disabled="sending"
          @keydown.enter.exact.prevent="send"
        />
        <el-button type="primary" :loading="sending" @click="send">{{ t('send') }}</el-button>
      </div>
    </div>

    <ConfirmDialog
      v-model="showDelete"
      :title="t('delete')"
      :content="t('assDeleteConfirm')"
      :loading="deleting"
      @confirm="onDelete"
    />
  </el-drawer>
</template>

<script setup lang="ts">
import { nextTick, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import AiConfirmationCard from '@/components/AiConfirmationCard.vue'
import { useSnackbarStore } from '@/stores/snackbar'
import { useAuthStore } from '@/stores/auth'
import { ApiError } from '@/api/client'
import { adminApi } from '@/api/admin'
import { capabilitiesApi } from '@/api/capabilities'
import { streamChat, confirmTool, type AiConfirmation, type AiToolEnd, type AiToolStart } from '@/utils/streamChat'
import type { AiConversationSummary } from '@/types/admin'

type ChatItem =
  | { kind: 'user'; content: string }
  | { kind: 'ai'; content: string; navigateTo?: string }
  | { kind: 'tool'; toolStart: AiToolStart; toolEnd?: AiToolEnd }
  | { kind: 'confirmation'; confirmation: AiConfirmation; status: 'pending' | 'decided'; result?: { approved: boolean } }
  | { kind: 'notice'; content: string }

defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>()

const { t } = useI18n()
const router = useRouter()
const snackbar = useSnackbarStore()
const auth = useAuthStore()

const view = ref<'chat' | 'list'>('chat')
const items = ref<ChatItem[]>([])
const input = ref('')
const sending = ref(false)
const conversationId = ref<string | null>(null)
const bodyRef = ref<HTMLElement | null>(null)
const abortCtrl = ref<AbortController | null>(null)

const conversations = ref<AiConversationSummary[]>([])
const historyLoading = ref(false)
const showDelete = ref(false)
const deleting = ref(false)
const pendingDelete = ref<AiConversationSummary | null>(null)

// 运行时 AI 可用性：feature 开了但没配 LLM → 顶栏提示配置指引
const aiNotReady = ref(false)

async function onOpen() {
  // 打开抽屉刷新历史列表（聊天状态保留在内存）
  historyLoading.value = true
  try {
    conversations.value = await adminApi.aiConversations()
  } catch {
    snackbar.error(t('assLoadFailed'))
  } finally {
    historyLoading.value = false
  }
  try {
    const caps = await capabilitiesApi.get()
    aiNotReady.value = caps.ai ? caps.ai.enabled && !caps.ai.providerConfigured : false
  } catch {
    aiNotReady.value = false
  }
}

function onClosed() {
  abortCtrl.value?.abort()
  abortCtrl.value = null
  sending.value = false
}

onUnmounted(() => {
  abortCtrl.value?.abort()
  abortCtrl.value = null
})

async function scrollBottom() {
  await nextTick()
  if (bodyRef.value) bodyRef.value.scrollTop = bodyRef.value.scrollHeight
}

function toggleView() {
  view.value = view.value === 'list' ? 'chat' : 'list'
  if (view.value === 'chat') void scrollBottom()
}

function newChat() {
  abortCtrl.value?.abort()
  abortCtrl.value = null
  items.value = []
  conversationId.value = null
  input.value = ''
  sending.value = false
  view.value = 'chat'
}

async function openConversation(id: string) {
  try {
    const conv = await adminApi.aiConversation(id)
    items.value = conv.messages
      .filter((m): m is AiConversationSummary['messages'][number] => m.role === 'user' || m.role === 'assistant')
      .map((m) => (m.role === 'user'
        ? ({ kind: 'user', content: m.content } as ChatItem)
        : ({ kind: 'ai', content: m.content } as ChatItem)))
    conversationId.value = conv.id
    view.value = 'chat'
    await scrollBottom()
  } catch {
    snackbar.error(t('assLoadFailed'))
  }
}

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
  let pendingConfirmation: ChatItem & { kind: 'confirmation' } | null = null
  const pushAi = () => {
    if (aiIndex === -1) {
      items.value.push({ kind: 'ai', content: '' })
      aiIndex = items.value.length - 1
    }
  }

  try {
    // 权限区分：管理员 = 系统 AI 助手（/admin/ai/chat/stream）；普通用户 = 本人数据作用域 AI（/ai/chat/stream）
    // 必须走流式：写操作（创建任务/事件/待办）依赖 confirmation_request 事件弹确认卡，非流式会被拒。
    await streamChat({
      endpoint: auth.isAdmin ? '/admin/ai/chat/stream' : undefined,
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
        // NC-2：ApiError 带可执行指引（LLM_UNAVAILABLE 等）→ 错误卡；否则聊天内提示
        items.value.push({
          kind: 'notice',
          content: err instanceof ApiError ? err.message : err.message || t('assLoadFailed'),
        })
        sending.value = false
        void scrollBottom()
      },
    })
  } catch {
    sending.value = false
  } finally {
    abortCtrl.value = null
    sending.value = false
    await scrollBottom()
  }
}

async function onApprove(item: ChatItem & { kind: 'confirmation' }, trustTool: boolean) {
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

async function onReject(item: ChatItem & { kind: 'confirmation' }) {
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
  emit('update:modelValue', false)
  router.push(route)
}

function requestDelete(c: AiConversationSummary) {
  pendingDelete.value = c
  showDelete.value = true
}

async function onDelete() {
  if (!pendingDelete.value) return
  deleting.value = true
  try {
    await adminApi.deleteAiConversation(pendingDelete.value.id)
    conversations.value = conversations.value.filter((x) => x.id !== pendingDelete.value!.id)
    // 删除的是当前聊天 → 复位
    if (conversationId.value === pendingDelete.value.id) newChat()
    snackbar.success(t('deleteSuccess'))
  } catch {
    snackbar.error(t('deleteFailed'))
  } finally {
    deleting.value = false
    showDelete.value = false
  }
}

/** 列表标题预览：首条 user 消息内容（与普通用户 AI 聊天一致），超长截断 */
function previewTitle(c: AiConversationSummary): string {
  let text = t('newConversation')
  for (const m of c.messages) {
    if (m.role === 'user' && m.content.trim()) {
      text = m.content.trim().replace(/\s+/g, ' ')
      break
    }
  }
  return text.length > 30 ? `${text.slice(0, 30)}...` : text
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const now = new Date()
  if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()) {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }
  return `${d.getMonth() + 1}/${d.getDate()}`
}
</script>

<style scoped>
.drawer-header {
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.drawer-footer {
  border-top: 1px solid var(--el-border-color-lighter);
  background: var(--el-bg-color);
}
.ai-avatar {
  width: 38px;
  height: 38px;
  border-radius: var(--keel-radius-md);
  color: #fff;
  background: linear-gradient(135deg, var(--keel-brand-gradient-from, var(--el-color-primary)) 0%, var(--keel-brand-gradient-to, var(--el-color-primary)) 100%);
  box-shadow: 0 4px 12px var(--keel-glow, rgba(79, 70, 229, 0.3));
  flex-shrink: 0;
}
.history-item {
  padding: 10px 8px;
  margin: 0 -8px;
  border-radius: 10px;
  cursor: pointer;
}
.history-item:hover {
  background: var(--el-fill-color-light);
}
.msg-bubble {
  max-width: 85%;
}
.user-bubble {
  background: var(--el-color-primary);
  color: #fff;
  border-top-right-radius: 4px;
}
.assistant-bubble {
  background: var(--el-fill-color-light);
  border-top-left-radius: 4px;
}
</style>
