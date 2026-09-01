// SPDX-License-Identifier: Apache-2.0

 export interface EventItem {
   id: number
   title: string
   description?: string
   startTime: string
   endTime: string
   location?: string
   colorRole: number
   isCancelled: boolean
   isRecurring: boolean
   userId?: number
   createdAt?: string
   updatedAt?: string
 }
 
 export interface CreateEventRequest {
   title: string
   description?: string
   startTime: string
   endTime: string
   location?: string
   colorRole?: number
 }
 
 export interface UpdateEventRequest extends Partial<CreateEventRequest> {
   isCancelled?: boolean
 }
