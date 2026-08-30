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

export interface AppCapabilities {
  preset: string
  features: Record<string, boolean>
  ai?: AiStatus
  businessModules: BusinessModule[]
}

export const capabilitiesApi = {
  get(): Promise<AppCapabilities> {
    return api.get<AppCapabilities>('/app/capabilities')
  },
}
