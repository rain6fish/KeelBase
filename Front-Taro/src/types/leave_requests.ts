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

// Required fields mirror `CreateLeaveRequestDto` exactly. `status` is absent: creation is always
// pending, and a client that sends one gets a 400 (the DTO does not accept it).
// 必填项与 `CreateLeaveRequestDto` 完全一致。没有 `status`：创建一律 pending，传了会得到 400
// （DTO 不接受它）。
export interface CreateLeaveRequestRequest {
  requestNo: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  days: number;
  reason?: string;
}
