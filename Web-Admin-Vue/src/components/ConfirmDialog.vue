<template>
  <v-dialog v-model="show" max-width="420">
    <v-card>
      <v-card-title class="d-flex align-center ga-2">
        <v-icon :icon="icon" :color="color" />
        {{ title }}
      </v-card-title>
      <v-card-text>{{ content }}</v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="show = false">{{ t('no') }}</v-btn>
        <v-btn :color="color" variant="tonal" :loading="loading" @click="confirm">{{ t('yes') }}</v-btn>
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
    content: string
    color?: string
    icon?: string
    loading?: boolean
  }>(),
  { color: 'error', icon: 'mdi-alert-outline' },
)
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'confirm'): void
}>()
const { t } = useI18n()

const show = ref(props.modelValue)
watch(
  () => props.modelValue,
  (v) => (show.value = v),
)
watch(show, (v) => emit('update:modelValue', v))

function confirm() {
  emit('confirm')
}
</script>
