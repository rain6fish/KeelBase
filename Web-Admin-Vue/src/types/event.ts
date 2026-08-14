export interface AdminEvent {
  id: number
  title: string
  description?: string | null
  startTime: string
  endTime: string
  location?: string | null
  colorRole?: number
  isCancelled: boolean
  isRecurring: boolean
  userId?: number
  user?: { id: number; username: string }
  createdAt?: string
  updatedAt?: string
}
