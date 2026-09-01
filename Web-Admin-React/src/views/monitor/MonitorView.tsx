// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState, type ReactNode } from 'react'
import { Box, Card, CardContent, CardHeader, Grid, Typography } from '@mui/material'
import SpeedIcon from '@mui/icons-material/Speed'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline'
import TimerOutlinedIcon from '@mui/icons-material/TimerOutlined'
import LanOutlinedIcon from '@mui/icons-material/LanOutlined'
import { useTranslation } from 'react-i18next'
import { PageHeader } from '@/components/PageHeader'
import { StatCard } from '@/components/StatCard'
import { StatusChip } from '@/components/StatusChip'
import { useSnackbarStore } from '@/stores/snackbar'
import { adminApi } from '@/api/admin'
import { formatUptime } from '@/utils/format'
import type { MonitorSummary } from '@/types/admin'

export default function MonitorView() {
  const { t } = useTranslation()
  const snackbar = useSnackbarStore()

  const [summary, setSummary] = useState<MonitorSummary | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const data = await adminApi.monitorSummary()
        if (!cancelled) setSummary(data)
      } catch (err) {
        if (!cancelled) snackbar.error(err instanceof Error ? err.message : t('loadFailed'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    const timer = window.setInterval(() => void load(), 15000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const statusLabelMap = { ok: t('statusOk'), error: t('statusError'), degraded: t('statusError') }
  const depLabelMap = { up: t('ok'), ok: t('ok'), down: t('statusError'), error: t('statusError') }

  const m = summary?.metrics
  const metrics: Array<{ label: string; value: string | number; icon: ReactNode; color: 'primary' | 'info' | 'success' | 'warning' | 'error' }> = [
    { label: t('requestRate'), value: m?.requestRateRps ?? '-', icon: <SpeedIcon />, color: 'primary' },
    { label: t('errorRate'), value: m?.errorRatePct != null ? `${m.errorRatePct}%` : '-', icon: <ErrorOutlineIcon />, color: m?.errorRatePct ? 'error' : 'success' },
    { label: t('latencyP95'), value: m?.latencyP95Ms != null ? `${m.latencyP95Ms}ms` : '-', icon: <TimerOutlinedIcon />, color: 'info' },
    { label: t('inFlight'), value: m?.inFlight ?? '-', icon: <LanOutlinedIcon />, color: 'warning' },
  ]

  if (loading) {
    return (
      <Typography color="text.secondary" sx={{ p: 2 }}>
        {t('loading')}
      </Typography>
    )
  }

  if (!summary) return null

  return (
    <Box>
      <PageHeader title={t('monitorTitle')} />

      <Grid container spacing={3}>
        <Grid item xs={12}>
          <Card>
            <CardContent sx={{ display: 'flex', flexWrap: 'wrap', gap: 3, alignItems: 'center' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <StatusChip status={summary.health.status} labelMap={statusLabelMap} />
                <Typography variant="body2">{t('serviceStatus', { status: summary.health.status })}</Typography>
              </Box>
              <Typography variant="body2">{t('uptime', { time: formatUptime(summary.health.uptimeSec) })}</Typography>
              <Typography variant="body2" color="text.secondary">
                v{summary.health.version}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12}>
          <Card>
            <CardHeader title={t('keyMetrics')} />
            <CardContent>
              <Grid container spacing={2}>
                {metrics.map((item) => (
                  <Grid key={item.label} item xs={6} md={3}>
                    <StatCard label={item.label} value={item.value} icon={item.icon} color={item.color} />
                  </Grid>
                ))}
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card>
            <CardHeader title={t('dependencies')} />
            <CardContent>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                {Object.entries(summary.dependencies).map(([k, v]) => (
                  <Box key={k} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 'body2.fontSize' }}>
                    <span>{t(k)}</span>
                    <StatusChip status={v} labelMap={depLabelMap} />
                  </Box>
                ))}
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card>
            <CardHeader title={t('dataScale')} />
            <CardContent>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                {Object.entries(summary.counts).map(([k, v]) => (
                  <Box key={k} sx={{ display: 'flex', justifyContent: 'space-between', fontSize: 'body2.fontSize' }}>
                    <span>{t(k)}</span>
                    <Typography color="text.secondary" component="span">
                      {v}
                    </Typography>
                  </Box>
                ))}
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  )
}
