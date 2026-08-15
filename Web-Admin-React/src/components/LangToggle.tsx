import { Button } from '@mui/material'
import { useTranslation } from 'react-i18next'
import { useLocaleStore } from '@/i18n/locale'

export function LangToggle() {
  const locale = useLocaleStore((s) => s.locale)
  const toggle = useLocaleStore((s) => s.toggle)
  const { t } = useTranslation()
  return (
    <Button variant="text" onClick={toggle} title={t('toggleLang')} sx={{ minWidth: 0, px: 1 }}>
      {locale === 'zh' ? 'EN' : '中文'}
    </Button>
  )
}
