import { useEffect, useState } from 'react'
import { Box, Button, IconButton } from '@mui/material'
import RefreshIcon from '@mui/icons-material/Refresh'
import LogoutIcon from '@mui/icons-material/Logout'
import { useTranslation } from 'react-i18next'
import { PageHeader } from '@/components/PageHeader'
import { AppTable, type AppColumn } from '@/components/AppTable'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { useSnackbarStore } from '@/stores/snackbar'
import { adminApi } from '@/api/admin'
import { formatTime } from '@/utils/format'
import type { AdminSession } from '@/types/admin'

export default function SessionsView() {
  const { t } = useTranslation()
  const snackbar = useSnackbarStore()

  const [sessions, setSessions] = useState<AdminSession[]>([])
  const [loading, setLoading] = useState(false)
  const [showRevoke, setShowRevoke] = useState(false)
  const [pending, setPending] = useState<AdminSession | null>(null)

  async function load() {
    setLoading(true)
    try {
      setSessions(await adminApi.sessions())
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

  function confirmRevoke(s: AdminSession) {
    setPending(s)
    setShowRevoke(true)
  }

  async function onRevoke() {
    if (!pending) return
    try {
      await adminApi.revokeSession(pending.id)
      snackbar.success(t('revoked'))
      void load()
    } catch (err) {
      snackbar.error(err instanceof Error ? err.message : t('revokeFailed'))
    } finally {
      setShowRevoke(false)
    }
  }

  const headers: AppColumn<AdminSession>[] = [
    { key: 'id', title: t('idCol'), width: 70 },
    { key: 'username', title: t('userCol'), render: (s) => s.username || '-' },
    { key: 'deviceName', title: t('deviceCol'), render: (s) => s.deviceName || t('unknownDevice') },
    { key: 'ip', title: t('ipCol'), render: (s) => s.ip || '-' },
    { key: 'lastActiveAt', title: t('lastActive'), render: (s) => formatTime(s.lastActiveAt) },
    {
      key: 'actions',
      title: t('actionCol'),
      render: (s) => (
        <IconButton size="small" color="error" onClick={() => confirmRevoke(s)}>
          <LogoutIcon fontSize="small" />
        </IconButton>
      ),
    },
  ]

  return (
    <Box>
      <PageHeader title={t('sessionTitle')}>
        <Button variant="outlined" startIcon={<RefreshIcon />} onClick={() => void load()}>
          {t('refresh')}
        </Button>
      </PageHeader>
      <AppTable headers={headers} items={sessions} loading={loading} emptyText={t('noSessions')} />
      <ConfirmDialog
        open={showRevoke}
        title={t('revokeConfirmTitle')}
        content={t('revokeConfirmContent', { name: pending?.username || pending?.userId || '', id: pending?.id || '' })}
        onClose={() => setShowRevoke(false)}
        onConfirm={() => void onRevoke()}
      />
    </Box>
  )
}
