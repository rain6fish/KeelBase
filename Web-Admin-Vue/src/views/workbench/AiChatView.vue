<!-- SPDX-License-Identifier: Apache-2.0 -->
<!--
  工作台 · AI 助手整页（登录后的默认落点）

  与右侧抽屉共用同一个 `AiChatPanel`：抽屉是「随手叫出来」，这里是「我就在这儿」。
  左侧菜单与其余页面原样保留——本页是**新增的入口**，不是把功能收进对话框。
-->
<template>
  <div class="ai-chat-view">
    <AiChatPanel ref="panel" />
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import AiChatPanel from '@/components/AiChatPanel.vue'

const panel = ref<InstanceType<typeof AiChatPanel> | null>(null)

// 整页宿主没有「打开」事件——挂载即加载账本
onMounted(() => {
  void panel.value?.refresh()
})
</script>

<style scoped>
.ai-chat-view {
  height: 100%;
  min-height: 480px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
  overflow: hidden;
}
</style>
