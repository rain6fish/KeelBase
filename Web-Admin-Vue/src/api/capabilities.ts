// SPDX-License-Identifier: Apache-2.0

import { api } from './client'

/** MOD-4 capabilities：当前预设 + 功能开关 + 启用业务模块 */
export interface BusinessModule {
  id: string
  label: string
}

/** 运行时 AI 可用性：enabled = feature flag；providerConfigured = LLM 真的配了 Key/本地模型 */
export interface AiStatus {
  enabled: boolean
  providerConfigured: boolean
  provider: string
}

/**
 * 展示参数（契约 v2）：由服务端下发，取代前端自己的常量。
 * Display parameters (contract v2): published by the server, replacing the front end's own constant.
 */
export interface AppDisplay {
  currencySymbol: string
}

export interface AppCapabilities {
  preset: string
  features: Record<string, boolean>
  ai?: AiStatus
  businessModules: BusinessModule[]
  /** v2 起有；旧服务端缺省 → 币种回落前端兜底值。 */
  display?: AppDisplay
}

export const capabilitiesApi = {
  get(): Promise<AppCapabilities> {
    return api.get<AppCapabilities>('/app/capabilities')
  },
}
