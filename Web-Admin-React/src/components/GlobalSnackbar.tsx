// SPDX-License-Identifier: Apache-2.0

import { Alert, Box, Snackbar } from '@mui/material'
import { useSnackbarStore } from '@/stores/snackbar'

export function GlobalSnackbar() {
  const items = useSnackbarStore((s) => s.items)
  const dismiss = useSnackbarStore((s) => s.dismiss)

  return (
    <Box
      sx={{
        position: 'fixed',
        bottom: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 4000,
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
      }}
    >
      {items.map((item) => (
        <Snackbar key={item.id} open autoHideDuration={null}>
          <Alert severity={item.type} variant="filled" onClose={() => dismiss(item.id)}>
            {item.message}
          </Alert>
        </Snackbar>
      ))}
    </Box>
  )
}
