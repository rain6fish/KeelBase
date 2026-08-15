import { create } from 'zustand'
import { i18n, initialLocale, type Locale } from './index'
import { storage } from '@/utils/storage'
import { STORAGE_KEYS } from '@/utils/constants'

interface LocaleState {
  locale: Locale
  setLocale: (locale: Locale) => void
  toggle: () => void
}

/** 语言切换（Zustand store，持久化到 localStorage），等价 Vue useLocaleStore */
export const useLocaleStore = create<LocaleState>((set, get) => ({
  locale: initialLocale(),
  setLocale: (locale) => {
    i18n.changeLanguage(locale)
    storage.set(STORAGE_KEYS.LOCALE, locale)
    set({ locale })
  },
  toggle: () => get().setLocale(get().locale === 'zh' ? 'en' : 'zh'),
}))
