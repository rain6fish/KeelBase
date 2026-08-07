import { useEffect, type ComponentType } from 'react'
import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useAuthStore } from '../../stores/auth-store'
import { useUiStore, NAV_GROUPS, type AdminTab } from '../../stores/ui-store'
import { APP_NAME } from '../../utils/constants'
import { useLocaleStore, restoreLocale, t } from '../../i18n'
import DashboardPage from '../../pages/dashboard/index'
import UsersPage from '../../pages/users/index'
import EventsPage from '../../pages/events/index'
import AuditPage from '../../pages/audit/index'
import OpAuditPage from '../../pages/op-audit/index'
import MonitorPage from '../../pages/monitor/index'
import KnowledgePage from '../../pages/knowledge/index'
import NotificationsPage from '../../pages/notifications/index'
import SessionsPage from '../../pages/sessions/index'
import ObservabilityPage from '../../pages/observability/index'
import SystemPage from '../../pages/system/index'
import './index.scss'

const TAB_VIEWS: Record<AdminTab, ComponentType> = {
  dashboard: DashboardPage,
  users: UsersPage,
  events: EventsPage,
  knowledge: KnowledgePage,
  notifications: NotificationsPage,
  monitor: MonitorPage,
  audit: AuditPage,
  'op-audit': OpAuditPage,
  sessions: SessionsPage,
  observability: ObservabilityPage,
  system: SystemPage,
}

function AdminLayout() {
  const { status, user, tryAutoLogin, logout } = useAuthStore()
  const { activeTab, mountedTabs, setActiveTab } = useUiStore()
  const { locale, setLocale, toggle } = useLocaleStore()

  useEffect(() => {
    if (status === 'initial') {
      tryAutoLogin()
    }
    // 恢复用户上次选择的语言
    restoreLocale().then((saved) => {
      if (saved) setLocale(saved)
    })
  }, [status, tryAutoLogin, setLocale])

  useEffect(() => {
    if (status === 'unauthenticated' || status === 'forbidden') {
      Taro.redirectTo({ url: '/pages/login/index' })
    }
  }, [status])

  if (status !== 'authenticated') {
    return (
      <View className='admin-loading'>
        <Text>加载中...</Text>
      </View>
    )
  }

  const handleLogout = async () => {
    await logout()
    Taro.redirectTo({ url: '/pages/login/index' })
  }

  const navLabel = (key: AdminTab): string => {
    const map: Record<AdminTab, string> = {
      dashboard: t('overview'),
      users: t('navUsers'),
      events: t('navEvents'),
      knowledge: t('navKnowledge'),
      notifications: t('navNotifications'),
      monitor: t('navMonitorCenter'),
      audit: t('navAiAudit'),
      'op-audit': t('navOpAudit'),
      sessions: t('navSessions'),
      observability: t('navObservability'),
      system: t('navSystemInfo'),
    }
    return map[key]
  }

  const groupLabel = (key: string): string => {
    if (key === 'data') return t('navData')
    if (key === 'monitor') return t('navMonitor')
    return t('navSystem')
  }

  return (
    <View className='admin-layout'>
      <View className='admin-layout__sidebar'>
        <View className='admin-layout__brand'>
          <Text className='admin-layout__brand-title'>{APP_NAME}</Text>
        </View>
        <View className='admin-layout__nav'>
          <View
            className={`admin-layout__nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('dashboard')}
          >
            <Text>{t('overview')}</Text>
          </View>

          {NAV_GROUPS.map((group) => (
            <View key={group.key} className='admin-layout__nav-group'>
              <Text className='admin-layout__nav-group-label'>{groupLabel(group.key)}</Text>
              {group.items.map((item) => (
                <View
                  key={item.key}
                  className={`admin-layout__nav-item ${activeTab === item.key ? 'active' : ''}`}
                  onClick={() => setActiveTab(item.key)}
                >
                  <Text>{navLabel(item.key)}</Text>
                </View>
              ))}
            </View>
          ))}
        </View>
        <View className='admin-layout__sidebar-footer'>
          <Text className='admin-layout__user'>{user?.username}</Text>
          <Text className='admin-layout__lang' onClick={toggle}>
            {locale === 'zh' ? 'EN' : '中文'}
          </Text>
          <Text className='admin-layout__logout' onClick={handleLogout}>{t('logout')}</Text>
        </View>
      </View>
      <View className='admin-layout__main'>
        {mountedTabs.map((key) => {
          const ActiveView = TAB_VIEWS[key]
          return (
            <View
              key={key}
              className={`admin-layout__tab ${activeTab === key ? 'active' : ''}`}
            >
              <ActiveView />
            </View>
          )
        })}
      </View>
    </View>
  )
}

export default AdminLayout
