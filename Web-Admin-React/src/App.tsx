// SPDX-License-Identifier: Apache-2.0

import { CssBaseline, ThemeProvider } from '@mui/material'
import { RouterProvider } from 'react-router-dom'
import { useUiStore } from '@/stores/ui'
import { lightTheme, darkTheme } from '@/theme'
import { router } from '@/router'
import { GlobalSnackbar } from '@/components/GlobalSnackbar'

export default function App() {
  const theme = useUiStore((s) => s.theme)
  return (
    <ThemeProvider theme={theme === 'dark' ? darkTheme : lightTheme}>
      <CssBaseline />
      <RouterProvider router={router} />
      <GlobalSnackbar />
    </ThemeProvider>
  )
}
