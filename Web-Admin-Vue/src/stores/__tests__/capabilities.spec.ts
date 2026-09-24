// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useCapabilitiesStore } from '@/stores/capabilities'
import { capabilitiesApi } from '@/api/capabilities'
import {
  FALLBACK_CURRENCY_SYMBOL,
  formatMoney,
  getCurrencySymbol,
  setCurrencySymbol,
} from '@/utils/money'

vi.mock('@/api/capabilities', () => ({
  capabilitiesApi: { get: vi.fn() },
}))

const mockedGet = vi.mocked(capabilitiesApi.get)

describe('capabilities store (MOD-4)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockedGet.mockReset()
    // 币种是模块级状态；用例之间复位，免得上一条改了符号影响下一条。
    setCurrencySymbol(FALLBACK_CURRENCY_SYMBOL)
  })

  it('未加载时默认全部模块开启（不误隐藏导航）', () => {
    const store = useCapabilitiesStore()
    expect(store.isModuleEnabled('events')).toBe(true)
    expect(store.isModuleEnabled('posts')).toBe(true)
  })

  it('加载后按 businessModules 判断启用', async () => {
    mockedGet.mockResolvedValue({
      preset: 'lite',
      features: { ai: true, search: false },
      businessModules: [
        { id: 'events', label: '事件' },
        { id: 'todos', label: '待办' },
      ],
    })
    const store = useCapabilitiesStore()
    await store.load()

    expect(store.isModuleEnabled('events')).toBe(true)
    expect(store.isModuleEnabled('tags')).toBe(false)
    expect(store.isModuleEnabled('posts')).toBe(false)
  })

  it('加载失败保持默认全开', async () => {
    mockedGet.mockRejectedValue(new Error('network'))
    const store = useCapabilitiesStore()
    await store.load()

    expect(store.isModuleEnabled('tags')).toBe(true)
  })

  it('加载后应用服务端下发的币种符号（契约 v2），金额随之以该符号显示', async () => {
    mockedGet.mockResolvedValue({
      preset: 'full',
      features: {},
      businessModules: [],
      display: { currencySymbol: '$' },
    })
    const store = useCapabilitiesStore()
    await store.load()

    expect(getCurrencySymbol()).toBe('$')
    expect(formatMoney(1234.5)).toBe('$1,234.50')
  })

  it('服务端未带 display（早于该字段）→ 币种回落兜底值，不被清空', async () => {
    mockedGet.mockResolvedValue({ preset: 'full', features: {}, businessModules: [] })
    const store = useCapabilitiesStore()
    await store.load()

    expect(getCurrencySymbol()).toBe(FALLBACK_CURRENCY_SYMBOL)
  })
})
