// SPDX-License-Identifier: Apache-2.0

import { zh } from './zh'
import { en } from './en'
import type { Locale, I18nDictionary } from './types'

/**
 * 模块级全局翻译（供服务/常量等非组件模块使用，不依赖 pinia 上下文）。
 * 语言状态与 i18n-store 同步（store.setLocale 会调用 setGlobalLocale）。
 */
let currentLocale: Locale = 'zh'

export function setGlobalLocale(l: Locale): void {
  currentLocale = l
}

const dictionaries: Record<Locale, I18nDictionary> = { zh, en }

export function translate(key: string, params?: Record<string, string | number>): string {
  let s: string = dictionaries[currentLocale][key] ?? zh[key] ?? key
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      s = s.split(`{${k}}`).join(String(v))
    }
  }
  return s
}
