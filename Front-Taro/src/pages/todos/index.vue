<template>
  <view class="todos-page">
    <view class="todos-page__header">
      <text class="todos-page__title">待办清单</text>
      <text class="todos-page__count">{{ active.length }} 未完成 / {{ todos.length }} 全部</text>
    </view>

    <view class="todos-page__input-bar">
      <input
        class="todos-page__input"
        v-model="title"
        placeholder="添加待办…"
        confirm-type="done"
        @confirm="handleAdd"
      />
      <button class="todos-page__add" size="mini" @click="handleAdd">添加</button>
    </view>

    <text v-if="store.isLoading" class="todos-page__hint">加载中…</text>
    <text v-if="store.error" class="todos-page__error">{{ store.error }}</text>

    <scroll-view class="todos-page__list" scroll-y>
      <view v-if="todos.length === 0 && !store.isLoading" class="todos-page__empty">
        <text>暂无待办，添加一条开始吧</text>
      </view>

      <text v-if="active.length > 0" class="todos-page__section">进行中</text>
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

      <text v-if="done.length > 0" class="todos-page__section">已完成</text>
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
import { computed, ref } from 'vue'
import Taro from '@tarojs/taro'
import { storeToRefs } from 'pinia'
import { useTodoStore } from '../../stores/todo-store'

const store = useTodoStore()
const { todos } = storeToRefs(store)
const title = ref('')

const active = computed(() => todos.value.filter((t) => !t.completed))
const done = computed(() => todos.value.filter((t) => t.completed))

function formatDate(d: string) {
  return new Date(d).toLocaleDateString()
}

async function handleAdd() {
  const text = title.value.trim()
  if (!text) {
    Taro.showToast({ title: '请输入待办内容', icon: 'none' })
    return
  }
  try {
    await store.add({ title: text })
    title.value = ''
  } catch (err: any) {
    Taro.showToast({ title: err.message || '创建失败', icon: 'none' })
  }
}

async function handleToggle(todo: any) {
  try {
    await store.toggle(todo)
  } catch (err: any) {
    Taro.showToast({ title: err.message || '操作失败', icon: 'none' })
  }
}

function handleRemove(todo: any) {
  Taro.showModal({
    title: '删除待办',
    content: `确定删除「${todo.title}」？`,
    success: async (res) => {
      if (!res.confirm) return
      try {
        await store.remove(todo.id)
      } catch (err: any) {
        Taro.showToast({ title: err.message || '删除失败', icon: 'none' })
      }
    },
  })
}
</script>

<style src="./index.scss" scoped></style>
