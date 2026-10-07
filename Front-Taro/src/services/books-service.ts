// SPDX-License-Identifier: Apache-2.0

import { api } from './api-client'
import type { BookItem, CreateBookRequest } from '../types/books'

export const booksService = {
  getBooks(): Promise<BookItem[]> {
    return api.get<BookItem[]>('/books').then((res) => res.data || [])
  },

  create(dto: CreateBookRequest): Promise<BookItem> {
    return api.post<BookItem>('/books', dto).then((res) => res.data!)
  },

  remove(id: number): Promise<void> {
    return api.delete(`/books/${id}`).then(() => {})
  },
}
