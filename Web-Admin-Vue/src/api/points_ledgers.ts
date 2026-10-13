// SPDX-License-Identifier: Apache-2.0

import { api } from './client';

export interface AdminPointsLedger {
  id: number;
  userId: number | null;
  points: number;
  checkinDate: string;
  reason: string;
  description: string;
  createdAt: string;
}

export const points_ledgersApi = {
  async list(): Promise<AdminPointsLedger[]> {
    const res = await api.get(`/points_ledgers/admin/all`);
    return res as AdminPointsLedger[];
  },
  async remove(id: number): Promise<void> {
    await api.delete(`/points_ledgers/admin/${id}`);
  },
};
