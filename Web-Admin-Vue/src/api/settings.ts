// SPDX-License-Identifier: Apache-2.0

import { api } from './client'

export interface SettingRow {
  key: string
  value: string
  type: string
  description?: string
}

/** Settings 动态配置（admin）：内容安全配置等读写（PUT 实时生效） */
export const settingsApi = {
  list(): Promise<SettingRow[]> {
    return api.get<SettingRow[]>('/settings')
  },
  update(key: string, value: string, type: 'string' | 'number' | 'boolean' = 'string'): Promise<unknown> {
    return api.put(`/settings/${key}`, { value, type })
  },
  /** EASY-5 首启预设：应用 full/small/lite → 返回应用后 feature flags */
  applyPreset(preset: 'full' | 'small' | 'lite'): Promise<Record<string, boolean>> {
    return api.post('/settings/preset', { preset })
  },
}
