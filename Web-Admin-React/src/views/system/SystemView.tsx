import { useEffect, useState } from 'react'
import { Box, Card, CardContent, CardHeader, Grid, List, ListItem, Typography } from '@mui/material'
import { useTranslation } from 'react-i18next'
import { PageHeader } from '@/components/PageHeader'
import { adminApi } from '@/api/admin'
import { formatUptime } from '@/utils/format'
import type { AppVersionInfo, MonitorSummary } from '@/types/admin'

export default function SystemView() {
  const { t } = useTranslation()
  const [version, setVersion] = useState<AppVersionInfo | null>(null)
  const [monitor, setMonitor] = useState<MonitorSummary | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const [v, m] = await Promise.all([adminApi.appVersion(), adminApi.monitorSummary()])
        setVersion(v)
        setMonitor(m)
      } catch {
        // global snackbar
      }
    }
    void load()
  }, [])

  return (
    <Box>
      <PageHeader title={t('sysTitle')} />
      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardHeader title={t('appInfo')} />
            <CardContent>
              {version ? (
                <>
                  <List dense>
                    <ListItem>
                      <Typography variant="body2">{t('adminConsole')}</Typography>
                    </ListItem>
                    <ListItem>
                      <Typography variant="body2">
                        {t('latestVersion')}：{version.latestVersion}
                      </Typography>
                    </ListItem>
                    <ListItem>
                      <Typography variant="body2">
                        {t('minVersion')}：{version.minRequiredVersion}
                      </Typography>
                    </ListItem>
                    {version.updateUrl ? (
                      <ListItem>
                        <Typography variant="body2">
                          {t('updateUrl')}：
                          <a href={version.updateUrl} target="_blank" rel="noreferrer">
                            {version.updateUrl}
                          </a>
                        </Typography>
                      </ListItem>
                    ) : null}
                  </List>
                  <Typography variant="subtitle2" mb={1}>
                    {t('changelog')}
                  </Typography>
                  <List dense>
                    {version.changelog?.length ? (
                      version.changelog.map((c, i) => (
                        <ListItem key={i} sx={{ py: 0 }}>
                          <Typography variant="body2">- {c}</Typography>
                        </ListItem>
                      ))
                    ) : (
                      <ListItem sx={{ py: 0 }}>
                        <Typography variant="body2" color="text.secondary">
                          -
                        </Typography>
                      </ListItem>
                    )}
                  </List>
                </>
              ) : (
                <Typography color="text.secondary">{t('loading')}</Typography>
              )}
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={6}>
          <Card>
            <CardHeader title={t('runtimeEnv')} />
            <CardContent>
              {monitor ? (
                <List dense>
                  <ListItem>
                    <Typography variant="body2">
                      {t('nodeEnv')}：{monitor.health.nodeEnv || '-'}
                    </Typography>
                  </ListItem>
                  <ListItem>
                    <Typography variant="body2">
                      {t('storageDriverLabel')}：{monitor.dependencies.storage}
                    </Typography>
                  </ListItem>
                  <ListItem>
                    <Typography variant="body2">
                      {t('pushDriverLabel')}：{monitor.dependencies.push}
                    </Typography>
                  </ListItem>
                  <ListItem>
                    <Typography variant="body2">
                      {t('mailService')}：{monitor.dependencies.mail}
                    </Typography>
                  </ListItem>
                  <ListItem>
                    <Typography variant="body2">
                      {t('redisCache')}：{monitor.dependencies.redis}
                    </Typography>
                  </ListItem>
                  <ListItem>
                    <Typography variant="body2">
                      {t('uptimeLabel')}：{formatUptime(monitor.health.uptimeSec)}
                    </Typography>
                  </ListItem>
                </List>
              ) : (
                <Typography color="text.secondary">{t('loading')}</Typography>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  )
}
