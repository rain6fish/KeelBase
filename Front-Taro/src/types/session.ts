 export interface SessionItem {
   id: number
   deviceId?: string
   deviceName?: string
   ip?: string
   createdAt?: string
   lastActiveAt?: string
   expiresAt?: string
   isCurrent: boolean
 }
