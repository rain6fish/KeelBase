// SPDX-License-Identifier: Apache-2.0

import { api } from './api-client'
import type { ReportItem, CreateReportRequest } from '../types/reports'

export const reportsService = {
  getReports(): Promise<ReportItem[]> {
    return api.get<ReportItem[]>('/reports').then((res) => res.data || [])
  },

  create(dto: CreateReportRequest): Promise<ReportItem> {
    return api.post<ReportItem>('/reports', dto).then((res) => res.data!)
  },

  remove(id: number): Promise<void> {
    return api.delete(`/reports/${id}`).then(() => {})
  },
}
