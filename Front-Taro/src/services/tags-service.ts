import { api } from './api-client'
import type { TagItem, CreateTagRequest } from '../types/tags'

export const tagsService = {
  getTags(): Promise<TagItem[]> {
    return api.get<TagItem[]>('/tags').then((res) => res.data || [])
  },

  create(dto: CreateTagRequest): Promise<TagItem> {
    return api.post<TagItem>('/tags', dto).then((res) => res.data!)
  },

  remove(id: number): Promise<void> {
    return api.delete(`/tags/${id}`).then(() => {})
  },
}
