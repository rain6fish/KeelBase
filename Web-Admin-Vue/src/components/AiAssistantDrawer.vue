<!-- SPDX-License-Identifier: Apache-2.0 -->
<!--
  AI 助手抽屉：只是 `AiChatPanel` 的一个宿主。

  行为全在面板里（历史账本 + 聊天 + 确认卡）；本文件只负责抽屉外壳，以及把抽屉的开/关
  接到面板的 `refresh()` / `reset()`。工作台整页（`views/workbench/AiChatView.vue`）是同一个面板的另一个宿主。
-->
<template>
  <el-drawer
    :model-value="modelValue"
    :size="'min(600px, 92vw)'"
    direction="rtl"
    :with-header="false"
    class="ai-assistant-drawer"
    @update:model-value="emit('update:modelValue', $event)"
    @open="onOpen"
    @closed="onClosed"
  >
    <AiChatPanel ref="panel" @close="emit('update:modelValue', false)" />
  </el-drawer>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import AiChatPanel from '@/components/AiChatPanel.vue'

defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>()

const panel = ref<InstanceType<typeof AiChatPanel> | null>(null)

/** 打开时刷新账本；聊天状态留在面板内，关/开抽屉不清空 */
function onOpen() {
  void panel.value?.refresh()
}

/** 关闭时中止在途流式（面板可被复用） */
function onClosed() {
  panel.value?.reset()
}
</script>
