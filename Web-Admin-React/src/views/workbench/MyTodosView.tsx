import { useEffect, useState } from 'react'
import { Box, Button, Checkbox, IconButton, TextField, Typography } from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import { useTranslation } from 'react-i18next'
import { PageHeader } from '@/components/PageHeader'
import { AppTable, type AppColumn } from '@/components/AppTable'
import { FormDialog } from '@/components/FormDialog'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { useSnackbarStore } from '@/stores/snackbar'
import { workbenchApi } from '@/api/workbench'
import { isEmailNotVerified } from '@/api/client'
import { formatTime } from '@/utils/format'
import type { CreateTodoInput, MyTodo } from '@/types/workbench'

export default function MyTodosView() {
  const { t } = useTranslation()
  const snackbar = useSnackbarStore()

  const [todos, setTodos] = useState<MyTodo[]>([])
  const [loading, setLoading] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ title: '', description: '', dueDate: '' })
  const [showDelete, setShowDelete] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<MyTodo | null>(null)

  async function load() {
    setLoading(true)
    try {
      setTodos(await workbenchApi.todos())
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
    setForm({ title: '', description: '', dueDate: '' })
    setShowCreate(true)
  }
  async function onCreate() {
    if (!form.title.trim()) {
      snackbar.warning(t('titleRequired'))
      return
    }
    setCreating(true)
    try {
      const d: CreateTodoInput = { title: form.title.trim(), description: form.description.trim() || undefined }
      if (form.dueDate) d.dueDate = new Date(form.dueDate).toISOString()
      await workbenchApi.createTodo(d)
      snackbar.success(t('todoCreated'))
      setShowCreate(false)
      void load()
    } catch (err) {
      if (isEmailNotVerified(err)) snackbar.warning(t('emailNotVerifiedHint'))
      else snackbar.error(err instanceof Error ? err.message : t('createFailed'))
    } finally {
      setCreating(false)
    }
  }

  async function toggle(item: MyTodo) {
    try {
      await workbenchApi.toggleTodo(item.id)
      void load()
    } catch (err) {
      if (isEmailNotVerified(err)) snackbar.warning(t('emailNotVerifiedHint'))
      else snackbar.error(err instanceof Error ? err.message : t('updateFailed'))
    }
  }

  function confirmDelete(todo: MyTodo) {
    setPendingDelete(todo)
    setShowDelete(true)
  }
  async function onDelete() {
    if (!pendingDelete) return
    try {
      await workbenchApi.removeTodo(pendingDelete.id)
      snackbar.success(t('deleted'))
      void load()
    } catch (err) {
      if (isEmailNotVerified(err)) snackbar.warning(t('emailNotVerifiedHint'))
      else snackbar.error(err instanceof Error ? err.message : t('deleteFailed'))
    } finally {
      setShowDelete(false)
    }
  }

  const headers: AppColumn<MyTodo>[] = [
    {
      key: 'title',
      title: t('titleLabel'),
      render: (todo) => (
        <Typography
          component="span"
          sx={todo.completed ? { color: 'text.secondary', textDecoration: 'line-through' } : {}}
        >
          {todo.title}
        </Typography>
      ),
    },
    { key: 'dueDate', title: t('dueDateCol'), render: (todo) => formatTime(todo.dueDate) },
    {
      key: 'completed',
      title: t('completed'),
      render: (todo) => <Checkbox checked={todo.completed} size="small" onChange={() => void toggle(todo)} />,
    },
    {
      key: 'actions',
      title: t('actionCol'),
      render: (todo) => (
        <IconButton size="small" color="error" onClick={() => confirmDelete(todo)}>
          <DeleteOutlineIcon fontSize="small" />
        </IconButton>
      ),
    },
  ]

  return (
    <Box>
      <PageHeader title={t('workbenchMyTodos')} subtitle={t('todoTotal', { n: todos.length })}>
        <Button variant="outlined" startIcon={<AddIcon />} onClick={openCreate}>
          {t('addTodo')}
        </Button>
      </PageHeader>
      <AppTable headers={headers} items={todos} loading={loading} emptyText={t('noTrend')} />

      <FormDialog open={showCreate} title={t('addTodo')} icon={<AddIcon />} loading={creating} onClose={() => setShowCreate(false)} onSave={() => void onCreate()}>
        <Box component="form" onSubmit={(e) => { e.preventDefault(); void onCreate() }}>
          <TextField label={t('titleLabel')} fullWidth margin="dense" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <TextField label={t('contentLabel')} multiline rows={2} fullWidth margin="dense" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <TextField label={t('dueDateCol')} type="date" fullWidth margin="dense" slotProps={{ inputLabel: { shrink: true } }} value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
        </Box>
      </FormDialog>

      <ConfirmDialog
        open={showDelete}
        title={t('deleteTodoTitle')}
        content={t('deleteTodoContent', { title: pendingDelete?.title || '' })}
        onClose={() => setShowDelete(false)}
        onConfirm={() => void onDelete()}
      />
    </Box>
  )
}
