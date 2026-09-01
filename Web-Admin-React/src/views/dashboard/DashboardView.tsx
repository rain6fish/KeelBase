// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from 'react'
import { Box, Card, CardContent, CardHeader, Grid, Typography } from '@mui/material'
import GroupOutlinedIcon from '@mui/icons-material/GroupOutlined'
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined'
import NotificationsOutlinedIcon from '@mui/icons-material/NotificationsOutlined'
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined'
import { useTranslation } from 'react-i18next'
import { PageHeader } from '@/components/PageHeader'
import { StatCard } from '@/components/StatCard'
import { adminApi } from '@/api/admin'
import { auditApi } from '@/api/audit'

interface TrendItem {
  date: string
  count: number
}

export default function DashboardView() {
  const { t } = useTranslation()

  const [counts, setCounts] = useState<Record<string, number>>({})
  const [storage, setStorage] = useState<{ driver: string; bytes: number | null }>({ driver: '-', bytes: null })
  const [trend, setTrend] = useState<TrendItem[]>([])
  const [topActions, setTopActions] = useState<Array<{ action: string; count: number }>>([])

  useEffect(() => {
    async function load() {
      try {
        const [overview, stats] = await Promise.all([adminApi.overview(7), auditApi.stats()])
        setCounts(overview.counts as Record<string, number>)
        setStorage(overview.storage)
        setTrend(overview.trend)
        setTopActions(stats.topActions)
      } catch {
        // snackbar handled globally
      }
    }
    void load()
  }, [])

  const maxCount = Math.max(1, ...trend.map((x) => x.count))
  const barHeight = (n: number) => Math.max(4, (n / maxCount) * 100)

  const statCards = [
    { label: t('users'), value: counts.users ?? '-', icon: <GroupOutlinedIcon />, color: 'primary' as const },
    { label: t('events'), value: counts.events ?? '-', icon: <CalendarMonthOutlinedIcon />, color: 'success' as const },
    { label: t('notifications'), value: counts.notifications ?? '-', icon: <NotificationsOutlinedIcon />, color: 'info' as const },
    {
      label: t('aiUsage'),
      value: `${counts.aiAuditLogs ?? '-'}`,
      icon: <SmartToyOutlinedIcon />,
      color: 'warning' as const,
      hint: t('storageDriver', { driver: storage.driver }),
    },
  ]

  return (
    <Box>
      <PageHeader title={t('overview')} />
      <Grid container spacing={3}>
        {statCards.map((card) => (
          <Grid key={card.label} item xs={12} sm={6} md={3}>
            <StatCard label={card.label} value={card.value} icon={card.icon} color={card.color} hint={card.hint} />
          </Grid>
        ))}
      </Grid>

      <Grid container spacing={3} sx={{ mt: 0 }}>
        <Grid item xs={12} md={8}>
          <Card>
            <CardHeader title={t('newUsers7d')} />
            <CardContent>
              {trend.length ? (
                <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 0.5, height: 120 }}>
                  {trend.map((item) => (
                    <Box
                      key={item.date}
                      title={`${item.date}: ${item.count}`}
                      sx={{
                        flexGrow: 1,
                        bgcolor: 'primary.main',
                        borderRadius: 0.5,
                        height: `${barHeight(item.count)}%`,
                      }}
                    />
                  ))}
                </Box>
              ) : (
                <Typography color="text.secondary">{t('noTrend')}</Typography>
              )}
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card>
            <CardHeader title={t('actionDistribution')} />
            <CardContent>
              {topActions.length ? (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                  {topActions.map((a) => (
                    <Box key={a.action} sx={{ display: 'flex', justifyContent: 'space-between', fontSize: 'body2.fontSize' }}>
                      <span>{a.action}</span>
                      <Typography color="text.secondary" component="span">
                        {a.count}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              ) : (
                <Typography color="text.secondary">{t('noTrend')}</Typography>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  )
}
