// SPDX-License-Identifier: Apache-2.0

export interface PointsLedgerItem {
  id: number
  points?: number
  checkinDate: string
  reason: string
  description: string
  createdAt: string
}

export interface CreatePointsLedgerRequest {
  points?: number;
  checkinDate: string;
  reason: string;
  description: string;
}
