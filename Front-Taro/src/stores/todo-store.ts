import { create } from 'zustand'
import { todosService } from '../services/todos-service'
import type { TodoItem, CreateTodoRequest } from '../types/todo'

interface TodoState {
  todos: TodoItem[]
  isLoading: boolean
  error: string | null

  load: () => Promise<void>
  add: (dto: CreateTodoRequest) => Promise<void>
  toggle: (todo: TodoItem) => Promise<void>
  remove: (id: number) => Promise<void>
}

/** 待办清单状态（DX-3）：列表 + 增/切换/删，乐观更新。 */
export const useTodoStore = create<TodoState>((set, get) => ({
  todos: [],
  isLoading: false,
  error: null,

  load: async () => {
    set({ isLoading: true, error: null })
    try {
      const todos = await todosService.getTodos()
      set({ todos, isLoading: false })
    } catch (err: any) {
      set({ error: err.message || 'Failed to load todos', isLoading: false })
    }
  },

  add: async (dto) => {
    try {
      const todo = await todosService.create(dto)
      set({ todos: [...get().todos, todo] })
    } catch (err: any) {
      throw new Error(err.message || 'Failed to create todo')
    }
  },

  toggle: async (todo) => {
    // 乐观更新，失败回滚
    const prev = get().todos
    set({
      todos: prev.map((t) =>
        t.id === todo.id ? { ...t, completed: !t.completed } : t,
      ),
    })
    try {
      const updated = await todosService.toggleComplete(todo.id)
      set({
        todos: get().todos.map((t) => (t.id === updated.id ? updated : t)),
      })
    } catch (err: any) {
      set({ todos: prev })
      throw new Error(err.message || 'Failed to toggle todo')
    }
  },

  remove: async (id) => {
    const prev = get().todos
    set({ todos: prev.filter((t) => t.id !== id) })
    try {
      await todosService.remove(id)
    } catch (err: any) {
      set({ todos: prev })
      throw new Error(err.message || 'Failed to delete todo')
    }
  },
}))
