// SPDX-License-Identifier: Apache-2.0

import { api } from './client'
import type { AdminTemplate, TemplateImportResult } from '@/types/admin'

export const templatesApi = {
  list(): Promise<AdminTemplate[]> {
    return api.get<AdminTemplate[]>('/admin/templates')
  },
  importTemplate(id: string, userId?: number): Promise<TemplateImportResult> {
    const qs = userId != null ? `?userId=${userId}` : ''
    return api.post<TemplateImportResult>(`/admin/templates/${id}/import${qs}`)
  },
}
