import { api } from './client'
import type { Paginated } from '@/types/api'

/** AI CRM 旗舰应用：工作台（应用侧）客户管理 */

export interface CrmCustomer {
  id: number
  name: string
  email?: string | null
  phone?: string | null
  company?: string | null
  status: string
  riskLevel: string
  notes?: string | null
  createdAt?: string
}

export interface CrmOrder {
  id: number
  customerId: number
  amount: number
  status: string
  orderDate?: string | null
  dueDate?: string | null
}

export interface CrmActivity {
  id: number
  customerId: number
  type: string
  summary: string
  happenedAt?: string | null
}

export interface CrmTask {
  id: number
  customerId?: number | null
  title: string
  description?: string | null
  dueDate?: string | null
  status: string
}

export interface CrmRisk {
  id: number
  customerId: number
  level: string
  reason: string
  detectedAt?: string | null
  resolvedAt?: string | null
}

export interface CrmCustomerDetail {
  customer: CrmCustomer
  orders: CrmOrder[]
  activities: CrmActivity[]
  tasks: CrmTask[]
  risks: CrmRisk[]
}

export interface RiskAnalysis {
  level: string
  score: number
  reasons: string[]
}

export interface CustomerQuery {
  page?: number
  limit?: number
  status?: string
  riskLevel?: string
  keyword?: string
}

/** P0 AI Intelligence Dashboard：AI CRM 业务洞察聚合（GET /crm/dashboard） */
export interface CrmDashboard {
  customers: number
  highRiskCustomers: number
  opportunities: number
  pipelineAmount: number
  weightedAmount: number
  soonClosing: number
  overdueOrders: number
  openTasks: number
  openRisks: number
}

export const crmApi = {
  dashboard(): Promise<CrmDashboard> {
    return api.get<CrmDashboard>('/crm/dashboard')
  },
  customers(q: CustomerQuery = {}): Promise<Paginated<CrmCustomer>> {
    const params: Record<string, unknown> = {}
    if (q.page) params.page = q.page
    if (q.limit) params.limit = q.limit
    if (q.status) params.status = q.status
    if (q.riskLevel) params.riskLevel = q.riskLevel
    if (q.keyword) params.keyword = q.keyword
    return api.get<Paginated<CrmCustomer>>('/crm/customers', params)
  },
  createCustomer(d: Partial<CrmCustomer>): Promise<CrmCustomer> {
    return api.post<CrmCustomer>('/crm/customers', d)
  },
  detail(id: number): Promise<CrmCustomerDetail> {
    return api.get<CrmCustomerDetail>(`/crm/customers/${id}`)
  },
  updateCustomer(id: number, d: Partial<CrmCustomer>): Promise<CrmCustomer> {
    return api.patch<CrmCustomer>(`/crm/customers/${id}`, d)
  },
  deleteCustomer(id: number): Promise<null> {
    return api.delete<null>(`/crm/customers/${id}`)
  },
  analyze(id: number): Promise<RiskAnalysis> {
    return api.get<RiskAnalysis>(`/crm/customers/${id}/analyze`)
  },
  createOrder(customerId: number, d: Partial<CrmOrder>): Promise<CrmOrder> {
    return api.post<CrmOrder>(`/crm/customers/${customerId}/orders`, d)
  },
  createActivity(customerId: number, d: Partial<CrmActivity>): Promise<CrmActivity> {
    return api.post<CrmActivity>(`/crm/customers/${customerId}/activities`, d)
  },
  createTask(d: Partial<CrmTask>): Promise<CrmTask> {
    return api.post<CrmTask>('/crm/tasks', d)
  },
  completeTask(id: number): Promise<CrmTask> {
    return api.post<CrmTask>(`/crm/tasks/${id}/complete`)
  },
}
