// SPDX-License-Identifier: Apache-2.0

export interface FollowupPlanItem {
  id: number
  title: string
  customerId?: number
  priority: string
  reason: string
  dueDate?: string
  status: string
  createdAt: string
}

export interface CreateFollowupPlanRequest {
  title: string;
  customerId?: number;
  priority: string;
  reason: string;
  dueDate?: string;
  status: string;
}
