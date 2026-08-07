import { create } from 'zustand'

export type AdminTab =
  | 'dashboard'
  | 'users'
  | 'events'
  | 'knowledge'
  | 'notifications'
  | 'monitor'
  | 'audit'
  | 'op-audit'
  | 'sessions'
  | 'observability'
  | 'system'

export interface NavGroup {
  key: string
  label: string
  items: { key: AdminTab; label: string }[]
}

export const NAV_GROUPS: NavGroup[] = [
  {
    key: 'data',
    label: '数据管理',
    items: [
      { key: 'users', label: '用户管理' },
      { key: 'events', label: '事件管理' },
      { key: 'knowledge', label: '知识库' },
      { key: 'notifications', label: '通知广播' },
    ],
  },
  {
    key: 'monitor',
    label: '监控审计',
    items: [
      { key: 'monitor', label: '监控中心' },
      { key: 'audit', label: 'AI 审计' },
      { key: 'op-audit', label: '操作审计' },
      { key: 'sessions', label: '会话管理' },
    ],
  },
  {
    key: 'system',
    label: '系统',
    items: [
      { key: 'observability', label: '可观测性' },
      { key: 'system', label: '系统信息' },
    ],
  },
]

interface UiState {
  activeTab: AdminTab
  mountedTabs: AdminTab[]
  setActiveTab: (tab: AdminTab) => void
}

export const useUiStore = create<UiState>((set, get) => ({
  activeTab: 'dashboard',
  mountedTabs: ['dashboard'],
  setActiveTab: (tab) => {
    if (tab === get().activeTab) return
    set((s) => ({
      activeTab: tab,
      mountedTabs: s.mountedTabs.includes(tab) ? s.mountedTabs : [...s.mountedTabs, tab],
    }))
  },
}))
