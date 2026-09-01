// SPDX-License-Identifier: Apache-2.0

import { api } from './client'
import type { Paginated } from '@/types/api'
import type { AdminEvent } from '@/types/event'

export interface EventFilter {
  keyword?: string
  userId?: number
  isCancelled?: boolean
  start?: string
  end?: string
}

export const eventsApi = {
  adminAll(page = 1, limit = 20, filter?: EventFilter): Promise<Paginated<AdminEvent>> {
    return api.get<Paginated<AdminEvent>>('/events/admin/all', {
      page,
      limit,
      ...(filter?.keyword ? { keyword: filter.keyword } : {}),
      ...(filter?.userId != null ? { userId: filter.userId } : {}),
      ...(filter?.isCancelled != null ? { isCancelled: filter.isCancelled } : {}),
      ...(filter?.start ? { start: filter.start } : {}),
      ...(filter?.end ? { end: filter.end } : {}),
    })
  },
  adminRemove(id: number): Promise<null> {
    return api.delete<null>(`/events/admin/${id}`)
  },
}
