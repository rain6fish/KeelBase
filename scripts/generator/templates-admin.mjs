// SPDX-License-Identifier: Apache-2.0

/**
 * EASY-2 Web-Admin-Vue（Vue 3 + **Element Plus**）管理 CRUD 页模板（⑤-2）。
 * 管理端复用 KnowledgeView 骨架（PageHeader + AppTable + ConfirmDialog + useSnackbarStore）。
 * 组件一律用 element-plus —— 本仓没有 Vuetify；按钮形态照 KnowledgeView 的
 * `el-button + <AppIcon icon="mdi-…" />`。
 * v1：全量列表（GET /<plural>/admin/all）+ 删除（DELETE /<plural>/admin/:id）；无分页/搜索/新建编辑。
 * 声明了 attachment 的模块另带**按行**的上传 / 撤销（每个附件一枚可关闭标签）。
 */

import { attachmentFields, enumLabelGetter, hasEnumLabels, refColumnName } from './validate.mjs';

const ADMIN_TS_TYPE = {
  string: () => 'string',
  text: () => 'string',
  int: () => 'number',
  bool: () => 'boolean',
  date: () => 'string',
  enum: () => 'string',
  // decimal 在 wire 上是字符串（协议决策 ①），TS 侧照搬，不用 number
  decimal: () => 'string',
  // ref 在 TS 侧只暴露外键 id（number）
  ref: () => 'number',
  // attachment 侧表不在本类型里逐字段展开 —— 它走 `attachments` 数组（见 adminApiTemplate）
  attachment: () => 'string',
};

export function adminApiTemplate(ctx) {
  // ref 在接口上要两行：外键 id（可提交）+ 嵌套的目标对象（用于回显）。切片 1 曾把 ref
  // 写成 `customer: number`，而接口实际返回 `customerId` + `customer` 对象 —— 那是错的。
  const attFields = attachmentFields(ctx.fields);
  const fieldsDecl = ctx.fields
    .flatMap((f) => {
      if (f.type === 'ref') {
        return [`  ${refColumnName(f.name)}: number;`, `  ${f.name}?: Record<string, unknown> | null;`];
      }
      // 附件不在本接口逐字段展开，改用下面的 attachments 数组
      if (f.type === 'attachment') return [];
      return [`  ${f.name}: ${ADMIN_TS_TYPE[f.type]()};`];
    })
    .join('\n');
  // 无附件字段 ⇒ 一个字的附件代码都不产（Code Economy §15.3：不留死代码）。
  const attachInterface =
    attFields.length === 0
      ? ''
      : `
/** One row of the module's attachment side table, shaped as the API returns it. */
/* 模块附件侧表的一行，形状同接口返回。 */
export interface Admin${ctx.singlePascal}Attachment {
  id: number;
  field: string;
  storageKey: string;
  originalName: string;
  mimeType: string;
  size: number;
}
`;
  const attachDecl =
    attFields.length === 0 ? '' : `\n  attachments?: Admin${ctx.singlePascal}Attachment[];`;
  // 上传那一步是平台调用、不是模块专属的，故共用 `./upload` 一份，不生成进每个模块。
  // 这里只用到它的**返回类型** —— 真正调它的是视图（先上传，再调 attach）。
  const uploadImport = attFields.length === 0 ? '' : `import { type UploadedFile } from './upload';\n`;
  const attachMethods =
    attFields.length === 0
      ? ''
      : `
  /** Uploads a file, then records the association against one declared field. */
  /* 上传一个文件，再把关联登记到某个已声明字段上。 */
  async attach(id: number, field: string, uploaded: UploadedFile): Promise<void> {
    await api.post(\`/${ctx.plural}/\${id}/attachments\`, {
      field,
      storageKey: uploaded.filename,
      originalName: uploaded.originalName,
      mimeType: uploaded.mimeType,
      size: uploaded.size,
    });
  },
  /** Revokes one association (soft delete on the server). */
  /* 撤销一条关联（服务端软删）。 */
  async revokeAttachment(id: number, attachmentId: number): Promise<void> {
    await api.delete(\`/${ctx.plural}/\${id}/attachments/\${attachmentId}\`);
  },`;
  return `import { api } from './client';
${uploadImport}${attachInterface}
export interface Admin${ctx.singlePascal} {
  id: number;
  userId: number | null;
${fieldsDecl}${attachDecl}
  createdAt: string;
}

export const ${ctx.plural}Api = {
  async list(): Promise<Admin${ctx.singlePascal}[]> {
    const res = await api.get(\`/${ctx.plural}/admin/all\`);
    return res as Admin${ctx.singlePascal}[];
  },
  async remove(id: number): Promise<void> {
    await api.delete(\`/${ctx.plural}/admin/\${id}\`);
  },${attachMethods}
};
`;
}

