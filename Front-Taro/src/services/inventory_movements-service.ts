// SPDX-License-Identifier: Apache-2.0

import { api } from './api-client'
import type { InventoryMovementItem, CreateInventoryMovementRequest } from '../types/inventory_movements'

export const inventory_movementsService = {
  getInventoryMovements(): Promise<InventoryMovementItem[]> {
    return api.get<InventoryMovementItem[]>('/inventory_movements').then((res) => res.data || [])
  },

  create(dto: CreateInventoryMovementRequest): Promise<InventoryMovementItem> {
    return api.post<InventoryMovementItem>('/inventory_movements', dto).then((res) => res.data!)
  },

  remove(id: number): Promise<void> {
    return api.delete(`/inventory_movements/${id}`).then(() => {})
  },
}
