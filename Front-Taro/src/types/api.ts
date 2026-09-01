// SPDX-License-Identifier: Apache-2.0

 /** Generic API response wrapper matching the backend format */
 export interface ApiResponse<T = any> {
   code: number
   message: string
   data: T
   timestamp: string
 }
 
 export interface PaginatedList<T> {
   items: T[]
   total: number
   page: number
   limit: number
 }
 
 export function isSuccess(code: number): boolean {
   return code >= 200 && code < 300
 }
