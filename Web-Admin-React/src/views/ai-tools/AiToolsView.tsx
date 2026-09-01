// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from 'react'
import { Box, Button, Card, CardContent, CardHeader, Chip, Grid, IconButton, TextField, Typography } from '@mui/material'
import RefreshIcon from '@mui/icons-material/Refresh'
import FilterAltIcon from '@mui/icons-material/FilterAlt'
import GppGoodOutlinedIcon from '@mui/icons-material/GppGoodOutlined'
import BuildOutlinedIcon from '@mui/icons-material/BuildOutlined'
import UndoOutlinedIcon from '@mui/icons-material/UndoOutlined'
import { useTranslation } from 'react-i18next'
import { PageHeader } from '@/components/PageHeader'
import { AppTable, type AppColumn } from '@/components/AppTable'
import { AppPagination } from '@/components/AppPagination'
import { StatusChip } from '@/components/StatusChip'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { useSnackbarStore } from '@/stores/snackbar'
import { aiToolsApi } from '@/api/aiTools'
import { formatTime } from '@/utils/format'
import type { AdminAiTool, ToolEffect } from '@/types/admin'

const LIMIT = 20

export default function AiToolsView() {
  const { t } = useTranslation()
  const snackbar = useSnackbarStore()

  const [tools, setTools] = useState<AdminAiTool[]>([])
  const [effects, setEffects] = useState<ToolEffect[]>([])
  const [effectTotal, setEffectTotal] = useState(0)
  const [effectPage, setEffectPage] = useState(1)
  const [effectsLoading, setEffectsLoading] = useState(false)
  const [effectUserId, setEffectUserId] = useState('')

  const [showRevoke, setShowRevoke] = useState(false)
  const [pending, setPending] = useState<ToolEffect | null>(null)

  async function loadTools() {
    try {
      setTools(await aiToolsApi.tools())
    } catch (err) {
      snackbar.error(err instanceof Error ? err.message : t('loadFailed'))
    }
  }

  async function loadEffects(p = 1) {
    setEffectsLoading(true)
    try {
      const res = await aiToolsApi.effects(effectUserId ? Number(effectUserId) : undefined, p, LIMIT)
      setEffects(res.items)
      setEffectTotal(res.total)
      setEffectPage(p)
    } catch (err) {
      snackbar.error(err instanceof Error ? err.message : t('loadFailed'))
    } finally {
      setEffectsLoading(false)
    }
  }

  useEffect(() => {
    void loadTools()
    void loadEffects()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function confirmRevoke(item: ToolEffect) {
    setPending(item)
    setShowRevoke(true)
  }
  async function onRevoke() {
    if (!pending) return
    try {
      await aiToolsApi.revokeEffect(pending.id)
      snackbar.success(t('revoked'))
      void loadEffects(effectPage)
    } catch (err) {
      snackbar.error(err instanceof Error ? err.message : t('revokeFailed'))
    } finally {
      setShowRevoke(false)
    }
  }

  const resultTypeMap = { event: t('events'), todo: t('todos') }
  const effectStatusMap = { ok: t('active'), cancelled: t('cancelled'), down: t('deleted') }
  const effectHeaders: AppColumn<ToolEffect>[] = [
    { key: 'id', title: t('idCol'), width: 70 },
    { key: 'toolName', title: t('tool') },
    { key: 'resultType', title: t('resultType'), render: (i) => <StatusChip status={i.resultType} labelMap={resultTypeMap} /> },
    { key: 'resultId', title: t('resultId') },
    { key: 'targetTitle', title: t('titleLabel'), render: (i) => i.targetTitle || '-' },
    {
      key: 'status',
      title: t('statusCol'),
      render: (i) =>
        i.targetExists && !i.targetSoftDeleted ? (
          <StatusChip status="ok" labelMap={effectStatusMap} />
        ) : i.targetSoftDeleted ? (
          <StatusChip status="cancelled" labelMap={effectStatusMap} />
        ) : (
          <StatusChip status="down" labelMap={effectStatusMap} />
        ),
    },
    { key: 'createdAt', title: t('createdAt'), render: (i) => formatTime(i.createdAt) },
    {
      key: 'actions',
      title: t('actionCol'),
      render: (i) => (
        <IconButton
          size="small"
          color="error"
          disabled={!i.targetExists || i.targetSoftDeleted}
          title={t('revokeEffect')}
          onClick={() => confirmRevoke(i)}
        >
          <UndoOutlinedIcon fontSize="small" />
        </IconButton>
      ),
    },
  ]

  return (
    <Box>
      <PageHeader title={t('navAiTools')} />

      <Card sx={{ mb: 3 }}>
        <CardHeader title={t('toolInventory')} />
        <CardContent>
          {tools.length ? (
            <Grid container spacing={2}>
              {tools.map((tool) => (
                <Grid key={tool.name}  item  xs={12} md={6} lg={4} >
                  <Card variant="outlined">
                    <CardHeader
                      avatar={
                        tool.requiresConfirmation ? (
                          <GppGoodOutlinedIcon color="warning" fontSize="small" />
                        ) : (
                          <BuildOutlinedIcon color="primary" fontSize="small" />
                        )
                      }
                      title={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          {tool.name}
                          {tool.requiresConfirmation ? <Chip size="small" color="warning" variant="outlined" label={t('requiresConfirmation')} /> : null}
                        </Box>
                      }
                    />
                    <CardContent sx={{ pt: 0 }}>
                      <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>
                        {tool.description}
                      </Typography>
                      {tool.parameters.length ? (
                        <Typography variant="caption" display="block">
                          {t('parameters')}: {tool.parameters.map((p) => `${p.name}${p.required ? '*' : ''}`).join(', ')}
                        </Typography>
                      ) : null}
                      {tool.permissions?.adminOnly ? (
                        <Typography variant="caption" color="error" display="block">
                          {t('adminOnly')}
                        </Typography>
                      ) : null}
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          ) : (
            <Typography color="text.secondary">{t('loading')}</Typography>
          )}
        </CardContent>
      </Card>

      <PageHeader title={t('toolEffects')}>
        <Button variant="outlined" startIcon={<RefreshIcon />} onClick={() => void loadEffects()}>
          {t('refresh')}
        </Button>
      </PageHeader>

      <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', mb: 2, p: 2, bgcolor: 'background.paper', border: 1, borderColor: 'divider', borderRadius: 2 }}>
        <TextField value={effectUserId} onChange={(e) => setEffectUserId(e.target.value)} label={t('filterByUserId')} type="number" size="small" sx={{ maxWidth: 180 }} />
        <Button color="primary" variant="contained" startIcon={<FilterAltIcon />} onClick={() => void loadEffects(1)}>
          {t('filter')}
        </Button>
      </Box>

      <AppTable headers={effectHeaders} items={effects} loading={effectsLoading} />
      <AppPagination page={effectPage} limit={LIMIT} total={effectTotal} loading={effectsLoading} onChange={(p) => void loadEffects(p)} />

      <ConfirmDialog
        open={showRevoke}
        title={t('revokeEffect')}
        content={t('revokeEffectConfirm', { title: pending?.targetTitle || `#${pending?.resultId}` })}
        onClose={() => setShowRevoke(false)}
        onConfirm={() => void onRevoke()}
      />
    </Box>
  )
}
