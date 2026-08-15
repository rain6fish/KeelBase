import { useEffect, useState } from 'react'
import { Box, Card, CardContent, CardHeader, Grid, MenuItem, Select, Typography } from '@mui/material'
import GroupOutlinedIcon from '@mui/icons-material/GroupOutlined'
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined'
import PercentOutlinedIcon from '@mui/icons-material/PercentOutlined'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline'
import { useTranslation } from 'react-i18next'
import { PageHeader } from '@/components/PageHeader'
import { StatCard } from '@/components/StatCard'
import { adminApi } from '@/api/admin'
import type { AnalyticsResponse } from '@/types/admin'

export default function AnalyticsView() {
  const { t } = useTranslation()

  const [data, setData] = useState<AnalyticsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState(30)

  async function load(d: number) {
    setLoading(true)
    try {
      setData(await adminApi.analytics(d))
    } catch {
      // global snackbar
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load(days)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const maxDaily = Math.max(1, ...(data?.activeUsers.daily.map((d) => d.count) ?? [0]))
  const maxErr = Math.max(1, ...(data?.errors.trend.map((e) => e.count) ?? [0]))
  const barHeight = (n: number) => Math.max(4, (n / maxDaily) * 100)
  const errBarHeight = (n: number) => Math.max(4, (n / maxErr) * 100)

  if (loading) {
    return (
      <Typography color="text.secondary" sx={{ p: 2 }}>
        {t('loading')}
      </Typography>
    )
  }

  if (!data) return null

  return (
    <Box>
      <PageHeader title={t('navAnalytics')}>
        <Select
          size="small"
          value={days}
          onChange={(e) => {
            const v = Number(e.target.value)
            setDays(v)
            void load(v)
          }}
          label={t('days')}
          sx={{ maxWidth: 120 }}
      >
          <MenuItem value={7}>7</MenuItem>
          <MenuItem value={30}>30</MenuItem>
          <MenuItem value={90}>90</MenuItem>
        </Select>
      </PageHeader>

      <Grid container spacing={3}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard label={t('wau')} value={data.activeUsers.wau} icon={<GroupOutlinedIcon />} color="primary" />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard label={t('mau')} value={data.activeUsers.mau} icon={<GroupsOutlinedIcon />} color="success" />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard label={t('retention')} value={`${data.retention.ratePct}%`} icon={<PercentOutlinedIcon />} color="info" />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard label={t('aiErrors')} value={data.errors.aiErrors} icon={<ErrorOutlineIcon />} color="error" />
        </Grid>
      </Grid>

      <Grid container spacing={3} sx={{ mt: 0 }}>
        <Grid item xs={12} md={7}>
          <Card>
            <CardHeader title={t('dailyActiveUsers')} />
            <CardContent>
              {data.activeUsers.daily.length ? (
                <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 0.5, height: 160 }}>
                  {data.activeUsers.daily.map((d) => (
                    <Box
                      key={d.date}
                      title={`${d.date}: ${d.count}`}
                      sx={{ flexGrow: 1, bgcolor: 'primary.main', borderRadius: 0.5, height: `${barHeight(d.count)}%` }}
                    />
                  ))}
                </Box>
              ) : (
                <Typography color="text.secondary">{t('noTrend')}</Typography>
              )}
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={5}>
          <Card>
            <CardHeader title={t('featureFunnel')} />
            <CardContent>
              {data.featureFunnel.length ? (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                  {data.featureFunnel.map((f) => (
                    <Box key={f.action} sx={{ display: 'flex', justifyContent: 'space-between', fontSize: 'body2.fontSize' }}>
                      <span>{f.action}</span>
                      <Typography color="text.secondary" component="span">
                        {f.count}
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

      <Card sx={{ mt: 3 }}>
        <CardHeader title={t('errorTrend')} />
        <CardContent>
          {data.errors.trend.length ? (
            <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 0.5, height: 100 }}>
              {data.errors.trend.map((e) => (
                <Box
                  key={e.date}
                  title={`${e.date}: ${e.count}`}
                  sx={{ flexGrow: 1, bgcolor: 'error.main', borderRadius: 0.5, height: `${errBarHeight(e.count)}%` }}
                />
              ))}
            </Box>
          ) : (
            <Typography color="text.secondary">{t('noTrend')}</Typography>
          )}
        </CardContent>
      </Card>
    </Box>
  )
}
