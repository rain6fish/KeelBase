// SPDX-License-Identifier: Apache-2.0

import { api } from './client'

/**
 * FE-1（Runtime-Neutrality）：`GET /app/provenance` —— 运行时来源指纹
 * （公开 onboarding）：来源身份（.keelbase/manifest.json）+ 能力清单 + AI 工具指纹。
 * 「这是什么系统」的运行时自述，与 `keelbase inspect`（Build 侧）互补。
 */
export interface ProvenanceSource {
  manifestPresent: boolean
  identity?: string
  generator?: string
  generatorVersion?: string
  protocol?: string
  modules?: string[]
  [key: string]: unknown
}

export interface ProvenanceBusinessModule {
  id: string
  label: string
  description?: string
}

export interface AiToolFingerprint {
  total: number
  read: number
  write: number
  byRisk: Record<string, number>
}

export interface AppProvenance {
  source: ProvenanceSource
  runtime: {
    preset: string
    businessModules: ProvenanceBusinessModule[]
    aiToolFingerprint: AiToolFingerprint
  }
}

export const provenanceApi = {
  get(): Promise<AppProvenance> {
    return api.get<AppProvenance>('/app/provenance')
  },
}
