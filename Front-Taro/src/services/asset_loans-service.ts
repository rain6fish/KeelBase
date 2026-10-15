// SPDX-License-Identifier: Apache-2.0

import { api } from './api-client'
import type { AssetLoanItem, CreateAssetLoanRequest } from '../types/asset_loans'

export const asset_loansService = {
  getAssetLoans(): Promise<AssetLoanItem[]> {
    return api.get<AssetLoanItem[]>('/asset_loans').then((res) => res.data || [])
  },

  create(dto: CreateAssetLoanRequest): Promise<AssetLoanItem> {
    return api.post<AssetLoanItem>('/asset_loans', dto).then((res) => res.data!)
  },

  remove(id: number): Promise<void> {
    return api.delete(`/asset_loans/${id}`).then(() => {})
  },
}
