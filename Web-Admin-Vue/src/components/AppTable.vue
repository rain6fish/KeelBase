<template>
  <v-card>
    <!-- 普通 v-data-table：items 直接渲染（分页由父组件 AppPagination 控制，无需 server 模式） -->
    <v-data-table
      :headers="headers"
      :items="items"
      :loading="loading"
      item-value="id"
      hover
      hide-default-footer
    >
      <template #no-data>
        <div class="pa-4 text-medium-emphasis">{{ emptyText || t('loading') }}</div>
      </template>
      <!-- 父组件提供的 #item.xxx 插槽 → 转发原始行数据（普通 v-data-table 的 item 插槽直接给行对象） -->
      <template v-for="col in columnSlots" :key="col" #[`item.${col}`]="props">
        <slot :name="`item.${col}`" :item="props.item" />
      </template>
      <template #bottom>
        <slot name="pagination" />
      </template>
    </v-data-table>
  </v-card>
</template>

<script setup lang="ts">
import { computed, useSlots } from 'vue'
import { useI18n } from 'vue-i18n'

withDefaults(
  defineProps<{
    headers: { key: string; title: string; sortable?: boolean; width?: string | number }[]
    items: any[]
    loading?: boolean
    total?: number
    itemsPerPage?: number
    emptyText?: string
  }>(),
  { itemsPerPage: 10 },
)

const { t } = useI18n()
const slots = useSlots()

// 父组件写 #item.columnName → 出现在 slots 里，取列名（去掉 item. 前缀）转发给内层 v-data-table-server
const columnSlots = computed(() =>
  Object.keys(slots)
    .filter((k) => k.startsWith('item.') && !k.includes(' '))
    .map((k) => k.slice('item.'.length)),
)
</script>
