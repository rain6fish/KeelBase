<template>
  <div class="d-flex flex-column" style="height: calc(100vh - 64px)">
    <PageHeader :title="t('navSystemAssistant')" :subtitle="t('assHint')" />

    <el-card shadow="never" class="flex-grow-1 d-flex flex-column" style="min-height: 0">
      <!-- 消息区 -->
      <div ref="scrollRef" class="flex-grow-1 overflow-auto pa-3" style="min-height: 320px">
        <div v-if="!messages.length" class="text-medium-emphasis text-center mt-8 pa-4">
          {{ t('assWelcome') }}
        </div>

        <div
          v-for="(m, i) in messages"
          :key="i"
          class="d-flex mb-3"
          :class="m.role === 'user' ? 'justify-content-end' : 'justify-content-start'"
        >
          <div
            class="pa-3 rounded"
            :style="
              m.role === 'user'
                ? { background: 'var(--el-color-primary)', color: '#fff', maxWidth: '80%', whiteSpace: 'pre-wrap' }
                : { background: 'var(--el-fill-color-light)', maxWidth: '80%', whiteSpace: 'pre-wrap' }
            "
          >
            {{ m.content }}
            <div v-if="m.role === 'assistant' && m.toolCalls?.length" class="mt-2">
              <span class="text-body-2 font-weight-medium">{{ t('assToolCalls') }}</span>
              <el-tag v-for="tool in m.toolCalls" :key="tool" size="small" class="ml-1">{{ tool }}</el-tag>
            </div>
            <div v-if="m.role === 'assistant' && m.navigateTo" class="mt-2">
              <el-button size="small" type="primary" text @click="go(m.navigateTo!)">
                {{ t('assNavigate') }} → {{ m.navigateTo }}
              </el-button>
            </div>
          </div>
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
          @keydown.enter.exact.prevent="send"
        />
        <div class="d-flex flex-column ga-1">
          <el-button type="primary" :loading="sending" @click="send">{{ t('send') }}</el-button>
          <el-button size="small" text @click="newChat">{{ t('assNewChat') }}</el-button>
        </div>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import PageHeader from '@/components/PageHeader.vue'
import { useSnackbarStore } from '@/stores/snackbar'
import { adminApi } from '@/api/admin'

interface ChatMsg {
  role: 'user' | 'assistant'
  content: string
  navigateTo?: string
  toolCalls?: string[]
}

const { t } = useI18n()
const router = useRouter()
const snackbar = useSnackbarStore()

const messages = ref<ChatMsg[]>([])
const input = ref('')
const sending = ref(false)
const conversationId = ref<string | null>(null)
const scrollRef = ref<HTMLElement | null>(null)

async function scrollBottom() {
  await nextTick()
  if (scrollRef.value) scrollRef.value.scrollTop = scrollRef.value.scrollHeight
}

async function send() {
  const text = input.value.trim()
  if (!text || sending.value) return
  input.value = ''
  messages.value.push({ role: 'user', content: text })
  sending.value = true
  await scrollBottom()
  try {
    const res = await adminApi.adminAiChat({
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
  } catch (err) {
    snackbar.error(err instanceof Error ? err.message : t('assLoadFailed'))
  } finally {
    sending.value = false
    await scrollBottom()
  }
}

function go(route: string) {
  router.push(route)
}

function newChat() {
  messages.value = []
  conversationId.value = null
  input.value = ''
}
</script>
