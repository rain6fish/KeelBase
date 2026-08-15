import { useEffect, useState } from 'react'
import { Box, Button, Card, CardActions, CardContent, CardHeader, Grid, Typography } from '@mui/material'
import GridViewOutlinedIcon from '@mui/icons-material/GridViewOutlined'
import DownloadIcon from '@mui/icons-material/Download'
import { useTranslation } from 'react-i18next'
import { PageHeader } from '@/components/PageHeader'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { useSnackbarStore } from '@/stores/snackbar'
import { templatesApi } from '@/api/templates'
import type { AdminTemplate } from '@/types/admin'

export default function TemplatesView() {
  const { t } = useTranslation()
  const snackbar = useSnackbarStore()

  const [templates, setTemplates] = useState<AdminTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [importingId, setImportingId] = useState<string | null>(null)
  const [showImport, setShowImport] = useState(false)
  const [pending, setPending] = useState<AdminTemplate | null>(null)

  async function load() {
    setLoading(true)
    try {
      setTemplates(await templatesApi.list())
    } catch (err) {
      snackbar.error(err instanceof Error ? err.message : t('loadFailed'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function confirmImport(tpl: AdminTemplate) {
    setPending(tpl)
    setShowImport(true)
  }

  async function onImport() {
    if (!pending) return
    setImportingId(pending.id)
    try {
      const res = await templatesApi.importTemplate(pending.id)
      snackbar.success(t('templateImported', { events: res.events, todos: res.todos }))
    } catch (err) {
      snackbar.error(err instanceof Error ? err.message : t('importFailed'))
    } finally {
      setImportingId(null)
      setShowImport(false)
    }
  }

  return (
    <Box>
      <PageHeader title={t('navTemplates')} />

      {loading ? (
        <Typography color="text.secondary" sx={{ p: 2 }}>
          {t('loading')}
        </Typography>
      ) : (
        <Grid container spacing={3}>
          {templates.map((tpl) => (
            <Grid key={tpl.id}  item  xs={12} md={6} lg={4} >
              <Card>
                <CardHeader
                  avatar={<GridViewOutlinedIcon color="primary" />}
                  title={tpl.name}
                />
                <CardContent>
                  <Typography variant="body2" color="text.secondary" mb={2}>
                    {tpl.description}
                  </Typography>
                  <Typography variant="caption">
                    {t('events')}: {tpl.events.length} · {t('todos')}: {tpl.todos.length}
                  </Typography>
                </CardContent>
                <CardActions sx={{ justifyContent: 'flex-end' }}>
                  <Button color="primary" variant="outlined" startIcon={<DownloadIcon />} loading={importingId === tpl.id} onClick={() => confirmImport(tpl)}>
                    {t('importTemplate')}
                  </Button>
                </CardActions>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {!loading && !templates.length ? (
        <Typography color="text.secondary" sx={{ p: 2 }}>
          {t('noTemplates')}
        </Typography>
      ) : null}

      <ConfirmDialog
        open={showImport}
        title={t('importTemplate')}
        content={t('importTemplateConfirm', { name: pending?.name || '' })}
        color="primary"
        loading={importingId !== null}
        onClose={() => setShowImport(false)}
        onConfirm={() => void onImport()}
      />
    </Box>
  )
}
