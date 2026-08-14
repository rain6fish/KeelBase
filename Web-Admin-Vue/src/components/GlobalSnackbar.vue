<template>
  <div class="snackbar-stack">
    <v-snackbar
      v-for="item in snackbar.items"
      :key="item.id"
      :model-value="true"
      :color="colorFor(item.type)"
      location="bottom"
      timeout="-1"
    >
      {{ item.message }}
      <template #actions>
        <v-btn icon="mdi-close" variant="text" @click="snackbar.dismiss(item.id)" />
      </template>
    </v-snackbar>
  </div>
</template>

<script setup lang="ts">
import { useSnackbarStore } from '@/stores/snackbar'

const snackbar = useSnackbarStore()

function colorFor(type: string): string {
  return type === 'success' ? 'success' : type === 'error' ? 'error' : 'info'
}
</script>

<style scoped>
.snackbar-stack {
  position: fixed;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 4000;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
</style>
