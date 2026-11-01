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

// Required fields mirror `CreateInventoryMovementDto` exactly: quantity is required (`@IsInt`),
// and unit / partner / occurredAt / note are optional.
// 必填项与 `CreateInventoryMovementDto` 完全一致：quantity 必填（`@IsInt`），
// unit / partner / occurredAt / note 可选。
export interface CreateInventoryMovementRequest {
  documentNo: string;
  sku: string;
  itemName: string;
  direction: string;
  quantity: number;
  unit?: string;
  partner?: string;
  occurredAt?: string;
  note?: string;
}
