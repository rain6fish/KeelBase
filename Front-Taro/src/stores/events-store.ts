 import { create } from 'zustand'
 import { eventsService } from '../services/events-service'
 import type { EventItem, CreateEventRequest } from '../types/event'
 
 interface EventsState {
   events: EventItem[]
   isLoading: boolean
   error: string | null
 
   loadEvents: (start: string, end: string) => Promise<void>
   createEvent: (dto: CreateEventRequest) => Promise<boolean>
   deleteEvent: (id: number) => Promise<boolean>
   clearError: () => void
 }
 
 export const useEventsStore = create<EventsState>((set, get) => ({
   events: [],
   isLoading: false,
   error: null,
 
   loadEvents: async (start, end) => {
     set({ isLoading: true, error: null })
     try {
       const events = await eventsService.getEventsForRange(start, end)
       set({ events, isLoading: false })
     } catch (err: any) {
       set({ error: err.message || 'Failed to load events', isLoading: false })
     }
   },
 
   createEvent: async (dto) => {
     try {
       await eventsService.create(dto)
       return true
     } catch (err: any) {
       set({ error: err.message || 'Failed to create event' })
       return false
     }
   },
 
   deleteEvent: async (id) => {
     try {
       await eventsService.remove(id)
       set((state) => ({ events: state.events.filter((e) => e.id !== id) }))
       return true
     } catch (err: any) {
       set({ error: err.message || 'Failed to delete event' })
       return false
     }
   },
 
   clearError: () => set({ error: null }),
 }))
