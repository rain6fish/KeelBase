<template>
  <el-drawer
    :model-value="modelValue"
    :size="420"
    direction="rtl"
    :with-header="false"
    class="ai-assistant-drawer"
    @update:model-value="emit('update:modelValue', $event)"
    @open="onOpen"
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
          <div v-if="!messages.length" class="text-center text-medium-emphasis pa-6">{{ t('assWelcome') }}</div>
          <div
            v-for="(m, i) in messages"
            :key="i"
            class="d-flex mb-3"
            :class="m.role === 'user' ? 'justify-content-end' : 'justify-content-start'"
          >
            <div class="pa-3 msg-bubble" :class="m.role === 'user' ? 'user-bubble' : 'assistant-bubble'">
              <div style="white-space: pre-wrap">{{ m.content }}</div>
              <div v-if="m.role === 'assistant' && m.navigateTo" class="mt-2">
                <el-button size="small" type="primary" text @click="go(m.navigateTo!)">
                  {{ t('assNavigate') }} → {{ m.navigateTo }}
                </el-button>
              </div>
            </div>
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
import { nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import { useSnackbarStore } from '@/stores/snackbar'
import { useAuthStore } from '@/stores/auth'
import { adminApi } from '@/api/admin'
import { aiApi } from '@/api/ai'
import type { AiConversationSummary } from '@/types/admin'

interface ChatMsg {
  role: 'user' | 'assistant'
  content: string
  navigateTo?: string
  toolCalls?: string[]
}

defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>()

const { t } = useI18n()
const router = useRouter()
const snackbar = useSnackbarStore()
const auth = useAuthStore()

const view = ref<'chat' | 'list'>('chat')
const messages = ref<ChatMsg[]>([])
const input = ref('')
const sending = ref(false)
const conversationId = ref<string | null>(null)
const bodyRef = ref<HTMLElement | null>(null)

const conversations = ref<AiConversationSummary[]>([])
const historyLoading = ref(false)
const showDelete = ref(false)
const deleting = ref(false)
const pendingDelete = ref<AiConversationSummary | null>(null)

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
}

async function scrollBottom() {
  await nextTick()
  if (bodyRef.value) bodyRef.value.scrollTop = bodyRef.value.scrollHeight
}

function toggleView() {
  view.value = view.value === 'list' ? 'chat' : 'list'
  if (view.value === 'chat') scrollBottom()
}

function newChat() {
  messages.value = []
  conversationId.value = null
  input.value = ''
  view.value = 'chat'
}

async function openConversation(id: string) {
  try {
    const conv = await adminApi.aiConversation(id)
    messages.value = conv.messages
      .filter((m): m is AiConversationSummary['messages'][number] => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role as ChatMsg['role'], content: m.content }))
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
  messages.value.push({ role: 'user', content: text })
  sending.value = true
  await scrollBottom()
  try {
    // 权限区分：管理员 = 系统 AI 助手（平台/治理上下文）；普通用户 = 本人数据作用域 AI
    const res = auth.isAdmin
      ? await adminApi.adminAiChat({
          message: text,
          conversationId: conversationId.value ?? undefined,
        })
      : await aiApi.chat({
          message: text,
          conversationId: conversationId.value ?? undefined,
        })
    messages.value.push({
      role: 'assistant',
      content: res.reply,
      navigateTo: res.navigateTo,
      toolCalls: res.toolCalls,
    })
    conversationId.value = res.conversationId
    await scrollBottom()
  } catch (err) {
    snackbar.error(err instanceof Error ? err.message : t('assLoadFailed'))
  } finally {
    sending.value = false
    await scrollBottom()
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
