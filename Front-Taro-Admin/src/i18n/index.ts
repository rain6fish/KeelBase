import { create } from 'zustand'
import { storage } from '../utils/storage'
import zh from './zh'
import en from './en'

export type Locale = 'zh' | 'en'

export const LOCALE_KEY = 'admin_locale'

/** 检测系统语言：zh → 中文，其余 → 英文（同步，仅 navigator） */
export function detectLocale(): Locale {
  try {
    const lang = (navigator.language || navigator.languages?.[0] || '').toLowerCase()
    return lang.startsWith('zh') ? 'zh' : 'en'
  } catch {
    return 'zh'
  }
}

/** 恢复用户上次选择的语言（异步读 storage） */
export async function restoreLocale(): Promise<Locale | null> {
  try {
    const saved = await storage.get<string>(LOCALE_KEY)
    return saved === 'zh' || saved === 'en' ? saved : null
  } catch {
    return null
  }
}

const dicts = { zh, en }

export function getDict(locale: Locale) {
  return dicts[locale]
}

/** 全局当前语言（供非 React 组件读取） */
export let currentLocale: Locale = detectLocale()

interface LocaleState {
  locale: Locale
  setLocale: (l: Locale) => void
  toggle: () => void
}

export const useLocaleStore = create<LocaleState>((set, get) => ({
  locale: currentLocale,
  setLocale: (l) => {
    storage.set(LOCALE_KEY, l)
    currentLocale = l
    set({ locale: l })
  },
  toggle: () => get().setLocale(get().locale === 'zh' ? 'en' : 'zh'),
}))

/**
 * 取翻译。支持 {placeholder} 插值：
 * t('userTotal', { n: 5 }) → '共 5 个用户'
 * t('feature.auth.login') → 功能名
 */
export function t(key: string, params?: Record<string, string | number>): string {
  const dict = getDict(currentLocale) as Record<string, unknown>
  // 第一段取对象，剩余段整体作 key（feature.auth.login → dict.feature['auth.login']）
  let value = lookup(dict, key)

  // 中英缺失时回退到英文，仍缺失则回退到 key 本身
  if (value == null && currentLocale !== 'en') {
    value = lookup(en as unknown as Record<string, unknown>, key)
  }
  if (value == null) return key

  let str = String(value)
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      str = str.split(`{${k}}`).join(String(v))
    }
  }
  return str
}

function lookup(dict: Record<string, unknown>, key: string): unknown {
  const parts = key.split('.')
  const head = dict[parts[0]]
  if (head == null) return undefined
  if (parts.length === 1) return head
  if (typeof head !== 'object') return undefined
  return (head as Record<string, unknown>)[parts.slice(1).join('.')]
}

/** 功能名：featureKey 优先，兜底 featureFallback（英文），再兜底 key */
export function tFeature(featureKey?: string | null, fallback?: string | null): string {
  if (!featureKey) return fallback || '-'
  const localized = t(`feature.${featureKey}`)
  if (localized !== `feature.${featureKey}`) return localized
  return fallback || featureKey
}
