// SPDX-License-Identifier: Apache-2.0

import { defineStore } from 'pinia'
import { postsService } from '../services/posts-service'
import type { PostItem, CreatePostRequest } from '../types/posts'

/** 帖子状态（Taro Vue3，pinia）：列表 + 增/删，乐观更新。 */
export const usePostsStore = defineStore('posts', {
  state: () => ({
    items: [] as PostItem[],
    isLoading: false,
    error: null as string | null,
  }),
  actions: {
    async load() {
      this.isLoading = true
      this.error = null
      try {
        this.items = await postsService.getPosts()
      } catch (err: any) {
        this.error = err.message || 'Failed to load 帖子'
      } finally {
        this.isLoading = false
      }
    },

    async add(dto: CreatePostRequest) {
      const item = await postsService.create(dto)
      this.items = [...this.items, item]
    },

    async remove(id: number) {
      const prev = this.items
      this.items = prev.filter((i) => i.id !== id)
      try {
        await postsService.remove(id)
      } catch (err: any) {
        this.items = prev
        throw new Error(err.message || 'Failed to delete post')
      }
    },
  },
})
