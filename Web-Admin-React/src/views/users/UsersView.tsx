// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from 'react'
import { Box, Button, IconButton, MenuItem, Select, TextField, Typography } from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import RefreshIcon from '@mui/icons-material/Refresh'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { PageHeader } from '@/components/PageHeader'
import { AppTable, type AppColumn } from '@/components/AppTable'
import { AppPagination } from '@/components/AppPagination'
import { DebouncedSearch } from '@/components/DebouncedSearch'
import { FormDialog } from '@/components/FormDialog'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { useSnackbarStore } from '@/stores/snackbar'
import { usersApi } from '@/api/users'
import { formatTime } from '@/utils/format'
import type { AdminUser, UserRole } from '@/types/user'

const LIMIT = 20
const emptyCreate = { username: '', email: '', password: '', nickname: '', firstName: '', lastName: '' }

export default function UsersView() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const snackbar = useSnackbarStore()

  const [users, setUsers] = useState<AdminUser[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [searchInput, setSearchInput] = useState('')

  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createForm, setCreateForm] = useState({ ...emptyCreate })

  const [showDelete, setShowDelete] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<AdminUser | null>(null)

  async function load(p = 1) {
    setLoading(true)
    try {
      const res = await usersApi.list(p, LIMIT, searchInput || undefined)
      setUsers(res.items)
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

  function onSearch() {
    void load(1)
  }

  function openCreate() {
    setCreateForm({ ...emptyCreate })
    setShowCreate(true)
  }

  async function onCreate() {
    const f = createForm
    if (!f.username.trim() || !f.email.trim() || !f.password.trim() || !f.nickname.trim()) {
      snackbar.error(t('fillCreateForm'))
      return
    }
    setCreating(true)
    try {
      await usersApi.create({
        username: f.username.trim(),
        email: f.email.trim(),
        password: f.password,
        nickname: f.nickname.trim(),
        firstName: f.firstName.trim() || undefined,
        lastName: f.lastName.trim() || undefined,
      })
      snackbar.success(t('userCreated'))
      setShowCreate(false)
      void load(1)
    } catch (err) {
      snackbar.error(err instanceof Error ? err.message : t('createFailed'))
    } finally {
      setCreating(false)
    }
  }

  async function onChangeRole(id: number, role: string) {
    try {
      await usersApi.updateRole(id, role as UserRole)
      snackbar.success(t('roleUpdated'))
    } catch (err) {
      snackbar.error(err instanceof Error ? err.message : t('updateFailed'))
      void load(page)
    }
  }

  function confirmDelete(user: AdminUser) {
    setPendingDelete(user)
    setShowDelete(true)
  }

  async function onDelete() {
    if (!pendingDelete) return
    try {
      await usersApi.remove(pendingDelete.id)
      snackbar.success(t('deleted'))
      void load(page)
    } catch (err) {
      snackbar.error(err instanceof Error ? err.message : t('deleteFailed'))
    } finally {
      setShowDelete(false)
    }
  }

  const headers: AppColumn<AdminUser>[] = [
    { key: 'id', title: t('idCol'), width: 70 },
    {
      key: 'username',
      title: t('usernameCol'),
      render: (item) => (
        <Typography
          component="a"
          color="primary"
          sx={{ textDecoration: 'none', cursor: 'pointer' }}
          onClick={() => navigate(`/users/${item.id}`)}
        >
          {item.username}
        </Typography>
      ),
    },
    { key: 'email', title: t('emailCol') },
    {
      key: 'role',
      title: t('roleCol'),
      width: 130,
      render: (item) => (
        <Select
          size="small"
          value={item.role}
          onChange={(e) => void onChangeRole(item.id, e.target.value as string)}
          sx={{ minWidth: 100 }}
        >
          <MenuItem value="user">user</MenuItem>
          <MenuItem value="admin">admin</MenuItem>
        </Select>
      ),
    },
    {
      key: 'createdAt',
      title: t('createdAt'),
      render: (item) => formatTime(item.createdAt),
    },
    {
      key: 'actions',
      title: t('actionCol'),
      render: (item) => (
        <IconButton size="small" color="error" onClick={() => confirmDelete(item)}>
          <DeleteOutlineIcon />
        </IconButton>
      ),
    },
  ]

  return (
    <Box>
      <PageHeader title={t('navUsers')} subtitle={t('userTotal', { n: total })}>
        <Button color="primary" variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
          {t('newUser')}
        </Button>
      </PageHeader>

      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', mb: 2, p: 2, bgcolor: 'background.paper', border: 1, borderColor: 'divider', borderRadius: 2 }}>
        <DebouncedSearch value={searchInput} placeholder={t('searchUserPlaceholder')} onChange={setSearchInput} onSearch={onSearch} />
        <Button variant="outlined" startIcon={<RefreshIcon />} onClick={() => void load(1)}>
          {t('reset')}
        </Button>
      </Box>

      <AppTable headers={headers} items={users} loading={loading} emptyText={t('noUsers')} />

      <AppPagination page={page} limit={LIMIT} total={total} loading={loading} onChange={(p) => void load(p)} />

      <FormDialog open={showCreate} title={t('newUser')} loading={creating} onClose={() => setShowCreate(false)} onSave={() => void onCreate()}>
        <Box component="form" onSubmit={(e) => { e.preventDefault(); void onCreate() }}>
          <TextField label={t('usernameCol')} required fullWidth margin="dense" value={createForm.username} onChange={(e) => setCreateForm({ ...createForm, username: e.target.value })} />
          <TextField label="Email" type="email" required fullWidth margin="dense" value={createForm.email} onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })} />
          <TextField label={t('password')} type="password" required fullWidth margin="dense" value={createForm.password} onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })} />
          <TextField label={t('nicknameCol')} required fullWidth margin="dense" value={createForm.nickname} onChange={(e) => setCreateForm({ ...createForm, nickname: e.target.value })} />
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
            <TextField label="First name" margin="dense" value={createForm.firstName} onChange={(e) => setCreateForm({ ...createForm, firstName: e.target.value })} />
            <TextField label="Last name" margin="dense" value={createForm.lastName} onChange={(e) => setCreateForm({ ...createForm, lastName: e.target.value })} />
          </Box>
        </Box>
      </FormDialog>

      <ConfirmDialog
        open={showDelete}
        title={t('deleteUserTitle')}
        content={t('deleteUserContent', { name: pendingDelete?.username || '' })}
        onClose={() => setShowDelete(false)}
        onConfirm={() => void onDelete()}
      />
    </Box>
  )
}
