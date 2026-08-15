import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import zh from './zh'
import en from './en'
import { storage } from '@/utils/storage'
import { STORAGE_KEYS } from '@/utils/constants'

export type Locale = 'zh' | 'en'

function detectLocale(): Locale {
  try {
    const lang = (navigator.language || navigator.languages?.[0] || '').toLowerCase()
    return lang.startsWith('zh') ? 'zh' : 'en'
  } catch {
    return 'zh'
  }
}

function initialLocale(): Locale {
  const saved = storage.get(STORAGE_KEYS.LOCALE)
  return saved === 'zh' || saved === 'en' ? saved : detectLocale()
}

// 插值用 { }（与 Vue 版 vue-i18n 的 {n} 占位符保持一致），否则全部参数文案失效
i18n.use(initReactI18next).init({
  resources: {
    zh: { translation: zh },
    en: { translation: en },
  },
  lng: initialLocale(),
  fallbackLng: 'en',
  returnNull: false,
  interpolation: {
    prefix: '{',
    suffix: '}',
  },
})

/** 与旧 t() 等价的组合式 helper（供非组件/纯 ts 使用） */
export function t(key: string, params?: Record<string, string | number>): string {
  return i18n.t(key, params ?? {})
}

/** 功能名：当前语言 feature 字典优先，英文兜底，再兜底 fallback/key */
export function tFeature(featureKey?: string | null, fallback?: string | null): string {
  if (!featureKey) return fallback || '-'
  const current = i18n.language.startsWith('zh') ? zh : en
  const localized = current.feature?.[featureKey as keyof typeof zh.feature]
  if (localized) return localized
  const enValue = en.feature?.[featureKey as keyof typeof en.feature]
  return enValue || fallback || featureKey
}

export { i18n, initialLocale, detectLocale }
