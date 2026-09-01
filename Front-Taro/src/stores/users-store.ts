// SPDX-License-Identifier: Apache-2.0

import { defineStore } from 'pinia'
import { usersService } from '../services/users-service'
import { translate } from '../i18n/translate'
import type { UserItem } from '../types/user'

/** 用户列表状态（Taro→Vue3 迁移：zustand → pinia）：分页加载 + 刷新。 */
export const useUsersStore = defineStore('users', {
  state: () => ({
    users: [] as UserItem[],
    total: 0,
    page: 1,
    isLoading: false,
    hasMore: true,
    error: null as string | null,
  }),
  actions: {
    async loadUsers(refresh = false) {
      if (this.isLoading || (!refresh && !this.hasMore)) return

      const page = refresh ? 1 : this.page
      this.isLoading = true
      this.error = null

      try {
        const result = await usersService.getUsers(page)
        this.users = refresh ? result.items : [...this.users, ...result.items]
        this.total = result.total
        this.page = page + 1
        this.isLoading = false
        this.hasMore = page * 20 < result.total
      } catch (err: any) {
        this.error = err.message || translate('users.loadFailed')
        this.isLoading = false
      }
    },

    clearUsers() {
      this.users = []
      this.total = 0
      this.page = 1
      this.hasMore = true
      this.error = null
    },
  },
})
