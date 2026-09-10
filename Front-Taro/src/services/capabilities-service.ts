// SPDX-License-Identifier: Apache-2.0

import { api } from './api-client'

/**
 * FE-1（Runtime-Neutrality）：`/app/capabilities` —— 当前预设 + 功能开关 + 启用业务模块。
 * 前端按「能力」显隐，而非按 runtime 语言分支。
 */
export interface BusinessModule {
  id: string
  label: string
}

export interface AppCapabilities {
  preset: string
  features: Record<string, boolean>
  businessModules: BusinessModule[]
}

export const capabilitiesService = {
  async get(): Promise<AppCapabilities> {
    const res = await api.get<AppCapabilities>('/app/capabilities')
    return res.data
  },
}
