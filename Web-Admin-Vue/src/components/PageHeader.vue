<template>
  <div class="d-flex justify-space-between align-center mb-4 flex-wrap ga-2">
    <div>
      <h2 class="text-h6 font-weight-bold">{{ title }}</h2>
      <div v-if="subtitle" class="text-body-2 text-medium-emphasis">{{ subtitle }}</div>
    </div>
    <div class="d-flex ga-2 flex-wrap">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  title: string
  subtitle?: string
}>()
</script>
