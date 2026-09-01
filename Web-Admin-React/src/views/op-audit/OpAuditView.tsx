// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from 'react'
import { Box, Button, Card, CardContent, CardHeader, IconButton, List, ListItem, ListItemText, TextField, Typography } from '@mui/material'
import DownloadIcon from '@mui/icons-material/Download'
import FilterAltIcon from '@mui/icons-material/FilterAlt'
import RefreshIcon from '@mui/icons-material/Refresh'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import { useTranslation } from 'react-i18next'
import { PageHeader } from '@/components/PageHeader'
import { AppTable, type AppColumn } from '@/components/AppTable'
import { AppPagination } from '@/components/AppPagination'
import { RangeFilter } from '@/components/RangeFilter'
import { useSnackbarStore } from '@/stores/snackbar'
import { auditApi } from '@/api/audit'
import { tFeature } from '@/i18n'
import { downloadCsv } from '@/utils/csv'
import { formatTime } from '@/utils/format'
import type { OperationAuditLog } from '@/types/admin'

const LIMIT = 20

function prettyJson(s?: string | null): string {
  if (!s) return '-'
  try {
    return JSON.stringify(JSON.parse(s), null, 2)
  } catch {
    return s
  }
}

export default function OpAuditView() {
  const { t } = useTranslation()
  const snackbar = useSnackbarStore()

  const [logs, setLogs] = useState<OperationAuditLog[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [userId, setUserId] = useState('')
  const [range, setRange] = useState('all')
  const [since, setSince] = useState<string | undefined>(undefined)
  const [expanded, setExpanded] = useState<OperationAuditLog | null>(null)

  async function load(p = 1) {
    setLoading(true)
    try {
      const res = await auditApi.opLogs(p, LIMIT, userId || undefined, since)
      setLogs(res.items)
      setTotal(res.total)
      setPage(p)
    } catch (err) {
      snackbar.error(err instanceof Error ? err.message : t('loadOpAuditFailed'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function onRange(key: string, s?: string) {
    setRange(key)
    setSince(s)
  }
  function reset() {
    setUserId('')
    setRange('all')
    setSince(undefined)
    void load(1)
  }
  function toggleExpand(id: number) {
    const log = logs.find((l) => l.id === id)
    setExpanded((cur) => (cur?.id === id ? null : log ?? null))
  }

  function onExport() {
    downloadCsv(
      'op-audit',
      [t('timeCol'), t('userCol'), t('methodCol'), t('featureCol'), t('pathCol'), t('statusCol')],
      logs.map((l) => [
        formatTime(l.createdAt),
        l.username || l.userId || '',
        l.method,
        tFeature(l.featureKey, l.featureFallback),
        l.path,
        l.statusCode ?? '',
      ]),
    )
    snackbar.success(t('exportDone'))
  }

  const headers: AppColumn<OperationAuditLog>[] = [
    { key: 'createdAt', title: t('timeCol'), render: (l) => formatTime(l.createdAt) },
    { key: 'username', title: t('userCol'), render: (l) => l.username || l.userId || '-' },
    { key: 'method', title: t('methodCol') },
    { key: 'feature', title: t('featureCol'), render: (l) => tFeature(l.featureKey, l.featureFallback) },
    { key: 'path', title: t('pathCol') },
    {
      key: 'statusCode',
      title: t('statusCol'),
      render: (l) => (
        <Typography color={(l.statusCode ?? 200) >= 400 ? 'error' : 'inherit'} component="span">
          {l.statusCode ?? '-'}
        </Typography>
      ),
    },
    {
      key: 'actions',
      title: '',
      render: (l) => (
        <IconButton size="small" onClick={() => toggleExpand(l.id)}>
          <ExpandMoreIcon fontSize="small" />
        </IconButton>
      ),
    },
  ]

  return (
    <Box>
      <PageHeader title={t('opAuditTitle')} subtitle={t('total', { n: total })}>
        <Button variant="outlined" startIcon={<DownloadIcon />} onClick={onExport}>
          {t('export')}
        </Button>
      </PageHeader>

      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center', mb: 2, p: 2, bgcolor: 'background.paper', border: 1, borderColor: 'divider', borderRadius: 2 }}>
        <TextField value={userId} onChange={(e) => setUserId(e.target.value)} label={t('filterByUserId')} type="number" size="small" sx={{ maxWidth: 180 }} />
        <RangeFilter value={range} onChange={onRange} />
        <Button color="primary" variant="contained" startIcon={<FilterAltIcon />} onClick={() => void load(1)}>
          {t('filter')}
        </Button>
        <Button variant="outlined" startIcon={<RefreshIcon />} onClick={reset}>
          {t('reset')}
        </Button>
      </Box>

      <AppTable headers={headers} items={logs} loading={loading} emptyText={t('noOpAudit')} />
      <AppPagination page={page} limit={LIMIT} total={total} loading={loading} onChange={(p) => void load(p)} />

      {expanded ? (
        <Card sx={{ mt: 1 }}>
          <CardHeader title={t('statistics')} />
          <CardContent>
            <List dense>
              {expanded.ip ? (
                <ListItem>
                  <ListItemText primary={t('ipCol')} secondary={expanded.ip} />
                </ListItem>
              ) : null}
              {expanded.userAgent ? (
                <ListItem>
                  <ListItemText primary={t('userAgent')} secondary={expanded.userAgent} />
                </ListItem>
              ) : null}
              {expanded.requestBody ? (
                <ListItem>
                  <ListItemText
                    primary={t('requestBody')}
                    secondary={<Box component="pre" sx={{ m: 0, fontSize: 'body2.fontSize', whiteSpace: 'pre-wrap' }}>{prettyJson(expanded.requestBody)}</Box>}
                  />
                </ListItem>
              ) : null}
            </List>
          </CardContent>
        </Card>
      ) : null}
    </Box>
  )
}
