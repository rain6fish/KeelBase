import { useEffect, useState } from 'react'
import { Accordion, AccordionDetails, AccordionSummary, Box, Button, Card, CardContent, CardHeader, Chip, IconButton, TextField, Typography } from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import LayersOutlinedIcon from '@mui/icons-material/LayersOutlined'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import CancelIcon from '@mui/icons-material/Cancel'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import { useTranslation } from 'react-i18next'
import { PageHeader } from '@/components/PageHeader'
import { AppTable, type AppColumn } from '@/components/AppTable'
import { StatusChip } from '@/components/StatusChip'
import { FormDialog } from '@/components/FormDialog'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { useSnackbarStore } from '@/stores/snackbar'
import { aiEvalApi } from '@/api/aiEval'
import { formatTime } from '@/utils/format'
import type { EvalCase, EvalRunReport } from '@/types/eval'

export default function AiEvalView() {
  const { t } = useTranslation()
  const snackbar = useSnackbarStore()

  const [cases, setCases] = useState<EvalCase[]>([])
  const [report, setReport] = useState<EvalRunReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [running, setRunning] = useState(false)

  const [showCreate, setShowCreate] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ category: '', prompt: '', expected: '' })

  const [showDelete, setShowDelete] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<EvalCase | null>(null)

  async function load() {
    setLoading(true)
    try {
      const [c, r] = await Promise.all([aiEvalApi.listCases(), aiEvalApi.report()])
      setCases(c)
      setReport(r)
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

  function openCreate() {
    setForm({ category: '', prompt: '', expected: '' })
    setShowCreate(true)
  }
  async function onCreate() {
    if (!form.category.trim() || !form.prompt.trim()) return
    setSaving(true)
    try {
      await aiEvalApi.createCase({
        category: form.category.trim(),
        prompt: form.prompt.trim(),
        expected: form.expected || undefined,
      })
      snackbar.success(t('saved'))
      setShowCreate(false)
      void load()
    } catch (err) {
      snackbar.error(err instanceof Error ? err.message : t('createFailed'))
    } finally {
      setSaving(false)
    }
  }

  function confirmDelete(item: EvalCase) {
    setPendingDelete(item)
    setShowDelete(true)
  }
  async function onDelete() {
    if (!pendingDelete) return
    try {
      await aiEvalApi.removeCase(pendingDelete.id)
      snackbar.success(t('deleted'))
      void load()
    } catch (err) {
      snackbar.error(err instanceof Error ? err.message : t('deleteFailed'))
    } finally {
      setShowDelete(false)
    }
  }

  async function onSeed() {
    try {
      const res = await aiEvalApi.seed()
      snackbar.success(t('seedDone', { n: res.added }))
      void load()
    } catch (err) {
      snackbar.error(err instanceof Error ? err.message : t('seedFailed'))
    }
  }

  async function onRun() {
    setRunning(true)
    try {
      setReport(await aiEvalApi.run())
      snackbar.success(t('runDone'))
    } catch (err) {
      snackbar.error(err instanceof Error ? err.message : t('runFailed'))
    } finally {
      setRunning(false)
    }
  }

  const enabledMap = { ok: t('enabled'), cancelled: t('disabled') }
  const headers: AppColumn<EvalCase>[] = [
    { key: 'id', title: t('idCol'), width: 70 },
    { key: 'category', title: t('category') },
    { key: 'prompt', title: t('prompt') },
    { key: 'expected', title: t('expected'), render: (c) => c.expected || '-' },
    { key: 'enabled', title: t('statusCol'), render: (c) => <StatusChip status={c.enabled ? 'ok' : 'cancelled'} labelMap={enabledMap} /> },
    { key: 'createdAt', title: t('createdAt'), render: (c) => formatTime(c.createdAt) },
    {
      key: 'actions',
      title: t('actionCol'),
      render: (c) => (
        <IconButton size="small" color="error" onClick={() => confirmDelete(c)}>
          <DeleteOutlineIcon fontSize="small" />
        </IconButton>
      ),
    },
  ]

  return (
    <Box>
      <PageHeader title={t('navAiEval')}>
        <Button variant="outlined" startIcon={<AddIcon />} onClick={openCreate}>
          {t('newEvalCase')}
        </Button>
        <Button variant="outlined" startIcon={<LayersOutlinedIcon />} onClick={() => void onSeed()}>
          {t('seedCases')}
        </Button>
        <Button color="primary" variant="contained" startIcon={<PlayArrowIcon />} loading={running} onClick={() => void onRun()}>
          {t('runEval')}
        </Button>
      </PageHeader>

      {report ? (
        <Box sx={{ mb: 3 }}>
          <Card>
            <CardHeader
              title={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  {t('lastReport')}
                  <Chip size="small" color="success" variant="outlined" label={t('passed', { n: report.passed })} />
                  <Chip size="small" color="error" variant="outlined" label={t('failed', { n: report.failed })} />
                  <Chip size="small" variant="outlined" label={t('total')} />
                </Box>
              }
            />
            <CardContent>
              {report.cases.map((c) => (
                <Accordion key={c.id}>
                  <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ alignItems: 'center' }}>
                    {c.ok ? <CheckCircleIcon color="success" fontSize="small" /> : <CancelIcon color="error" fontSize="small" />}
                    <Typography variant="body2" sx={{ ml: 1 }}>
                      {c.category} / {c.prompt}
                    </Typography>
                  </AccordionSummary>
                  <AccordionDetails>
                    <Typography variant="body2">
                      {t('assertType')}: {c.assertType}
                    </Typography>
                    <Typography variant="body2">
                      {t('detail')}: {c.detail}
                    </Typography>
                    {c.actualToolCalls?.length ? (
                      <Typography variant="body2">
                        {t('actualToolCalls')}: {c.actualToolCalls.join(', ')}
                      </Typography>
                    ) : null}
                    {c.replyPreview ? (
                      <Typography variant="body2">
                        {t('replyPreview')}: {c.replyPreview}
                      </Typography>
                    ) : null}
                    {c.error ? (
                      <Typography variant="body2" color="error">
                        {t('error')}: {c.error}
                      </Typography>
                    ) : null}
                    <Typography variant="caption" color="text.secondary">
                      {c.durationMs}ms
                    </Typography>
                  </AccordionDetails>
                </Accordion>
              ))}
            </CardContent>
          </Card>
        </Box>
      ) : null}

      <AppTable headers={headers} items={cases} loading={loading} emptyText={t('noTrend')} />

      <FormDialog open={showCreate} title={t('newEvalCase')} loading={saving} onClose={() => setShowCreate(false)} onSave={() => void onCreate()}>
        <Box component="form" onSubmit={(e) => { e.preventDefault(); void onCreate() }}>
          <TextField label={t('category')} required fullWidth margin="dense" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
          <TextField label={t('prompt')} multiline rows={3} required fullWidth margin="dense" value={form.prompt} onChange={(e) => setForm({ ...form, prompt: e.target.value })} />
          <TextField label={t('expected')} fullWidth margin="dense" value={form.expected} onChange={(e) => setForm({ ...form, expected: e.target.value })} />
        </Box>
      </FormDialog>

      <ConfirmDialog
        open={showDelete}
        title={t('deleteEvalCase')}
        content={t('deleteEvalCaseConfirm', { id: pendingDelete?.id || '' })}
        onClose={() => setShowDelete(false)}
        onConfirm={() => void onDelete()}
      />
    </Box>
  )
}
