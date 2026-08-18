<template>
  <el-dialog v-model="show" :title="title" width="420" :close-on-click-modal="false">
    <div class="d-flex align-center ga-2">
      <AppIcon :icon="icon" :color="color" />
      <span class="text-body-2">{{ content }}</span>
    </div>
    <template #footer>
      <el-button @click="show = false">{{ t('no') }}</el-button>
      <el-button :type="buttonType" :loading="loading" @click="confirm">{{ t('yes') }}</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
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

const buttonType = computed(() => (props.color === 'error' ? 'danger' : 'primary'))

function confirm() {
  emit('confirm')
}
</script>
