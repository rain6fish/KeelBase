// SPDX-License-Identifier: Apache-2.0

import { useState, type ComponentType } from 'react'
import {
  AppBar,
  Avatar,
  Box,
  Breadcrumbs,
  Button,
  Drawer,
  Divider,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Typography,
} from '@mui/material'
import MenuIcon from '@mui/icons-material/Menu'
import LogoutIcon from '@mui/icons-material/Logout'
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined'
import GroupOutlinedIcon from '@mui/icons-material/GroupOutlined'
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined'
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined'
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined'
import CampaignOutlinedIcon from '@mui/icons-material/CampaignOutlined'
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined'
import FileUploadOutlinedIcon from '@mui/icons-material/FileUploadOutlined'
import StorageOutlinedIcon from '@mui/icons-material/StorageOutlined'
import MonitorHeartOutlinedIcon from '@mui/icons-material/MonitorHeartOutlined'
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined'
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined'
import DevicesOutlinedIcon from '@mui/icons-material/DevicesOutlined'
import InsightsOutlinedIcon from '@mui/icons-material/InsightsOutlined'
import ScienceOutlinedIcon from '@mui/icons-material/ScienceOutlined'
import TimelineOutlinedIcon from '@mui/icons-material/TimelineOutlined'
import LanOutlinedIcon from '@mui/icons-material/LanOutlined'
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined'
import GridViewOutlinedIcon from '@mui/icons-material/GridViewOutlined'
import HandymanOutlinedIcon from '@mui/icons-material/HandymanOutlined'
import HomeOutlinedIcon from '@mui/icons-material/HomeOutlined'
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined'
import NotificationsOutlinedIcon from '@mui/icons-material/NotificationsOutlined'
import type { SvgIconProps } from '@mui/material/SvgIcon'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuthStore, useIsAdmin } from '@/stores/auth'
import { ThemeToggle } from '@/components/ThemeToggle'
import { LangToggle } from '@/components/LangToggle'

interface NavItem {
  name: string
  to: string
  icon: ComponentType<SvgIconProps>
  label: string
}
interface NavGroup {
  label: string
  items: NavItem[]
}

// 面包屑标题映射：path → i18n key（等价 Vue route.meta.title）
const TITLE_BY_PATH: Record<string, string> = {
  '/': 'overview',
  '/users': 'navUsers',
  '/events': 'navEvents',
  '/knowledge': 'navKnowledge',
  '/notifications': 'navNotifications',
  '/monitor': 'navMonitorCenter',
  '/audit': 'navAiAudit',
  '/op-audit': 'navOpAudit',
  '/sessions': 'navSessions',
  '/observability': 'navObservability',
  '/system': 'navSystemInfo',
  '/trash': 'navTrash',
  '/data-import': 'navDataImport',
  '/tags': 'navTags',
  '/notes': 'navNotes',
  '/templates': 'navTemplates',
  '/ai-eval': 'navAiEval',
  '/ai-timeline': 'navAiTimeline',
  '/ai-tools': 'navAiTools',
  '/analytics': 'navAnalytics',
  '/org': 'navOrg',
  '/workbench': 'navWorkbench',
  '/workbench/events': 'workbenchMyEvents',
  '/workbench/todos': 'workbenchMyTodos',
  '/workbench/notifications': 'workbenchNotifications',
  '/workbench/org': 'workbenchOrgDir',
}

const DRAWER_WIDTH = 260
const DRAWER_RAIL_WIDTH = 72

