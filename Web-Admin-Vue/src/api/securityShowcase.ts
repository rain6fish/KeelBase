// SPDX-License-Identifier: Apache-2.0

import { api } from './client'
import type { ShowcaseScenario, ShowcaseResult } from '@/types/securityShowcase'

export const securityShowcaseApi = {
  scenarios(): Promise<ShowcaseScenario[]> {
    return api.get<ShowcaseScenario[]>('/ai/security-showcase/scenarios')
  },
  run(scenarioId: string): Promise<ShowcaseResult> {
    return api.post<ShowcaseResult>(`/ai/security-showcase/run/${scenarioId}`)
  },
}
