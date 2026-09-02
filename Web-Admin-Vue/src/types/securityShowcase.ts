// SPDX-License-Identifier: Apache-2.0

export type ShowcaseCategory = 'injection' | 'unauthorized' | 'risk' | 'confirmation'
export type ShowcaseOutcome = 'refused' | 'denied' | 'blocked' | 'requiresConfirmation'

export interface ShowcaseScenario {
  id: string
  category: ShowcaseCategory
}

export interface ShowcaseStep {
  step: 'input' | 'guard' | 'decision' | 'outcome'
  detail: string
}

export interface ShowcaseResult {
  scenarioId: string
  outcome: ShowcaseOutcome
  reason: string
  trace: ShowcaseStep[]
}
