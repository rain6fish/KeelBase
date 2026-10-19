// SPDX-License-Identifier: Apache-2.0

import { defineStore } from 'pinia'

/**
 * First-run trust setup visibility. The wizard is mounted once in `App.vue`; the settings page and
 * any other entry point open it through this store instead of duplicating the dialog.
 *
 * 首启信任配置向导的可见性。向导在 `App.vue` 挂载一次；设置页等入口通过本 store 打开，
 * 不重复挂载弹窗。
 */
export const useTrustSetupStore = defineStore('trustSetup', {
  state: () => ({
    visible: false,
  }),
  actions: {
    open() {
      this.visible = true
    },
    close() {
      this.visible = false
    },
  },
})
