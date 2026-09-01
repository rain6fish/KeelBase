// SPDX-License-Identifier: Apache-2.0

import { IconButton } from '@mui/material'
import DarkModeOutlinedIcon from '@mui/icons-material/DarkModeOutlined'
import LightModeOutlinedIcon from '@mui/icons-material/LightModeOutlined'
import { useTranslation } from 'react-i18next'
import { useUiStore } from '@/stores/ui'

export function ThemeToggle() {
  const theme = useUiStore((s) => s.theme)
  const toggleTheme = useUiStore((s) => s.toggleTheme)
  const { t } = useTranslation()
  return (
    <IconButton onClick={toggleTheme} title={t('toggleTheme')} size="small">
      {theme === 'light' ? <DarkModeOutlinedIcon /> : <LightModeOutlinedIcon />}
    </IconButton>
  )
}
