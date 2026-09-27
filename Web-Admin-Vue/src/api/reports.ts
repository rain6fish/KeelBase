// SPDX-License-Identifier: Apache-2.0

import { api } from './client';

export interface AdminReport {
  id: number;
  userId: number | null;
  title: string;
  summary: string;
  status: string;
  amount: number;
  createdAt: string;
}

export const reportsApi = {
  async list(): Promise<AdminReport[]> {
    const res = await api.get(`/reports/admin/all`);
    return res as AdminReport[];
  },
  async remove(id: number): Promise<void> {
    await api.delete(`/reports/admin/${id}`);
  },
};
