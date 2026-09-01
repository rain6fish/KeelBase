// SPDX-License-Identifier: Apache-2.0

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { storage } from '../utils/storage'
import { zh } from '../i18n/zh'
import { en } from '../i18n/en'
import { setGlobalLocale } from '../i18n/translate'
import type { Locale, I18nDictionary } from '../i18n/types'

/**
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
    const saved = await storage.get<string>('locale')
    if (saved === 'zh' || saved === 'en') locale.value = saved
    setGlobalLocale(locale.value)
  }

  async function setLocale(l: Locale): Promise<void> {
    locale.value = l
    setGlobalLocale(l)
    await storage.set('locale', l)
  }

  return { locale, messages, t, initLocale, setLocale }
})
