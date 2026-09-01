// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it } from 'vitest'
import { useSnackbarStore } from '@/stores/snackbar'

function resetStore() {
  useSnackbarStore.setState({ items: [], _seq: 0 })
}

describe('snackbar store', () => {
  beforeEach(resetStore)

  it('pushes and dismisses items', () => {
    const store = useSnackbarStore.getState()
    store.show('hello', 'info', 60000)
    expect(useSnackbarStore.getState().items.length).toBe(1)
    const id = useSnackbarStore.getState().items[0].id
    expect(useSnackbarStore.getState().items[0].message).toBe('hello')
    useSnackbarStore.getState().dismiss(id)
    expect(useSnackbarStore.getState().items.length).toBe(0)
  })

  it('success/error helpers set the right type', () => {
    const store = useSnackbarStore.getState()
    store.success('ok', 60000)
    store.error('bad', 60000)
    const types = useSnackbarStore.getState().items.map((s) => s.type)
    expect(types).toContain('success')
    expect(types).toContain('error')
  })
})
