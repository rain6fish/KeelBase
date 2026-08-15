import instance from './client'
import type { ImportResult } from '@/types/admin'

export const importApi = {
  /** CSV 上传（multipart，字段名 file）。响应拦截器解包，TS 需 unknown 断言 */
  importUsers(file: File): Promise<ImportResult> {
    const fd = new FormData()
    fd.append('file', file)
    return instance.post('/admin/import/users', fd) as unknown as Promise<ImportResult>
  },
  importEvents(file: File): Promise<ImportResult> {
    const fd = new FormData()
    fd.append('file', file)
    return instance.post('/admin/import/events', fd) as unknown as Promise<ImportResult>
  },
}
