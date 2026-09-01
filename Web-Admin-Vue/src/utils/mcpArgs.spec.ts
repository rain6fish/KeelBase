// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'
import { buildArgumentsTemplate } from './mcpArgs'

describe('buildArgumentsTemplate', () => {
  it('空 schema 或 undefined 返回空对象', () => {
    expect(buildArgumentsTemplate(undefined)).toBe('{}')
    expect(buildArgumentsTemplate({})).toBe('{}')
  })

  it('按类型生成占位值', () => {
    const json = buildArgumentsTemplate({
      properties: {
        count: { type: 'integer' },
        ratio: { type: 'number' },
        active: { type: 'boolean' },
        tags: { type: 'array' },
      },
    })
    expect(JSON.parse(json)).toEqual({ count: 0, ratio: 0, active: false, tags: [] })
  })

  it('必填字符串给空串，可选字符串给 null', () => {
    const json = buildArgumentsTemplate({
      required: ['title'],
      properties: { title: { type: 'string' }, note: { type: 'string' } },
    })
    expect(JSON.parse(json)).toEqual({ title: '', note: null })
  })

  it('无 properties 时忽略 required', () => {
    expect(buildArgumentsTemplate({ required: ['x'] })).toBe('{}')
  })
})
