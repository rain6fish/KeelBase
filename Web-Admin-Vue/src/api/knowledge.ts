import { api } from './client'
import instance from './client'
import type { Paginated } from '@/types/api'
import type { KnowledgeArticle } from '@/types/admin'

export const knowledgeApi = {
  list(page = 1, limit = 20, q?: string): Promise<Paginated<KnowledgeArticle>> {
    return api.get<Paginated<KnowledgeArticle>>('/ai/knowledge', {
      page,
      limit,
      ...(q ? { q } : {}),
    })
  },
  create(data: { title: string; content: string; category?: string }): Promise<KnowledgeArticle> {
    return api.post<KnowledgeArticle>('/ai/knowledge', data)
  },
  update(id: number, data: { title?: string; content?: string; category?: string }): Promise<KnowledgeArticle> {
    return api.patch<KnowledgeArticle>(`/ai/knowledge/${id}`, data)
  },
  remove(id: number): Promise<null> {
    return api.delete<null>(`/ai/knowledge/${id}`)
  },
  upload(file: File, formData?: { title?: string; category?: string }): Promise<KnowledgeArticle> {
    const fd = new FormData()
    fd.append('file', file)
    if (formData?.title) fd.append('title', formData.title)
    if (formData?.category) fd.append('category', formData.category)
    // 用原始 axios 实例（拦截器带 Bearer + 解包），不走 multipart 手动拼 header
    // 响应拦截器已把 AxiosResponse 解包为 data，TS 类型需经 unknown 断言
    return instance.post('/ai/knowledge/upload', fd) as unknown as Promise<KnowledgeArticle>
  },
}
