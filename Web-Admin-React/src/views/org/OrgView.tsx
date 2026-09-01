// SPDX-License-Identifier: Apache-2.0

import { useEffect, useMemo, useState } from 'react'
import { Box, Button, Card, CardContent, CardHeader, Divider, IconButton, List, ListItemButton, MenuItem, Select, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import GroupOutlinedIcon from '@mui/icons-material/GroupOutlined'
import PersonAddAltOutlinedIcon from '@mui/icons-material/PersonAddAltOutlined'
import LinkOutlinedIcon from '@mui/icons-material/LinkOutlined'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined'
import { useTranslation } from 'react-i18next'
import { PageHeader } from '@/components/PageHeader'
import { AppTable, type AppColumn } from '@/components/AppTable'
import { AppPagination } from '@/components/AppPagination'
import { FormDialog } from '@/components/FormDialog'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { DebouncedSearch } from '@/components/DebouncedSearch'
import { useSnackbarStore } from '@/stores/snackbar'
import { orgApi } from '@/api/org'
import { usersApi } from '@/api/users'
import { OrgDeptTree } from './components/OrgDeptTree'
import { buildDeptTree, collectDescendantIds, findDeptNode } from './orgTree'
import type { Organization, Department, OrgMember, OrgMemberRole, OrgInvite, DeptTreeNode } from '@/types/org'

const roleOptions = [
  { value: 'owner', label: 'roleOwner' },
  { value: 'admin', label: 'roleAdmin' },
  { value: 'member', label: 'roleMember' },
] as const

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)

