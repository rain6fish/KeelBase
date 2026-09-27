// SPDX-License-Identifier: Apache-2.0

import { api } from './api-client'
import type { FollowupPlanItem, CreateFollowupPlanRequest } from '../types/followup_plans'

export const followup_plansService = {
  getFollowupPlans(): Promise<FollowupPlanItem[]> {
    return api.get<FollowupPlanItem[]>('/followup_plans').then((res) => res.data || [])
  },

  create(dto: CreateFollowupPlanRequest): Promise<FollowupPlanItem> {
    return api.post<FollowupPlanItem>('/followup_plans', dto).then((res) => res.data!)
  },

  remove(id: number): Promise<void> {
    return api.delete(`/followup_plans/${id}`).then(() => {})
  },
}
