<template>
  <el-dialog v-model="show" :width="maxWidth" :title="title" :close-on-click-modal="false">
    <div class="d-flex align-center ga-2 mb-3">
      <AppIcon :icon="icon" color="var(--el-color-primary)" />
    </div>
    <slot />
    <template #footer>
      <el-button :disabled="loading" @click="show = false">{{ t('cancel') }}</el-button>
      <el-button type="primary" :loading="loading" @click="emit('save')">
        {{ saveLabel || t('save') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const props = withDefaults(
  defineProps<{
    modelValue: boolean
    title: string
    icon?: string
    loading?: boolean
    maxWidth?: string | number
    saveLabel?: string
  }>(),
  { icon: 'mdi-form-select', maxWidth: 560 },
)
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'save'): void
}>()
const { t } = useI18n()

const show = ref(props.modelValue)
watch(
  () => props.modelValue,
  (v) => (show.value = v),
)
watch(show, (v) => emit('update:modelValue', v))
</script>
