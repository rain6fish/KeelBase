<template>
  <v-dialog v-model="show" :max-width="maxWidth" persistent>
    <v-card :loading="loading">
      <v-card-title class="d-flex align-center ga-2">
        <v-icon :icon="icon" color="primary" />
        {{ title }}
      </v-card-title>
      <v-divider />
      <v-card-text class="pt-4">
        <slot />
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" :disabled="loading" @click="show = false">{{ t('cancel') }}</v-btn>
        <v-btn color="primary" variant="tonal" :loading="loading" @click="emit('save')">
          {{ saveLabel || t('save') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
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
