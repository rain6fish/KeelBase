// SPDX-License-Identifier: Apache-2.0

import { defineStore } from 'pinia'
import { ApiError, isActionableApiError } from '@/api/client'

interface Snack {
  id: number
  message: string
  type: 'success' | 'error' | 'info'
  /** NC-2：为什么 / 影响 / 下一步（带则 GlobalSnackbar 走错误卡而非单句 toast） */
  reason?: string
  impact?: string
  nextStep?: string
}

export const useSnackbarStore = defineStore('snackbar', {
  state: () => ({
    items: [] as Snack[],
    _seq: 0,
  }),
  actions: {
    show(
      message: string,
      type: 'success' | 'error' | 'info' = 'info',
      timeout = 3000,
      details?: { reason?: string; impact?: string; nextStep?: string },
    ) {
      const id = ++this._seq
      this.items.push({ id, message, type, ...details })
      setTimeout(() => this.dismiss(id), timeout)
    },
    success(message: string, timeout = 3000) {
      this.show(message, 'success', timeout)
    },
    /** 接受 string（单句 toast）或 ApiError（带 reason/impact/nextStep → 错误卡，长 8s） */
    error(message: string | ApiError, timeout = 5000) {
      if (message instanceof ApiError && isActionableApiError(message)) {
        this.show(message.message, 'error', 8000, {
          reason: message.reason,
          impact: message.impact,
          nextStep: message.nextStep,
        })
      } else {
        this.show(typeof message === 'string' ? message : message.message, 'error', timeout)
      }
    },
    warning(message: string, timeout = 4000) {
      this.show(message, 'info', timeout)
    },
    dismiss(id: number) {
      this.items = this.items.filter((s) => s.id !== id)
    },
  },
})
