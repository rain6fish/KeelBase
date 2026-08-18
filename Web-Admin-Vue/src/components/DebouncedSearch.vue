<template>
  <el-input
    :model-value="modelValue"
    :placeholder="placeholder"
    clearable
    style="max-width: 260px"
    @update:model-value="onInput"
    @clear="clear"
  >
    <template #prefix>
      <AppIcon icon="mdi-magnify" />
    </template>
  </el-input>
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

function onInput(v: string | number | null) {
  const value = v == null ? '' : String(v)
  emit('update:modelValue', value)
  if (timer.value) clearTimeout(timer.value)
  timer.value = setTimeout(() => emit('search', value), props.delay ?? 400)
}
function clear() {
  emit('update:modelValue', '')
  emit('search', '')
}
</script>
