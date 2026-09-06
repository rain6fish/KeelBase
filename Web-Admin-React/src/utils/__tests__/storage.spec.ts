// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it } from 'vitest'
import { storage } from '@/utils/storage'
import { STORAGE_KEYS } from '@/utils/constants'

beforeEach(() => {
  localStorage.clear()
})

describe('storage token pair', () => {
  it('reads an empty token pair when nothing is stored', () => {
    expect(storage.readTokens()).toEqual({ accessToken: '', refreshToken: '' })
  })

  it('round-trips tokens under the admin_* keys', () => {
    storage.saveTokens('acc', 'ref')
    expect(localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN)).toBe('acc')
    expect(localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN)).toBe('ref')
    expect(storage.readTokens()).toEqual({ accessToken: 'acc', refreshToken: 'ref' })
  })

  it('clearTokens removes both token keys', () => {
    storage.saveTokens('acc', 'ref')
    storage.clearTokens()
    expect(localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN)).toBeNull()
    expect(localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN)).toBeNull()
    expect(storage.readTokens()).toEqual({ accessToken: '', refreshToken: '' })
  })
})

describe('storage generic get/set', () => {
  it('returns null for a missing key', () => {
    expect(storage.get('missing')).toBeNull()
  })

  it('set/get round-trips and removeKey deletes', () => {
    storage.set('pref', 'v')
    expect(storage.get('pref')).toBe('v')
    storage.removeKey('pref')
    expect(storage.get('pref')).toBeNull()
  })
})
