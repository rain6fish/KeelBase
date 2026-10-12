// SPDX-License-Identifier: Apache-2.0

export interface PointRecordItem {
  id: number
  points?: number
  checkinDate: string
  reason: string
  description: string
  createdAt: string
}

export interface CreatePointRecordRequest {
  points?: number;
  checkinDate: string;
  reason: string;
  description: string;
}
