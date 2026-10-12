// SPDX-License-Identifier: Apache-2.0

import { api } from './client';

export interface AdminPointRecord {
  id: number;
  userId: number | null;
  points: number;
  checkinDate: string;
  reason: string;
  description: string;
  createdAt: string;
}

export const point_recordsApi = {
  async list(): Promise<AdminPointRecord[]> {
    const res = await api.get(`/point_records/admin/all`);
    return res as AdminPointRecord[];
  },
  async remove(id: number): Promise<void> {
    await api.delete(`/point_records/admin/${id}`);
  },
};
