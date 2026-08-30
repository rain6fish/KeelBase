import { useState } from 'react'
import { Alert, Box, Button, Card, CardActions, CardContent, CardHeader, Divider, IconButton, InputAdornment, TextField, Typography } from '@mui/material'
import AccountCircleOutlinedIcon from '@mui/icons-material/AccountCircleOutlined'
import LockOutlinedIcon from '@mui/icons-material/LockOutlined'
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined'
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '@/stores/auth'
import { LangToggle } from '@/components/LangToggle'
import { homeFor } from '@/router/AuthGate'

export default function LoginView() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const status = useAuthStore((s) => s.status)
  const storeError = useAuthStore((s) => s.errorMessage)
  const login = useAuthStore((s) => s.login)

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const loading = status === 'loading'
  const shownError = errorMessage || storeError

  async function onSubmit() {
    if (!username || !password) {
      setErrorMessage(t('loginFailed'))
      return
    }
    const ok = await login(username, password)
    if (ok) {
      const params = new URLSearchParams(location.search)
      const redirect = params.get('redirect')
      const user = useAuthStore.getState().user
      navigate(typeof redirect === 'string' && redirect ? redirect : homeFor(user?.role), {
        replace: true,
      })
    } else {
      setErrorMessage(useAuthStore.getState().errorMessage || t('loginFailed'))
    }
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #2f6bf5 0%, #f4f5fa 100%)',
      }}
    >
      <Card sx={{ width: 420, maxWidth: '92vw', borderRadius: 3, p: 1 }}>
        <CardHeader
          title={
            <Box sx={{ textAlign: 'center' }}>
              <Typography color="primary" fontSize={40} lineHeight={1} mb={1}>
                K
              </Typography>
              <Typography variant="h5" fontWeight="bold">
                {t('appName')}
              </Typography>
            </Box>
          }
          sx={{ pt: 3, pb: 0 }}
        />
        <CardContent sx={{ px: 4, py: 3 }}>
          <Typography variant="subtitle2" mb={2} textAlign="center">
            {t('loginTitle')}
          </Typography>

          {shownError ? (
            <Alert severity="error" variant="outlined" sx={{ mb: 2 }}>
              {shownError}
            </Alert>
          ) : null}

          <form
            onSubmit={(e) => {
              e.preventDefault()
              void onSubmit()
            }}
          >
            <TextField
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              label={t('username')}
              placeholder={t('usernamePlaceholder')}
              fullWidth
              margin="dense"
              autoComplete="username"
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <AccountCircleOutlinedIcon fontSize="small" />
                    </InputAdornment>
                  ),
                },
              }}
            />
            <TextField
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              label={t('password')}
              placeholder={t('passwordPlaceholder')}
              fullWidth
              margin="dense"
              type={showPwd ? 'text' : 'password'}
              autoComplete="current-password"
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <LockOutlinedIcon fontSize="small" />
                    </InputAdornment>
                  ),
                  endAdornment: (
                    <IconButton size="small" onClick={() => setShowPwd((v) => !v)}>
                      {showPwd ? <VisibilityOffOutlinedIcon /> : <VisibilityOutlinedIcon />}
                    </IconButton>
                  ),
                },
              }}
            />
            <Button type="submit" color="primary" variant="contained" fullWidth size="large" sx={{ mt: 2 }} loading={loading} disabled={loading}>
              {t('login')}
            </Button>
          </form>

          <Typography variant="caption" color="text.secondary" mt={2} textAlign="center" display="block">
            admin / Admin@2026$KeelBase（控制台）· alex / Alex@2026$Demo（工作台）
          </Typography>
        </CardContent>
        <Divider />
        <CardActions sx={{ justifyContent: 'center', pb: 2, pt: 1 }}>
          <LangToggle />
        </CardActions>
      </Card>
    </Box>
  )
}
