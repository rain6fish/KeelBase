// SPDX-License-Identifier: Apache-2.0

import { Box, IconButton, Typography } from '@mui/material'
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import { useTranslation } from 'react-i18next'

interface AppPaginationProps {
  page: number
  limit: number
  total: number
  loading?: boolean
  onChange: (page: number) => void
}

export function AppPagination({ page, limit, total, loading, onChange }: AppPaginationProps) {
  const { t } = useTranslation()
  const pages = total ? Math.max(1, Math.ceil(total / limit)) : 1
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 1, py: 1.5, px: 2 }}>
      <Typography variant="caption" color="text.secondary">
        {t('total', { n: total })}
      </Typography>
      <IconButton size="small" disabled={page <= 1 || loading} onClick={() => onChange(page - 1)}>
        <ChevronLeftIcon />
      </IconButton>
      <Typography variant="caption">{t('pageInfo', { page, pages })}</Typography>
      <IconButton size="small" disabled={page >= pages || loading} onClick={() => onChange(page + 1)}>
        <ChevronRightIcon />
      </IconButton>
    </Box>
  )
}
