<template>
  <!-- 有子部门：可展开的 details 分组 -->
  <details v-if="node.children.length" class="dept-tree-group" open>
    <summary
      class="dept-tree-node"
      :class="{ 'is-active': selectedId === node.id }"
      @click="emit('select', node.id)"
    >
      <AppIcon icon="mdi-chevron-right" size="16" class="dept-chevron me-1 flex-shrink-0" />
      <span class="flex-grow-1 text-truncate">{{ node.name }}</span>
      <div v-if="!readonly" class="d-flex ga-0 flex-shrink-0" @click.stop>
        <el-button text size="small" :title="t('deptAdd')" @click="emit('add', node.id)">
          <AppIcon icon="mdi-plus" />
        </el-button>
        <el-button text size="small" :title="t('edit')" @click="emit('rename', node.id)">
          <AppIcon icon="mdi-pencil-outline" />
        </el-button>
        <el-button text size="small" type="danger" :title="t('delete')" @click="emit('remove', node.id)">
          <AppIcon icon="mdi-delete-outline" />
        </el-button>
      </div>
    </summary>
    <div class="dept-tree-children">
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
    </div>
  </details>

  <!-- 叶子部门 -->
  <div
    v-else
    class="dept-tree-node"
    :class="{ 'is-active': selectedId === node.id }"
    @click="emit('select', node.id)"
  >
    <span class="flex-shrink-0" style="width: 20px" />
    <span class="flex-grow-1 text-truncate">{{ node.name }}</span>
    <div v-if="!readonly" class="d-flex ga-0 flex-shrink-0" @click.stop>
      <el-button text size="small" :title="t('deptAdd')" @click="emit('add', node.id)">
        <AppIcon icon="mdi-plus" />
      </el-button>
      <el-button text size="small" :title="t('edit')" @click="emit('rename', node.id)">
        <AppIcon icon="mdi-pencil-outline" />
      </el-button>
      <el-button text size="small" type="danger" :title="t('delete')" @click="emit('remove', node.id)">
        <AppIcon icon="mdi-delete-outline" />
      </el-button>
    </div>
  </div>
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

<style scoped>
.dept-tree-node {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer;
  min-height: 32px;
}
.dept-tree-node:hover {
  background: var(--el-fill-color-light);
}
.dept-tree-node.is-active {
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
}
.dept-tree-children {
  padding-left: 14px;
}
details.dept-tree-group > summary {
  list-style: none;
}
details.dept-tree-group > summary::-webkit-details-marker {
  display: none;
}
details.dept-tree-group[open] > summary .dept-chevron {
  transform: rotate(90deg);
}
.dept-chevron {
  transition: transform 0.15s ease;
}
</style>
