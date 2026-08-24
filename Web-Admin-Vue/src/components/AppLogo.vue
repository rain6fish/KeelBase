<template>
  <svg
    viewBox="0 0 24 24"
    :style="{ width: `${size}px`, height: `${size}px`, color }"
    aria-hidden="true"
  >
    <!-- mdi-shield-check：盾形信任章（Business-safe 品牌标记） -->
    <path
      fill="currentColor"
      d="M10,17L6,13L7.41,11.59L10,14.17L16.59,7.58L18,9M12,1L3,5V11C3,16.55 6.84,21.74 12,23C17.16,21.74 21,16.55 21,11V5L12,1Z"
    />
  </svg>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    size?: number
    color?: string
  }>(),
  { size: 26, color: 'var(--el-color-primary)' },
)
</script>
