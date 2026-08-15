import { useEffect, useState } from 'react'
import { Box, Button, IconButton } from '@mui/material'
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
import { workbenchApi } from '@/api/workbench'
import { isEmailNotVerified } from '@/api/client'
import { formatTime } from '@/utils/format'
import type { MyEvent } from '@/types/workbench'

const LIMIT = 20

export default function MyEventsView() {
  const { t } = useTranslation()
  const snackbar = useSnackbarStore()

  const [events, setEvents] = useState<MyEvent[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [range, setRange] = useState('all')
  const [since, setSince] = useState<string | undefined>(undefined)
  const [showDelete, setShowDelete] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<MyEvent | null>(null)

  async function load(p = 1) {
    setLoading(true)
    try {
      const res = await workbenchApi.events({ keyword: keyword || undefined, start: since, page: p, limit: LIMIT })
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
    setRange('all')
    setSince(undefined)
    void load(1)
  }

  function confirmDelete(e: MyEvent) {
    setPendingDelete(e)
    setShowDelete(true)
  }
  async function onDelete() {
    if (!pendingDelete) return
    try {
      await workbenchApi.removeEvent(pendingDelete.id)
      snackbar.success(t('deleted'))
      void load(page)
    } catch (err) {
      if (isEmailNotVerified(err)) snackbar.warning(t('emailNotVerifiedHint'))
      else snackbar.error(err instanceof Error ? err.message : t('deleteFailed'))
    } finally {
      setShowDelete(false)
    }
  }

  const statusLabelMap = { active: t('active'), cancelled: t('cancelled') }
  const headers: AppColumn<MyEvent>[] = [
    { key: 'title', title: t('eventTitle') },
    { key: 'startTime', title: t('eventStart'), render: (e) => formatTime(e.startTime) },
    { key: 'endTime', title: t('eventEnd'), render: (e) => formatTime(e.endTime) },
    { key: 'location', title: t('locationCol'), render: (e) => e.location || '-' },
    { key: 'isCancelled', title: t('eventStatus'), render: (e) => <StatusChip status={e.isCancelled ? 'cancelled' : 'active'} labelMap={statusLabelMap} /> },
    {
      key: 'actions',
      title: t('actionCol'),
      render: (e) => (
        <IconButton size="small" color="error" onClick={() => confirmDelete(e)}>
          <DeleteOutlineIcon fontSize="small" />
        </IconButton>
      ),
    },
  ]

  return (
    <Box>
      <PageHeader title={t('workbenchMyEvents')} subtitle={t('eventTotal', { n: total })} />
      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center', mb: 2, p: 2, bgcolor: 'background.paper', border: 1, borderColor: 'divider', borderRadius: 2 }}>
        <DebouncedSearch value={keyword} placeholder={t('searchTitle')} onChange={setKeyword} onSearch={() => void load(1)} />
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
