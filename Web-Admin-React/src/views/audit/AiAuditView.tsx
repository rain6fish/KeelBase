// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from 'react'
import { Box, Button, Card, CardContent, CardHeader, Grid, IconButton, List, ListItem, ListItemText, TextField } from '@mui/material'
import DownloadIcon from '@mui/icons-material/Download'
import FilterAltIcon from '@mui/icons-material/FilterAlt'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ForumOutlinedIcon from '@mui/icons-material/ForumOutlined'
import MessageOutlinedIcon from '@mui/icons-material/MessageOutlined'
import StorageOutlinedIcon from '@mui/icons-material/StorageOutlined'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline'
import { useTranslation } from 'react-i18next'
import { PageHeader } from '@/components/PageHeader'
import { AppTable, type AppColumn } from '@/components/AppTable'
import { StatCard } from '@/components/StatCard'
import { RangeFilter } from '@/components/RangeFilter'
import { StatusChip } from '@/components/StatusChip'
import { useSnackbarStore } from '@/stores/snackbar'
import { auditApi } from '@/api/audit'
import { downloadCsv } from '@/utils/csv'
import { formatTime } from '@/utils/format'
import type { AuditLog, UsageStats } from '@/types/audit'

const LIMIT = 50

export default function AiAuditView() {
  const { t } = useTranslation()
  const snackbar = useSnackbarStore()

  const [logs, setLogs] = useState<AuditLog[]>([])
  const [stats, setStats] = useState<UsageStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [userId, setUserId] = useState('')
  const [range, setRange] = useState('all')
  const [since, setSince] = useState<string | undefined>(undefined)
  const [expanded, setExpanded] = useState<AuditLog | null>(null)

  async function load() {
    setLoading(true)
    try {
      const [logsRes, statsRes] = await Promise.all([
        auditApi.logs({ userId: userId || undefined, limit: LIMIT, since }),
        auditApi.stats(since),
      ])
      setLogs(logsRes)
      setStats(statsRes)
    } catch (err) {
      snackbar.error(err instanceof Error ? err.message : t('loadFailed'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function onRange(key: string, s?: string) {
    setRange(key)
    setSince(s)
  }

  function toggleExpand(id: number) {
    const log = logs.find((l) => l.id === id)
    setExpanded((cur) => (cur?.id === id ? null : log ?? null))
  }

  function onExport() {
    downloadCsv(
      'ai-audit',
      [t('timeCol'), t('userCol'), t('featureCol'), t('modelCol'), t('tokenCol'), t('statusCol')],
      logs.map((l) => [
        formatTime(l.createdAt),
        l.username || l.userId || '',
        l.action,
        l.provider ? `${l.provider}/${l.model}` : l.model || '',
        (l.promptTokens ?? 0) + (l.completionTokens ?? 0),
        l.isError ? t('error') : t('ok'),
      ]),
    )
    snackbar.success(t('exportDone'))
  }

  const errorLabelMap = { ok: t('ok'), error: t('error') }
  const statCards = [
    { label: t('conversations'), value: stats?.totalConversations ?? '-', icon: <ForumOutlinedIcon />, color: 'primary' as const },
    { label: t('messages'), value: stats?.totalMessages ?? '-', icon: <MessageOutlinedIcon />, color: 'success' as const },
    { label: t('totalTokens'), value: stats?.totalTokens ?? '-', icon: <StorageOutlinedIcon />, color: 'warning' as const },
    { label: t('errors'), value: stats?.totalErrors ?? '-', icon: <ErrorOutlineIcon />, color: 'error' as const },
  ]
  const headers: AppColumn<AuditLog>[] = [
    { key: 'createdAt', title: t('timeCol'), render: (l) => formatTime(l.createdAt) },
    { key: 'username', title: t('userCol'), render: (l) => l.username || l.userId || '-' },
    { key: 'action', title: t('featureCol') },
    { key: 'model', title: t('modelCol'), render: (l) => (l.provider ? t('providerModel', { provider: l.provider, model: l.model || '-' }) : l.model || '-') },
    { key: 'tokens', title: t('tokenCol'), render: (l) => (l.promptTokens ?? 0) + (l.completionTokens ?? 0) || '-' },
    { key: 'isError', title: t('statusCol'), render: (l) => <StatusChip status={l.isError ? 'error' : 'ok'} labelMap={errorLabelMap} /> },
    {
      key: 'expand',
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
      <PageHeader title={t('aiAuditTitle')}>
        <Button variant="outlined" startIcon={<DownloadIcon />} onClick={onExport}>
          {t('export')}
        </Button>
      </PageHeader>

      <Grid container spacing={2} sx={{ mb: 2 }}>
        {statCards.map((s) => (
          <Grid key={s.label}  item  xs={6} md={3} >
            <StatCard label={s.label} value={s.value} icon={s.icon} color={s.color} />
          </Grid>
        ))}
      </Grid>

      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center', mb: 2, p: 2, bgcolor: 'background.paper', border: 1, borderColor: 'divider', borderRadius: 2 }}>
        <TextField value={userId} onChange={(e) => setUserId(e.target.value)} label={t('filterByUser')} size="small" sx={{ maxWidth: 200 }} />
        <RangeFilter value={range} onChange={onRange} />
        <Button color="primary" variant="contained" startIcon={<FilterAltIcon />} onClick={() => void load()}>
          {t('filter')}
        </Button>
      </Box>

      <AppTable headers={headers} items={logs} loading={loading} emptyText={t('noAiAudit')} />

      {expanded ? (
        <Card sx={{ mt: 1 }}>
          <CardHeader title={t('statistics')} />
          <CardContent>
            <List dense>
              {expanded.detail ? (
                <ListItem>
                  <ListItemText primary={t('detail')} secondary={expanded.detail} />
                </ListItem>
              ) : null}
              {expanded.errorMessage ? (
                <ListItem>
                  <ListItemText primary={t('errorMessage')} secondary={expanded.errorMessage} />
                </ListItem>
              ) : null}
              {expanded.durationMs != null ? (
                <ListItem>
                  <ListItemText primary={t('durationMs')} secondary={`${expanded.durationMs} ms`} />
                </ListItem>
              ) : null}
              {expanded.conversationId ? (
                <ListItem>
                  <ListItemText primary={t('conversationId')} secondary={expanded.conversationId} />
                </ListItem>
              ) : null}
            </List>
          </CardContent>
        </Card>
      ) : null}
    </Box>
  )
}
