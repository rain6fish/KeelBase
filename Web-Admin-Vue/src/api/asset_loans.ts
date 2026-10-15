// SPDX-License-Identifier: Apache-2.0

import { api } from './client';

export interface AdminAssetLoan {
  id: number;
  userId: number | null;
  assetName: string;
  assetTag: string;
  purpose: string;
  dueDate: string;
  status: string;
  createdAt: string;
}

export const asset_loansApi = {
  async list(): Promise<AdminAssetLoan[]> {
    const res = await api.get(`/asset_loans/admin/all`);
    return res as AdminAssetLoan[];
  },
  async remove(id: number): Promise<void> {
    await api.delete(`/asset_loans/admin/${id}`);
  },
};
