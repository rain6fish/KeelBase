// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from 'react'
import { Box, Card, CardContent, CardHeader, Chip, Grid, Typography } from '@mui/material'
import AccountCircleOutlinedIcon from '@mui/icons-material/AccountCircleOutlined'
import BadgeOutlinedIcon from '@mui/icons-material/BadgeOutlined'
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined'
import NotificationsActiveOutlinedIcon from '@mui/icons-material/NotificationsActiveOutlined'
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined'
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined'
import NotificationsOutlinedIcon from '@mui/icons-material/NotificationsOutlined'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { PageHeader } from '@/components/PageHeader'
import { StatCard } from '@/components/StatCard'
import { useAuthStore } from '@/stores/auth'
import { authApi } from '@/api/auth'
import { workbenchApi } from '@/api/workbench'

export default function WorkbenchHomeView() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const setUser = useAuthStore.setState
  const [unread, setUnread] = useState(0)

  useEffect(() => {
    // 登录响应不含 email 等完整字段，挂载时用 /auth/me 刷新完整资料；未读数失败静默
    void (async () => {
      try {
        const me = await authApi.me()
        setUser({ user: me })
      } catch {
        // 忽略：守卫已保证 user 存在
      }
      try {
        const res = await workbenchApi.unreadCount()
        setUnread(res.count)
      } catch {
        // 忽略：未读数为附加信息
      }
    })()
  }, [setUser])

  const infoCards = [
    { label: t('username'), value: user?.username ?? '-', icon: <AccountCircleOutlinedIcon />, color: 'primary' as const },
    { label: t('nicknameCol'), value: user?.nickname || user?.username || '-', icon: <BadgeOutlinedIcon />, color: 'success' as const },
    { label: t('emailCol'), value: user?.email || '-', icon: <EmailOutlinedIcon />, color: 'info' as const },
    { label: t('unreadCount'), value: unread, icon: <NotificationsActiveOutlinedIcon />, color: 'warning' as const },
  ]

  const shortcutCards = [
    { title: t('workbenchMyEvents'), desc: t('workbenchMyEventsDesc'), icon: <CalendarMonthOutlinedIcon color="primary" />, to: '/workbench/events' },
    { title: t('workbenchMyTodos'), desc: t('workbenchMyTodosDesc'), icon: <CheckCircleOutlinedIcon color="primary" />, to: '/workbench/todos' },
    { title: t('workbenchNotifications'), desc: t('workbenchNotificationsDesc'), icon: <NotificationsOutlinedIcon color="primary" />, to: '/workbench/notifications' },
  ]

  return (
    <Box>
      <PageHeader title={t('navWorkbench')} subtitle={t('workbenchSubtitle')} />
      <Grid container spacing={3}>
        {infoCards.map((c) => (
          <Grid key={c.label}  item  xs={12} sm={6} md={3} >
            <StatCard label={c.label} value={c.value} icon={c.icon} color={c.color} />
          </Grid>
        ))}
      </Grid>
      <Grid container spacing={3} sx={{ mt: 0 }}>
        {shortcutCards.map((c) => (
          <Grid key={c.title}  item  xs={12} sm={6} md={4} >
            <Card sx={{ cursor: 'pointer', height: '100%' }} onClick={() => navigate(c.to)}>
              <CardHeader title={<Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>{c.icon}{c.title}</Box>} />
              <CardContent>
                <Typography variant="body2" color="text.secondary" mb={1.5}>
                  {c.desc}
                </Typography>
                <Chip size="small" color="primary" variant="outlined" label={t('open')} />
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  )
}
