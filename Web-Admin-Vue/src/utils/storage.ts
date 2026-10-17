// SPDX-License-Identifier: Apache-2.0

import { STORAGE_KEYS } from './constants'
import type { TokenPair } from '@/types/api'

// Node-environment specs import the API client, which imports i18n, which reads the saved locale.
// Guard the browser-only storage so those specs can load the module graph (reads fall back to null).
// Node 环境的测试会经 API client → i18n 读到本模块；为浏览器专有的 storage 加守卫，
// 使这些测试能加载整条模块图（读回落为 null）。
function read(key: string): string | null {
  return typeof localStorage === 'undefined' ? null : localStorage.getItem(key)
}
function write(key: string, value: string) {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(key, value)
}
function remove(key: string) {
  if (typeof localStorage === 'undefined') return
  localStorage.removeItem(key)
}

export const storage = {
  readTokens(): TokenPair {
    return {
      accessToken: read(STORAGE_KEYS.ACCESS_TOKEN) ?? '',
      refreshToken: read(STORAGE_KEYS.REFRESH_TOKEN) ?? '',
    }
  },
  saveTokens(accessToken: string, refreshToken: string) {
    write(STORAGE_KEYS.ACCESS_TOKEN, accessToken)
    write(STORAGE_KEYS.REFRESH_TOKEN, refreshToken)
  },
  clearTokens() {
    remove(STORAGE_KEYS.ACCESS_TOKEN)
    remove(STORAGE_KEYS.REFRESH_TOKEN)
  },
  get(key: string): string | null {
    return read(key)
  },
  set(key: string, value: string) {
    write(key, value)
  },
  removeKey(key: string) {
    remove(key)
  },
}
