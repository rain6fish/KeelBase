<template>
  <div>
    <PageHeader :title="t('navMcp')" />

    <!-- MCP servers -->
    <v-card class="mb-4">
      <v-card-title>{{ t('mcpServers') }}</v-card-title>
      <v-card-text>
        <v-row class="align-center mb-2">
          <v-col cols="12" sm="4">
            <v-text-field v-model="newName" :label="t('serverName')" density="compact" variant="outlined" hide-details />
          </v-col>
          <v-col cols="12" sm="6">
            <v-text-field v-model="newUrl" :label="t('serverUrl')" density="compact" variant="outlined" hide-details placeholder="https://..." />
          </v-col>
          <v-col cols="12" sm="2">
            <v-btn color="primary" prepend-icon="mdi-plus" :loading="busy" block @click="onRegister()">{{ t('register') }}</v-btn>
          </v-col>
        </v-row>
        <v-table v-if="servers.length" density="compact">
          <thead>
            <tr>
              <th>{{ t('serverName') }}</th>
              <th>{{ t('serverUrl') }}</th>
              <th class="text-end">{{ t('actionCol') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="s in servers" :key="s.name">
              <td class="font-weight-medium">{{ s.name }}</td>
              <td class="text-caption text-medium-emphasis">{{ s.url }}</td>
              <td class="text-end">
                <v-btn icon="mdi-delete-outline" variant="text" size="small" color="error" :title="t('removeServer')" @click="confirmRemove(s)" />
              </td>
            </tr>
          </tbody>
        </v-table>
        <div v-else class="text-medium-emphasis">{{ t('noServers') }}</div>
      </v-card-text>
    </v-card>

    <!-- Discovered tools -->
    <v-card class="mb-4">
      <v-card-title class="d-flex align-center justify-space-between">
        <span>{{ t('mcpTools') }}</span>
        <div>
          <v-btn variant="tonal" prepend-icon="mdi-refresh" :loading="toolsLoading" @click="loadTools(false)">{{ t('refresh') }}</v-btn>
          <v-btn variant="text" prepend-icon="mdi-refresh-auto" :loading="toolsLoading" @click="loadTools(true)">{{ t('forceRefresh') }}</v-btn>
        </div>
      </v-card-title>
      <v-card-text>
        <template v-if="discovered.length">
          <div v-for="group in discovered" :key="group.server" class="mb-3">
            <div class="text-subtitle-2 font-weight-medium mb-1">{{ group.server }}</div>
            <div v-if="group.error" class="text-error text-caption mb-1">{{ t('discoverFailed') }}: {{ group.error }}</div>
            <div v-if="!group.tools.length && !group.error" class="text-medium-emphasis text-caption mb-1">{{ t('noTools') }}</div>
            <v-row>
              <v-col v-for="tool in group.tools" :key="`${group.server}-${tool.name}`" cols="12" md="6" lg="4">
                <v-card variant="outlined">
                  <v-card-title class="text-subtitle-1 d-flex align-center ga-2">
                    <v-icon :icon="tool.readOnly ? 'mdi-eye-outline' : 'mdi-pen'" :color="tool.readOnly ? 'primary' : 'warning'" size="small" />
                    {{ tool.name }}
                    <v-chip v-if="tool.readOnly" size="x-small" color="primary" variant="tonal">{{ t('readOnly') }}</v-chip>
                    <v-chip v-else size="x-small" color="warning" variant="tonal">{{ t('needsConfirmation') }}</v-chip>
                  </v-card-title>
                  <v-card-text class="text-caption">
                    <div class="text-medium-emphasis mb-2">{{ tool.description || '-' }}</div>
                    <v-btn size="small" color="primary" variant="tonal" prepend-icon="mdi-play" @click="openCall(group.server, tool)">{{ t('callTool') }}</v-btn>
                  </v-card-text>
                </v-card>
              </v-col>
            </v-row>
          </div>
        </template>
        <div v-else class="text-medium-emphasis">{{ t('noServers') }}</div>
      </v-card-text>
    </v-card>

    <!-- Call dialog -->
    <v-dialog v-model="showCall" max-width="680">
      <v-card>
        <v-card-title>{{ t('callTool') }}</v-card-title>
        <v-card-text>
          <div class="text-caption text-medium-emphasis mb-2">{{ callServer }} · {{ callToolName }}</div>
          <v-textarea v-model="callArgsText" :label="t('callArgsLabel')" rows="8" variant="outlined" spellcheck="false" />
          <div v-if="callOutcome">
            <v-divider class="my-2" />
            <v-alert v-if="callOutcome.requiresConfirmation" type="info" variant="tonal">{{ t('callNeedsConfirmation') }}</v-alert>
            <v-alert v-else-if="callOutcome.error" type="error" variant="tonal">{{ callOutcome.error }}</v-alert>
            <v-alert v-else :type="callOutcome.result?.isError ? 'warning' : 'success'" variant="tonal" class="text-caption">{{ callResultText }}</v-alert>
          </div>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="showCall = false">{{ t('cancel') }}</v-btn>
          <v-btn color="primary" :loading="callLoading" prepend-icon="mdi-play" @click="onCall()">{{ t('execute') }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

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
