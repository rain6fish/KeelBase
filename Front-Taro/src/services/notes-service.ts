// SPDX-License-Identifier: Apache-2.0

import { api } from './api-client'
import type { NoteItem, CreateNoteRequest } from '../types/notes'

export const notesService = {
  getNotes(): Promise<NoteItem[]> {
    return api.get<NoteItem[]>('/notes').then((res) => res.data || [])
  },

  create(dto: CreateNoteRequest): Promise<NoteItem> {
    return api.post<NoteItem>('/notes', dto).then((res) => res.data!)
  },

  remove(id: number): Promise<void> {
    return api.delete(`/notes/${id}`).then(() => {})
  },
}
