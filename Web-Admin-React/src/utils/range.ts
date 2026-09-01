// SPDX-License-Identifier: Apache-2.0

export interface RangeOption {
  key: string
  days: number | null
}

export const RANGE_OPTIONS: RangeOption[] = [
  { key: 'all', days: null },
  { key: 'today', days: 0 },
  { key: '7d', days: 7 },
  { key: '30d', days: 30 },
]

/** 按选项计算 since ISO 字符串；all → undefined */
export function sinceForOption(option: RangeOption): string | undefined {
  if (option.days == null) return undefined
  if (option.days === 0) {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d.toISOString()
  }
  const d = new Date()
  d.setDate(d.getDate() - option.days)
  return d.toISOString()
}
