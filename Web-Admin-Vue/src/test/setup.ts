// SPDX-License-Identifier: Apache-2.0

import { beforeEach } from 'vitest'

// 每个用例前清空 localStorage（storage util 依赖它）
beforeEach(() => {
  localStorage.clear()
})
