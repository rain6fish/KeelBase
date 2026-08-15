/** 工作台（应用侧）本人数据模型 —— 对应后端 user-scoped 端点 */

export interface MyEvent {
  id: number
  title: string
  description?: string | null
  startTime: string
  endTime: string
  location?: string | null
  colorRole?: number
  isCancelled: boolean
  isRecurring: boolean
  reminderMinutes?: number | null
  createdAt?: string
}

export interface MyTodo {
  id: number
  title: string
  description?: string | null
  completed: boolean
  dueDate?: string | null
  createdAt?: string
}

export interface MyNotification {
  id: number
  title: string
  body?: string | null
  type: string
  targetType?: string | null
  targetId?: string | number | null
  isRead: boolean
  link?: string | null
  createdAt?: string
}

export interface MyEventQuery {
  keyword?: string
  start?: string
  end?: string
  page?: number
  limit?: number
}

export interface CreateTodoInput {
  title: string
  description?: string
  dueDate?: string
}
