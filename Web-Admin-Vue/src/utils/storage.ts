import { STORAGE_KEYS } from './constants'
import type { TokenPair } from '@/types/api'

function read(key: string): string | null {
  return localStorage.getItem(key)
}
function write(key: string, value: string) {
  localStorage.setItem(key, value)
}
function remove(key: string) {
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
