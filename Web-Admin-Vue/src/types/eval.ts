// SPDX-License-Identifier: Apache-2.0

export interface EvalCase {
  id: number
  category: string
  prompt: string
  expected: string | null
  enabled: boolean
  createdAt: string
}

export interface EvalRunReport {
  ranAt: string
  total: number
  passed: number
  failed: number
  timedOut: number
  byAssert: Record<string, { total: number; passed: number }>
  cases: Array<{
    id: number
    category: string
    prompt: string
    expected: string | null
    assertType: string
    assertValue?: string
    ok: boolean
    detail: string
    durationMs: number
    error?: string
    actualToolCalls?: string[]
    replyPreview?: string
  }>
}
