import { useEffect, useState } from 'react'
import { View, Text, Input, ScrollView, Button } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useTodoStore } from '../../stores/todo-store'
import './index.scss'

/** 待办清单页（DX-3）：列表 + 新增 + 切换完成 + 删除。 */
export default function TodosPage() {
  const { todos, isLoading, error, load, add, toggle, remove } = useTodoStore()
  const [title, setTitle] = useState('')

  useEffect(() => {
    load()
  }, [])

  const handleAdd = async () => {
    const text = title.trim()
    if (!text) {
      Taro.showToast({ title: '请输入待办内容', icon: 'none' })
      return
    }
    try {
      await add({ title: text })
      setTitle('')
    } catch (err: any) {
      Taro.showToast({ title: err.message || '创建失败', icon: 'none' })
    }
  }

  const handleToggle = async (todo: any) => {
    try {
      await toggle(todo)
    } catch (err: any) {
      Taro.showToast({ title: err.message || '操作失败', icon: 'none' })
    }
  }

  const handleRemove = (todo: any) => {
    Taro.showModal({
      title: '删除待办',
      content: `确定删除「${todo.title}」？`,
      success: async (res) => {
        if (!res.confirm) return
        try {
          await remove(todo.id)
        } catch (err: any) {
          Taro.showToast({ title: err.message || '删除失败', icon: 'none' })
        }
      },
    })
  }

  const active = todos.filter((t) => !t.completed)
  const done = todos.filter((t) => t.completed)

  return (
    <View className='todos-page'>
      <View className='todos-page__header'>
        <Text className='todos-page__title'>待办清单</Text>
        <Text className='todos-page__count'>
          {active.length} 未完成 / {todos.length} 全部
        </Text>
      </View>

      <View className='todos-page__input-bar'>
        <Input
          className='todos-page__input'
          value={title}
          placeholder='添加待办…'
          confirmType='done'
          onInput={(e) => setTitle(e.detail.value)}
          onConfirm={handleAdd}
        />
        <Button className='todos-page__add' size='mini' onClick={handleAdd}>
          添加
        </Button>
      </View>

      {isLoading && <Text className='todos-page__hint'>加载中…</Text>}
      {error && <Text className='todos-page__error'>{error}</Text>}

      <ScrollView className='todos-page__list' scrollY>
        {todos.length === 0 && !isLoading && (
          <View className='todos-page__empty'>
            <Text>暂无待办，添加一条开始吧</Text>
          </View>
        )}

        {active.length > 0 && (
          <Text className='todos-page__section'>进行中</Text>
        )}
        {active.map((todo) => (
          <View key={todo.id} className='todos-page__item'>
            <View
              className='todos-page__checkbox'
              onClick={() => handleToggle(todo)}
            >
              <Text className='todos-page__checkbox-mark'>○</Text>
            </View>
            <View className='todos-page__content' onClick={() => handleToggle(todo)}>
              <Text className='todos-page__text'>{todo.title}</Text>
              {todo.dueDate && (
                <Text className='todos-page__due'>
                  {new Date(todo.dueDate).toLocaleDateString()}
                </Text>
              )}
            </View>
            <Text
              className='todos-page__delete'
              onClick={() => handleRemove(todo)}
            >
              ✕
            </Text>
          </View>
        ))}

        {done.length > 0 && (
          <Text className='todos-page__section'>已完成</Text>
        )}
        {done.map((todo) => (
          <View key={todo.id} className='todos-page__item'>
            <View
              className='todos-page__checkbox todos-page__checkbox--done'
              onClick={() => handleToggle(todo)}
            >
              <Text className='todos-page__checkbox-mark'>✓</Text>
            </View>
            <View className='todos-page__content' onClick={() => handleToggle(todo)}>
              <Text className='todos-page__text todos-page__text--done'>
                {todo.title}
              </Text>
            </View>
            <Text
              className='todos-page__delete'
              onClick={() => handleRemove(todo)}
            >
              ✕
            </Text>
          </View>
        ))}
      </ScrollView>
    </View>
  )
}
