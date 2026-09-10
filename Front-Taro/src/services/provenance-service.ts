// SPDX-License-Identifier: Apache-2.0

import { api } from './api-client'

/**
 * FE-1（Runtime-Neutrality）：`/app/provenance` —— 运行时来源指纹
 * （来源身份 .keelbase/manifest.json + 能力清单 + AI 工具指纹）。
 */
export interface ProvenanceSource {
  manifestPresent: boolean
  identity?: string
  generator?: string
  generatorVersion?: string
  protocol?: string
}

export interface ProvenanceBusinessModule {
  id: string
  label: string
}

export interface AiToolFingerprint {
  total: number
  read: number
  write: number
}

export interface AppProvenance {
  source: ProvenanceSource
  preset: string
  moduleCount: number
  tools: AiToolFingerprint
}

export const provenanceService = {
  async get(): Promise<AppProvenance> {
    const res = await api.get<{
      source: ProvenanceSource
      runtime: {
        preset: string
        businessModules: ProvenanceBusinessModule[]
        aiToolFingerprint: AiToolFingerprint
      }
    }>('/app/provenance')
    const d = res.data
    return {
      source: d.source ?? { manifestPresent: false },
      preset: d.runtime?.preset ?? '',
      moduleCount: d.runtime?.businessModules?.length ?? 0,
      tools: d.runtime?.aiToolFingerprint ?? { total: 0, read: 0, write: 0 },
    }
  },
}
