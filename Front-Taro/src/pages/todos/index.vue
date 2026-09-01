<!-- SPDX-License-Identifier: Apache-2.0 -->
<template>
  <view class="todos-page">
    <view class="todos-page__header">
      <text class="todos-page__title">{{ t('todos.title') }}</text>
      <text class="todos-page__count">{{ t('todos.count', { active: active.length, total: todos.length }) }}</text>
    </view>

    <view class="todos-page__input-bar">
      <input
        class="todos-page__input"
        v-model="title"
        :placeholder="t('todos.placeholder')"
        confirm-type="done"
        @confirm="handleAdd"
      />
      <button class="todos-page__add" size="mini" @click="handleAdd">{{ t('todos.add') }}</button>
    </view>

    <text v-if="store.isLoading" class="todos-page__hint">{{ t('common.loading') }}</text>
    <text v-if="store.error" class="todos-page__error">{{ store.error }}</text>

    <scroll-view class="todos-page__list" scroll-y>
      <view v-if="todos.length === 0 && !store.isLoading" class="todos-page__empty">
        <text>{{ t('todos.empty') }}</text>
      </view>

      <text v-if="active.length > 0" class="todos-page__section">{{ t('todos.active') }}</text>
      <view v-for="todo in active" :key="todo.id" class="todos-page__item">
        <view class="todos-page__checkbox" @click="handleToggle(todo)">
          <text class="todos-page__checkbox-mark">○</text>
        </view>
        <view class="todos-page__content" @click="handleToggle(todo)">
          <text class="todos-page__text">{{ todo.title }}</text>
          <text v-if="todo.dueDate" class="todos-page__due">{{ formatDate(todo.dueDate) }}</text>
        </view>
        <text class="todos-page__delete" @click="handleRemove(todo)">✕</text>
      </view>

      <text v-if="done.length > 0" class="todos-page__section">{{ t('todos.done') }}</text>
      <view v-for="todo in done" :key="todo.id" class="todos-page__item">
        <view class="todos-page__checkbox todos-page__checkbox--done" @click="handleToggle(todo)">
          <text class="todos-page__checkbox-mark">✓</text>
        </view>
        <view class="todos-page__content" @click="handleToggle(todo)">
          <text class="todos-page__text todos-page__text--done">{{ todo.title }}</text>
        </view>
        <text class="todos-page__delete" @click="handleRemove(todo)">✕</text>
      </view>
    </scroll-view>
  </view>
</template>

<script setup lang="ts">
import './index.scss'
import { computed, ref } from 'vue'
import Taro from '@tarojs/taro'
import { storeToRefs } from 'pinia'
import { useTodoStore } from '../../stores/todo-store'
import { useI18n } from '../../composables/useI18n'

const store = useTodoStore()
const { todos } = storeToRefs(store)
const { t } = useI18n()
const title = ref('')

const active = computed(() => todos.value.filter((t) => !t.completed))
const done = computed(() => todos.value.filter((t) => t.completed))

function formatDate(d: string) {
  return new Date(d).toLocaleDateString()
}

async function handleAdd() {
  const text = title.value.trim()
  if (!text) {
    Taro.showToast({ title: t('todos.inputRequired'), icon: 'none' })
    return
  }
  try {
    await store.add({ title: text })
    title.value = ''
  } catch (err: any) {
    Taro.showToast({ title: err.message || t('todos.createFailed'), icon: 'none' })
  }
}

async function handleToggle(todo: any) {
  try {
    await store.toggle(todo)
  } catch (err: any) {
    Taro.showToast({ title: err.message || t('common.failed'), icon: 'none' })
  }
}

function handleRemove(todo: any) {
  Taro.showModal({
    title: t('todos.deleteTitle'),
    content: t('common.deleteConfirm', { name: todo.title }),
    success: async (res) => {
      if (!res.confirm) return
      try {
        await store.remove(todo.id)
      } catch (err: any) {
        Taro.showToast({ title: err.message || t('todos.deleteFailed'), icon: 'none' })
      }
    },
  })
}
</script>

