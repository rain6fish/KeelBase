// SPDX-License-Identifier: Apache-2.0

export type ShowcaseCategory = 'injection' | 'unauthorized' | 'risk' | 'confirmation'
export type ShowcaseOutcome = 'refused' | 'denied' | 'blocked' | 'requiresConfirmation'

export interface ShowcaseScenario {
  id: string
  category: ShowcaseCategory
}

/** 对抗场景 trace 步：key + params 由前端 i18n 双语渲染（后端不产用户可见文案，守 §5.5 #3 双语红线） */
export interface ShowcaseStep {
  step: 'input' | 'guard' | 'decision' | 'outcome'
  key: string
  params?: Record<string, string | number>
}

export interface ShowcaseResult {
  scenarioId: string
  outcome: ShowcaseOutcome
  reasonKey: string
  reasonParams?: Record<string, string | number>
  trace: ShowcaseStep[]
}
