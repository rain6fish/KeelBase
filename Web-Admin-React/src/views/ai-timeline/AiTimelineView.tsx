// SPDX-License-Identifier: Apache-2.0

import { useEffect, useMemo, useState } from 'react'
import { Accordion, AccordionDetails, AccordionSummary, Box, Button, Card, CardContent, Chip, TextField, Typography } from '@mui/material'
import RefreshIcon from '@mui/icons-material/Refresh'
import FilterAltIcon from '@mui/icons-material/FilterAlt'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined'
import ForumOutlinedIcon from '@mui/icons-material/ForumOutlined'
import { useTranslation } from 'react-i18next'
import { PageHeader } from '@/components/PageHeader'
import { StatusChip } from '@/components/StatusChip'
import { useSnackbarStore } from '@/stores/snackbar'
import { auditApi } from '@/api/audit'
import { aiToolsApi } from '@/api/aiTools'
import { formatTime } from '@/utils/format'
import type { AuditLog } from '@/types/audit'
import type { ToolEffect } from '@/types/admin'

interface TimelineEvent {
  key: string
  type: string
  time: string
  color: string
  label: string
  toolName?: string
  args?: string
  detail?: string | null
  errorMessage?: string | null
  outcome?: string
  effect?: ToolEffect
  effectStatus?: string
}

interface Session {
  conversationId: string | null
  events: TimelineEvent[]
  toolEffects: ToolEffect[]
}

const DOT_COLORS: Record<string, string> = {
  primary: 'primary.main',
  success: 'success.main',
  error: 'error.main',
  info: 'info.main',
  warning: 'warning.main',
  grey: 'text.disabled',
}

function effectStatus(eff: ToolEffect): string {
  if (eff.targetExists && !eff.targetSoftDeleted) return 'ok'
  if (eff.targetSoftDeleted) return 'cancelled'
  return 'down'
}

function toEvent(log: AuditLog, tFn: (k: string) => string): TimelineEvent | null {
  const base = { key: `${log.id}-${log.action}-${log.createdAt}`, time: log.createdAt, detail: log.detail, errorMessage: log.errorMessage }
  switch (log.action) {
    case 'tool_call': {
      const m = /^([\w]+)\((.*)\)$/s.exec(log.detail || '')
      return {
        ...base,
        type: 'tool_call',
        toolName: m?.[1] || log.detail || '-',
        args: m?.[2] || '',
        color: 'primary',
        label: tFn('toolCall'),
      }
    }
    case 'tool_confirmation': {
      const m = /^([\w]+)\((.*)\) → (\w+)$/s.exec(log.detail || '')
      return {
        ...base,
        type: 'tool_confirmation',
        toolName: m?.[1] || log.detail || '-',
        args: m?.[2] || '',
        outcome: m?.[3] || 'unknown',
        color: log.isError ? 'error' : 'success',
        label: tFn('confirmation'),
      }
    }
    case 'error':
      return { ...base, type: 'error', color: 'error', label: tFn('error') }
    case 'navigate':
      return { ...base, type: 'navigate', color: 'info', label: tFn('navigate') }
    default: {
      const label = tFn(`action.${log.action}`)
      return { ...base, type: log.action, color: 'grey', label: label !== `action.${log.action}` ? label : log.action }
    }
  }
}

