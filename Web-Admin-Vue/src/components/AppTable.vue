<!-- SPDX-License-Identifier: Apache-2.0 -->
<template>
  <el-card shadow="never" class="app-table">
    <el-table
      :data="items"
      v-loading="loading"
      :row-key="'id'"
      style="width: 100%"
    >
      <el-table-column
        v-for="col in headers"
        :key="col.key"
        :prop="col.key"
        :label="col.title"
        :sortable="col.sortable"
        :width="typeof col.width === 'number' ? col.width : undefined"
        :min-width="col.width === undefined ? 120 : undefined"
      >
        <!-- 父组件提供了 #item.X 插槽 → 渲染插槽；否则 el-table 自动渲染原始值 -->
        <template v-if="columnSlots.includes(col.key)" #default="scope">
          <slot :name="`item.${col.key}`" :item="scope.row" :value="scope.row[col.key]" />
        </template>
      </el-table-column>
      <template #empty>
        <div class="pa-4 text-medium-emphasis">
          <AppIcon icon="mdi-inbox-outline" size="28" class="mb-1" />
          <div>{{ emptyText || t('noData') }}</div>
        </div>
      </template>
    </el-table>
    <div v-if="hasPaginationSlot" class="px-3">
      <slot name="pagination" />
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { computed, useSlots } from 'vue'
import { useI18n } from 'vue-i18n'

withDefaults(
  defineProps<{
    headers: { key: string; title: string; sortable?: boolean; width?: string | number }[]
    items: any[] // eslint-disable-line @typescript-eslint/no-explicit-any
    loading?: boolean
    total?: number
    itemsPerPage?: number
    emptyText?: string
  }>(),
  { itemsPerPage: 10 },
)

const { t } = useI18n()
const slots = useSlots()

// 父组件写 #item.columnName → 出现在 slots 里，取列名（去掉 item. 前缀）
const columnSlots = computed(() =>
  Object.keys(slots)
    .filter((k) => k.startsWith('item.') && !k.includes(' '))
    .map((k) => k.slice('item.'.length)),
)
const hasPaginationSlot = computed(() => Boolean(slots.pagination))
</script>
