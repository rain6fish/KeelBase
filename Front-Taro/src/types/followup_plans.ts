// SPDX-License-Identifier: Apache-2.0

export interface FollowupPlanItem {
  id: number
  title: string
  priority: string
  reason: string
  dueDate?: string
  status: string
  createdAt: string
}

export interface CreateFollowupPlanRequest {
  title: string;
  priority: string;
  reason: string;
  dueDate?: string;
  status: string;
}
