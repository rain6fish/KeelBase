 import { create } from 'zustand'
 import { storage } from '../utils/storage'
 import { STORAGE_KEYS } from '../utils/constants'
 
 export type ThemeMode = 'light' | 'dark' | 'system'
 
 interface ThemeState {
   themeMode: ThemeMode
   initialize: () => Promise<void>
   setThemeMode: (mode: ThemeMode) => Promise<void>
   toggle: () => Promise<void>
 }
 
 export const useThemeStore = create<ThemeState>((set, get) => ({
   themeMode: 'system',
 
   initialize: async () => {
     const stored = await storage.get<string>(STORAGE_KEYS.THEME_MODE)
     const mode = stored === 'light' || stored === 'dark' ? stored : 'system'
     set({ themeMode: mode as ThemeMode })
   },
 
   setThemeMode: async (mode) => {
     set({ themeMode: mode })
     await storage.set(STORAGE_KEYS.THEME_MODE, mode)
   },
 
   toggle: async () => {
     const current = get().themeMode
     const next = current === 'dark' ? 'light' : 'dark'
     await get().setThemeMode(next)
   },
 }))
