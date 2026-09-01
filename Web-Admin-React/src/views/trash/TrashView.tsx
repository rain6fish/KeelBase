// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from 'react'
import { Box, Button, IconButton } from '@mui/material'
import RefreshIcon from '@mui/icons-material/Refresh'
import RestoreIcon from '@mui/icons-material/Restore'
import { useTranslation } from 'react-i18next'
import { PageHeader } from '@/components/PageHeader'
import { AppTable, type AppColumn } from '@/components/AppTable'
import { AppPagination } from '@/components/AppPagination'
import { StatusChip } from '@/components/StatusChip'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { useSnackbarStore } from '@/stores/snackbar'
import { adminApi } from '@/api/admin'
import { formatTime } from '@/utils/format'
import type { TrashItem } from '@/types/admin'

const LIMIT = 20

export default function TrashView() {
  const { t } = useTranslation()
  const snackbar = useSnackbarStore()

  const [trash, setTrash] = useState<TrashItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [showRestore, setShowRestore] = useState(false)
  const [pending, setPending] = useState<TrashItem | null>(null)

  async function load(p = 1) {
    setLoading(true)
    try {
      const res = await adminApi.trash(p, LIMIT)
      setTrash(res.items)
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

  function confirmRestore(item: TrashItem) {
    setPending(item)
    setShowRestore(true)
  }

  async function onRestore() {
    if (!pending) return
    try {
      await adminApi.restoreTrash(pending.type, pending.id)
      snackbar.success(t('restored'))
      void load(page)
    } catch (err) {
      snackbar.error(err instanceof Error ? err.message : t('restoreFailed'))
    } finally {
      setShowRestore(false)
    }
  }

  const typeLabelMap = { event: t('events'), todo: t('todos') }
  const headers: AppColumn<TrashItem>[] = [
    { key: 'type', title: t('typeLabel'), render: (i) => <StatusChip status={i.type} labelMap={typeLabelMap} /> },
    { key: 'title', title: t('titleLabel') },
    { key: 'username', title: t('userCol'), render: (i) => i.username || '-' },
    { key: 'deletedAt', title: t('deletedAt'), render: (i) => formatTime(i.deletedAt) },
    {
      key: 'actions',
      title: t('actionCol'),
      render: (i) => (
        <IconButton size="small" color="primary" title={t('restore')} onClick={() => confirmRestore(i)}>
          <RestoreIcon />
        </IconButton>
      ),
    },
  ]

  return (
    <Box>
      <PageHeader title={t('navTrash')} subtitle={t('total', { n: total })}>
        <Button variant="outlined" startIcon={<RefreshIcon />} onClick={() => void load(1)}>
          {t('refresh')}
        </Button>
      </PageHeader>
      <AppTable headers={headers} items={trash} loading={loading} />
      <AppPagination page={page} limit={LIMIT} total={total} loading={loading} onChange={(p) => void load(p)} />
      <ConfirmDialog
        open={showRestore}
        title={t('restore')}
        content={t('restoreConfirm', { title: pending?.title || '' })}
        color="primary"
        onClose={() => setShowRestore(false)}
        onConfirm={() => void onRestore()}
      />
    </Box>
  )
}
