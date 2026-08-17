import { api } from './client'
import type { Paginated } from '@/types/api'

/** AI Approval 旗舰应用：工作台（应用侧）审批 */

export interface ApprovalRequest {
  id: number
  title: string
  type: string
  amount: number
  reason: string
  status: string
  riskLevel: string
  aiRecommendation?: string | null
  createdAt?: string
}

export interface ApprovalPolicy {
  id: number
  title: string
  type: string
  maxAmount: number
  description?: string | null
  active: boolean
}

export interface ApprovalQuery {
  page?: number
  limit?: number
  status?: string
}

export const approvalApi = {
  requests(q: ApprovalQuery = {}): Promise<Paginated<ApprovalRequest>> {
    const params: Record<string, unknown> = {}
    if (q.page) params.page = q.page
    if (q.limit) params.limit = q.limit
    if (q.status) params.status = q.status
    return api.get<Paginated<ApprovalRequest>>('/approval/requests', params)
  },
  createRequest(d: Partial<ApprovalRequest>): Promise<ApprovalRequest> {
    return api.post<ApprovalRequest>('/approval/requests', d)
  },
  getRequest(id: number): Promise<ApprovalRequest> {
    return api.get<ApprovalRequest>(`/approval/requests/${id}`)
  },
  review(id: number): Promise<ApprovalRequest> {
    return api.post<ApprovalRequest>(`/approval/requests/${id}/review`)
  },
  decide(id: number, decision: 'approved' | 'rejected'): Promise<ApprovalRequest> {
    return api.post<ApprovalRequest>(`/approval/requests/${id}/decide`, { decision })
  },
  policies(): Promise<ApprovalPolicy[]> {
    return api.get<ApprovalPolicy[]>('/approval/policies')
  },
  createPolicy(d: Partial<ApprovalPolicy>): Promise<ApprovalPolicy> {
    return api.post<ApprovalPolicy>('/approval/policies', d)
  },
}
