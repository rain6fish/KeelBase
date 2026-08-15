import type { ReactNode } from 'react'
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline'
import { useTranslation } from 'react-i18next'

type DialogColor = 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning'

interface ConfirmDialogProps {
  open: boolean
  title: string
  content: string
  color?: DialogColor
  icon?: ReactNode
  loading?: boolean
  onClose: () => void
  onConfirm: () => void
}

export function ConfirmDialog({ open, title, content, color = 'error', icon, loading, onClose, onConfirm }: ConfirmDialogProps) {
  const { t } = useTranslation()
  return (
    <Dialog
      open={open}
      onClose={(_, reason) => {
        if (reason !== 'backdropClick') onClose()
      }}
      PaperProps={{ sx: { width: 420, maxWidth: '100%' } }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography color={color} sx={{ display: 'inline-flex' }}>
          {icon ?? <ErrorOutlineIcon />}
        </Typography>
        {title}
      </DialogTitle>
      <DialogContent>{content}</DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button variant="text" onClick={onClose}>
          {t('no')}
        </Button>
        <Button color={color} variant="outlined" loading={loading} disabled={loading} onClick={onConfirm}>
          {t('yes')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
