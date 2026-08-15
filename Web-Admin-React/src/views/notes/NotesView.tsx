import { useEffect, useState } from 'react'
import { Box, IconButton } from '@mui/material'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import { useTranslation } from 'react-i18next'
import { PageHeader } from '@/components/PageHeader'
import { AppTable, type AppColumn } from '@/components/AppTable'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { useSnackbarStore } from '@/stores/snackbar'
import { notesApi, type AdminNote } from '@/api/notes'
import { formatTime } from '@/utils/format'

export default function NotesView() {
  const { t } = useTranslation()
  const snackbar = useSnackbarStore()

  const [items, setItems] = useState<AdminNote[]>([])
  const [loading, setLoading] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<AdminNote | null>(null)

  async function load() {
    setLoading(true)
    try {
      setItems(await notesApi.list())
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

  function confirmDelete(item: AdminNote) {
    setPendingDelete(item)
    setShowDelete(true)
  }

  async function onDelete() {
    if (!pendingDelete) return
    try {
      await notesApi.remove(pendingDelete.id)
      snackbar.success(t('deleted'))
      await load()
    } catch (err) {
      snackbar.error(err instanceof Error ? err.message : t('deleteFailed'))
    } finally {
      setShowDelete(false)
    }
  }

  const headers: AppColumn<AdminNote>[] = [
    { key: 'id', title: 'ID', width: 70 },
    { key: 'title', title: 'title' },
    { key: 'content', title: 'content' },
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
      <PageHeader title={t('navNotes')} subtitle={t('notesViewSubtitle')} />
      <AppTable headers={headers} items={items} loading={loading} />
      <ConfirmDialog
        open={showDelete}
        title={t('notesDeleteTitle')}
        content={t('notesDeleteContent')}
        onClose={() => setShowDelete(false)}
        onConfirm={() => void onDelete()}
      />
    </Box>
  )
}
