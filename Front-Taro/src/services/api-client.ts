// SPDX-License-Identifier: Apache-2.0

 import Taro from '@tarojs/taro'
 import { API_BASE_URL, API_TIMEOUT } from '../utils/constants'
 import { storage } from '../utils/storage'
 import { translate } from '../i18n/translate'
 import type { ApiResponse } from '../types/api'
 
 /** Public endpoints that don't require auth token */
 const PUBLIC_ENDPOINTS = [
   '/auth/login',
   '/auth/register',
   '/auth/refresh',
   '/auth/oauth',
   '/health',
 ]
 
 let onAuthFailure: (() => void) | null = null

 export function setOnAuthFailure(callback: () => void) {
   onAuthFailure = callback
 }

 let cachedDeviceId: string | null = null

 /** 生成/读取设备 ID（登录/会话标记当前设备用），首次生成 32 位 hex。 */
 async function getOrCreateDeviceId(): Promise<string> {
   if (cachedDeviceId) return cachedDeviceId
   const existing = await storage.get<string>('device_id')
   if (existing) {
     cachedDeviceId = existing
     return existing
   }
   const bytes: string[] = []
   for (let i = 0; i < 16; i++) {
     bytes.push(Math.floor(Math.random() * 256).toString(16).padStart(2, '0'))
   }
   const id = bytes.join('')
   await storage.set('device_id', id)
   cachedDeviceId = id
   return id
 }

 function isPublicEndpoint(path: string): boolean {
   return PUBLIC_ENDPOINTS.some((ep) => path.includes(ep))
 }
 
 async function request<T = any>(
   method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
   path: string,
   data?: any,
   options?: { isFormData?: boolean },
 ): Promise<ApiResponse<T>> {
   const header: Record<string, string> = {}
 
   if (!options?.isFormData) {
     header['Content-Type'] = 'application/json'
     header['Accept'] = 'application/json'
   }
   // Device ID header（会话 isCurrent 标记，login 时后端登记）
   header['x-device-id'] = await getOrCreateDeviceId()

   // Add auth token for protected endpoints
   if (!isPublicEndpoint(path)) {
     const tokens = await storage.readTokens()
     if (tokens.accessToken) {
       header['Authorization'] = `Bearer ${tokens.accessToken}`
     }
   }
 
   try {
     const response = await Taro.request({
       url: `${API_BASE_URL}${path}`,
       method,
       header,
       data,
       timeout: API_TIMEOUT,
       dataType: options?.isFormData ? undefined : 'json',
     })
 
     const body = response.data as ApiResponse<T>
 
     // Handle 401 - try token refresh
     if (response.statusCode === 401 && !isPublicEndpoint(path)) {
       const refreshed = await tryRefreshToken()
       if (refreshed) {
         // Retry the original request
         return request<T>(method, path, data, options)
       }
       onAuthFailure?.()
       throw new ApiError(translate('api.authRequired'), 401)
     }
 
     if (response.statusCode >= 400) {
       throw new ApiError(
         (body as any)?.message || translate('api.requestFailed'),
         response.statusCode,
         (body as any)?.errors,
       )
     }
 
     return body
   } catch (err: any) {
     if (err instanceof ApiError) throw err
     if (err.errMsg?.includes('timeout')) {
       throw new ApiError(translate('api.timeout'), 0)
     }
     if (err.errMsg?.includes('fail')) {
       throw new ApiError(translate('api.networkError'), 0)
     }
     throw new ApiError(err.message || translate('api.unexpectedError'), 0)
   }
 }
 
 let refreshPromise: Promise<boolean> | null = null

 async function tryRefreshToken(): Promise<boolean> {
   // CR-16：共享刷新 Promise（单飞）——并发 401 只刷新一次，防后端 token 轮换并发刷新互相覆盖导致误登出
   if (refreshPromise) return refreshPromise
   refreshPromise = (async () => {
     try {
       const tokens = await storage.readTokens()
       if (!tokens.refreshToken) return false

       const response = await Taro.request({
         url: `${API_BASE_URL}/auth/refresh`,
         method: 'POST',
         header: { 'Content-Type': 'application/json' },
         data: { refreshToken: tokens.refreshToken },
         timeout: 10000,
       })

       const body = response.data as any
       const data = body?.data
       if (data?.accessToken && data?.refreshToken) {
         await storage.saveTokens(data.accessToken, data.refreshToken)
         return true
       }
       return false
     } catch {
       return false
     } finally {
       refreshPromise = null
     }
   })()
   return refreshPromise
 }
 
 export class ApiError extends Error {
   statusCode: number
   errors?: Record<string, string[]>
 
   constructor(message: string, statusCode: number, errors?: Record<string, string[]>) {
     super(message)
     this.statusCode = statusCode
     this.errors = errors
   }
 }
 
 export const api = {
   get<T = any>(path: string, params?: Record<string, any>): Promise<ApiResponse<T>> {
     return request<T>('GET', path, params)
   },
 
   post<T = any>(path: string, data?: any): Promise<ApiResponse<T>> {
     return request<T>('POST', path, data)
   },
 
   put<T = any>(path: string, data?: any): Promise<ApiResponse<T>> {
     return request<T>('PUT', path, data)
   },

   patch<T = any>(path: string, data?: any): Promise<ApiResponse<T>> {
     return request<T>('PATCH', path, data)
   },

   delete<T = any>(path: string): Promise<ApiResponse<T>> {
     return request<T>('DELETE', path)
   },
 
   upload<T = any>(path: string, filePath: string, fieldName: string = 'file'): Promise<ApiResponse<T>> {
     // CR-10：Taro.request 发 filePath 字符串不会上传文件内容，必须用 Taro.uploadFile
     return (async () => {
       const header: Record<string, string> = {}
       header['x-device-id'] = await getOrCreateDeviceId()
       if (!isPublicEndpoint(path)) {
         const tokens = await storage.readTokens()
         if (tokens.accessToken) header['Authorization'] = `Bearer ${tokens.accessToken}`
       }
       try {
         const res = await Taro.uploadFile({
           url: `${API_BASE_URL}${path}`,
           filePath,
           name: fieldName,
           header,
           timeout: API_TIMEOUT,
         })
         let body: ApiResponse<T>
         try {
           body = JSON.parse(res.data as string) as ApiResponse<T>
         } catch {
           throw new ApiError(translate('api.invalidResponse'), res.statusCode)
         }
         if (res.statusCode === 401 && !isPublicEndpoint(path)) {
           const refreshed = await tryRefreshToken()
           if (refreshed) return this.upload<T>(path, filePath, fieldName)
           onAuthFailure?.()
           throw new ApiError(translate('api.authRequired'), 401)
         }
         if (res.statusCode >= 400) {
           throw new ApiError((body as any)?.message || translate('api.uploadFailed'), res.statusCode, (body as any)?.errors)
         }
         return body
       } catch (err: any) {
         if (err instanceof ApiError) throw err
         throw new ApiError(err.errMsg || err.message || translate('api.uploadFailed'), 0)
       }
     })()
   },
 }
