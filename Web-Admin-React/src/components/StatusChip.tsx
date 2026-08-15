import { Chip, type ChipProps } from '@mui/material'

interface StatusChipProps {
  /** 语义值：ok/error/active/cancelled/read/unread/up/down/true/false 等 */
  status: string | boolean | number | null | undefined
  /** 可选：传入 map 覆盖默认映射 */
  colorMap?: Record<string, string>
  labelMap?: Record<string, string>
}

const DEFAULT_COLOR_MAP: Record<string, string> = {
  ok: 'success',
  up: 'success',
  active: 'success',
  true: 'success',
  success: 'success',
  error: 'error',
  down: 'error',
  cancelled: 'warning',
  false: 'default',
  unread: 'info',
  read: 'success',
  normal: 'success',
}

export function StatusChip({ status, colorMap, labelMap }: StatusChipProps) {
  const s = String(status ?? '').toLowerCase()
  const raw = colorMap?.[s] ?? DEFAULT_COLOR_MAP[s] ?? 'default'
  const color = (['success', 'error', 'warning', 'info'].includes(raw) ? raw : 'default') as ChipProps['color']
  const label = labelMap?.[String(status ?? '')] ?? String(status ?? '')
  return <Chip size="small" color={color} label={label} />
}
