// SPDX-License-Identifier: Apache-2.0

import { api } from './client';

export interface AdminLeaveRequest {
  id: number;
  userId: number | null;
  requestNo: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  days: number;
  reason: string;
  status: string;
  createdAt: string;
}

export const leave_requestsApi = {
  async list(): Promise<AdminLeaveRequest[]> {
    const res = await api.get(`/leave_requests/admin/all`);
    return res as AdminLeaveRequest[];
  },
  async remove(id: number): Promise<void> {
    await api.delete(`/leave_requests/admin/${id}`);
  },
};
