<template>
  <v-card class="stat-card">
    <v-card-text class="d-flex align-center ga-3">
      <v-avatar :color="color" variant="tonal" size="46" class="flex-shrink-0">
        <v-icon :icon="icon" size="24" />
      </v-avatar>
      <div>
        <div class="text-caption text-medium-emphasis">{{ label }}</div>
        <div class="text-h6 font-weight-bold">{{ value }}</div>
        <div v-if="hint" class="text-caption text-medium-emphasis">{{ hint }}</div>
      </div>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    label: string
    value: string | number
    icon: string
    color?: string
    hint?: string
  }>(),
  { color: 'primary' },
)
</script>