export default function AiTimelineView() {
  const { t } = useTranslation()
  const snackbar = useSnackbarStore()

  const [userId, setUserId] = useState('')
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [effects, setEffects] = useState<ToolEffect[]>([])
  const [loading, setLoading] = useState(false)

  const outcomeMap = { ok: t('approved'), cancelled: t('rejected') }
  const effectStatusMap = { ok: t('active'), cancelled: t('cancelled'), down: t('deleted') }

  async function load() {
    setLoading(true)
    try {
      const uid = userId ? Number(userId) : undefined
      const [logsRes, effRes] = await Promise.all([
        auditApi.logs({ userId: userId || undefined, limit: 100 }),
        aiToolsApi.effects(uid, 1, 100),
      ])
      setLogs(logsRes)
      setEffects(effRes.items)
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

  const sessions = useMemo<Session[]>(() => {
    const groups = new Map<string, Session>()
    for (const log of logs) {
      const conv = log.conversationId || 'no-conv'
      const session = groups.get(conv) || { conversationId: log.conversationId || null, events: [], toolEffects: [] }
      const ev = toEvent(log, t)
      if (ev) session.events.push(ev)
      groups.set(conv, session)
    }
    for (const eff of effects) {
      const conv = eff.conversationId || 'no-conv'
      const session = groups.get(conv) || { conversationId: eff.conversationId || null, events: [], toolEffects: [] }
      session.toolEffects.push(eff)
      session.events.push({
        key: `effect-${eff.id}`,
        type: 'effect',
        time: eff.createdAt,
        color: eff.targetExists && !eff.targetSoftDeleted ? 'success' : 'grey',
        label: t('toolEffect'),
        toolName: eff.toolName,
        detail: eff.targetTitle || `#${eff.resultId}`,
        effect: eff,
        effectStatus: effectStatus(eff),
      })
      groups.set(conv, session)
    }
    const arr = Array.from(groups.values())
    arr.forEach((s) => {
      s.events.sort((a, b) => (a.time < b.time ? 1 : -1))
    })
    return arr
  }, [logs, effects, t])

  const sessionIcon = (s: Session) => (s.toolEffects.length ? <SmartToyOutlinedIcon color="warning" /> : <ForumOutlinedIcon color="primary" />)
  const shortId = (id: string) => (id.length > 12 ? `${id.slice(0, 12)}…` : id)

  async function onRevoke(effect: ToolEffect) {
    try {
      await aiToolsApi.revokeEffect(effect.id)
      snackbar.success(t('revoked'))
      void load()
    } catch (err) {
      snackbar.error(err instanceof Error ? err.message : t('revokeFailed'))
    }
  }

  function renderEvent(e: TimelineEvent) {
    return (
      <Card variant="outlined" sx={{ mb: 1.5, ml: 2.5 }}>
        <CardContent sx={{ py: 1.5, px: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="caption" fontWeight={600}>
              {e.label}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {formatTime(e.time)}
            </Typography>
          </Box>

          {e.type === 'tool_call' ? (
            <Box sx={{ mt: 0.5 }}>
              <Typography variant="body2">
                {e.toolName} <code>{e.args}</code>
              </Typography>
              {e.errorMessage ? (
                <Typography variant="body2" color="error" sx={{ mt: 0.5 }}>
                  {e.errorMessage}
                </Typography>
              ) : null}
            </Box>
          ) : e.type === 'tool_confirmation' ? (
            <Box sx={{ mt: 0.5 }}>
              <Typography variant="body2">
                {e.toolName} <code>{e.args}</code>
              </Typography>
              <StatusChip status={e.outcome === 'approve' ? 'ok' : 'cancelled'} labelMap={outcomeMap} />
            </Box>
          ) : e.type === 'effect' ? (
            <Box sx={{ mt: 0.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="body2">{e.toolName}</Typography>
                <StatusChip status={e.effectStatus || ''} labelMap={effectStatusMap} />
              </Box>
              {e.detail ? (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  {e.detail}
                </Typography>
              ) : null}
              {e.effect ? (
                <Button
                  size="small"
                  variant="outlined"
                  color="warning"
                  sx={{ mt: 0.5 }}
                  disabled={!e.effect.targetExists || e.effect.targetSoftDeleted}
                  onClick={() => void onRevoke(e.effect as ToolEffect)}
                >
                  {t('revoke')} #{e.effect.resultId}
                </Button>
              ) : null}
            </Box>
          ) : e.detail ? (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {e.detail}
            </Typography>
          ) : null}
          {e.type === 'error' && e.errorMessage ? (
            <Typography variant="body2" color="error" sx={{ mt: 0.5 }}>
              {e.errorMessage}
            </Typography>
          ) : null}
        </CardContent>
      </Card>
    )
  }

  return (
    <Box>
      <PageHeader title={t('navAiTimeline')} subtitle={t('aiTimelineHint')}>
        <Button variant="outlined" startIcon={<RefreshIcon />} onClick={() => void load()}>
          {t('refresh')}
        </Button>
      </PageHeader>

      <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', mb: 2, p: 2, bgcolor: 'background.paper', border: 1, borderColor: 'divider', borderRadius: 2 }}>
        <TextField value={userId} onChange={(e) => setUserId(e.target.value)} label={t('filterByUserId')} type="number" size="small" sx={{ maxWidth: 180 }} />
        <Button color="primary" variant="contained" startIcon={<FilterAltIcon />} onClick={() => void load()}>
          {t('filter')}
        </Button>
      </Box>

      {loading ? (
        <Typography color="text.secondary" sx={{ p: 2 }}>
          {t('loading')}
        </Typography>
      ) : sessions.length === 0 ? (
        <Typography color="text.secondary" sx={{ p: 2 }}>
          {t('noTimeline')}
        </Typography>
      ) : (
        sessions.map((s) => (
          <Accordion key={s.conversationId || 'no-conv'} sx={{ mb: 1.5 }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                {sessionIcon(s)}
                <Typography variant="body2">
                  {s.conversationId ? `${t('conversation')} ${shortId(s.conversationId)}` : t('adhocChat')}
                </Typography>
                <Chip size="small" variant="outlined" label={`${s.events.length} ${t('events')}`} />
                {s.toolEffects.length ? <Chip size="small" color="warning" variant="outlined" label={`${s.toolEffects.length} ${t('toolEffects')}`} /> : null}
              </Box>
            </AccordionSummary>
            <AccordionDetails>
              <Box sx={{ position: 'relative', '&::before': { content: '""', position: 'absolute', left: 7, top: 4, bottom: 4, width: 2, bgcolor: 'divider' } }}>
                {s.events.map((e) => (
                  <Box key={e.key} sx={{ position: 'relative', pt: 0.5 }}>
                    <Box
                      sx={{
                        position: 'absolute',
                        left: 2,
                        top: 10,
                        width: 12,
                        height: 12,
                        borderRadius: '50%',
                        bgcolor: DOT_COLORS[e.color] ?? 'text.disabled',
                        zIndex: 1,
                      }}
                    />
                    {renderEvent(e)}
                  </Box>
                ))}
              </Box>
            </AccordionDetails>
          </Accordion>
        ))
      )}
    </Box>
  )
}
