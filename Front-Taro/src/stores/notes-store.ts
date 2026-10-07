// SPDX-License-Identifier: Apache-2.0

import { defineStore } from 'pinia'
import { notesService } from '../services/notes-service'
import type { NoteItem, CreateNoteRequest } from '../types/notes'

/** 笔记状态（Taro Vue3，pinia）：列表 + 增/删，乐观更新。 */
export const useNotesStore = defineStore('notes', {
  state: () => ({
    items: [] as NoteItem[],
    isLoading: false,
    error: null as string | null,
  }),
  actions: {
    async load() {
      this.isLoading = true
      this.error = null
      try {
        this.items = await notesService.getNotes()
      } catch (err: any) {
        this.error = err.message || 'Failed to load 笔记'
      } finally {
        this.isLoading = false
      }
    },

    async add(dto: CreateNoteRequest) {
      const item = await notesService.create(dto)
      this.items = [...this.items, item]
    },

    async remove(id: number) {
      const prev = this.items
      this.items = prev.filter((i) => i.id !== id)
      try {
        await notesService.remove(id)
      } catch (err: any) {
        this.items = prev
        throw new Error(err.message || 'Failed to delete note')
      }
    },
  },
})
