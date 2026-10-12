// SPDX-License-Identifier: Apache-2.0

import { api } from './api-client'
import type { PointRecordItem, CreatePointRecordRequest } from '../types/point_records'

export const point_recordsService = {
  getPointRecords(): Promise<PointRecordItem[]> {
    return api.get<PointRecordItem[]>('/point_records').then((res) => res.data || [])
  },

  create(dto: CreatePointRecordRequest): Promise<PointRecordItem> {
    return api.post<PointRecordItem>('/point_records', dto).then((res) => res.data!)
  },

  remove(id: number): Promise<void> {
    return api.delete(`/point_records/${id}`).then(() => {})
  },
}
