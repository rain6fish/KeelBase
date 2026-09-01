// SPDX-License-Identifier: Apache-2.0

import { useI18nStore } from '../stores/i18n-store'

/** 页面/组件用：`const { t } = useI18n()` → 模板 `{{ t('key') }}`、脚本 `t('key')` */
export function useI18n() {
  const store = useI18nStore()
  return { t: store.t, locale: store.locale, setLocale: store.setLocale }
}
