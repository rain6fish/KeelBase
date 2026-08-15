import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useSnackbarStore } from '@/stores/snackbar'

describe('useSnackbarStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('show 追加条目并带默认类型 info', () => {
    const store = useSnackbarStore()
    store.show('加载中')
    expect(store.items).toHaveLength(1)
    expect(store.items[0]).toMatchObject({ message: '加载中', type: 'info' })
  })

  it('success / error / warning 使用对应类型与超时', () => {
    const store = useSnackbarStore()
    store.success('成功')
    store.error('失败')
    store.warning('警告')
    expect(store.items).toHaveLength(3)
    expect(store.items[0].type).toBe('success')
    expect(store.items[1].type).toBe('error')
    expect(store.items[2].type).toBe('info')
  })

  it('超时后自动 dismiss', () => {
    const store = useSnackbarStore()
    store.show('临时消息', 'info', 3000)
    expect(store.items).toHaveLength(1)

    vi.advanceTimersByTime(3000)
    expect(store.items).toHaveLength(0)
  })

  it('dismiss 移除指定 id', () => {
    const store = useSnackbarStore()
    store.show('a')
    const id = store.items[0].id
    store.dismiss(id)
    expect(store.items).toHaveLength(0)
  })
})
