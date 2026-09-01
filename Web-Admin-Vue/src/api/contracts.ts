// SPDX-License-Identifier: Apache-2.0

import { api } from './client';

export interface AdminContract {
  id: number;
  userId: number | null;
  name: string;
  counterparty: string;
  status: string;
  amount: number;
  createdAt: string;
}

export const contractsApi = {
  async list(): Promise<AdminContract[]> {
    const res = await api.get(`/contracts/admin/all`);
    return res as AdminContract[];
  },
  async remove(id: number): Promise<void> {
    await api.delete(`/contracts/admin/${id}`);
  },
};
