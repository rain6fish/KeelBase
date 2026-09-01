// SPDX-License-Identifier: Apache-2.0

import { defineStore } from 'pinia'
import { tagsService } from '../services/tags-service'
import { translate } from '../i18n/translate'
import type { TagItem, CreateTagRequest } from '../types/tags'

/** 标签状态（Taro Vue3，pinia）：列表 + 增/删，乐观更新。 */
export const useTagsStore = defineStore('tags', {
  state: () => ({
    items: [] as TagItem[],
    isLoading: false,
    error: null as string | null,
  }),
  actions: {
    async load() {
      this.isLoading = true
      this.error = null
      try {
        this.items = await tagsService.getTags()
      } catch (err: any) {
        this.error = err.message || translate('tags.loadFailed')
      } finally {
        this.isLoading = false
      }
    },

    async add(dto: CreateTagRequest) {
      const item = await tagsService.create(dto)
      this.items = [...this.items, item]
    },

    async remove(id: number) {
      const prev = this.items
      this.items = prev.filter((i) => i.id !== id)
      try {
        await tagsService.remove(id)
      } catch (err: any) {
        this.items = prev
        throw new Error(err.message || translate('tags.deleteFailed'))
      }
    },
  },
})
