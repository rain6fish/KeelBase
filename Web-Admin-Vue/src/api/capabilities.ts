import { api } from './client'

/** MOD-4 capabilities：当前预设 + 功能开关 + 启用业务模块 */
export interface BusinessModule {
  id: string
  label: string
}

export interface AppCapabilities {
  preset: string
  features: Record<string, boolean>
  businessModules: BusinessModule[]
}

export const capabilitiesApi = {
  get(): Promise<AppCapabilities> {
    return api.get<AppCapabilities>('/app/capabilities')
  },
}
