import { api } from './client'
import type { Paginated } from '@/types/api'

/** AI Project Management 旗舰应用：工作台（应用侧）项目管理 */

export interface PmProject {
  id: number
  name: string
  description?: string | null
  status: string
  riskLevel: string
  startDate?: string | null
  endDate?: string | null
}

export interface PmMilestone {
  id: number
  projectId: number
  title: string
  dueDate?: string | null
  status: string
}

export interface PmTask {
  id: number
  projectId: number
  title: string
  description?: string | null
  dueDate?: string | null
  status: string
}

export interface PmRisk {
  id: number
  projectId: number
  level: string
  reason: string
}

export interface PmProjectDetail {
  project: PmProject
  milestones: PmMilestone[]
  tasks: PmTask[]
  risks: PmRisk[]
  memberCount: number
}

export interface PmRiskAnalysis {
  level: string
  score: number
  reasons: string[]
}

export interface PmQuery {
  page?: number
  limit?: number
  status?: string
  keyword?: string
}

export const pmApi = {
  projects(q: PmQuery = {}): Promise<Paginated<PmProject>> {
    const params: Record<string, unknown> = {}
    if (q.page) params.page = q.page
    if (q.limit) params.limit = q.limit
    if (q.status) params.status = q.status
    if (q.keyword) params.keyword = q.keyword
    return api.get<Paginated<PmProject>>('/pm/projects', params)
  },
  createProject(d: Partial<PmProject>): Promise<PmProject> {
    return api.post<PmProject>('/pm/projects', d)
  },
  detail(id: number): Promise<PmProjectDetail> {
    return api.get<PmProjectDetail>(`/pm/projects/${id}`)
  },
  deleteProject(id: number): Promise<null> {
    return api.delete<null>(`/pm/projects/${id}`)
  },
  analyze(id: number): Promise<PmRiskAnalysis> {
    return api.get<PmRiskAnalysis>(`/pm/projects/${id}/analyze`)
  },
  createMilestone(projectId: number, d: Partial<PmMilestone>): Promise<PmMilestone> {
    return api.post<PmMilestone>(`/pm/projects/${projectId}/milestones`, d)
  },
  createTask(d: Partial<PmTask>): Promise<PmTask> {
    return api.post<PmTask>('/pm/tasks', d)
  },
  completeTask(id: number): Promise<PmTask> {
    return api.post<PmTask>(`/pm/tasks/${id}/complete`)
  },
}
