// SPDX-License-Identifier: Apache-2.0

import { api } from './api-client'
import type { PostItem, CreatePostRequest } from '../types/posts'

export const postsService = {
  getPosts(): Promise<PostItem[]> {
    return api.get<PostItem[]>('/posts').then((res) => res.data || [])
  },

  create(dto: CreatePostRequest): Promise<PostItem> {
    return api.post<PostItem>('/posts', dto).then((res) => res.data!)
  },

  remove(id: number): Promise<void> {
    return api.delete(`/posts/${id}`).then(() => {})
  },
}
