// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from 'react'
import { Box, Button, Card, CardContent, Checkbox, FormControlLabel, MenuItem, Select, TextField, Typography } from '@mui/material'
import SendIcon from '@mui/icons-material/Send'
import { useTranslation } from 'react-i18next'
import { PageHeader } from '@/components/PageHeader'
import { useSnackbarStore } from '@/stores/snackbar'
import { adminApi } from '@/api/admin'
import { usersApi } from '@/api/users'

export default function NotificationsView() {
  const { t } = useTranslation()
  const snackbar = useSnackbarStore()

  const [form, setForm] = useState({ title: '', body: '', type: '' })
  const [sendToAll, setSendToAll] = useState(true)
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [userOptions, setUserOptions] = useState<{ label: string; value: number }[]>([])
  const [sending, setSending] = useState(false)

  async function loadUsers() {
    try {
      const res = await usersApi.list(1, 100)
      setUserOptions(res.items.map((u) => ({ label: `${u.username} (${u.nickname})`, value: u.id })))
    } catch {
      // 选人列表加载失败静默，用户仍可发给全体
    }
  }

  useEffect(() => {
    void loadUsers()
  }, [])

  async function onSend() {
    if (!form.title.trim()) {
      snackbar.error(t('titleRequired'))
      return
    }
    if (!sendToAll && selectedIds.length === 0) {
      snackbar.error(t('selectRequired'))
      return
    }
    setSending(true)
    try {
      const res = await adminApi.broadcast({
        title: form.title.trim(),
        body: form.body || undefined,
        type: form.type || undefined,
        ...(sendToAll ? {} : { userIds: selectedIds }),
      })
      snackbar.success(t('broadcastSent', { n: res.sent }))
      setForm({ title: '', body: '', type: '' })
      setSelectedIds([])
    } catch (err) {
      snackbar.error(err instanceof Error ? err.message : t('sendFailed'))
    } finally {
      setSending(false)
    }
  }

  return (
    <Box>
      <PageHeader title={t('navNotifications')} />
      <Card sx={{ maxWidth: 720, mx: 'auto' }}>
        <CardContent>
          <Box component="form" onSubmit={(e) => { e.preventDefault(); void onSend() }}>
            <TextField label={t('broadcastTitle')} required fullWidth margin="dense" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <TextField label={t('contentLabel')} multiline rows={3} fullWidth margin="dense" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
            <TextField label={t('typeLabel')} placeholder={t('typePlaceholder')} fullWidth margin="dense" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} />
            <FormControlLabel
              control={<Checkbox checked={sendToAll} onChange={(e) => setSendToAll(e.target.checked)} />}
              label={t('sendToAll')}
              sx={{ mb: 1 }}
            />

            {!sendToAll ? (
              <Select
                multiple
                fullWidth
                size="small"
                value={selectedIds}
                onChange={(e) => setSelectedIds(e.target.value as number[])}
                label={t('selectRecipients', { n: selectedIds.length })}
                renderValue={(sel) => `${t('selectRecipients', { n: sel.length })}`}
              >
                {userOptions.map((o) => (
                  <MenuItem key={o.value} value={o.value}>
                    {o.label}
                  </MenuItem>
                ))}
              </Select>
            ) : null}

            <Button type="submit" color="primary" variant="contained" fullWidth size="large" sx={{ mt: 2 }} loading={sending} startIcon={<SendIcon />}>
              {t('send')}
            </Button>
          </Box>
        </CardContent>
      </Card>
      {!sendToAll ? null : (
        <Typography variant="caption" color="text.secondary" display="block" textAlign="center" mt={1}>
          {t('selectRecipients', { n: selectedIds.length })}
        </Typography>
      )}
    </Box>
  )
}
