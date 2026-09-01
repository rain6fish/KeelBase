// SPDX-License-Identifier: Apache-2.0

import { useEffect, useRef, useState } from 'react'
import { Box, Button, Chip, IconButton, TextField, Typography } from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import UploadIcon from '@mui/icons-material/Upload'
import RefreshIcon from '@mui/icons-material/Refresh'
import EditOutlinedIcon from '@mui/icons-material/EditOutlined'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import { useTranslation } from 'react-i18next'
import { PageHeader } from '@/components/PageHeader'
import { AppTable, type AppColumn } from '@/components/AppTable'
import { AppPagination } from '@/components/AppPagination'
import { DebouncedSearch } from '@/components/DebouncedSearch'
import { FormDialog } from '@/components/FormDialog'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { useSnackbarStore } from '@/stores/snackbar'
import { knowledgeApi } from '@/api/knowledge'
import { formatTime } from '@/utils/format'
import type { KnowledgeArticle } from '@/types/admin'

const LIMIT = 20

export default function KnowledgeView() {
  const { t } = useTranslation()
  const snackbar = useSnackbarStore()

  const [knowledge, setKnowledge] = useState<KnowledgeArticle[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [q, setQ] = useState('')

  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<KnowledgeArticle | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ title: '', content: '', category: '' })

  const [showDelete, setShowDelete] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<KnowledgeArticle | null>(null)

  const fileInput = useRef<HTMLInputElement>(null)

  async function load(p = 1) {
    setLoading(true)
    try {
      const res = await knowledgeApi.list(p, LIMIT, q || undefined)
      setKnowledge(res.items)
      setTotal(res.total)
      setPage(p)
    } catch (err) {
      snackbar.error(err instanceof Error ? err.message : t('loadFailed'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function openCreate() {
    setEditing(null)
    setForm({ title: '', content: '', category: '' })
    setShowForm(true)
  }
  function openEdit(item: KnowledgeArticle) {
    setEditing(item)
    setForm({ title: item.title, content: item.content, category: item.category || '' })
    setShowForm(true)
  }
  async function onSave() {
    if (!form.title.trim() || !form.content.trim()) {
      snackbar.error(t('titleContentRequired'))
      return
    }
    setSaving(true)
    try {
      const data = { title: form.title.trim(), content: form.content, category: form.category || undefined }
      if (editing) {
        await knowledgeApi.update(editing.id, data)
      } else {
        await knowledgeApi.create(data)
      }
      snackbar.success(t('saved'))
      setShowForm(false)
      void load(page)
    } catch (err) {
      snackbar.error(err instanceof Error ? err.message : t('saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  function confirmDelete(item: KnowledgeArticle) {
    setPendingDelete(item)
    setShowDelete(true)
  }
  async function onDelete() {
    if (!pendingDelete) return
    try {
      await knowledgeApi.remove(pendingDelete.id)
      snackbar.success(t('deleted'))
      void load(page)
    } catch (err) {
      snackbar.error(err instanceof Error ? err.message : t('deleteFailed'))
    } finally {
      setShowDelete(false)
    }
  }

  async function onUploadFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      await knowledgeApi.upload(file)
      snackbar.success(t('uploadSuccess'))
      e.target.value = ''
      void load(1)
    } catch (err) {
      snackbar.error(err instanceof Error ? err.message : t('uploadFailed'))
    }
  }

  const headers: AppColumn<KnowledgeArticle>[] = [
    { key: 'id', title: t('idCol'), width: 70 },
    { key: 'title', title: t('titleLabel') },
    { key: 'category', title: t('categoryOptional'), render: (i) => (i.category ? <Chip size="small" label={i.category} /> : <span>-</span>) },
    { key: 'sourceFile', title: t('sourceFile'), render: (i) => (i.sourceFile ? <Typography variant="caption">{i.sourceFile}</Typography> : <span>-</span>) },
    { key: 'createdAt', title: t('createdAt'), render: (i) => formatTime(i.createdAt) },
    {
      key: 'actions',
      title: t('actionCol'),
      render: (i) => (
        <>
          <IconButton size="small" onClick={() => openEdit(i)}>
            <EditOutlinedIcon fontSize="small" />
          </IconButton>
          <IconButton size="small" color="error" onClick={() => confirmDelete(i)}>
            <DeleteOutlineIcon fontSize="small" />
          </IconButton>
        </>
      ),
    },
  ]

  return (
    <Box>
      <PageHeader title={t('navKnowledge')} subtitle={t('total', { n: total })}>
        <Button color="primary" variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
          {t('newArticle')}
        </Button>
        <Button variant="outlined" startIcon={<UploadIcon />} onClick={() => fileInput.current?.click()}>
          {t('uploadDocument')}
        </Button>
        <input ref={fileInput} type="file" accept=".pdf,.docx" hidden onChange={onUploadFile} />
      </PageHeader>

      <Box sx={{ display: 'flex', gap: 1.5, mb: 2, p: 2, bgcolor: 'background.paper', border: 1, borderColor: 'divider', borderRadius: 2 }}>
        <DebouncedSearch value={q} placeholder={t('searchKnowledge')} onChange={setQ} onSearch={() => void load(1)} />
        <Button variant="outlined" startIcon={<RefreshIcon />} onClick={() => void load(1)}>
          {t('reset')}
        </Button>
      </Box>

      <AppTable headers={headers} items={knowledge} loading={loading} emptyText={t('noKnowledge')} />
      <AppPagination page={page} limit={LIMIT} total={total} loading={loading} onChange={(p) => void load(p)} />

      <FormDialog open={showForm} title={editing ? t('editArticle') : t('createArticle')} loading={saving} onClose={() => setShowForm(false)} onSave={() => void onSave()}>
        <Box component="form" onSubmit={(e) => { e.preventDefault(); void onSave() }}>
          <TextField label={t('titleLabel')} required fullWidth margin="dense" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <TextField label={t('categoryOptional')} fullWidth margin="dense" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
          <TextField label={t('contentMarkdown')} multiline rows={6} required fullWidth margin="dense" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} />
        </Box>
      </FormDialog>

      <ConfirmDialog
        open={showDelete}
        title={t('deleteArticleTitle')}
        content={t('deleteArticleContent', { title: pendingDelete?.title || '' })}
        onClose={() => setShowDelete(false)}
        onConfirm={() => void onDelete()}
      />
    </Box>
  )
}