export function adminViewTemplate(ctx) {
  const attFields = attachmentFields(ctx.fields);
  const hasAtt = attFields.length > 0;
  const headerCols = ctx.fields
    .map((f) => `  { key: '${f.name}', title: '${f.name}' },`)
    .join('\n');
  const enumFields = ctx.fields.filter((f) => f.type === 'enum' && hasEnumLabels(f));
  const enumLabelEntries = enumFields
    .flatMap((f) =>
      f.enum
        .filter((opt) => f.enumLabels[opt])
        .map((opt) => `  '${f.name}:${opt}': t('${enumLabelGetter(ctx, f.name, opt)}'),`),
    )
    .join('\n');
  // 无带标签的 enum 字段时不产出任何查表/helper —— 避免生成死代码（Code Economy §15.3）
  // 附件：一个字段可挂多个附件，故撤销**按附件**（每条一个可关闭标签），不按字段。
  const attachRefs = !hasAtt
    ? ''
    : `const fileInput = ref<HTMLInputElement | null>(null)\n` +
      `const pendingUpload = ref<{ item: Admin${ctx.singlePascal}; field: string } | null>(null)\n` +
      `const showRevoke = ref(false)\n` +
      `const pendingRevoke = ref<{ item: Admin${ctx.singlePascal}; attachment: Admin${ctx.singlePascal}Attachment } | null>(null)\n`;
  const attachBlock = !hasAtt
    ? ''
    : `// The attachments belonging to one declared field, for that field's list cell.\n` +
      `// 某个声明字段名下的附件，供该字段的列表单元格使用。\n` +
      `function attachmentsOf(item: Admin${ctx.singlePascal}, field: string): Admin${ctx.singlePascal}Attachment[] {\n` +
      `  return (item.attachments ?? []).filter((a) => a.field === field)\n` +
      `}\n\n` +
      `// Uploading hangs off the row, not off a create form: an association needs an owner id\n` +
      `// that does not exist yet while the row is still being created.\n` +
      `// 上传挂在**行**上而不是新建表单上：关联需要一个 owner id，而行还在创建中时它并不存在。\n` +
      `function pickFile(item: Admin${ctx.singlePascal}, field: string) {\n` +
      `  pendingUpload.value = { item, field }\n` +
      `  fileInput.value?.click()\n` +
      `}\n\n` +
      `async function onFilePicked(event: Event) {\n` +
      `  const input = event.target as HTMLInputElement\n` +
      `  const file = input.files?.[0]\n` +
      `  // Clear first, or re-picking the same file never fires change again.\n` +
      `  // 先清空，否则再选同一个文件不会再次触发 change。\n` +
      `  input.value = ''\n` +
      `  const target = pendingUpload.value\n` +
      `  pendingUpload.value = null\n` +
      `  if (!file || !target) return\n` +
      `  try {\n` +
      `    const uploaded = await uploadFile(file)\n` +
      `    await ${ctx.plural}Api.attach(target.item.id, target.field, uploaded)\n` +
      `    snackbar.success(t('saved'))\n` +
      `    await load()\n` +
      `  } catch (err) {\n` +
      `    snackbar.error(err instanceof Error ? err.message : t('uploadFailed'))\n` +
      `  }\n` +
      `}\n\n` +
      `function confirmRevoke(item: Admin${ctx.singlePascal}, attachment: Admin${ctx.singlePascal}Attachment) {\n` +
      `  pendingRevoke.value = { item, attachment }\n` +
      `  showRevoke.value = true\n` +
      `}\n\n` +
      `async function onRevoke() {\n` +
      `  if (!pendingRevoke.value) return\n` +
      `  try {\n` +
      `    await ${ctx.plural}Api.revokeAttachment(pendingRevoke.value.item.id, pendingRevoke.value.attachment.id)\n` +
      `    snackbar.success(t('deleted'))\n` +
      `    await load()\n` +
      `  } catch (err) {\n` +
      `    snackbar.error(err instanceof Error ? err.message : t('deleteFailed'))\n` +
      `  } finally {\n` +
      `    showRevoke.value = false\n` +
      `  }\n` +
      `}\n\n`;
  // ONE hidden file input for the whole view, not one per field or per row.
  // 整个视图**一个**隐藏 file input，不是每字段或每行一个。
  const attachHiddenInput = !hasAtt
    ? ''
    : `    <input ref="fileInput" type="file" class="d-none" @change="onFilePicked" />\n`;
  const attachRevokeDialog = !hasAtt
    ? ''
    : `    <ConfirmDialog\n` +
      `      v-model="showRevoke"\n` +
      `      :title="t('${ctx.plural}RevokeTitle')"\n` +
      `      :content="t('${ctx.plural}RevokeContent')"\n` +
      `      @confirm="onRevoke"\n` +
      `    />\n`;
  const enumLabelBlock =
    enumFields.length === 0
      ? ''
      : `const enumLabels = computed<Record<string, string>>(() => ({\n${enumLabelEntries}\n}))\n\n` +
        `// Renders an enum cell with its label, falling back to the raw value.\n` +
        `// enum 单元格按标签渲染；缺标签时回落原始值。\n` +
        `function cellText(field: string, value: unknown): string {\n` +
        `  const key = field + ':' + String(value)\n` +
        `  return enumLabels.value[key] ?? String(value ?? '')\n` +
        `}\n\n`;
  const enumSlots = enumFields
    .map(
      (f) => `      <template #item.${f.name}="{ item }">{{ cellText('${f.name}', item.${f.name}) }}</template>`,
    )
    .join('\n');
  // 回显：关联列显示**目标名**（缺则回落外键 id），附件列显示**文件名**。
  const refSlots = ctx.fields
    .filter((f) => f.type === 'ref')
    .map(
      (f) =>
        `      <template #item.${f.name}="{ item }">{{ String(item.${f.name}?.['${f.display}'] ?? item.${refColumnName(f.name)} ?? '') }}</template>`,
    )
    .join('\n');
  const attachSlots = attFields
    .map(
      (n) =>
        `      <template #item.${n}="{ item }">\n` +
        `        <el-space :size="4" wrap>\n` +
        `          <el-tag\n` +
        `            v-for="a in attachmentsOf(item, '${n}')"\n` +
        `            :key="a.id"\n` +
        `            closable\n` +
        `            size="small"\n` +
        `            @close="confirmRevoke(item, a)"\n` +
        `          >\n` +
        `            {{ a.originalName }}\n` +
        `          </el-tag>\n` +
        `          <el-button text size="small" @click="pickFile(item, '${n}')">\n` +
        `            <AppIcon icon="mdi-paperclip" />\n` +
        `          </el-button>\n` +
        `        </el-space>\n` +
        `      </template>`,
    )
    .join('\n');
  const echoSlots = [enumSlots, refSlots, attachSlots].filter(Boolean).join('\n');
  return `<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import PageHeader from '@/components/PageHeader.vue'
import AppTable from '@/components/AppTable.vue'
import AppIcon from '@/components/AppIcon.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import { useSnackbarStore } from '@/stores/snackbar'
import { ${ctx.plural}Api, type Admin${ctx.singlePascal}${hasAtt ? `, type Admin${ctx.singlePascal}Attachment` : ''} } from '@/api/${ctx.plural}'
${hasAtt ? `import { uploadFile } from '@/api/upload'\n` : ''}

const { t } = useI18n()
const snackbar = useSnackbarStore()

const items = ref<Admin${ctx.singlePascal}[]>([])
const loading = ref(false)
const showDelete = ref(false)
const pendingDelete = ref<Admin${ctx.singlePascal} | null>(null)
${attachRefs}
${enumLabelBlock}${attachBlock}const headers = computed(() => [
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
${echoSlots ? `${echoSlots}\n` : ''}      <template #item.actions="{ item }">
        <el-button text size="small" type="danger" @click="confirmDelete(item)">
          <AppIcon icon="mdi-delete-outline" />
        </el-button>
      </template>
    </AppTable>
${attachHiddenInput}    <ConfirmDialog
      v-model="showDelete"
      :title="t('${ctx.plural}DeleteTitle')"
      :content="t('${ctx.plural}DeleteContent')"
      @confirm="onDelete"
    />
${attachRevokeDialog}  </div>
</template>
`;
}

