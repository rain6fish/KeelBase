// SPDX-License-Identifier: Apache-2.0

import { defineStore } from 'pinia'

/** 网络连接状态（Taro→Vue3 迁移：zustand → pinia）：在线/离线标记（offline-banner 组件用）。 */
export const useConnectivityStore = defineStore('connectivity', {
  state: () => ({
    isOnline: true,
  }),
  actions: {
    setOnline(online: boolean) {
      this.isOnline = online
    },
  },
})
