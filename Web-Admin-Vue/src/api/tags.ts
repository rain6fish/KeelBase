import { api } from './client';

export interface AdminTag {
  id: number;
  userId: number | null;
  name: string;
  createdAt: string;
}

export const tagsApi = {
  async list(): Promise<AdminTag[]> {
    const res = await api.get(`/tags/admin/all`);
    return res as AdminTag[];
  },
  async remove(id: number): Promise<void> {
    await api.delete(`/tags/admin/${id}`);
  },
};