/** i18n 文案（zh/en 成对）。 */
export function adminI18nKeys(ctx) {
  const single = ctx.singular;
  const enumZh = {};
  const enumEn = {};
  for (const f of ctx.fields.filter((x) => x.type === 'enum' && hasEnumLabels(x))) {
    for (const opt of f.enum) {
      if (!f.enumLabels[opt]) continue;
      enumZh[enumLabelGetter(ctx, f.name, opt)] = f.enumLabels[opt].zh;
      enumEn[enumLabelGetter(ctx, f.name, opt)] = f.enumLabels[opt].en;
    }
  }
  // 撤销附件是模块专属文案；没有附件字段就不发这两个 key（§15.3）。
  // Only a module with attachments gets the revoke labels.
  const revokeZh =
    attachmentFields(ctx.fields).length === 0
      ? {}
      : {
          [`${ctx.plural}RevokeTitle`]: `撤销${ctx.label}附件`,
          [`${ctx.plural}RevokeContent`]: `确定撤销该附件？`,
        };
  const revokeEn =
    attachmentFields(ctx.fields).length === 0
      ? {}
      : {
          [`${ctx.plural}RevokeTitle`]: `Revoke ${ctx.singlePascal} attachment`,
          [`${ctx.plural}RevokeContent`]: `Revoke this attachment?`,
        };
  return {
    zh: {
      [`nav${ctx.pluralPascal}`]: ctx.label,
      [`${ctx.plural}ViewSubtitle`]: `${ctx.label}管理`,
      [`${ctx.plural}DeleteTitle`]: `删除${ctx.label}`,
      [`${ctx.plural}DeleteContent`]: `确定删除该${ctx.label}？`,
      ...revokeZh,
      ...enumZh,
    },
    en: {
      [`nav${ctx.pluralPascal}`]: ctx.singlePascal,
      [`${ctx.plural}ViewSubtitle`]: `Manage ${ctx.singlePascal}`,
      [`${ctx.plural}DeleteTitle`]: `Delete ${ctx.singlePascal}`,
      [`${ctx.plural}DeleteContent`]: `Delete this ${single}?`,
      ...revokeEn,
      ...enumEn,
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
