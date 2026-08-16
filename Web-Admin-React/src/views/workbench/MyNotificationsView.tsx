import { useEffect, useState } from 'react'
import { Box, Button, Grid, IconButton, Typography } from '@mui/material'
import DoneAllIcon from '@mui/icons-material/DoneAll'
import NotificationsActiveOutlinedIcon from '@mui/icons-material/NotificationsActiveOutlined'
import MarkEmailReadOutlinedIcon from '@mui/icons-material/MarkEmailReadOutlined'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import { useTranslation } from 'react-i18next'
import { PageHeader } from '@/components/PageHeader'
import { AppTable, type AppColumn } from '@/components/AppTable'
import { AppPagination } from '@/components/AppPagination'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { StatCard } from '@/components/StatCard'
import { StatusChip } from '@/components/StatusChip'
import { useSnackbarStore } from '@/stores/snackbar'
import { workbenchApi } from '@/api/workbench'
import { isEmailNotVerified } from '@/api/client'
import { connectRealtime, onRealtimeMessage } from '@/api/ws'
import { formatTime } from '@/utils/format'
import type { MyNotification } from '@/types/workbench'

const LIMIT = 20

export default function MyNotificationsView() {
  const { t } = useTranslation()
  const snackbar = useSnackbarStore()

  const [notifications, setNotifications] = useState<MyNotification[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [unread, setUnread] = useState(0)
  const [showDelete, setShowDelete] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<MyNotification | null>(null)

  async function load(p = 1) {
    setLoading(true)
    try {
      const [res, count] = await Promise.all([workbenchApi.notifications(p, LIMIT), workbenchApi.unreadCount()])
      setNotifications(res.items)
      setTotal(res.total)
      setPage(p)
      setUnread(count.count)
    } catch (err) {
      snackbar.error(err instanceof Error ? err.message : t('loadFailed'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load(1)
    // RG-6：连接 WS 实时通道，新通知实时插入列表（REST 轮询保留为降级）
    connectRealtime()
    const off = onRealtimeMessage((msg) => {
      if (msg.event !== 'notification') return
      const n = msg.data as MyNotification
      setNotifications((prev) => [n, ...prev])
      setTotal((prev) => prev + 1)
      if (!n.isRead) setUnread((prev) => prev + 1)
    })
    return () => {
      off()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function refresh() {
    void load(page)
  }

  async function markRead(item: MyNotification) {
    try {
      await workbenchApi.readNotification(item.id)
      await refresh()
    } catch (err) {
      if (isEmailNotVerified(err)) snackbar.warning(t('emailNotVerifiedHint'))
      else snackbar.error(err instanceof Error ? err.message : t('updateFailed'))
    }
  }

  async function onReadAll() {
    try {
      await workbenchApi.readAllNotifications()
      snackbar.success(t('markAllReadDone'))
      await refresh()
    } catch (err) {
      if (isEmailNotVerified(err)) snackbar.warning(t('emailNotVerifiedHint'))
      else snackbar.error(err instanceof Error ? err.message : t('updateFailed'))
    }
  }

  function confirmDelete(n: MyNotification) {
    setPendingDelete(n)
    setShowDelete(true)
  }
  async function onDelete() {
    if (!pendingDelete) return
    try {
      await workbenchApi.removeNotification(pendingDelete.id)
      snackbar.success(t('deleted'))
      await refresh()
    } catch (err) {
      if (isEmailNotVerified(err)) snackbar.warning(t('emailNotVerifiedHint'))
      else snackbar.error(err instanceof Error ? err.message : t('deleteFailed'))
    } finally {
      setShowDelete(false)
    }
  }

  const headers: AppColumn<MyNotification>[] = [
    {
      key: 'title',
      title: t('titleLabel'),
      render: (n) => (
        <Box>
          <div>{n.title}</div>
          {n.body ? (
            <Typography variant="caption" color="text.secondary">
              {n.body}
            </Typography>
          ) : null}
        </Box>
      ),
    },
    { key: 'type', title: t('typeLabel'), render: (n) => n.type },
    { key: 'isRead', title: t('read'), render: (n) => <StatusChip status={n.isRead ? 'read' : 'unread'} /> },
    { key: 'createdAt', title: t('createdAt'), render: (n) => formatTime(n.createdAt) },
    {
      key: 'actions',
      title: t('actionCol'),
      render: (n) => (
        <>
          {!n.isRead ? (
            <IconButton size="small" title={t('markRead')} onClick={() => void markRead(n)}>
              <MarkEmailReadOutlinedIcon fontSize="small" />
            </IconButton>
          ) : null}
          <IconButton size="small" color="error" onClick={() => confirmDelete(n)}>
            <DeleteOutlineIcon fontSize="small" />
          </IconButton>
        </>
      ),
    },
  ]

  return (
    <Box>
      <PageHeader title={t('workbenchNotifications')}>
        <Button variant="outlined" startIcon={<DoneAllIcon />} onClick={() => void onReadAll()}>
          {t('markAllRead')}
        </Button>
      </PageHeader>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard label={t('unreadCount')} value={unread} icon={<NotificationsActiveOutlinedIcon />} color="warning" />
        </Grid>
      </Grid>

      <AppTable headers={headers} items={notifications} loading={loading} emptyText={t('noNotifications')} />
      <AppPagination page={page} limit={LIMIT} total={total} loading={loading} onChange={(p) => void load(p)} />

      <ConfirmDialog
        open={showDelete}
        title={t('deleteNotificationTitle')}
        content={t('deleteNotificationContent', { title: pendingDelete?.title || '' })}
        onClose={() => setShowDelete(false)}
        onConfirm={() => void onDelete()}
      />
    </Box>
  )
}
