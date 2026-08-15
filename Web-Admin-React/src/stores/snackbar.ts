import { create } from 'zustand'

export interface Snack {
  id: number
  message: string
  type: 'success' | 'error' | 'info'
}

interface SnackbarState {
  items: Snack[]
  _seq: number
  show: (message: string, type?: Snack['type'], timeout?: number) => void
  success: (message: string, timeout?: number) => void
  error: (message: string, timeout?: number) => void
  warning: (message: string, timeout?: number) => void
  dismiss: (id: number) => void
}

export const useSnackbarStore = create<SnackbarState>((set, get) => ({
  items: [],
  _seq: 0,

  show(message, type = 'info', timeout = 3000) {
    const id = ++get()._seq
    set((s) => ({ items: [...s.items, { id, message, type }] }))
    setTimeout(() => get().dismiss(id), timeout)
  },
  success(message, timeout = 3000) {
    get().show(message, 'success', timeout)
  },
  error(message, timeout = 5000) {
    get().show(message, 'error', timeout)
  },
  warning(message, timeout = 4000) {
    get().show(message, 'info', timeout)
  },
  dismiss(id) {
    set((s) => ({ items: s.items.filter((sn) => sn.id !== id) }))
  },
}))
