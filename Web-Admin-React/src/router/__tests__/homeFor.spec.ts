import { describe, expect, it } from 'vitest'
import { homeFor } from '@/router/AuthGate'

describe('homeFor', () => {
  it('routes admin to console dashboard', () => {
    expect(homeFor('admin')).toBe('/')
  })
  it('routes other roles to workbench', () => {
    expect(homeFor('user')).toBe('/workbench')
  })
  it('defaults to workbench when role is unknown', () => {
    expect(homeFor(undefined)).toBe('/workbench')
  })
})
