// SPDX-License-Identifier: Apache-2.0

export type ShowcaseCategory = 'injection' | 'unauthorized' | 'risk' | 'confirmation' | 'hallucination' | 'revoke'
export type ShowcaseOutcome =
  | 'refused'
  | 'denied'
  | 'blocked'
  | 'requiresConfirmation'
  /** The tool name could not be resolved (a hallucination) — not "may not", but "there is nothing to run" */
  | 'unresolved'
  /** Owner revoked their own AI side effect — target soft-deleted (restorable), audit kept */
  | 'revoked'

/** Server-computed per-step verdict. The client only maps it to a bilingual label. */
export type ShowcaseVerdict = 'info' | 'allow' | 'deny' | 'require' | 'block'

export interface ShowcaseScenario {
  id: string
  category: ShowcaseCategory
}

/**
 * 对抗场景 trace 步：key + params 由前端 i18n 双语渲染（后端不产用户可见文案，守 §5.5 #3 双语红线）。
 * verdict / basisKey / evidence 是**服务端算出来的判据**，前端不编造判定。
 */
export interface ShowcaseStep {
  step: 'input' | 'guard' | 'decision' | 'outcome'
  key: string
  params?: Record<string, string | number>
  verdict?: ShowcaseVerdict
  basisKey?: string
  basisParams?: Record<string, string | number>
  evidence?: Record<string, string | number | boolean>
}

export interface ShowcaseResult {
  scenarioId: string
  outcome: ShowcaseOutcome
  reasonKey: string
  reasonParams?: Record<string, string | number>
  /** "Why this is safe" one-liner — server picks the key, the client renders it bilingually */
  invariantKey: string
  trace: ShowcaseStep[]
}
