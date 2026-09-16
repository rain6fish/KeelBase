// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest'
import zh from '@/i18n/zh'
import { revokeClassTag } from '../revokeClass'

/** 直取 key 的假 t（与 i18n 真源同表，避免第二套文案） */
const t = (key: string) => String((zh as unknown as Record<string, unknown>)[key])

describe('revokeClassTag（KB-6 撤销档位展示映射，工具治理页 + 确认卡共用）', () => {
  it('四档各自映射到对应文案与 tag 类型', () => {
    expect(revokeClassTag('local_compensate', t)).toEqual({ label: '可撤销（本地）', type: 'success' })
    expect(revokeClassTag('governed_external', t)).toEqual({ label: '可撤销（需外部补偿）', type: 'warning' })
    expect(revokeClassTag('transactional', t)).toEqual({ label: '可撤销（事务回滚）', type: 'primary' })
    expect(revokeClassTag('none', t)).toEqual({ label: '不可撤销', type: 'info' })
  })

  it('未知/缺省档位按不可撤销显示——不猜"可撤销"', () => {
    expect(revokeClassTag(undefined, t).label).toBe('不可撤销')
    expect(revokeClassTag('', t).label).toBe('不可撤销')
    expect(revokeClassTag('legacy_unknown', t).label).toBe('不可撤销')
  })
})
