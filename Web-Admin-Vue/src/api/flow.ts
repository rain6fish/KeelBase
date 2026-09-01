// SPDX-License-Identifier: Apache-2.0

import { api } from './client'

/** FLOW 工作流：A-7 审批链可视化（发起 → 每级 human_task 审批人/结果 → 终态） */

export interface FlowTaskStep {
  taskId: number
  nodeId: string
  nodeName: string
  assigneeId: number
  assigneeName: string | null
  status: 'pending' | 'approved' | 'rejected'
  decisionNote: string | null
  createdAt: string
  updatedAt: string
}

export interface FlowInstance {
  id: number
  definitionId: string
  definitionName: string | null
  state: 'pending' | 'running' | 'completed' | 'failed' | 'rolled_back'
  initiatorId: number
  initiatorName: string | null
  currentNodeId?: string | null
  dataJson?: string | null
  createdAt: string
  updatedAt: string
  tasks?: FlowTaskStep[]
}

export interface MyFlowInstance {
  id: number
  definitionId: string
  definitionName: string | null
  state: string
  initiatorId: number
  pendingTasks: number
  createdAt: string
  updatedAt: string
}

export interface MyFlowTask {
  id: number
  instanceId: number
  nodeId: string
  assigneeId: number
  status: string
  decisionNote?: string | null
  createdAt: string
  updatedAt: string
  title?: string
  flowName?: string
}

export const flowApi = {
  myInstances(): Promise<MyFlowInstance[]> {
    return api.get<MyFlowInstance[]>('/flows/my')
  },
  instance(id: number): Promise<FlowInstance> {
    return api.get<FlowInstance>(`/flows/${id}`)
  },
  myTasks(): Promise<MyFlowTask[]> {
    return api.get<MyFlowTask[]>('/flows/tasks')
  },
  approve(taskId: number, decision: 'approve' | 'reject', note?: string): Promise<FlowInstance> {
    return api.post<FlowInstance>(`/flows/tasks/${taskId}/approve`, { decision, ...(note ? { note } : {}) })
  },
}
