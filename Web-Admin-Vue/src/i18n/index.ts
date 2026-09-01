// SPDX-License-Identifier: Apache-2.0

import { createI18n } from 'vue-i18n'
import { defineStore } from 'pinia'
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

export const i18n = createI18n({
  legacy: false,
  locale: initialLocale(),
  fallbackLocale: 'en',
  messages: { zh, en },
})

/** 与旧 t() 等价的组合式 helper（供非模板/纯 ts 使用） */
export function t(key: string, params?: Record<string, string | number>): string {
  return i18n.global.t(key, params ?? {})
}

/** 功能名：featureKey 优先，兜底 featureFallback（英文），再兜底 key */
export function tFeature(featureKey?: string | null, fallback?: string | null): string {
  if (!featureKey) return fallback || '-'
  const dict = i18n.global.messages.value[i18n.global.locale.value] as { feature?: Record<string, string> }
  const localized = dict?.feature?.[featureKey]
  if (localized) return localized
  // 英文兜底
  const enDict = i18n.global.messages.value.en as { feature?: Record<string, string> }
  return enDict?.feature?.[featureKey] || fallback || featureKey
}

/** 语言切换（Pinia store，持久化到 localStorage） */
export const useLocaleStore = defineStore('locale', {
  state: () => ({
    locale: initialLocale() as Locale,
  }),
  actions: {
    setLocale(locale: Locale) {
      this.locale = locale
      i18n.global.locale.value = locale
      storage.set(STORAGE_KEYS.LOCALE, locale)
    },
    toggle() {
      this.setLocale(this.locale === 'zh' ? 'en' : 'zh')
    },
  },
})
