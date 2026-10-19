// SPDX-License-Identifier: Apache-2.0

import { api } from './client';

export interface AdminInventoryMovement {
  id: number;
  userId: number | null;
  documentNo: string;
  sku: string;
  itemName: string;
  direction: string;
  quantity: number;
  unit: string;
  partner: string;
  occurredAt: string;
  note: string;
  createdAt: string;
}

export const inventory_movementsApi = {
  async list(): Promise<AdminInventoryMovement[]> {
    const res = await api.get(`/inventory_movements/admin/all`);
    return res as AdminInventoryMovement[];
  },
  async remove(id: number): Promise<void> {
    await api.delete(`/inventory_movements/admin/${id}`);
  },
};