export default function OrgView() {
  const { t } = useTranslation()
  const snackbar = useSnackbarStore()

  // 组织
  const [orgs, setOrgs] = useState<Organization[]>([])
  const [currentOrgId, setCurrentOrgId] = useState<number | null>(null)
  const [savingOrg, setSavingOrg] = useState(false)
  const [showOrgDialog, setShowOrgDialog] = useState(false)
  const [orgForm, setOrgForm] = useState({ id: 0, name: '', description: '' })

  // 部门
  const [departments, setDepartments] = useState<Department[]>([])
  const [selectedDeptId, setSelectedDeptId] = useState<number | null>(null)
  const [savingDept, setSavingDept] = useState(false)
  const [showDeptDialog, setShowDeptDialog] = useState(false)
  const [deptForm, setDeptForm] = useState({ id: 0, name: '', parentId: null as number | null })

  // 成员
  const [members, setMembers] = useState<OrgMember[]>([])
  const [memberTotal, setMemberTotal] = useState(0)
  const [memberPage, setMemberPage] = useState(1)
  const [memberKeyword, setMemberKeyword] = useState('')
  const [memberLoading, setMemberLoading] = useState(false)
  const [savingMember, setSavingMember] = useState(false)
  const [showMemberDialog, setShowMemberDialog] = useState(false)
  const [memberForm, setMemberForm] = useState({ userId: null as number | null, role: 'member' as OrgMemberRole, deptId: null as number | null })
  const [users, setUsers] = useState<Array<{ id: number; username: string; nickname: string }>>([])

  // 邀请
  const [invites, setInvites] = useState<OrgInvite[]>([])
  const [showInviteDialog, setShowInviteDialog] = useState(false)
  const [savingInvite, setSavingInvite] = useState(false)
  const [inviteForm, setInviteForm] = useState({ role: 'member' as OrgMemberRole, deptId: null as number | null })
  const [inviteResult, setInviteResult] = useState('')

  // 通用确认
  const [confirm, setConfirm] = useState<{ show: boolean; title: string; content: string; action: (() => Promise<void>) | null }>({
    show: false,
    title: '',
    content: '',
    action: null,
  })

  const deptTree = useMemo(() => buildDeptTree(departments), [departments])

  const parentDeptOptions = useMemo(() => {
    // 编辑时排除自身及其子孙（全树 DFS 定位 self，避免嵌套部门下防环失效）
    const exclude = new Set<number>()
    if (deptForm.id) {
      const node = findDeptNode(buildDeptTree(departments), deptForm.id)
      if (node) collectDescendantIds(node).forEach((id) => exclude.add(id))
    }
    return departments.filter((d) => !exclude.has(d.id)).map((d) => ({ label: d.name, value: d.id }))
  }, [departments, deptForm.id])

  const deptOptions = useMemo(() => departments.map((d) => ({ label: d.name, value: d.id })), [departments])
  const memberUserOptions = useMemo(
    () => users.filter((u) => !members.some((m) => m.userId === u.id)).map((u) => ({ label: `${u.nickname || u.username} (${u.username})`, value: u.id })),
    [users, members],
  )

  // 组织
  async function loadOrgs(): Promise<number | null> {
    const res = await orgApi.listOrganizations(1, 100)
    setOrgs(res.items)
    const firstId = res.items.length ? res.items[0].id : null
    setCurrentOrgId((cur) => (cur ?? firstId))
    return firstId
  }

  async function onSelectOrg(id: number | null) {
    setCurrentOrgId(id)
    setSelectedDeptId(null)
    setMemberPage(1)
    if (id) {
      void loadDepartments(id)
      void loadMembers(1, id)
      void loadInvites(id)
    }
  }

  function openCreateOrg() {
    setOrgForm({ id: 0, name: '', description: '' })
    setShowOrgDialog(true)
  }

  async function onSaveOrg() {
    if (!orgForm.name.trim()) return
    setSavingOrg(true)
    try {
      if (orgForm.id) {
        await orgApi.updateOrganization(orgForm.id, { name: orgForm.name, description: orgForm.description })
        snackbar.success(t('saved'))
      } else {
        const org = await orgApi.createOrganization({ name: orgForm.name, description: orgForm.description })
        snackbar.success(t('orgCreated'))
        await loadOrgs()
        setCurrentOrgId(org.id)
        void onSelectOrg(org.id)
      }
      setShowOrgDialog(false)
    } catch {
      snackbar.error(t('saveFailed'))
    } finally {
      setSavingOrg(false)
    }
  }

  function confirmDeleteOrg() {
    const orgId = currentOrgId
    if (!orgId) return
    setConfirm({
      show: true,
      title: t('deleteOrgTitle'),
      content: t('deleteOrgContent'),
      action: async () => {
        await orgApi.removeOrganization(orgId)
        snackbar.success(t('deleted'))
        setCurrentOrgId(null)
        await loadOrgs()
      },
    })
  }

  // 部门
  async function loadDepartments(orgId = currentOrgId) {
    if (!orgId) return
    setDepartments(await orgApi.listDepartments(orgId))
  }

  function selectDept(id: number | null) {
    setSelectedDeptId(id)
    void loadMembers(1)
  }

  function openAddDept(parentId: number | null) {
    setDeptForm({ id: 0, name: '', parentId })
    setShowDeptDialog(true)
  }

  function openEditDept(id: number) {
    const d = departments.find((x) => x.id === id)
    if (!d) return
    setDeptForm({ id: d.id, name: d.name, parentId: d.parentId ?? null })
    setShowDeptDialog(true)
  }

  async function onSaveDept() {
    if (!deptForm.name.trim()) return
    setSavingDept(true)
    try {
      if (deptForm.id) {
        await orgApi.updateDepartment(deptForm.id, { name: deptForm.name, parentId: deptForm.parentId })
      } else {
        if (!currentOrgId) return
        await orgApi.createDepartment(currentOrgId, { name: deptForm.name, parentId: deptForm.parentId ?? undefined })
      }
      snackbar.success(t('saved'))
      setShowDeptDialog(false)
      await loadDepartments()
    } catch {
      snackbar.error(t('saveFailed'))
    } finally {
      setSavingDept(false)
    }
  }

  function confirmDeleteDept(id: number) {
    const d = departments.find((x) => x.id === id)
    setConfirm({
      show: true,
      title: t('deleteDeptTitle'),
      content: t('deleteDeptContent', { name: d?.name ?? '' }),
      action: async () => {
        await orgApi.removeDepartment(id)
        snackbar.success(t('deleted'))
        if (selectedDeptId === id) setSelectedDeptId(null)
        await loadDepartments()
        void loadMembers(1)
      },
    })
  }

  // 成员
  async function loadMembers(page = memberPage, orgId = currentOrgId) {
    if (!orgId) return
    setMemberLoading(true)
    try {
      const res = await orgApi.listMembers(orgId, page, 20, memberKeyword || undefined, selectedDeptId ?? undefined)
      setMembers(res.items)
      setMemberTotal(res.total)
      setMemberPage(page)
    } catch {
      snackbar.error(t('loadFailed'))
    } finally {
      setMemberLoading(false)
    }
  }

  async function openAddMember() {
    const res = await usersApi.list(1, 100)
    setUsers(res.items.map((u) => ({ id: u.id, username: u.username, nickname: u.nickname })))
    setMemberForm({ userId: null, role: 'member', deptId: null })
    setShowMemberDialog(true)
  }

  async function onSaveMember() {
    if (!currentOrgId || !memberForm.userId) return
    setSavingMember(true)
    try {
      await orgApi.addMember(currentOrgId, {
        userId: memberForm.userId,
        role: memberForm.role,
        ...(memberForm.deptId ? { deptId: memberForm.deptId } : {}),
      })
      snackbar.success(t('memberAdded'))
      setShowMemberDialog(false)
      await loadMembers()
      await loadDepartments()
    } catch {
      snackbar.error(t('saveFailed'))
    } finally {
      setSavingMember(false)
    }
  }

  async function updateMemberRole(item: OrgMember, role: OrgMemberRole) {
    try {
      await orgApi.updateMember(item.id, { role })
      snackbar.success(t('saved'))
      setMembers((prev) => prev.map((m) => (m.id === item.id ? { ...m, role } : m)))
    } catch {
      snackbar.error(t('saveFailed'))
      void loadMembers()
    }
  }

  function confirmDeleteMember(item: OrgMember) {
    setConfirm({
      show: true,
      title: t('memberRemove'),
      content: t('memberRemoveContent', { name: item.nickname || item.username || '' }),
      action: async () => {
        await orgApi.removeMember(item.id)
        snackbar.success(t('deleted'))
        void loadMembers()
      },
    })
  }

  // 邀请
  async function loadInvites(orgId = currentOrgId) {
    if (!orgId) return
    setInvites(await orgApi.listInvites(orgId))
  }

  function openInvite() {
    setInviteForm({ role: 'member', deptId: null })
    setInviteResult('')
    setShowInviteDialog(true)
  }

  async function onSaveInvite() {
    if (!currentOrgId) return
    setSavingInvite(true)
    try {
      const inv = await orgApi.createInvite(currentOrgId, {
        role: inviteForm.role,
        ...(inviteForm.deptId ? { deptId: inviteForm.deptId } : {}),
      })
      setInviteResult(inv.code)
      await loadInvites()
    } catch {
      snackbar.error(t('saveFailed'))
    } finally {
      setSavingInvite(false)
    }
  }

  async function copyInvite(code: string) {
    try {
      await navigator.clipboard.writeText(code)
      snackbar.success(t('inviteCopied'))
    } catch {
      snackbar.error(t('saveFailed'))
    }
  }

  function revokeInvite(inv: OrgInvite) {
    setConfirm({
      show: true,
      title: t('inviteRevoke'),
      content: t('inviteRevokeContent', { code: inv.code }),
      action: async () => {
        await orgApi.removeInvite(inv.id)
        snackbar.success(t('deleted'))
        void loadInvites()
      },
    })
  }

  async function runConfirm() {
    const action = confirm.action
    setConfirm({ show: false, title: '', content: '', action: null })
    if (action) await action()
  }

  useEffect(() => {
    let cancelled = false
    void (async () => {
      // C3: loadOrgs 返回首个 org id，避免闭包 currentOrgId 恒为 null 导致首组织部门/成员/邀请不加载
      const firstId = await loadOrgs()
      if (!cancelled && firstId) void onSelectOrg(firstId)
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const memberHeaders: AppColumn<OrgMember>[] = [
    { key: 'nickname', title: t('nicknameCol'), render: (m) => m.nickname || '-' },
    { key: 'username', title: t('usernameCol'), render: (m) => m.username || '-' },
    { key: 'email', title: t('emailCol'), render: (m) => m.email || '-' },
    {
      key: 'role',
      title: t('roleCol'),
      render: (m) => (
        <Select size="small" value={m.role} onChange={(e) => void updateMemberRole(m, e.target.value as OrgMemberRole)} sx={{ maxWidth: 130, minWidth: 100 }}>
          {roleOptions.map((r) => (
            <MenuItem key={r.value} value={r.value}>
              {t(r.label)}
            </MenuItem>
          ))}
        </Select>
      ),
    },
    { key: 'deptName', title: t('deptCol'), render: (m) => m.deptName || '-' },
    {
      key: 'actions',
      title: t('actionCol'),
      render: (m) => (
        <IconButton size="small" color="error" title={t('delete')} onClick={() => confirmDeleteMember(m)}>
          <DeleteOutlineIcon fontSize="small" />
        </IconButton>
      ),
    },
  ]

  return (
    <Box>
      <PageHeader title={t('navOrg')} subtitle={t('orgSubtitle')}>
        <Button color="primary" variant="contained" startIcon={<AddIcon />} onClick={openCreateOrg}>
          {t('orgCreate')}
        </Button>
      </PageHeader>

      <Card sx={{ mb: 3 }}>
        <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Select size="small" fullWidth value={currentOrgId ?? ''} onChange={(e) => void onSelectOrg(e.target.value === '' ? null : Number(e.target.value))} displayEmpty>
            <MenuItem value="">{t('selectOrg')}</MenuItem>
            {orgs.map((o) => (
              <MenuItem key={o.id} value={o.id}>
                {o.name}
              </MenuItem>
            ))}
          </Select>
          {currentOrgId ? (
            <Button variant="outlined" color="error" startIcon={<DeleteOutlineIcon />} onClick={confirmDeleteOrg}>
              {t('deleteOrg')}
            </Button>
          ) : null}
        </CardContent>
      </Card>

      {currentOrgId ? (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '4fr 8fr' }, gap: 3 }}>
          <Card>
            <CardHeader
              avatar={<AccountTreeOutlinedIcon />}
              title={t('deptTitle')}
              action={
                <IconButton size="small" title={t('deptAdd')} onClick={() => openAddDept(null)}>
                  <AddIcon />
                </IconButton>
              }
            />
            <Divider />
            <CardContent sx={{ p: 1 }}>
              <List dense>
                <DeptTreeItem
                  active={selectedDeptId == null}
                  label={t('allDepartments')}
                  onClick={() => selectDept(null)}
                />
                {deptTree.map((n: DeptTreeNode) => (
                  <OrgDeptTree key={n.id} node={n} selectedId={selectedDeptId} onSelect={(id) => selectDept(id)} onAdd={openAddDept} onRename={openEditDept} onRemove={confirmDeleteDept} />
                ))}
              </List>
              {!departments.length ? (
                <Typography variant="caption" color="text.secondary" sx={{ p: 1 }}>
                  {t('noDept')}
                </Typography>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader
              avatar={<GroupOutlinedIcon />}
              title={t('memberTitle')}
              action={
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Button variant="outlined" startIcon={<LinkOutlinedIcon />} onClick={openInvite}>
                    {t('inviteCreate')}
                  </Button>
                  <Button color="primary" variant="contained" startIcon={<PersonAddAltOutlinedIcon />} onClick={() => void openAddMember()}>
                    {t('memberAdd')}
                  </Button>
                </Box>
              }
            />
            <Divider />
            <CardContent>
              <Box sx={{ mb: 2 }}>
                <DebouncedSearch value={memberKeyword} placeholder={t('searchMember')} onChange={setMemberKeyword} onSearch={() => void loadMembers(1)} />
              </Box>
              <AppTable headers={memberHeaders} items={members} loading={memberLoading} emptyText={t('noMember')} />
              <AppPagination page={memberPage} limit={20} total={memberTotal} loading={memberLoading} onChange={(p) => void loadMembers(p)} />

              <Divider sx={{ my: 2 }} />
              <Typography variant="subtitle2" mb={1}>
                {t('inviteList')}
              </Typography>
              {invites.length ? (
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>{t('inviteCode')}</TableCell>
                      <TableCell>{t('roleCol')}</TableCell>
                      <TableCell>{t('statusCol')}</TableCell>
                      <TableCell>{t('actionCol')}</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {invites.map((inv) => (
                      <TableRow key={inv.id}>
                        <TableCell><code>{inv.code}</code></TableCell>
                        <TableCell>{t(`role${cap(inv.role)}`)}</TableCell>
                        <TableCell>{inv.usedBy ? t('inviteUsed') : t('invitePending')}</TableCell>
                        <TableCell>
                          <IconButton size="small" title={t('inviteCopy')} onClick={() => void copyInvite(inv.code)}>
                            <ContentCopyIcon fontSize="small" />
                          </IconButton>
                          <IconButton size="small" color="error" title={t('inviteRevoke')} onClick={() => revokeInvite(inv)}>
                            <DeleteOutlineIcon fontSize="small" />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <Typography variant="caption" color="text.secondary">
                  {t('noInvite')}
                </Typography>
              )}
            </CardContent>
          </Card>
        </Box>
      ) : (
        <Card sx={{ textAlign: 'center', py: 6 }}>
          <Typography variant="h6">{t('selectOrgFirst')}</Typography>
          <Typography variant="body2" color="text.secondary" mt={0.5}>
            {t('selectOrgFirstHint')}
          </Typography>
        </Card>
      )}

      {/* 新建/编辑组织 */}
      <FormDialog open={showOrgDialog} title={orgForm.id ? t('editOrg') : t('orgCreate')} loading={savingOrg} onClose={() => setShowOrgDialog(false)} onSave={() => void onSaveOrg()}>
        <Box component="form" onSubmit={(e) => { e.preventDefault(); void onSaveOrg() }}>
          <TextField label={t('orgName')} required fullWidth margin="dense" value={orgForm.name} onChange={(e) => setOrgForm({ ...orgForm, name: e.target.value })} />
          <TextField label={t('orgDescription')} fullWidth margin="dense" value={orgForm.description} onChange={(e) => setOrgForm({ ...orgForm, description: e.target.value })} />
        </Box>
      </FormDialog>

      {/* 新建/编辑部门 */}
      <FormDialog open={showDeptDialog} title={deptForm.id ? t('editDept') : t('deptAdd')} loading={savingDept} onClose={() => setShowDeptDialog(false)} onSave={() => void onSaveDept()}>
        <Box component="form" onSubmit={(e) => { e.preventDefault(); void onSaveDept() }}>
          <TextField label={t('deptName')} required fullWidth margin="dense" value={deptForm.name} onChange={(e) => setDeptForm({ ...deptForm, name: e.target.value })} />
          <Select size="small" fullWidth displayEmpty value={deptForm.parentId ?? ''} onChange={(e) => setDeptForm({ ...deptForm, parentId: e.target.value === '' ? null : Number(e.target.value) })}>
            <MenuItem value="">{t('deptParent')}</MenuItem>
            {parentDeptOptions.map((o) => (
              <MenuItem key={o.value} value={o.value}>
                {o.label}
              </MenuItem>
            ))}
          </Select>
        </Box>
      </FormDialog>

      {/* 添加成员 */}
      <FormDialog open={showMemberDialog} title={t('memberAdd')} loading={savingMember} onClose={() => setShowMemberDialog(false)} onSave={() => void onSaveMember()}>
        <Box component="form" onSubmit={(e) => { e.preventDefault(); void onSaveMember() }}>
          <Select size="small" fullWidth displayEmpty value={memberForm.userId ?? ''} onChange={(e) => setMemberForm({ ...memberForm, userId: e.target.value === '' ? null : Number(e.target.value) })}>
            <MenuItem value="" disabled>{t('selectUser')}</MenuItem>
            {memberUserOptions.map((o) => (
              <MenuItem key={o.value} value={o.value}>
                {o.label}
              </MenuItem>
            ))}
          </Select>
          <Select size="small" fullWidth sx={{ mt: 2 }} value={memberForm.role} onChange={(e) => setMemberForm({ ...memberForm, role: e.target.value as OrgMemberRole })}>
            {roleOptions.map((r) => (
              <MenuItem key={r.value} value={r.value}>
                {t(r.label)}
              </MenuItem>
            ))}
          </Select>
          <Select size="small" fullWidth displayEmpty sx={{ mt: 2 }} value={memberForm.deptId ?? ''} onChange={(e) => setMemberForm({ ...memberForm, deptId: e.target.value === '' ? null : Number(e.target.value) })}>
            <MenuItem value="">{t('deptOptional')}</MenuItem>
            {deptOptions.map((o) => (
              <MenuItem key={o.value} value={o.value}>
                {o.label}
              </MenuItem>
            ))}
          </Select>
        </Box>
      </FormDialog>

      {/* 邀请 */}
      <FormDialog open={showInviteDialog} title={t('inviteCreate')} loading={savingInvite} saveLabel={t('generateInvite')} onClose={() => setShowInviteDialog(false)} onSave={() => void onSaveInvite()}>
        <Box component="form" onSubmit={(e) => { e.preventDefault(); void onSaveInvite() }}>
          <Select size="small" fullWidth value={inviteForm.role} onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value as OrgMemberRole })}>
            {roleOptions.map((r) => (
              <MenuItem key={r.value} value={r.value}>
                {t(r.label)}
              </MenuItem>
            ))}
          </Select>
          <Select size="small" fullWidth displayEmpty sx={{ mt: 2 }} value={inviteForm.deptId ?? ''} onChange={(e) => setInviteForm({ ...inviteForm, deptId: e.target.value === '' ? null : Number(e.target.value) })}>
            <MenuItem value="">{t('deptOptional')}</MenuItem>
            {deptOptions.map((o) => (
              <MenuItem key={o.value} value={o.value}>
                {o.label}
              </MenuItem>
            ))}
          </Select>
          {inviteResult ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 2 }}>
              <code style={{ fontSize: 18 }}>{inviteResult}</code>
              <IconButton size="small" title={t('inviteCopy')} onClick={() => void copyInvite(inviteResult)}>
                <ContentCopyIcon fontSize="small" />
              </IconButton>
            </Box>
          ) : null}
        </Box>
      </FormDialog>

      <ConfirmDialog open={confirm.show} title={confirm.title} content={confirm.content} onClose={() => setConfirm({ show: false, title: '', content: '', action: null })} onConfirm={() => void runConfirm()} />
    </Box>
  )
}

function DeptTreeItem({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <ListItemButton selected={active} onClick={onClick} sx={{ py: 0.5, minHeight: 36 }}>
      <Typography fontSize={14}>{label}</Typography>
    </ListItemButton>
  )
}
