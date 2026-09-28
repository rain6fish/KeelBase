// SPDX-License-Identifier: Apache-2.0

import { api } from './client';

export interface AdminFollowupPlan {
  id: number;
  userId: number | null;
  title: string;
  customerId: number;
  priority: string;
  reason: string;
  dueDate: string;
  status: string;
  createdAt: string;
}

export const followup_plansApi = {
  async list(): Promise<AdminFollowupPlan[]> {
    const res = await api.get(`/followup_plans/admin/all`);
    return res as AdminFollowupPlan[];
  },
  async remove(id: number): Promise<void> {
    await api.delete(`/followup_plans/admin/${id}`);
  },
};
