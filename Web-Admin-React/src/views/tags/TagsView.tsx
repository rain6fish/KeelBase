// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from 'react'
import { Box, IconButton } from '@mui/material'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import { useTranslation } from 'react-i18next'
import { PageHeader } from '@/components/PageHeader'
import { AppTable, type AppColumn } from '@/components/AppTable'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { useSnackbarStore } from '@/stores/snackbar'
import { tagsApi, type AdminTag } from '@/api/tags'
import { formatTime } from '@/utils/format'

export default function TagsView() {
  const { t } = useTranslation()
  const snackbar = useSnackbarStore()

  const [items, setItems] = useState<AdminTag[]>([])
  const [loading, setLoading] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<AdminTag | null>(null)

  async function load() {
    setLoading(true)
    try {
      setItems(await tagsApi.list())
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

  function confirmDelete(item: AdminTag) {
    setPendingDelete(item)
    setShowDelete(true)
  }

  async function onDelete() {
    if (!pendingDelete) return
    try {
      await tagsApi.remove(pendingDelete.id)
      snackbar.success(t('deleted'))
      await load()
    } catch (err) {
      snackbar.error(err instanceof Error ? err.message : t('deleteFailed'))
    } finally {
      setShowDelete(false)
    }
  }

  const headers: AppColumn<AdminTag>[] = [
    { key: 'id', title: 'ID', width: 70 },
    { key: 'name', title: 'name' },
    { key: 'createdAt', title: t('createdAt'), render: (i) => formatTime(i.createdAt) },
    {
      key: 'actions',
      title: t('actionCol'),
      render: (i) => (
        <IconButton size="small" color="error" onClick={() => confirmDelete(i)}>
          <DeleteOutlineIcon />
        </IconButton>
      ),
    },
  ]

  return (
    <Box>
      <PageHeader title={t('navTags')} subtitle={t('tagsViewSubtitle')} />
      <AppTable headers={headers} items={items} loading={loading} />
      <ConfirmDialog
        open={showDelete}
        title={t('tagsDeleteTitle')}
        content={t('tagsDeleteContent')}
        onClose={() => setShowDelete(false)}
        onConfirm={() => void onDelete()}
      />
    </Box>
  )
}
