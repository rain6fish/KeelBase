/**
 * EASY-2 Taro（Vue3）用户 CRUD 页模板（⑤-3）。
 * 参考迁移后的 Taro Vue3 黄金样例（todos/index.vue + pinia store + api-client service）。
 * v1：列表 + 首字段新增 + 删除（本人数据，走用户端 API）。
 */

const TARO_TS_TYPE = {
  string: () => 'string',
  text: () => 'string',
  int: () => 'number',
  bool: () => 'boolean',
  date: () => 'string',
  enum: () => 'string',
};

export function taroServiceTemplate(ctx) {
  return `import { api } from './api-client'
import type { ${ctx.singlePascal}Item, Create${ctx.singlePascal}Request } from '../types/${ctx.plural}'

export const ${ctx.plural}Service = {
  get${ctx.pluralPascal}(): Promise<${ctx.singlePascal}Item[]> {
    return api.get<${ctx.singlePascal}Item[]>('/${ctx.plural}').then((res) => res.data || [])
  },

  create(dto: Create${ctx.singlePascal}Request): Promise<${ctx.singlePascal}Item> {
    return api.post<${ctx.singlePascal}Item>('/${ctx.plural}', dto).then((res) => res.data!)
  },

  remove(id: number): Promise<void> {
    return api.delete(\`/${ctx.plural}/\${id}\`).then(() => {})
  },
}
`;
}

export function taroTypesTemplate(ctx) {
  const itemFields = ctx.fields
    .map((f) => `  ${f.name}${f.type === 'int' || f.type === 'date' ? '?' : ''}: ${TARO_TS_TYPE[f.type]()}`)
    .join('\n');
  const reqFields = ctx.fields
    .map((f) => `  ${f.name}${f.type === 'int' || f.type === 'date' ? '?' : ''}: ${TARO_TS_TYPE[f.type]()};`)
    .join('\n');
  return `export interface ${ctx.singlePascal}Item {
  id: number
${itemFields}
  createdAt: string
}

export interface Create${ctx.singlePascal}Request {
${reqFields}
}
`;
}

export function taroStoreTemplate(ctx) {
  return `import { defineStore } from 'pinia'
import { ${ctx.plural}Service } from '../services/${ctx.plural}-service'
import type { ${ctx.singlePascal}Item, Create${ctx.singlePascal}Request } from '../types/${ctx.plural}'

/** ${ctx.label}状态（Taro Vue3，pinia）：列表 + 增/删，乐观更新。 */
export const use${ctx.pluralPascal}Store = defineStore('${ctx.plural}', {
  state: () => ({
    items: [] as ${ctx.singlePascal}Item[],
    isLoading: false,
    error: null as string | null,
  }),
  actions: {
    async load() {
      this.isLoading = true
      this.error = null
      try {
        this.items = await ${ctx.plural}Service.get${ctx.pluralPascal}()
      } catch (err: any) {
        this.error = err.message || 'Failed to load ${ctx.label}'
      } finally {
        this.isLoading = false
      }
    },

    async add(dto: Create${ctx.singlePascal}Request) {
      const item = await ${ctx.plural}Service.create(dto)
      this.items = [...this.items, item]
    },

    async remove(id: number) {
      const prev = this.items
      this.items = prev.filter((i) => i.id !== id)
      try {
        await ${ctx.plural}Service.remove(id)
      } catch (err: any) {
        this.items = prev
        throw new Error(err.message || 'Failed to delete ${ctx.singular}')
      }
    },
  },
})
`;
}

