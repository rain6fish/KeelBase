// SPDX-License-Identifier: Apache-2.0

import { api } from './api-client'
import type { TodoItem, CreateTodoRequest } from '../types/todo'

export const todosService = {
  getTodos(): Promise<TodoItem[]> {
    return api.get<TodoItem[]>('/todos').then((res) => res.data || [])
  },

  create(dto: CreateTodoRequest): Promise<TodoItem> {
    return api.post<TodoItem>('/todos', dto).then((res) => res.data!)
  },

  update(id: number, dto: Partial<CreateTodoRequest>): Promise<TodoItem> {
    return api.patch<TodoItem>(`/todos/${id}`, dto).then((res) => res.data!)
  },

  toggleComplete(id: number): Promise<TodoItem> {
    return api.patch<TodoItem>(`/todos/${id}/complete`).then((res) => res.data!)
  },

  remove(id: number): Promise<void> {
    return api.delete(`/todos/${id}`).then(() => {})
  },
}
