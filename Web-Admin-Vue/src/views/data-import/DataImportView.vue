<template>
  <div>
    <PageHeader :title="t('navDataImport')" />

    <v-row>
      <v-col cols="12" md="4">
        <v-card>
          <v-card-title>{{ t('importUsers') }}</v-card-title>
          <v-card-text>
            <div class="text-body-2 text-medium-emphasis mb-3">
              {{ t('importUsersHint') }}
            </div>
            <div class="d-flex ga-2 flex-wrap">
              <v-btn variant="tonal" prepend-icon="mdi-file-download-outline" @click="downloadUsersTemplate">
                {{ t('downloadTemplate') }}
              </v-btn>
              <v-btn color="primary" prepend-icon="mdi-upload" :loading="importing === 'user'" @click="userInput?.click()">
                {{ t('chooseCsv') }}
              </v-btn>
            </div>
            <input ref="userInput" type="file" accept=".csv" class="d-none" @change="onUserFile" />
          </v-card-text>
        </v-card>
      </v-col>

      <v-col cols="12" md="4">
        <v-card>
          <v-card-title>{{ t('importEvents') }}</v-card-title>
          <v-card-text>
            <div class="text-body-2 text-medium-emphasis mb-3">
              {{ t('importEventsHint') }}
            </div>
            <div class="d-flex ga-2 flex-wrap">
              <v-btn variant="tonal" prepend-icon="mdi-file-download-outline" @click="downloadEventsTemplate">
                {{ t('downloadTemplate') }}
              </v-btn>
              <v-btn color="primary" prepend-icon="mdi-upload" :loading="importing === 'event'" @click="eventInput?.click()">
                {{ t('chooseCsv') }}
              </v-btn>
            </div>
            <input ref="eventInput" type="file" accept=".csv" class="d-none" @change="onEventFile" />
          </v-card-text>
        </v-card>
      </v-col>

      <v-col cols="12" md="4">
        <v-card>
          <v-card-title>{{ t('importTodos') }}</v-card-title>
          <v-card-text>
            <div class="text-body-2 text-medium-emphasis mb-3">
              {{ t('importTodosHint') }}
            </div>
            <div class="d-flex ga-2 flex-wrap">
              <v-btn variant="tonal" prepend-icon="mdi-file-download-outline" @click="downloadTodosTemplate">
                {{ t('downloadTemplate') }}
              </v-btn>
              <v-btn color="primary" prepend-icon="mdi-upload" :loading="importing === 'todo'" @click="todoInput?.click()">
                {{ t('chooseCsv') }}
              </v-btn>
            </div>
            <input ref="todoInput" type="file" accept=".csv" class="d-none" @change="onTodoFile" />
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <!-- 导入结果 -->
    <v-card v-if="result" class="mt-4">
      <v-card-title>{{ t('importResult') }}</v-card-title>
      <v-card-text>
        <v-row class="mb-2">
          <v-col cols="4"><StatCard :label="t('importTotal')" :value="result.total" icon="mdi-file-document-outline" color="info" /></v-col>
          <v-col cols="4"><StatCard :label="t('importSuccess')" :value="result.success" icon="mdi-check-circle-outline" color="success" /></v-col>
          <v-col cols="4"><StatCard :label="t('importFailed')" :value="result.failed" icon="mdi-alert-circle-outline" color="error" /></v-col>
        </v-row>
        <v-alert v-if="result.errors.length" type="error" variant="tonal">
          <div v-for="e in result.errors" :key="e.row" class="text-body-2">
            {{ t('row') }} {{ e.row }}: {{ e.reason }}
          </div>
        </v-alert>
        <div v-else class="text-body-2 text-medium-emphasis">{{ t('importAllOk') }}</div>
      </v-card-text>
    </v-card>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import PageHeader from '@/components/PageHeader.vue'
import StatCard from '@/components/StatCard.vue'
import { useSnackbarStore } from '@/stores/snackbar'
import { importApi } from '@/api/import'
import { downloadCsv } from '@/utils/csv'
import type { ImportResult } from '@/types/admin'

const { t } = useI18n()
const snackbar = useSnackbarStore()

const userInput = ref<HTMLInputElement | null>(null)
const eventInput = ref<HTMLInputElement | null>(null)
const todoInput = ref<HTMLInputElement | null>(null)
const importing = ref<'user' | 'event' | 'todo' | null>(null)
const result = ref<ImportResult | null>(null)

async function handleFile(file: File, kind: 'user' | 'event' | 'todo') {
  importing.value = kind
  try {
    result.value =
      kind === 'user'
        ? await importApi.importUsers(file)
        : kind === 'event'
          ? await importApi.importEvents(file)
          : await importApi.importTodos(file)
    snackbar.success(t('importDone'))
  } catch (err) {
    snackbar.error(err instanceof Error ? err.message : t('importFailed'))
  } finally {
    importing.value = null
    if (kind === 'user' && userInput.value) userInput.value.value = ''
    if (kind === 'event' && eventInput.value) eventInput.value.value = ''
    if (kind === 'todo' && todoInput.value) todoInput.value.value = ''
  }
}

function onUserFile(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (f) handleFile(f, 'user')
}
function onEventFile(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (f) handleFile(f, 'event')
}
function onTodoFile(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (f) handleFile(f, 'todo')
}

function downloadUsersTemplate() {
  downloadCsv(
    'import_users_template',
    ['username', 'email', 'password', 'nickname'],
    [['alex', 'alex@example.com', 'Password123', 'Alex']],
  )
}
function downloadEventsTemplate() {
  downloadCsv(
    'import_events_template',
    ['userId', 'title', 'startTime', 'endTime', 'location', 'description'],
    [[1, 'Team standup', '2026-08-16T09:00:00Z', '2026-08-16T09:30:00Z', 'Meeting room', 'Daily sync']],
  )
}
function downloadTodosTemplate() {
  downloadCsv(
    'import_todos_template',
    ['userId', 'title', 'completed', 'dueDate'],
    [[1, 'Write report', 'false', '2026-08-20T18:00:00Z']],
  )
}
</script>
