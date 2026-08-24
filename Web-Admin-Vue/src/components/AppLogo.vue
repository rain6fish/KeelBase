<template>
  <img src="/logo.png" alt="KeelBase" class="app-logo" :style="{ width: `${width}px` }" />
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    /** 16:9 品牌横幅，仅设宽，高按比例自适应 */
    width?: number
  }>(),
  { width: 96 },
)
</script>

<style scoped>
.app-logo {
  display: block;
  height: auto;
}
</style>
