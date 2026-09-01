// SPDX-License-Identifier: Apache-2.0

import { FormControl, InputLabel, MenuItem, Select } from '@mui/material'
import { useTranslation } from 'react-i18next'
import { RANGE_OPTIONS, sinceForOption, type RangeOption } from '@/utils/range'

interface RangeFilterProps {
  value: string
  onChange: (key: string, since?: string) => void
}

export function RangeFilter({ value, onChange }: RangeFilterProps) {
  const { t } = useTranslation()

  const handleChange = (key: string) => {
    const option = RANGE_OPTIONS.find((o) => o.key === key) as RangeOption
    onChange(key, sinceForOption(option))
  }

  return (
    <FormControl size="small" sx={{ maxWidth: 160, minWidth: 140 }}>
      <InputLabel>{t('timeRange')}</InputLabel>
      <Select label={t('timeRange')} value={value} onChange={(e) => handleChange(e.target.value)}>
        {RANGE_OPTIONS.map((o) => (
          <MenuItem key={o.key} value={o.key}>
            {t(o.key === 'all' ? 'rangeAll' : o.key === 'today' ? 'rangeToday' : o.key === '7d' ? 'range7d' : 'range30d')}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  )
}
