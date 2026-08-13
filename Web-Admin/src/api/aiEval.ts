import { api } from './client'
import type { EvalCase, EvalRunReport } from '@/types/eval'

export const aiEvalApi = {
  listCases(): Promise<EvalCase[]> {
    return api.get<EvalCase[]>('/ai/eval/cases')
  },
  createCase(data: { category: string; prompt: string; expected?: string }): Promise<EvalCase> {
    return api.post<EvalCase>('/ai/eval/cases', data)
  },
  removeCase(id: number): Promise<{ deleted: boolean }> {
    return api.delete<{ deleted: boolean }>(`/ai/eval/cases/${id}`)
  },
  seed(): Promise<{ added: number }> {
    return api.post<{ added: number }>('/ai/eval/seed')
  },
  run(): Promise<EvalRunReport> {
    return api.post<EvalRunReport>('/ai/eval/run')
  },
  report(): Promise<EvalRunReport | null> {
    return api.get<EvalRunReport | null>('/ai/eval/report')
  },
}
