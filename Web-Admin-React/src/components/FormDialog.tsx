// SPDX-License-Identifier: Apache-2.0

import type { ReactNode } from 'react'
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Divider, Stack, Typography } from '@mui/material'
import { useTranslation } from 'react-i18next'

interface FormDialogProps {
  open: boolean
  title: string
  icon?: ReactNode
  loading?: boolean
  maxWidth?: number | string
  saveLabel?: string
  onClose: () => void
  onSave: () => void
  children: ReactNode
}

export function FormDialog({
  open,
  title,
  icon,
  loading,
  maxWidth = 560,
  saveLabel,
  onClose,
  onSave,
  children,
}: FormDialogProps) {
  const { t } = useTranslation()
  return (
    <Dialog
      open={open}
      maxWidth={false}
      onClose={(_, reason) => {
        if (reason !== 'backdropClick') onClose()
      }}
      PaperProps={{ sx: { width: maxWidth, maxWidth: '100%' } }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography color="primary" sx={{ display: 'inline-flex' }}>
          {icon}
        </Typography>
        {title}
      </DialogTitle>
      <Divider />
      <DialogContent sx={{ pt: 3 }}>{children}</DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button variant="text" disabled={loading} onClick={onClose}>
          {t('cancel')}
        </Button>
        <Button color="primary" variant="outlined" disabled={loading} onClick={onSave}>
          {saveLabel || t('save')}
        </Button>
      </DialogActions>
      {loading ? (
        <Stack sx={{ px: 3, pb: 1, alignItems: 'flex-end' }}></Stack>
      ) : null}
    </Dialog>
  )
}
