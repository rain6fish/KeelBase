export type UserRole = 'user' | 'admin'

export interface AdminUser {
  id: number
  username: string
  email: string
  nickname: string
  role: UserRole
  firstName?: string | null
  lastName?: string | null
  phone?: string | null
  bio?: string | null
  avatarUrl?: string | null
  createdAt?: string
  updatedAt?: string
}
