<template>
  <!-- 有子部门：可展开的 list-group -->
  <v-list-group v-if="node.children.length" :value="node.id">
    <template #activator="{ props: groupProps }">
      <v-list-item
        v-bind="groupProps"
        :title="node.name"
        :active="selectedId === node.id"
        :readonly="readonly"
        @click="emit('select', node.id)"
      >
        <template #append>
          <div v-if="!readonly" class="d-flex ga-0" @click.stop>
            <v-btn icon="mdi-plus" size="x-small" variant="text" :title="t('deptAdd')" @click="emit('add', node.id)" />
            <v-btn icon="mdi-pencil-outline" size="x-small" variant="text" :title="t('edit')" @click="emit('rename', node.id)" />
            <v-btn icon="mdi-delete-outline" size="x-small" variant="text" color="error" :title="t('delete')" @click="emit('remove', node.id)" />
          </div>
        </template>
      </v-list-item>
    </template>
    <OrgDeptTree
      v-for="c in node.children"
      :key="c.id"
      :node="c"
      :selected-id="selectedId"
      :readonly="readonly"
      @select="emit('select', $event)"
      @add="emit('add', $event)"
      @rename="emit('rename', $event)"
      @remove="emit('remove', $event)"
    />
  </v-list-group>

  <!-- 叶子部门 -->
  <v-list-item
    v-else
    :title="node.name"
    :active="selectedId === node.id"
    :readonly="readonly"
    @click="emit('select', node.id)"
  >
    <template #append>
      <div v-if="!readonly" class="d-flex ga-0" @click.stop>
        <v-btn icon="mdi-plus" size="x-small" variant="text" :title="t('deptAdd')" @click="emit('add', node.id)" />
        <v-btn icon="mdi-pencil-outline" size="x-small" variant="text" :title="t('edit')" @click="emit('rename', node.id)" />
        <v-btn icon="mdi-delete-outline" size="x-small" variant="text" color="error" :title="t('delete')" @click="emit('remove', node.id)" />
      </div>
    </template>
  </v-list-item>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { DeptTreeNode } from '@/types/org'

defineOptions({ name: 'OrgDeptTree' })

withDefaults(
  defineProps<{
    node: DeptTreeNode
    selectedId: number | null
    /** 只读模式：隐藏增删改按钮（工作台通讯录用） */
    readonly?: boolean
  }>(),
  { readonly: false },
)

const emit = defineEmits<{
  (e: 'select', id: number): void
  (e: 'add', parentId: number): void
  (e: 'rename', id: number): void
  (e: 'remove', id: number): void
}>()

const { t } = useI18n()
</script>
