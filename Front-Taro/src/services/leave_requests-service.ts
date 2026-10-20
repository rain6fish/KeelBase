// SPDX-License-Identifier: Apache-2.0

import { api } from './api-client'
import type { LeaveRequestItem, CreateLeaveRequestRequest } from '../types/leave_requests'

export const leave_requestsService = {
  getLeaveRequests(): Promise<LeaveRequestItem[]> {
    return api.get<LeaveRequestItem[]>('/leave_requests').then((res) => res.data || [])
  },

  create(dto: CreateLeaveRequestRequest): Promise<LeaveRequestItem> {
    return api.post<LeaveRequestItem>('/leave_requests', dto).then((res) => res.data!)
  },

  remove(id: number): Promise<void> {
    return api.delete(`/leave_requests/${id}`).then(() => {})
  },
}
