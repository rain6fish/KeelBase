// SPDX-License-Identifier: Apache-2.0

import { api } from './client';

export interface AdminPost {
  id: number;
  userId: number | null;
  title: string;
  content: string;
  createdAt: string;
}

export const postsApi = {
  async list(): Promise<AdminPost[]> {
    const res = await api.get(`/posts/admin/all`);
    return res as AdminPost[];
  },
  async remove(id: number): Promise<void> {
    await api.delete(`/posts/admin/${id}`);
  },
};
