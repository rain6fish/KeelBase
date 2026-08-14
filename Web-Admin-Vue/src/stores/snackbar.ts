import { defineStore } from 'pinia'

interface Snack {
  id: number
  message: string
  type: 'success' | 'error' | 'info'
}

export const useSnackbarStore = defineStore('snackbar', {
  state: () => ({
    items: [] as Snack[],
    _seq: 0,
  }),
  actions: {
    show(message: string, type: 'success' | 'error' | 'info' = 'info', timeout = 3000) {
      const id = ++this._seq
      this.items.push({ id, message, type })
      setTimeout(() => this.dismiss(id), timeout)
    },
    success(message: string, timeout = 3000) {
      this.show(message, 'success', timeout)
    },
    error(message: string, timeout = 5000) {
      this.show(message, 'error', timeout)
    },
    warning(message: string, timeout = 4000) {
      this.show(message, 'info', timeout)
    },
    dismiss(id: number) {
      this.items = this.items.filter((s) => s.id !== id)
    },
  },
})
