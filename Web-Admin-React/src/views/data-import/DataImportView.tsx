import { useRef, useState } from 'react'
import { Alert, Box, Button, Card, CardContent, CardHeader, Grid, Typography } from '@mui/material'
import UploadIcon from '@mui/icons-material/Upload'
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined'
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline'
import { useTranslation } from 'react-i18next'
import { PageHeader } from '@/components/PageHeader'
import { StatCard } from '@/components/StatCard'
import { useSnackbarStore } from '@/stores/snackbar'
import { importApi } from '@/api/import'
import type { ImportResult } from '@/types/admin'

export default function DataImportView() {
  const { t } = useTranslation()
  const snackbar = useSnackbarStore()

  const userInput = useRef<HTMLInputElement>(null)
  const eventInput = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState<'user' | 'event' | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)

  async function handleFile(file: File, kind: 'user' | 'event') {
    setImporting(kind)
    try {
      setResult(kind === 'user' ? await importApi.importUsers(file) : await importApi.importEvents(file))
      snackbar.success(t('importDone'))
    } catch (err) {
      snackbar.error(err instanceof Error ? err.message : t('importFailed'))
    } finally {
      setImporting(null)
    }
  }

  function onUserFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) void handleFile(f, 'user')
    // C9: 重置 input 值，重复导入同一文件也能触发 change
    e.target.value = ''
  }
  function onEventFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) void handleFile(f, 'event')
    e.target.value = ''
  }

  return (
    <Box>
      <PageHeader title={t('navDataImport')} />
      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardHeader title={t('importUsers')} />
            <CardContent>
              <Typography variant="body2" color="text.secondary" mb={2}>
                {t('importUsersHint')}
              </Typography>
              <input ref={userInput} type="file" accept=".csv" hidden onChange={onUserFile} />
              <Button color="primary" variant="contained" startIcon={<UploadIcon />} loading={importing === 'user'} onClick={() => userInput.current?.click()}>
                {t('chooseCsv')}
              </Button>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={6}>
          <Card>
            <CardHeader title={t('importEvents')} />
            <CardContent>
              <Typography variant="body2" color="text.secondary" mb={2}>
                {t('importEventsHint')}
              </Typography>
              <input ref={eventInput} type="file" accept=".csv" hidden onChange={onEventFile} />
              <Button color="primary" variant="contained" startIcon={<UploadIcon />} loading={importing === 'event'} onClick={() => eventInput.current?.click()}>
                {t('chooseCsv')}
              </Button>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {result ? (
        <Card sx={{ mt: 3 }}>
          <CardHeader title={t('importResult')} />
          <CardContent>
            <Grid container spacing={2} mb={1}>
              <Grid item xs={4}>
                <StatCard label={t('importTotal')} value={result.total} icon={<InsertDriveFileOutlinedIcon />} color="info" />
              </Grid>
              <Grid item xs={4}>
                <StatCard label={t('importSuccess')} value={result.success} icon={<CheckCircleOutlinedIcon />} color="success" />
              </Grid>
              <Grid item xs={4}>
                <StatCard label={t('importFailed')} value={result.failed} icon={<ErrorOutlineIcon />} color="error" />
              </Grid>
            </Grid>
            {result.errors.length ? (
              <Alert severity="error" variant="outlined">
                {result.errors.map((e) => (
                  <div key={e.row}>
                    {t('row')} {e.row}: {e.reason}
                  </div>
                ))}
              </Alert>
            ) : (
              <Typography variant="body2" color="text.secondary">
                {t('importAllOk')}
              </Typography>
            )}
          </CardContent>
        </Card>
      ) : null}
    </Box>
  )
}
