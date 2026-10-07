// SPDX-License-Identifier: Apache-2.0

import { defineStore } from 'pinia'
import { booksService } from '../services/books-service'
import type { BookItem, CreateBookRequest } from '../types/books'

/** 图书状态（Taro Vue3，pinia）：列表 + 增/删，乐观更新。 */
export const useBooksStore = defineStore('books', {
  state: () => ({
    items: [] as BookItem[],
    isLoading: false,
    error: null as string | null,
  }),
  actions: {
    async load() {
      this.isLoading = true
      this.error = null
      try {
        this.items = await booksService.getBooks()
      } catch (err: any) {
        this.error = err.message || 'Failed to load 图书'
      } finally {
        this.isLoading = false
      }
    },

    async add(dto: CreateBookRequest) {
      const item = await booksService.create(dto)
      this.items = [...this.items, item]
    },

    async remove(id: number) {
      const prev = this.items
      this.items = prev.filter((i) => i.id !== id)
      try {
        await booksService.remove(id)
      } catch (err: any) {
        this.items = prev
        throw new Error(err.message || 'Failed to delete book')
      }
    },
  },
})
