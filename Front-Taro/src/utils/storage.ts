// SPDX-License-Identifier: Apache-2.0

 import Taro from '@tarojs/taro'
 
 /** Typed storage wrapper using Taro's storage API */
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
 
   // Token convenience
   async saveTokens(accessToken: string, refreshToken: string): Promise<void> {
     await this.set('access_token', accessToken)
     await this.set('refresh_token', refreshToken)
   },
 
   async readTokens(): Promise<{ accessToken: string | null; refreshToken: string | null }> {
     const [accessToken, refreshToken] = await Promise.all([
       this.get<string>('access_token'),
       this.get<string>('refresh_token'),
     ])
     return { accessToken, refreshToken }
   },
 
   async clearTokens(): Promise<void> {
     await Promise.all([
       this.remove('access_token'),
       this.remove('refresh_token'),
     ])
   },
 }
