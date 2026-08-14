/**
 * EASY-2 Web-Admin-Vue（Vue3 + Vuetify3）管理 CRUD 页模板（⑤-2）。
 * 管理端复用 KnowledgeView 骨架（PageHeader + AppTable + ConfirmDialog + useSnackbarStore）。
 * v1：全量列表（GET /<plural>/admin/all）+ 删除（DELETE /<plural>/admin/:id）；无分页/搜索/新建编辑。
 */

const ADMIN_TS_TYPE = {
  string: () => 'string',
  text: () => 'string',
  int: () => 'number',
  bool: () => 'boolean',
  date: () => 'string',
};

export function adminApiTemplate(ctx) {
  const fieldsDecl = ctx.fields
    .map((f) => `  ${f.name}: ${ADMIN_TS_TYPE[f.type]()};`)
    .join('\n');
  return `import { api } from './client';

export interface Admin${ctx.singlePascal} {
  id: number;
  userId: number | null;
${fieldsDecl}
  createdAt: string;
}

export const ${ctx.plural}Api = {
  async list(): Promise<Admin${ctx.singlePascal}[]> {
    const res = await api.get(\`/${ctx.plural}/admin/all\`);
    return res as Admin${ctx.singlePascal}[];
  },
  async remove(id: number): Promise<void> {
    await api.delete(\`/${ctx.plural}/admin/\${id}\`);
  },
};
`;
}

export function adminViewTemplate(ctx) {
  const headerCols = ctx.fields
    .map((f) => `  { key: '${f.name}', title: '${f.name}' },`)
    .join('\n');
  return `<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import PageHeader from '@/components/PageHeader.vue'
import AppTable from '@/components/AppTable.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import { useSnackbarStore } from '@/stores/snackbar'
import { ${ctx.plural}Api, type Admin${ctx.singlePascal} } from '@/api/${ctx.plural}'

const { t } = useI18n()
const snackbar = useSnackbarStore()

const items = ref<Admin${ctx.singlePascal}[]>([])
const loading = ref(false)
const showDelete = ref(false)
const pendingDelete = ref<Admin${ctx.singlePascal} | null>(null)

const headers = computed(() => [
  { key: 'id', title: 'ID' },
${headerCols}
  { key: 'createdAt', title: t('createdAt') },
  { key: 'actions', title: t('actionCol') },
])

async function load() {
  loading.value = true
  try {
    items.value = await ${ctx.plural}Api.list()
  } catch (err) {
    snackbar.error(err instanceof Error ? err.message : t('loadFailed'))
  } finally {
    loading.value = false
  }
}

function confirmDelete(item: Admin${ctx.singlePascal}) {
  pendingDelete.value = item
  showDelete.value = true
}

async function onDelete() {
  if (!pendingDelete.value) return
  try {
    await ${ctx.plural}Api.remove(pendingDelete.value.id)
    snackbar.success(t('deleted'))
    await load()
  } catch (err) {
    snackbar.error(err instanceof Error ? err.message : t('deleteFailed'))
  } finally {
    showDelete.value = false
  }
}

onMounted(load)
</script>

<template>
  <div>
    <PageHeader :title="t('nav${ctx.pluralPascal}')" :subtitle="t('${ctx.plural}ViewSubtitle')" />
    <AppTable :headers="headers" :items="items" :loading="loading">
      <template #item.actions="{ item }">
        <v-btn icon="mdi-delete-outline" variant="text" size="small" color="error" @click="confirmDelete(item)" />
      </template>
    </AppTable>
    <ConfirmDialog
      v-model="showDelete"
      :title="t('${ctx.plural}DeleteTitle')"
      :content="t('${ctx.plural}DeleteContent')"
      @confirm="onDelete"
    />
  </div>
</template>
`;
}

/** i18n 文案（zh/en 成对）。 */
export function adminI18nKeys(ctx) {
  const single = ctx.singular;
  return {
    zh: {
      [`nav${ctx.pluralPascal}`]: ctx.label,
      [`${ctx.plural}ViewSubtitle`]: `${ctx.label}管理`,
      [`${ctx.plural}DeleteTitle`]: `删除${ctx.label}`,
      [`${ctx.plural}DeleteContent`]: `确定删除该${ctx.label}？`,
    },
    en: {
      [`nav${ctx.pluralPascal}`]: ctx.singlePascal,
      [`${ctx.plural}ViewSubtitle`]: `Manage ${ctx.singlePascal}`,
      [`${ctx.plural}DeleteTitle`]: `Delete ${ctx.singlePascal}`,
      [`${ctx.plural}DeleteContent`]: `Delete this ${single}?`,
    },
  };
}

/** Web-Admin-Vue 新文件：{ relativePath, content }。 */
export function adminFiles(ctx) {
  return [
    { path: `src/api/${ctx.plural}.ts`, content: adminApiTemplate(ctx) },
    { path: `src/views/${ctx.plural}/${ctx.pluralPascal}View.vue`, content: adminViewTemplate(ctx) },
  ];
}
