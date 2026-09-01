// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useCapabilitiesStore } from '@/stores/capabilities'
import { capabilitiesApi } from '@/api/capabilities'

vi.mock('@/api/capabilities', () => ({
  capabilitiesApi: { get: vi.fn() },
}))

const mockedGet = vi.mocked(capabilitiesApi.get)

describe('capabilities store (MOD-4)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockedGet.mockReset()
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
})
