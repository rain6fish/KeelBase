// SPDX-License-Identifier: Apache-2.0

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { storage } from '../utils/storage'
import { zh } from '../i18n/zh'
import { en } from '../i18n/en'
import { setGlobalLocale } from '../i18n/translate'
import type { Locale, I18nDictionary } from '../i18n/types'

/**
 * Locale persistence key, kept identical to Front-Flutter's `app_locale`
 * (`lib/core/services/locale_provider.dart`) so both clients use the same semantic key.
 * Web-Admin-Vue keeps its own `admin_locale`; that is a different app.
 *
 * Locale 持久化键与 Front-Flutter 的 `app_locale` 保持一致
 * （`lib/core/services/locale_provider.dart`），两端语义相同。
 * Web-Admin-Vue 用的是自己的 `admin_locale`，那是另一个应用。
 */
export const LOCALE_STORAGE_KEY = 'app_locale'
/** Written by earlier Taro builds; read once so the migration is seamless. */
const LEGACY_LOCALE_STORAGE_KEY = 'locale'

/**
 * Lightweight i18n for Taro Vue3: zh is the default dictionary and en mirrors it.
 * No vue-i18n dependency (steadier across Taro H5/weapp builds); a Pinia store
 * owns the language state and t().
 *
 * 轻量 i18n（Taro Vue3）：zh 为默认字典，en 逐步补齐。
 * 不使用 vue-i18n 依赖（Taro H5/小程序构建兼容性更稳），由 Pinia store 承载语言状态与 t() 翻译。
 */
export const useI18nStore = defineStore('i18n', () => {
  const locale = ref<Locale>('zh')
  const dictionaries: Record<Locale, I18nDictionary> = { zh, en }
  const messages = computed(() => dictionaries[locale.value])

  function t(key: string, params?: Record<string, string | number>): string {
    let s: string = messages.value[key] ?? zh[key] ?? key
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        s = s.split(`{${k}}`).join(String(v))
      }
    }
    return s
  }

  async function initLocale(): Promise<void> {
    let saved = await storage.get<string>(LOCALE_STORAGE_KEY)
    if (saved !== 'zh' && saved !== 'en') {
      const legacy = await storage.get<string>(LEGACY_LOCALE_STORAGE_KEY)
      if (legacy === 'zh' || legacy === 'en') {
        saved = legacy
        await storage.set(LOCALE_STORAGE_KEY, legacy)
      }
    }
    if (saved === 'zh' || saved === 'en') locale.value = saved
    setGlobalLocale(locale.value)
  }

  async function setLocale(l: Locale): Promise<void> {
    locale.value = l
    setGlobalLocale(l)
    await storage.set(LOCALE_STORAGE_KEY, l)
  }

  return { locale, messages, t, initLocale, setLocale }
})
