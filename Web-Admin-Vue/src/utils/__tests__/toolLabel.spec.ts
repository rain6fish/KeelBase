// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest'
import { toolKey, toolLabel } from '../toolLabel'

const feature = {
  'ai.tool.createFollowupTask': '创建跟进任务',
  'ai.tool.queryCustomers': '查询客户',
}

describe('toolLabel（D2 人类语言工具标签）', () => {
  it('toolKey：snake_case → camelCase', () => {
    expect(toolKey('create_followup_task')).toBe('createFollowupTask')
    expect(toolKey('query_customers')).toBe('queryCustomers')
  })

  it('toolLabel：命中 feature 命名空间 ai.tool.* 返回人类标签', () => {
    expect(toolLabel(feature, 'create_followup_task')).toBe('创建跟进任务')
  })

  it('toolLabel：未命中回退原始 toolName', () => {
    expect(toolLabel(feature, 'unknown_tool')).toBe('unknown_tool')
  })

  it('toolLabel：空值回退 -', () => {
    expect(toolLabel(feature, '')).toBe('-')
  })
})
