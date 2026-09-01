// SPDX-License-Identifier: Apache-2.0

 import { api } from './api-client'
 
 export const uploadService = {
   async uploadFile(filePath: string): Promise<{ url: string; filename: string; size: number }> {
     const res = await api.upload<{ url: string; filename: string; size: number }>('/upload', filePath)
     return res.data!
   },
 }
