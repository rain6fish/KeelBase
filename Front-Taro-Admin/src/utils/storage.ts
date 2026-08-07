import Taro from '@tarojs/taro'
import { STORAGE_KEYS } from './constants'

export const storage = {
  get<T = string>(key: string): Promise<T | null> {
    return Taro.getStorage({ key }).then(
      (res) => res.data as T,
      () => null,
    )
  },

  set(key: string, value: any): Promise<void> {
    return Taro.setStorage({ key, data: value }).then(() => {})
  },

  remove(key: string): Promise<void> {
    return Taro.removeStorage({ key }).then(() => {})
  },

  clear(): Promise<void> {
    return Taro.clearStorage().then(() => {})
  },

  async saveTokens(accessToken: string, refreshToken: string): Promise<void> {
    await this.set(STORAGE_KEYS.ACCESS_TOKEN, accessToken)
    await this.set(STORAGE_KEYS.REFRESH_TOKEN, refreshToken)
  },

  async readTokens(): Promise<{ accessToken: string | null; refreshToken: string | null }> {
    const [accessToken, refreshToken] = await Promise.all([
      this.get<string>(STORAGE_KEYS.ACCESS_TOKEN),
      this.get<string>(STORAGE_KEYS.REFRESH_TOKEN),
    ])
    return { accessToken, refreshToken }
  },

  async clearTokens(): Promise<void> {
    await Promise.all([
      this.remove(STORAGE_KEYS.ACCESS_TOKEN),
      this.remove(STORAGE_KEYS.REFRESH_TOKEN),
    ])
  },
}
