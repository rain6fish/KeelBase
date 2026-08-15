import { useEffect, useState } from 'react'
import { Box, Button, IconButton, MenuItem, Select, TextField } from '@mui/material'
import DownloadIcon from '@mui/icons-material/Download'
import FilterAltIcon from '@mui/icons-material/FilterAlt'
import RefreshIcon from '@mui/icons-material/Refresh'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import { useTranslation } from 'react-i18next'
import { PageHeader } from '@/components/PageHeader'
import { AppTable, type AppColumn } from '@/components/AppTable'
import { AppPagination } from '@/components/AppPagination'
import { DebouncedSearch } from '@/components/DebouncedSearch'
import { RangeFilter } from '@/components/RangeFilter'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { StatusChip } from '@/components/StatusChip'
import { useSnackbarStore } from '@/stores/snackbar'
import { eventsApi, type EventFilter } from '@/api/events'
import { downloadCsv } from '@/utils/csv'
import { formatTime } from '@/utils/format'
import type { AdminEvent } from '@/types/event'

const LIMIT = 20

export default function EventsView() {
  const { t } = useTranslation()
  const snackbar = useSnackbarStore()

  const [events, setEvents] = useState<AdminEvent[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)

  const [keyword, setKeyword] = useState('')
  const [userId, setUserId] = useState('')
  const [status, setStatus] = useState('all')
  const [range, setRange] = useState('all')
  const [since, setSince] = useState<string | undefined>(undefined)

  const [showDelete, setShowDelete] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<AdminEvent | null>(null)

  function currentFilter(): EventFilter {
    return {
      keyword: keyword || undefined,
      userId: userId ? Number(userId) : undefined,
      isCancelled: status === 'all' ? undefined : status === 'cancelled',
      start: since,
    }
  }

  async function load(p = 1) {
    setLoading(true)
    try {
      const res = await eventsApi.adminAll(p, LIMIT, currentFilter())
      setEvents(res.items)
      setTotal(res.total)
      setPage(p)
    } catch (err) {
      snackbar.error(err instanceof Error ? err.message : t('loadFailed'))
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
    setKeyword('')
    setUserId('')
    setStatus('all')
    setRange('all')
    setSince(undefined)
    void load(1)
  }

  function onExport() {
    downloadCsv(
      'events',
      [t('idCol'), t('eventTitle'), t('eventStart'), t('eventEnd'), t('eventUser'), t('eventStatus')],
      events.map((e) => [
        e.id,
        e.title,
        formatTime(e.startTime),
        formatTime(e.endTime),
        e.user?.username || e.userId || '',
        e.isCancelled ? t('cancelled') : t('active'),
      ]),
    )
    snackbar.success(t('exportDone'))
  }

  function confirmDelete(e: AdminEvent) {
    setPendingDelete(e)
    setShowDelete(true)
  }

  async function onDelete() {
    if (!pendingDelete) return
    try {
      await eventsApi.adminRemove(pendingDelete.id)
      snackbar.success(t('deleted'))
      void load(page)
    } catch (err) {
      snackbar.error(err instanceof Error ? err.message : t('deleteFailed'))
    } finally {
      setShowDelete(false)
    }
  }

  const statusLabelMap = { active: t('active'), cancelled: t('cancelled') }
  const headers: AppColumn<AdminEvent>[] = [
    { key: 'id', title: t('idCol'), width: 70 },
    { key: 'title', title: t('eventTitle') },
    { key: 'startTime', title: t('eventStart'), render: (e) => formatTime(e.startTime) },
    { key: 'endTime', title: t('eventEnd'), render: (e) => formatTime(e.endTime) },
    { key: 'user', title: t('eventUser'), render: (e) => e.user?.username || e.userId || '-' },
    {
      key: 'isCancelled',
      title: t('eventStatus'),
      render: (e) => <StatusChip status={e.isCancelled ? 'cancelled' : 'active'} labelMap={statusLabelMap} />,
    },
    {
      key: 'actions',
      title: t('actionCol'),
      render: (e) => (
        <IconButton size="small" color="error" onClick={() => confirmDelete(e)}>
          <DeleteOutlineIcon />
        </IconButton>
      ),
    },
  ]

  return (
    <Box>
      <PageHeader title={t('navEvents')} subtitle={t('eventTotal', { n: total })}>
        <Button variant="outlined" startIcon={<DownloadIcon />} onClick={onExport}>
          {t('export')}
        </Button>
      </PageHeader>

      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center', mb: 2, p: 2, bgcolor: 'background.paper', border: 1, borderColor: 'divider', borderRadius: 2 }}>
        <DebouncedSearch value={keyword} placeholder={t('searchTitle')} onChange={setKeyword} onSearch={() => void load(1)} />
        <TextField
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          label={t('filterByUserId')}
          type="number"
          size="small"
          sx={{ maxWidth: 160 }}
        />
        <Select size="small" value={status} onChange={(e) => setStatus(e.target.value)} sx={{ maxWidth: 150, minWidth: 120 }}>
          <MenuItem value="all">{t('allStatus')}</MenuItem>
          <MenuItem value="active">{t('active')}</MenuItem>
          <MenuItem value="cancelled">{t('cancelled')}</MenuItem>
        </Select>
        <RangeFilter value={range} onChange={onRange} />
        <Button color="primary" variant="contained" startIcon={<FilterAltIcon />} onClick={() => void load(1)}>
          {t('filter')}
        </Button>
        <Button variant="outlined" startIcon={<RefreshIcon />} onClick={reset}>
          {t('reset')}
        </Button>
      </Box>

      <AppTable headers={headers} items={events} loading={loading} emptyText={t('noEvents')} />

      <AppPagination page={page} limit={LIMIT} total={total} loading={loading} onChange={(p) => void load(p)} />

      <ConfirmDialog
        open={showDelete}
        title={t('deleteEventTitle')}
        content={t('deleteEventContent', { title: pendingDelete?.title || '' })}
        onClose={() => setShowDelete(false)}
        onConfirm={() => void onDelete()}
      />
    </Box>
  )
}
