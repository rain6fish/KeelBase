// SPDX-License-Identifier: Apache-2.0

import { api } from './api-client'
import type { PointsLedgerItem, CreatePointsLedgerRequest } from '../types/points_ledgers'

export const points_ledgersService = {
  getPointsLedgers(): Promise<PointsLedgerItem[]> {
    return api.get<PointsLedgerItem[]>('/points_ledgers').then((res) => res.data || [])
  },

  create(dto: CreatePointsLedgerRequest): Promise<PointsLedgerItem> {
    return api.post<PointsLedgerItem>('/points_ledgers', dto).then((res) => res.data!)
  },

  remove(id: number): Promise<void> {
    return api.delete(`/points_ledgers/${id}`).then(() => {})
  },
}
