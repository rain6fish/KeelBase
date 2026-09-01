// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from 'react'
import { Avatar, Box, Card, CardContent, CardHeader, Chip, Grid, List, Typography } from '@mui/material'
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined'
import GroupOutlinedIcon from '@mui/icons-material/GroupOutlined'
import BadgeOutlinedIcon from '@mui/icons-material/BadgeOutlined'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import { useTranslation } from 'react-i18next'
import { PageHeader } from '@/components/PageHeader'
import { orgApi } from '@/api/org'
import { OrgDeptTree } from '@/views/org/components/OrgDeptTree'
import type { DeptTreeNode, MyMember, MyOrgInfo, OrgMemberRole } from '@/types/org'

function cap(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
}

function roleColor(role: OrgMemberRole): 'warning' | 'primary' | 'default' {
  return role === 'owner' ? 'warning' : role === 'admin' ? 'primary' : 'default'
}

export default function OrgDirectoryView() {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(true)
  const [myOrg, setMyOrg] = useState<MyOrgInfo | null>(null)
  const [tree, setTree] = useState<DeptTreeNode[]>([])
  const [members, setMembers] = useState<MyMember[]>([])

  useEffect(() => {
    void (async () => {
      try {
        const [org, treeRes, memberRes] = await Promise.all([orgApi.getMyOrg(), orgApi.getMyTree(), orgApi.listMyMembers()])
        setMyOrg(org)
        setTree(treeRes)
        setMembers(memberRes)
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  if (!loading && !myOrg) {
    return (
      <Box>
        <PageHeader title={t('workbenchOrgDir')} subtitle={t('orgDirSubtitle')} />
        <Card sx={{ textAlign: 'center', py: 6 }}>
          <Typography variant="h6">{t('notInOrg')}</Typography>
          <Typography variant="body2" color="text.secondary" mt={0.5}>
            {t('notInOrgHint')}
          </Typography>
        </Card>
      </Box>
    )
  }

  return (
    <Box>
      <PageHeader title={t('workbenchOrgDir')} subtitle={t('orgDirSubtitle')} />

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6">{myOrg?.org.name}</Typography>
          <Typography variant="body2" color="text.secondary" mt={0.5}>
            <BadgeOutlinedIcon fontSize="small" sx={{ mr: 0.5, verticalAlign: 'middle' }} />
            {t(`role${cap(myOrg?.role ?? '')}`)}
            {myOrg?.deptPath.length ? (
              <>
                <ChevronRightIcon fontSize="small" sx={{ mx: 0.5, verticalAlign: 'middle' }} />
                {myOrg.deptPath.join(' / ')}
              </>
            ) : null}
          </Typography>
        </CardContent>
      </Card>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '5fr 7fr' }, gap: 3 }}>
        <Card>
          <CardHeader avatar={<AccountTreeOutlinedIcon />} title={t('deptTitle')} />
          <CardContent sx={{ p: 1 }}>
            {tree.length ? (
              <List dense>
                {tree.map((n) => (
                  <OrgDeptTree key={n.id} node={n} selectedId={null} readonly onSelect={() => undefined} onAdd={() => undefined} onRename={() => undefined} onRemove={() => undefined} />
                ))}
              </List>
            ) : (
              <Typography variant="caption" color="text.secondary" sx={{ p: 1 }}>
                {t('noDept')}
              </Typography>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader
            avatar={<GroupOutlinedIcon />}
            title={t('memberTitle')}
            action={<Chip size="small" variant="outlined" label={t('memberTotal', { n: members.length })} />}
          />
          <CardContent>
            {!members.length ? (
              <Typography variant="caption" color="text.secondary">
                {t('noMember')}
              </Typography>
            ) : (
              <Grid container spacing={1.5}>
                {members.map((m) => (
                  <Grid key={m.id}  item  xs={12} sm={6} >
                    <Card variant="outlined">
                      <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 1.5 }}>
                        <Avatar sx={{ bgcolor: 'primary.main', width: 40, height: 40 }}>
                          {m.avatarUrl ? <img src={m.avatarUrl} alt="" width={40} height={40} style={{ objectFit: 'cover' }} /> : (m.nickname || '?').charAt(0)}
                        </Avatar>
                        <Box sx={{ flexGrow: 1 }}>
                          <Typography variant="subtitle2">{m.nickname || '-'}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {m.deptName || '-'}
                          </Typography>
                        </Box>
                        <Chip size="small" color={roleColor(m.role)} variant="outlined" label={t(`role${cap(m.role)}`)} />
                      </CardContent>
                    </Card>
                  </Grid>
                ))}
              </Grid>
            )}
          </CardContent>
        </Card>
      </Box>
    </Box>
  )
}
