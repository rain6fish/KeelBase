<!-- SPDX-License-Identifier: Apache-2.0 -->
<template>
  <view class="event-form">
    <view class="event-form__content">
      <view class="form-group">
        <text class="form-label">{{ t('eventForm.titleLabel') }}</text>
        <input
          class="form-input"
          :class="{ 'form-input--error': errors.title }"
          :placeholder="t('eventForm.titlePlaceholder')"
          v-model="title"
        />
        <text v-if="errors.title" class="form-error">{{ errors.title }}</text>
      </view>

      <view class="form-group">
        <text class="form-label">{{ t('eventForm.descriptionLabel') }}</text>
        <input
          class="form-input form-input--multiline"
          :placeholder="t('eventForm.descriptionPlaceholder')"
          v-model="description"
        />
      </view>

      <view class="form-group">
        <text class="form-label">{{ t('eventForm.locationLabel') }}</text>
        <input
          class="form-input"
          :placeholder="t('eventForm.locationPlaceholder')"
          v-model="location"
        />
      </view>

      <!-- Start date/time -->
      <text class="form-section-title">{{ t('eventForm.start') }}</text>
      <view class="event-form__datetime">
        <picker mode="date" :value="startDate" @change="startDate = $event.detail.value">
          <view class="event-form__picker">
            <text class="event-form__picker-icon">📅</text>
            <text>{{ startDate }}</text>
          </view>
        </picker>
        <picker mode="time" :value="startTime" @change="startTime = $event.detail.value">
          <view class="event-form__picker">
            <text class="event-form__picker-icon">⏰</text>
            <text>{{ startTime }}</text>
          </view>
        </picker>
      </view>

      <!-- End date/time -->
      <text class="form-section-title">{{ t('eventForm.end') }}</text>
      <view class="event-form__datetime">
        <picker mode="date" :value="endDate" @change="endDate = $event.detail.value">
          <view class="event-form__picker">
            <text class="event-form__picker-icon">📅</text>
            <text>{{ endDate }}</text>
          </view>
        </picker>
        <picker mode="time" :value="endTime" @change="endTime = $event.detail.value">
          <view class="event-form__picker">
            <text class="event-form__picker-icon">⏰</text>
            <text>{{ endTime }}</text>
          </view>
        </picker>
      </view>

      <!-- Color picker -->
      <view class="form-group">
        <text class="form-label">{{ t('eventForm.color') }}</text>
        <view class="event-form__colors">
          <view
            v-for="(color, i) in EVENT_COLORS"
            :key="i"
            class="event-form__color"
            :class="{ 'event-form__color--selected': colorRole === i }"
            :style="{ backgroundColor: color }"
            @click="colorRole = i"
          />
        </view>
      </view>

      <button
        class="event-form__submit"
        :loading="store.isLoading"
        :disabled="store.isLoading"
        @click="handleSubmit"
      >
        {{ isEditing ? t('eventForm.update') : t('eventForm.create') }}
      </button>
    </view>
  </view>
</template>

<script setup lang="ts">
import './index.scss'
import { ref } from 'vue'
import Taro from '@tarojs/taro'
import { useEventsStore } from '../../stores/events-store'
import { useI18n } from '../../composables/useI18n'
import { EVENT_COLORS } from '../../utils/constants'
import { validateTitle } from '../../utils/validators'

const store = useEventsStore()
const { t } = useI18n()

const router = Taro.getCurrentInstance().router
const eventId = router?.params?.id ? Number(router.params.id) : undefined
const isEditing = eventId != null

const title = ref('')
const description = ref('')
const location = ref('')

const now = new Date()
const startDate = ref(
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
)
const startTime = ref(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`)

const baseEnd = new Date()
baseEnd.setHours(baseEnd.getHours() + 1)
const endDate = ref(
  `${baseEnd.getFullYear()}-${String(baseEnd.getMonth() + 1).padStart(2, '0')}-${String(baseEnd.getDate()).padStart(2, '0')}`,
)
const endTime = ref(`${String(baseEnd.getHours()).padStart(2, '0')}:${String(baseEnd.getMinutes()).padStart(2, '0')}`)

const colorRole = ref(0)
const errors = ref<Record<string, string>>({})

async function handleSubmit() {
  const titleErr = validateTitle(title.value)
  errors.value = { title: titleErr || '' }
  if (titleErr) return

  const start = new Date(`${startDate.value}T${startTime.value}`)
  const end = new Date(`${endDate.value}T${endTime.value}`)

  if (end <= start) {
    Taro.showToast({ title: t('eventForm.endBeforeStart'), icon: 'none' })
    return
  }

  const success = await store.createEvent({
    title: title.value.trim(),
    description: description.value.trim() || undefined,
    startTime: start.toISOString(),
    endTime: end.toISOString(),
    location: location.value.trim() || undefined,
    colorRole: colorRole.value,
  })

  if (success) {
    Taro.showToast({ title: t('eventForm.created'), icon: 'success' })
    setTimeout(() => Taro.navigateBack(), 1500)
  }
}
</script>

