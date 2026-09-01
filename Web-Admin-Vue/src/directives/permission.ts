// SPDX-License-Identifier: Apache-2.0

import type { Directive } from 'vue'
import { useAuthStore } from '@/stores/auth'

/**
 * 渲染层权限指令（WEB-FRONT-2）：`v-permission="'user.manage'"`，无权限则移除元素。
 * 仅渲染层（隐藏 ≠ 越权），授权唯一来源仍是后端 CASL；permissions 未加载时保守隐藏。
 */
export const vPermission: Directive<HTMLElement, string> = {
  mounted(el, binding) {
    const auth = useAuthStore()
    if (binding.value && !auth.hasPermission(binding.value)) {
      el.parentNode?.removeChild(el)
    }
  },
}
