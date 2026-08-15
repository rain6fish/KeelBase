import { api } from './client'
import type { Paginated } from '@/types/api'
import type { CreateTodoInput, MyEvent, MyEventQuery, MyNotification, MyTodo } from '@/types/workbench'

function cleanQuery(q: MyEventQuery): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (q.keyword) out.keyword = q.keyword
  if (q.start) out.start = q.start
  if (q.end) out.end = q.end
  if (q.page) out.page = q.page
  if (q.limit) out.limit = q.limit
  return out
}

/** 工作台（应用侧）user-scoped 端点封装：全部按当前登录用户隔离 */
export const workbenchApi = {
  // 我的事件
  events(q: MyEventQuery): Promise<Paginated<MyEvent>> {
    return api.get<Paginated<MyEvent>>('/events/search', cleanQuery(q))
  },
  removeEvent(id: number): Promise<null> {
    return api.delete<null>(`/events/${id}`)
  },
  // 我的待办
  todos(): Promise<MyTodo[]> {
    return api.get<MyTodo[]>('/todos')
  },
  createTodo(d: CreateTodoInput): Promise<MyTodo> {
    return api.post<MyTodo>('/todos', d)
  },
  toggleTodo(id: number): Promise<MyTodo> {
    return api.patch<MyTodo>(`/todos/${id}/complete`)
  },
  removeTodo(id: number): Promise<null> {
    return api.delete<null>(`/todos/${id}`)
  },
  // 我的通知
  notifications(page = 1, limit = 20): Promise<Paginated<MyNotification>> {
    return api.get<Paginated<MyNotification>>('/notifications', { page, limit })
  },
  unreadCount(): Promise<{ count: number }> {
    return api.get<{ count: number }>('/notifications/unread-count')
  },
  readNotification(id: number): Promise<null> {
    return api.patch<null>(`/notifications/${id}/read`)
  },
  readAllNotifications(): Promise<null> {
    return api.patch<null>('/notifications/read-all')
  },
  removeNotification(id: number): Promise<null> {
    return api.delete<null>(`/notifications/${id}`)
  },
}
