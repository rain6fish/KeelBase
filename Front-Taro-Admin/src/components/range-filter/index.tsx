import { View, Text, Picker } from '@tarojs/components'
import { t } from '../../i18n'
import './index.scss'

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

function rangeLabel(key: string): string {
  const map: Record<string, string> = {
    all: t('rangeAll'),
    today: t('rangeToday'),
    '7d': t('range7d'),
    '30d': t('range30d'),
  }
  return map[key] || key
}

interface Props {
  value: string
  onChange: (key: string, since?: string) => void
}

function RangeFilter({ value, onChange }: Props) {
  const idx = Math.max(0, RANGE_OPTIONS.findIndex((o) => o.key === value))

  const handleChange = (e: { detail: { value: number | string } }) => {
    const option = RANGE_OPTIONS[Number(e.detail.value)]
    onChange(option.key, sinceForOption(option))
  }

  return (
    <Picker mode='selector' range={RANGE_OPTIONS.map((o) => rangeLabel(o.key))} value={idx} onChange={handleChange}>
      <View className='range-filter'>
        <Text className='range-filter__label'>{t('timeRange')}</Text>
        <Text className='range-filter__value'>{rangeLabel(value)}</Text>
      </View>
    </Picker>
  )
}

export default RangeFilter
