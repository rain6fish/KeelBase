// SPDX-License-Identifier: Apache-2.0

export interface LeaveRequestItem {
  id: number
  requestNo: string
  leaveType: string
  startDate?: string
  endDate?: string
  days?: number
  reason: string
  status: string
  createdAt: string
}

export interface CreateLeaveRequestRequest {
  requestNo: string;
  leaveType: string;
  startDate?: string;
  endDate?: string;
  days?: number;
  reason: string;
  status: string;
}
