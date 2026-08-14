import { api } from './client';

export interface AdminNote {
  id: number;
  userId: number | null;
  title: string;
  content: string;
  createdAt: string;
}

export const notesApi = {
  async list(): Promise<AdminNote[]> {
    const res = await api.get(`/notes/admin/all`);
    return res as AdminNote[];
  },
  async remove(id: number): Promise<void> {
    await api.delete(`/notes/admin/${id}`);
  },
};
