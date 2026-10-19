// SPDX-License-Identifier: Apache-2.0

export interface InventoryMovementItem {
  id: number
  documentNo: string
  sku: string
  itemName: string
  direction: string
  quantity?: number
  unit: string
  partner: string
  occurredAt?: string
  note: string
  createdAt: string
}

export interface CreateInventoryMovementRequest {
  documentNo: string;
  sku: string;
  itemName: string;
  direction: string;
  quantity?: number;
  unit: string;
  partner: string;
  occurredAt?: string;
  note: string;
}
