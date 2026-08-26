import { defineStore } from 'pinia'
import { todosService } from '../services/todos-service'
import { translate } from '../i18n/translate'
import type { TodoItem, CreateTodoRequest } from '../types/todo'

/** 待办清单状态（DX-3，Taro→Vue3 迁移：zustand → pinia）：列表 + 增/切换/删，乐观更新。 */
export const useTodoStore = defineStore('todo', {
  state: () => ({
    todos: [] as TodoItem[],
    isLoading: false,
    error: null as string | null,
  }),
  actions: {
    async load() {
      this.isLoading = true
      this.error = null
      try {
        this.todos = await todosService.getTodos()
      } catch (err: any) {
        this.error = err.message || translate('todos.loadFailed')
      } finally {
        this.isLoading = false
      }
    },

    async add(dto: CreateTodoRequest) {
      const todo = await todosService.create(dto)
      this.todos = [...this.todos, todo]
    },

    async toggle(todo: TodoItem) {
      // 乐观更新，失败回滚
      const prev = this.todos
      this.todos = prev.map((t) =>
        t.id === todo.id ? { ...t, completed: !t.completed } : t,
      )
      try {
        const updated = await todosService.toggleComplete(todo.id)
        this.todos = this.todos.map((t) => (t.id === updated.id ? updated : t))
      } catch (err: any) {
        this.todos = prev
        throw new Error(err.message || translate('todos.toggleFailed'))
      }
    },

    async remove(id: number) {
      const prev = this.todos
      this.todos = prev.filter((t) => t.id !== id)
      try {
        await todosService.remove(id)
      } catch (err: any) {
        this.todos = prev
        throw new Error(err.message || translate('todos.deleteFailed'))
      }
    },
  },
})
