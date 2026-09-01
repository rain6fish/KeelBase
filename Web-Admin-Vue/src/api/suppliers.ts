// SPDX-License-Identifier: Apache-2.0

import { api } from './client';

export interface AdminSupplier {
  id: number;
  userId: number | null;
  name: string;
  contact: string;
  status: string;
  riskLevel: string;
  annualSpend: number;
  createdAt: string;
}

export const suppliersApi = {
  async list(): Promise<AdminSupplier[]> {
    const res = await api.get(`/suppliers/admin/all`);
    return res as AdminSupplier[];
  },
  async remove(id: number): Promise<void> {
    await api.delete(`/suppliers/admin/${id}`);
  },
};
