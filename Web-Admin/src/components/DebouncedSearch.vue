<template>
  <v-text-field
    :model-value="modelValue"
    :placeholder="placeholder"
    prepend-inner-icon="mdi-magnify"
    variant="outlined"
    density="comfortable"
    hide-details
    clearable
    @update:model-value="onInput"
    @click:clear="clear"
  />
</template>

<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{
  modelValue: string
  placeholder?: string
  /** debounce 毫秒，默认 400 */
  delay?: number
}>()
const emit = defineEmits<{
  (e: 'update:modelValue', v: string): void
  (e: 'search', v: string): void
}>()

const timer = ref<ReturnType<typeof setTimeout> | null>(null)

function onInput(v: string | null) {
  const value = v ?? ''
  emit('update:modelValue', value)
  if (timer.value) clearTimeout(timer.value)
  timer.value = setTimeout(() => emit('search', value), props.delay ?? 400)
}
function clear() {
  emit('update:modelValue', '')
  emit('search', '')
}
</script>
