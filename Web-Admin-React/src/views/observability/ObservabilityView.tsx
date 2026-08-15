import { Alert, Box, Card, CardContent, Grid, Typography } from '@mui/material'
import InsertChartOutlinedIcon from '@mui/icons-material/InsertChartOutlined'
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment'
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined'
import StorageOutlinedIcon from '@mui/icons-material/StorageOutlined'
import { useTranslation } from 'react-i18next'
import { PageHeader } from '@/components/PageHeader'
import { OBSERVABILITY_URLS } from '@/utils/constants'

const systems = [
  { key: 'grafana', label: 'Grafana', icon: <InsertChartOutlinedIcon />, color: 'primary' as const, url: OBSERVABILITY_URLS.grafana },
  { key: 'prometheus', label: 'Prometheus', icon: <LocalFireDepartmentIcon />, color: 'error' as const, url: OBSERVABILITY_URLS.prometheus },
  { key: 'jaeger', label: 'Jaeger', icon: <AccountTreeOutlinedIcon />, color: 'success' as const, url: OBSERVABILITY_URLS.jaeger },
  { key: 'loki', label: 'Loki', icon: <StorageOutlinedIcon />, color: 'warning' as const, url: OBSERVABILITY_URLS.loki },
]

export default function ObservabilityView() {
  const { t } = useTranslation()
  return (
    <Box>
      <PageHeader title={t('obsTitle')} />
      <Alert severity="info" variant="outlined" sx={{ mb: 3 }}>
        {t('obsHint')}
      </Alert>
      <Grid container spacing={3}>
        {systems.map((sys) => (
          <Grid key={sys.key}  item  xs={12} sm={6} md={3} >
            <Card sx={{ textAlign: 'center', py: 3, cursor: 'pointer' }} onClick={() => window.open(sys.url, '_blank')}>
              <CardContent>
                <Box color={`${sys.color}.main`} fontSize={42} mb={1} sx={{ display: 'flex', justifyContent: 'center' }}>
                  {sys.icon}
                </Box>
                <Typography variant="h6">{sys.label}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {sys.url}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  )
}