export default function AdminLayout() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const isAdmin = useIsAdmin()
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)

  const [rail, setRail] = useState(false)

  const navGroups: NavGroup[] = isAdmin
    ? [
        {
          label: t('navData'),
          items: [
            { name: 'users', to: '/users', icon: GroupOutlinedIcon, label: t('navUsers') },
            { name: 'org', to: '/org', icon: AccountTreeOutlinedIcon, label: t('navOrg') },
            { name: 'events', to: '/events', icon: CalendarMonthOutlinedIcon, label: t('navEvents') },
            { name: 'knowledge', to: '/knowledge', icon: MenuBookOutlinedIcon, label: t('navKnowledge') },
            { name: 'notifications', to: '/notifications', icon: CampaignOutlinedIcon, label: t('navNotifications') },
            { name: 'trash', to: '/trash', icon: DeleteOutlinedIcon, label: t('navTrash') },
            { name: 'data-import', to: '/data-import', icon: FileUploadOutlinedIcon, label: t('navDataImport') },
            { name: 'tags', to: '/tags', icon: StorageOutlinedIcon, label: t('navTags') },
            { name: 'notes', to: '/notes', icon: StorageOutlinedIcon, label: t('navNotes') },
          ],
        },
        {
          label: t('navMonitor'),
          items: [
            { name: 'monitor', to: '/monitor', icon: MonitorHeartOutlinedIcon, label: t('navMonitorCenter') },
            { name: 'audit', to: '/audit', icon: HistoryOutlinedIcon, label: t('navAiAudit') },
            { name: 'op-audit', to: '/op-audit', icon: DescriptionOutlinedIcon, label: t('navOpAudit') },
            { name: 'sessions', to: '/sessions', icon: DevicesOutlinedIcon, label: t('navSessions') },
            { name: 'analytics', to: '/analytics', icon: InsightsOutlinedIcon, label: t('navAnalytics') },
            { name: 'ai-eval', to: '/ai-eval', icon: ScienceOutlinedIcon, label: t('navAiEval') },
            { name: 'ai-timeline', to: '/ai-timeline', icon: TimelineOutlinedIcon, label: t('navAiTimeline') },
          ],
        },
        {
          label: t('navSystem'),
          items: [
            { name: 'observability', to: '/observability', icon: LanOutlinedIcon, label: t('navObservability') },
            { name: 'system', to: '/system', icon: SettingsOutlinedIcon, label: t('navSystemInfo') },
            { name: 'templates', to: '/templates', icon: GridViewOutlinedIcon, label: t('navTemplates') },
            { name: 'ai-tools', to: '/ai-tools', icon: HandymanOutlinedIcon, label: t('navAiTools') },
          ],
        },
      ]
    : [
        {
          label: t('navWorkbench'),
          items: [{ name: 'workbench-home', to: '/workbench', icon: HomeOutlinedIcon, label: t('navWorkbench') }],
        },
        {
          label: t('navMy'),
          items: [
            { name: 'workbench-events', to: '/workbench/events', icon: CalendarMonthOutlinedIcon, label: t('workbenchMyEvents') },
            { name: 'workbench-todos', to: '/workbench/todos', icon: CheckCircleOutlinedIcon, label: t('workbenchMyTodos') },
            { name: 'workbench-notifications', to: '/workbench/notifications', icon: NotificationsOutlinedIcon, label: t('workbenchNotifications') },
            { name: 'workbench-org', to: '/workbench/org', icon: GroupOutlinedIcon, label: t('workbenchOrgDir') },
          ],
        },
      ]

  const isActive = (to: string): boolean => {
    const path = location.pathname
    if (to === '/') return path === '/'
    if (to === '/users') return path === '/users' || path.startsWith('/users/')
    return path === to
  }

  const go = (to: string) => {
    if (rail) setRail(false)
    navigate(to)
  }

  const onLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  const metaTitleKey = TITLE_BY_PATH[location.pathname]
  const drawerWidth = rail ? DRAWER_RAIL_WIDTH : DRAWER_WIDTH

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <Drawer
        variant="permanent"
        open
        sx={{
          width: drawerWidth,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: drawerWidth,
            boxSizing: 'border-box',
            overflowX: 'hidden',
            transition: 'width 0.2s ease',
            borderRight: '1px solid',
            borderColor: 'divider',
          },
        }}
      >
        <Box
          sx={{ minHeight: 56, display: 'flex', alignItems: 'center', gap: 1, px: rail ? 1.5 : 2, cursor: 'pointer' }}
          onClick={() => go('/')}
        >
          <Avatar sx={{ bgcolor: 'primary.main', width: 32, height: 32, fontSize: 16, fontWeight: 700 }}>K</Avatar>
          {!rail ? (
            <Box>
              <Typography fontWeight="bold" fontSize={14} lineHeight={1.2}>
                {t('appName')}
              </Typography>
              <Typography variant="caption" color="text.secondary" lineHeight={1.2}>
                KeelBase
              </Typography>
            </Box>
          ) : null}
        </Box>
        <Divider />

        {isAdmin ? (
          <List dense sx={{ px: rail ? 1 : 1.5 }}>
            <ListItemButton selected={isActive('/')} onClick={() => go('/')} sx={{ px: 1.5 }}>
              <ListItemIcon sx={{ minWidth: 36 }}>
                <DashboardOutlinedIcon fontSize="small" />
              </ListItemIcon>
              {!rail ? <ListItemText primary={t('overview')} /> : null}
            </ListItemButton>
          </List>
        ) : null}

        <Box sx={{ flexGrow: 1, overflowY: 'auto' }}>
          {navGroups.map((group) => (
            <Box key={group.label}>
              {!rail ? (
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{
                    display: 'block',
                    px: 2,
                    pt: 1.5,
                    pb: 0.5,
                    textTransform: 'uppercase',
                    fontSize: 11,
                    letterSpacing: 0.5,
                  }}
                >
                  {group.label}
                </Typography>
              ) : null}
              <List dense sx={{ px: rail ? 1 : 1.5 }}>
                {group.items.map((item) => {
                  const Icon = item.icon
                  return (
                    <ListItemButton key={item.to} selected={isActive(item.to)} onClick={() => go(item.to)} sx={{ px: 1.5 }}>
                      <ListItemIcon sx={{ minWidth: 36 }}>
                        <Icon fontSize="small" />
                      </ListItemIcon>
                      {!rail ? <ListItemText primary={item.label} /> : null}
                    </ListItemButton>
                  )
                })}
              </List>
            </Box>
          ))}
        </Box>

        <Box sx={{ px: 2, py: 1.5 }}>
          <Divider sx={{ mb: 1 }} />
          <ListItemButton sx={{ px: 1.5 }}>
            <ListItemIcon sx={{ minWidth: 36 }}>
              <Avatar sx={{ width: 28, height: 28, bgcolor: 'primary.main', fontSize: 13 }}>{user?.username?.[0]?.toUpperCase() ?? '-'}</Avatar>
            </ListItemIcon>
            {!rail ? (
              <ListItemText
                primary={user?.username || '-'}
                secondary={user?.role || ''}
                slotProps={{ primary: { fontSize: 14, fontWeight: 600 }, secondary: { fontSize: 12 } }}
              />
            ) : null}
          </ListItemButton>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: 0.5 }}>
            <LangToggle />
            <ThemeToggle />
            <IconButton size="small" title={t('logout')} onClick={onLogout}>
              <LogoutIcon fontSize="small" />
            </IconButton>
          </Box>
        </Box>
      </Drawer>

      <Box component="main" sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', minWidth: 0, bgcolor: 'background.default' }}>
        <AppBar position="sticky" color="transparent" elevation={0} sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: 'background.default' }}>
          <Toolbar>
            <IconButton onClick={() => setRail((r) => !r)} size="small" sx={{ mr: 1 }}>
              <MenuIcon />
            </IconButton>
            <Breadcrumbs aria-label="breadcrumb">
              <Typography variant="body2" color="text.secondary">
                {t('appName')}
              </Typography>
              {metaTitleKey ? (
                <Typography variant="body2" color="text.primary">
                  {t(metaTitleKey)}
                </Typography>
              ) : null}
            </Breadcrumbs>
            <Box sx={{ flexGrow: 1 }} />
            <ThemeToggle />
            <LangToggle />
            <Button variant="outlined" startIcon={<LogoutIcon />} onClick={onLogout} sx={{ ml: 1 }}>
              {t('logout')}
            </Button>
          </Toolbar>
        </AppBar>
        <Box sx={{ p: 3, flexGrow: 1 }}>
          <Outlet />
        </Box>
      </Box>
    </Box>
  )
}
