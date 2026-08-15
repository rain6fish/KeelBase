import { useEffect, useState } from 'react'
import { Box, Card, CardContent, CardHeader, Grid, List, ListItem, ListItemIcon, ListItemText, Typography } from '@mui/material'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import AccountCircleIcon from '@mui/icons-material/AccountCircle'
import EmailIcon from '@mui/icons-material/Email'
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings'
import ClockOutlineIcon from '@mui/icons-material/Schedule'
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined'
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined'
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined'
import StorageOutlinedIcon from '@mui/icons-material/StorageOutlined'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { PageHeader } from '@/components/PageHeader'
import { StatCard } from '@/components/StatCard'
import { StatusChip } from '@/components/StatusChip'
import { useSnackbarStore } from '@/stores/snackbar'
import { usersApi } from '@/api/users'
import { formatTime } from '@/utils/format'
import type { UserDetail } from '@/types/admin'

export default function UserDetailView() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { id } = useParams()
  const snackbar = useSnackbarStore()

  const [detail, setDetail] = useState<UserDetail | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        setDetail(await usersApi.detail(Number(id)))
      } catch (err) {
        snackbar.error(err instanceof Error ? err.message : t('loadFailed'))
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [id, snackbar, t])

  if (loading) {
    return (
      <Typography color="text.secondary" sx={{ p: 2 }}>
        {t('loading')}
      </Typography>
    )
  }

  if (!detail) return null

  const statCards = [
    { label: t('events'), value: detail.counts.events ?? '-', icon: <CalendarMonthOutlinedIcon />, color: 'success' as const },
    { label: t('opAuditLogs'), value: detail.counts.operationAuditLogs ?? '-', icon: <DescriptionOutlinedIcon />, color: 'info' as const },
    { label: t('aiAuditLogs'), value: detail.counts.aiAuditLogs ?? '-', icon: <HistoryOutlinedIcon />, color: 'primary' as const },
    { label: t('totalTokens'), value: detail.counts.totalTokens ?? '-', icon: <StorageOutlinedIcon />, color: 'warning' as const },
  ]
  const readMap = { read: t('read'), unread: t('unread') }

  return (
    <Box>
      <PageHeader title={`${t('navUsers')} #${id}`} subtitle={detail.username}>
        <ButtonBack onClick={() => navigate(-1)} label={t('back')} />
      </PageHeader>

      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Card sx={{ mb: 3 }}>
            <CardHeader title={t('appInfo')} />
            <CardContent>
              <List dense>
                <ListItem>
                  <ListItemIcon><AccountCircleIcon fontSize="small" /></ListItemIcon>
                  <ListItemText primary={`${t('usernameCol')}：${detail.username}`} />
                </ListItem>
                <ListItem>
                  <ListItemIcon><EmailIcon fontSize="small" /></ListItemIcon>
                  <ListItemText primary={`${t('emailCol')}：${detail.email}`} />
                </ListItem>
                <ListItem>
                  <ListItemIcon><AdminPanelSettingsIcon fontSize="small" /></ListItemIcon>
                  <ListItemText primary={`${t('roleCol')}：${detail.role}`} />
                </ListItem>
                <ListItem>
                  <ListItemIcon><ClockOutlineIcon fontSize="small" /></ListItemIcon>
                  <ListItemText primary={`${t('createdAt')}：${formatTime(detail.createdAt)}`} />
                </ListItem>
              </List>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={6}>
          <Grid container spacing={2}>
            {statCards.map((s) => (
              <Grid key={s.label}  item xs={6}>
                <StatCard label={s.label} value={s.value} icon={s.icon} color={s.color} />
              </Grid>
            ))}
          </Grid>
        </Grid>
      </Grid>

      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardHeader title={t('sessions')} />
            <CardContent>
              {detail.sessions.length ? (
                <List dense>
                  {detail.sessions.map((s) => (
                    <ListItem key={s.id}>
                      <ListItemText
                        primary={s.deviceName || t('unknownDevice')}
                        secondary={`${s.ip} · ${formatTime(s.lastActiveAt)}`}
                      />
                    </ListItem>
                  ))}
                </List>
              ) : (
                <Typography color="text.secondary">{t('noSessions')}</Typography>
              )}
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={6}>
          <Card>
            <CardHeader title={t('notifications')} />
            <CardContent>
              {detail.notifications.length ? (
                <List dense>
                  {detail.notifications.map((n) => (
                    <ListItem key={n.id}>
                      <ListItemText
                        primary={
                          <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
                            {n.title}
                            <StatusChip status={n.isRead ? 'read' : 'unread'} labelMap={readMap} />
                          </Box>
                        }
                        secondary={`${n.body} · ${formatTime(n.createdAt)}`}
                      />
                    </ListItem>
                  ))}
                </List>
              ) : (
                <Typography color="text.secondary">{t('noNotifications')}</Typography>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  )
}

function ButtonBack({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <Typography component="a" color="inherit" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, cursor: 'pointer', textDecoration: 'none' }} onClick={onClick}>
      <ArrowBackIcon fontSize="small" />
      {label}
    </Typography>
  )
}