export function taroPageTemplate(ctx) {
  const first = ctx.fields.length > 0 ? ctx.fields[0].name : 'id';
  return `<template>
  <view class="${ctx.plural}-page">
    <view class="${ctx.plural}-page__header">
      <text class="${ctx.plural}-page__title">${ctx.label}</text>
      <text class="${ctx.plural}-page__count">{{ items.length }} 条</text>
    </view>

    <view class="${ctx.plural}-page__input-bar">
      <input
        class="${ctx.plural}-page__input"
        v-model="${first}"
        placeholder="新增${ctx.label}…"
        confirm-type="done"
        @confirm="handleAdd"
      />
      <button class="${ctx.plural}-page__add" size="mini" @click="handleAdd">添加</button>
    </view>

    <text v-if="store.isLoading" class="${ctx.plural}-page__hint">加载中…</text>
    <text v-if="store.error" class="${ctx.plural}-page__error">{{ store.error }}</text>

    <view v-if="items.length === 0 && !store.isLoading" class="${ctx.plural}-page__empty">
      <text>暂无${ctx.label}</text>
    </view>
    <view v-for="item in items" :key="item.id" class="${ctx.plural}-page__item">
      <text class="${ctx.plural}-page__text">{{ item.${first} }}</text>
      <text class="${ctx.plural}-page__delete" @click="handleRemove(item)">✕</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import Taro from '@tarojs/taro'
import { storeToRefs } from 'pinia'
import { use${ctx.pluralPascal}Store } from '../../stores/${ctx.plural}-store'

const store = use${ctx.pluralPascal}Store()
const { items } = storeToRefs(store)
const ${first} = ref('')

onMounted(() => {
  store.load()
})

async function handleAdd() {
  const text = ${first}.value.trim()
  if (!text) {
    Taro.showToast({ title: '请输入${ctx.label}内容', icon: 'none' })
    return
  }
  try {
    await store.add({ ${first}: text } as any)
    ${first}.value = ''
  } catch (err: any) {
    Taro.showToast({ title: err.message || '创建失败', icon: 'none' })
  }
}

function handleRemove(item: any) {
  Taro.showModal({
    title: '删除${ctx.label}',
    content: \`确定删除「\${item.${first}}」？\`,
    success: async (res) => {
      if (!res.confirm) return
      try {
        await store.remove(item.id)
      } catch (err: any) {
        Taro.showToast({ title: err.message || '删除失败', icon: 'none' })
      }
    },
  })
}
</script>

<style src="./index.scss" scoped></style>
`;
}

export function taroScssTemplate(ctx) {
  const c = ctx.plural;
  return `.${c}-page {
  padding: 16px;
  &__header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
  &__title { font-size: 20px; font-weight: 600; }
  &__count { font-size: 13px; color: #999; }
  &__input-bar { display: flex; gap: 8px; margin-bottom: 12px; }
  &__input { flex: 1; border: 1px solid #e5e7eb; border-radius: 8px; padding: 8px 12px; font-size: 14px; }
  &__add { background: #16a34a; color: #fff; border-radius: 8px; font-size: 14px; }
  &__hint, &__error { font-size: 13px; color: #999; }
  &__error { color: #dc2626; }
  &__empty { text-align: center; color: #999; padding: 32px 0; font-size: 14px; }
  &__item { display: flex; justify-content: space-between; align-items: center; padding: 12px; border-bottom: 1px solid #f3f4f6; }
  &__text { font-size: 15px; }
  &__delete { color: #dc2626; font-size: 16px; padding: 4px; }
}
`;
}

/** Taro（Vue3）新文件：{ relativePath, content }。 */
export function taroFiles(ctx) {
  const base = `src`;
  return [
    { path: `${base}/services/${ctx.plural}-service.ts`, content: taroServiceTemplate(ctx) },
    { path: `${base}/types/${ctx.plural}.ts`, content: taroTypesTemplate(ctx) },
    { path: `${base}/stores/${ctx.plural}-store.ts`, content: taroStoreTemplate(ctx) },
    { path: `${base}/pages/${ctx.plural}/index.vue`, content: taroPageTemplate(ctx) },
    { path: `${base}/pages/${ctx.plural}/index.scss`, content: taroScssTemplate(ctx) },
  ];
}
