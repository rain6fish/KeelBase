export interface TodoItem {
  id: number
  title: string
  description?: string
  completed: boolean
  dueDate?: string
  userId?: number
  createdAt?: string
  updatedAt?: string
}

export interface CreateTodoRequest {
  title: string
  description?: string
  dueDate?: string
}

export interface UpdateTodoRequest extends Partial<CreateTodoRequest> {
  completed?: boolean
}
