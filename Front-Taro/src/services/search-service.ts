// SPDX-License-Identifier: Apache-2.0

import { api } from './api-client'
import type { SearchResult } from '../types/search'

export const searchService = {
  search(q: string, page = 1, limit = 10): Promise<SearchResult> {
    return api
      .get<SearchResult>('/search', { q, page, limit })
      .then((res) => res.data || { events: { items: [], total: 0 }, users: { items: [], total: 0 } })
  },
}
