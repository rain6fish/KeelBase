// SPDX-License-Identifier: Apache-2.0

 import { api } from './api-client'
 import type { EventItem, CreateEventRequest, UpdateEventRequest } from '../types/event'
 
 export const eventsService = {
   getEventsForRange(start: string, end: string): Promise<EventItem[]> {
     return api
       .get<EventItem[]>('/events', { start, end })
       .then((res) => res.data || [])
   },
 
   getEvent(id: number): Promise<EventItem> {
     return api.get<EventItem>(`/events/${id}`).then((res) => res.data!)
   },
 
   create(dto: CreateEventRequest): Promise<EventItem> {
     return api.post<EventItem>('/events', dto).then((res) => res.data!)
   },
 
   update(id: number, dto: UpdateEventRequest): Promise<EventItem> {
     return api.put<EventItem>(`/events/${id}`, dto).then((res) => res.data!)
   },
 
   remove(id: number): Promise<void> {
     return api.delete(`/events/${id}`).then(() => {})
   },
 }
