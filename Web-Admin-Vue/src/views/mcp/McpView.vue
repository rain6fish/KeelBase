<!-- SPDX-License-Identifier: Apache-2.0 -->
<template>
  <div>
    <PageHeader :title="t('navMcp')" />

    <!-- MCP servers -->
    <el-card shadow="never" class="mb-4">
      <template #header>{{ t('mcpServers') }}</template>
      <el-row :gutter="16" class="align-center mb-2">
        <el-col :xs="24" :sm="8">
          <el-input v-model="newName" :label="t('serverName')" />
        </el-col>
        <el-col :xs="24" :sm="12">
          <el-input v-model="newUrl" :label="t('serverUrl')" placeholder="https://..." />
        </el-col>
        <el-col :xs="24" :sm="4">
          <el-button type="primary" :loading="busy" style="width: 100%" @click="onRegister()">
            <template #icon><AppIcon icon="mdi-plus" /></template>
            {{ t('register') }}
          </el-button>
        </el-col>
      </el-row>
      <table v-if="servers.length" class="w-100 border">
        <thead>
          <tr>
            <th class="pa-2 text-left">{{ t('serverName') }}</th>
            <th class="pa-2 text-left">{{ t('serverUrl') }}</th>
            <th class="text-end pa-2">{{ t('actionCol') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="s in servers" :key="s.name">
            <td class="pa-2 font-weight-medium">{{ s.name }}</td>
            <td class="pa-2 text-caption text-medium-emphasis">{{ s.url }}</td>
            <td class="text-end pa-2">
              <el-button text size="small" type="danger" :title="t('removeServer')" @click="confirmRemove(s)">
                <AppIcon icon="mdi-delete-outline" />
              </el-button>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-else class="text-medium-emphasis">{{ t('noServers') }}</div>
    </el-card>

    <!-- Discovered tools -->
    <el-card shadow="never" class="mb-4">
      <template #header>
        <div class="d-flex align-center justify-space-between">
          <span>{{ t('mcpTools') }}</span>
          <div>
            <el-button :loading="toolsLoading" @click="loadTools(false)">
              <template #icon><AppIcon icon="mdi-refresh" /></template>
              {{ t('refresh') }}
            </el-button>
            <el-button text :loading="toolsLoading" @click="loadTools(true)">
              <template #icon><AppIcon icon="mdi-refresh-auto" /></template>
              {{ t('forceRefresh') }}
            </el-button>
          </div>
        </div>
      </template>
      <template v-if="discovered.length">
        <div v-for="group in discovered" :key="group.server" class="mb-3">
          <div class="text-subtitle-2 font-weight-medium mb-1">{{ group.server }}</div>
          <div v-if="group.error" class="text-error text-caption mb-1">{{ t('discoverFailed') }}: {{ group.error }}</div>
          <div v-if="!group.tools.length && !group.error" class="text-medium-emphasis text-caption mb-1">{{ t('noTools') }}</div>
          <el-row :gutter="16">
            <el-col v-for="tool in group.tools" :key="`${group.server}-${tool.name}`" :xs="24" :md="12" :lg="8">
              <el-card shadow="never" class="mb-4">
                <template #header>
                  <div class="text-subtitle-1 d-flex align-center ga-2">
                    <AppIcon
                      :icon="tool.readOnly ? 'mdi-eye-outline' : 'mdi-pen'"
                      :color="tool.readOnly ? 'var(--el-color-primary)' : 'var(--el-color-warning)'"
                      size="18"
                    />
                    {{ tool.name }}
                    <el-tag v-if="tool.readOnly" size="small" type="primary" effect="light">{{ t('readOnly') }}</el-tag>
                    <el-tag v-else size="small" type="warning" effect="light">{{ t('needsConfirmation') }}</el-tag>
                    <el-tag v-if="tool.riskLevel" size="small" :type="riskTagType(tool.riskLevel)" effect="plain">{{ tool.riskLevel }} · {{ riskLabel(tool.riskLevel) }}</el-tag>
                  </div>
                </template>
                <div class="text-caption">
                  <div class="text-medium-emphasis mb-2">{{ tool.description || '-' }}</div>
                  <el-button size="small" type="primary" plain @click="openCall(group.server, tool)">
                    <template #icon><AppIcon icon="mdi-play" /></template>
                    {{ t('callTool') }}
                  </el-button>
                </div>
              </el-card>
            </el-col>
          </el-row>
        </div>
      </template>
      <div v-else class="text-medium-emphasis">{{ t('noServers') }}</div>
    </el-card>

    <!-- Call dialog -->
    <el-dialog v-model="showCall" :width="680" :title="t('callTool')" :close-on-click-modal="false">
      <div class="text-caption text-medium-emphasis mb-2">{{ callServer }} · {{ callToolName }}</div>
      <el-input v-model="callArgsText" :label="t('callArgsLabel')" type="textarea" :rows="8" spellcheck="false" />
      <div v-if="callOutcome">
        <el-divider class="my-2" />
        <el-alert v-if="callOutcome.requiresConfirmation" type="info" :closable="false">{{ t('callNeedsConfirmation') }}</el-alert>
        <el-alert v-else-if="callOutcome.error" type="error" :closable="false">{{ callOutcome.error }}</el-alert>
        <el-alert v-else :type="callOutcome.result?.isError ? 'warning' : 'success'" :closable="false" class="text-caption">{{ callResultText }}</el-alert>
      </div>
      <template #footer>
        <el-button @click="showCall = false">{{ t('cancel') }}</el-button>
        <el-button type="primary" :loading="callLoading" @click="onCall()">
          <template #icon><AppIcon icon="mdi-play" /></template>
          {{ t('execute') }}
        </el-button>
      </template>
    </el-dialog>

    <ConfirmDialog
      v-model="showRemove"
      :title="t('removeServer')"
      :content="t('confirmRemoveServer', { name: pendingRemove })"
      @confirm="onRemove"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import PageHeader from '@/components/PageHeader.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import { useSnackbarStore } from '@/stores/snackbar'
import { mcpApi, type ExternalMcpTool, type McpCallOutcome, type McpDiscoverResult, type McpServerConfig } from '@/api/mcp'
import { buildArgumentsTemplate } from '@/utils/mcpArgs'

const { t } = useI18n()
const snackbar = useSnackbarStore()

const servers = ref<McpServerConfig[]>([])
const discovered = ref<McpDiscoverResult[]>([])
const newName = ref('')
const newUrl = ref('')
const busy = ref(false)
const toolsLoading = ref(false)

/** A2 风险级 → 可读标签 / 标签色（对齐 Security Review 的 R0-R5 展示） */
function riskLabel(lv: string): string {
  if (lv === 'R5') return t('riskBlocked')
  if (lv === 'R4') return t('riskApproval')
  if (lv === 'R3') return t('riskConfirm')
  return t('riskAuto')
}
function riskTagType(lv: string): 'danger' | 'warning' | 'success' {
  if (lv === 'R5') return 'danger'
  if (lv === 'R4' || lv === 'R3') return 'warning'
  return 'success'
}

const showRemove = ref(false)
const pendingRemove = ref('')
function confirmRemove(s: McpServerConfig) {
  pendingRemove.value = s.name
  showRemove.value = true
}
async function onRemove() {
  if (!pendingRemove.value) return
  try {
    servers.value = await mcpApi.remove(pendingRemove.value)
    snackbar.success(t('removeServer'))
    await loadTools(false)
  } catch (err) {
    snackbar.error(err instanceof Error ? err.message : t('removeFailed'))
  } finally {
    showRemove.value = false
  }
}

async function onRegister() {
  const name = newName.value.trim()
  const url = newUrl.value.trim()
  if (!name || !url) return
  busy.value = true
  try {
    servers.value = await mcpApi.register(name, url)
    snackbar.success(t('register'))
    newName.value = ''
    newUrl.value = ''
    await loadTools(true)
  } catch (err) {
    snackbar.error(err instanceof Error ? err.message : t('registerFailed'))
  } finally {
    busy.value = false
  }
}

async function loadServers() {
  try {
    servers.value = await mcpApi.servers()
  } catch (err) {
    snackbar.error(err instanceof Error ? err.message : t('loadFailed'))
  }
}

async function loadTools(force: boolean) {
  toolsLoading.value = true
  try {
    discovered.value = await mcpApi.discover(force)
  } catch (err) {
    snackbar.error(err instanceof Error ? err.message : t('loadFailed'))
  } finally {
    toolsLoading.value = false
  }
}

const showCall = ref(false)
const callServer = ref('')
const callToolName = ref('')
const callArgsText = ref('{}')
const callOutcome = ref<McpCallOutcome | null>(null)
const callLoading = ref(false)

function openCall(server: string, tool: ExternalMcpTool) {
  callServer.value = server
  callToolName.value = tool.name
  callArgsText.value = buildArgumentsTemplate(tool.inputSchema)
  callOutcome.value = null
  showCall.value = true
}

const callResultText = computed(() => {
  const content = callOutcome.value?.result?.content ?? []
  return content.map((c) => c.text ?? '').filter(Boolean).join('\n') || '-'
})

async function onCall() {
  let args: Record<string, unknown>
  try {
    args = callArgsText.value.trim() ? JSON.parse(callArgsText.value) : {}
  } catch {
    snackbar.error(t('argParseFailed'))
    return
  }
  callLoading.value = true
  try {
    callOutcome.value = await mcpApi.call(callServer.value, callToolName.value, args)
  } catch (err) {
    snackbar.error(err instanceof Error ? err.message : t('callFailed'))
  } finally {
    callLoading.value = false
  }
}

onMounted(() => {
  loadServers()
  loadTools(false)
})
</script>
