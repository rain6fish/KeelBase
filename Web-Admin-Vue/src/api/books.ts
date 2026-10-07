// SPDX-License-Identifier: Apache-2.0

import { api } from './client';

export interface AdminBook {
  id: number;
  userId: number | null;
  title: string;
  author: string;
  status: string;
  rating: number;
  createdAt: string;
}

export const booksApi = {
  async list(): Promise<AdminBook[]> {
    const res = await api.get(`/books/admin/all`);
    return res as AdminBook[];
  },
  async remove(id: number): Promise<void> {
    await api.delete(`/books/admin/${id}`);
  },
};
