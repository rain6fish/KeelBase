<template>
  <el-drawer v-model="open" :title="t('copilotTitle')" size="420px">
    <!-- 对话区 -->
    <div ref="scrollRef" class="copilot-chat flex-grow-1 mb-3">
      <div v-if="!messages.length" class="text-medium-emphasis pa-2">
        {{ t('copilotHint', { name: customerName }) }}
      </div>
      <div v-for="(m, i) in messages" :key="i" class="mb-2">
        <div :class="['d-flex', m.role === 'user' ? 'justify-end' : 'justify-start']">
          <div
            :class="[
              'pa-2 copilot-bubble',
              m.role === 'user' ? 'copilot-user' : 'copilot-ai',
            ]"
          >
            {{ m.content }}
          </div>
        </div>
      </div>
      <div v-if="loading" class="text-caption text-medium-emphasis pa-2">{{ t('thinking') }}</div>
    </div>

    <!-- 预置问题（AI Copilot：让业务用户一键问） -->
    <div class="d-flex flex-wrap ga-1 mb-2">
      <el-button v-for="q in quickQuestions" :key="q.key" size="small" plain @click="sendQuick(q)">
        {{ q.label }}
      </el-button>
    </div>

    <!-- 输入区 -->
    <div class="d-flex ga-2">
      <el-input
        v-model="input"
        :placeholder="t('copilotPlaceholder')"
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
import { aiApi } from '@/api/ai'

const props = defineProps<{
  modelValue: boolean
  customerName: string
  customerId: number
}>()
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>()

const { t } = useI18n()
const snackbar = useSnackbarStore()
const scrollRef = ref<HTMLElement>()
const messages = ref<Array<{ role: 'user' | 'ai'; content: string }>>([])
const input = ref('')
const loading = ref(false)
const conversationId = ref<string | undefined>()

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
    messages.value = []
    conversationId.value = undefined
    input.value = ''
  }
})

function customerContext(): string {
  return `当前客户「${props.customerName}」（ID ${props.customerId}）`
}

function sendQuick(q: { key: string; label: string }) {
  const message = `${customerContext()}。${q.label}`
  send(message)
}

async function send(raw: string) {
  const message = raw.trim()
  if (!message || loading.value) return
  messages.value.push({ role: 'user', content: message })
  input.value = ''
  loading.value = true
  try {
    const res = await aiApi.chat({ message, conversationId: conversationId.value })
    conversationId.value = res.conversationId
    messages.value.push({ role: 'ai', content: res.reply })
  } catch {
    snackbar.error(t('loadFailed'))
  } finally {
    loading.value = false
    await nextTick()
    scrollRef.value?.scrollTo({ top: scrollRef.value.scrollHeight })
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
