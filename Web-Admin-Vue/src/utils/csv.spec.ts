// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, afterEach } from 'vitest'
import { downloadCsv } from './csv'

/**
 * The scope line is part of the artifact, not only of the call that asked for it: the file a reader
 * opens says which question it answers before the table does.
 *
 * 口径行是**导出件本身**的一部分，不只是调用方传了一个参数：读者打开文件时，表还没出现就先看到
 * 这份导出答的是哪个问题。
 */
describe('downloadCsv', () => {
  afterEach(() => vi.restoreAllMocks())

  function read(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(reader.error)
      reader.readAsText(blob)
    })
  }

  async function captured(
    headers: string[],
    rows: unknown[][],
    note?: string,
  ): Promise<string[]> {
    let blob: Blob | undefined
    // jsdom has no object-URL implementation, so the hook is installed rather than spied on.
    // jsdom 没有 object URL 实现，故是**装上**这个钩子、不是 spy 一个已有的。
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      writable: true,
      value: (value: Blob) => {
        blob = value
        return 'blob:test'
      },
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      writable: true,
      value: () => {},
    })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    downloadCsv('audit-six-answers', headers, rows, note)
    // The BOM is for Excel; the lines are what the reader sees.
    // BOM 是给 Excel 的；读者看到的是那些行。
    return (await read(blob!)).replace(/^\uFEFF/, '').split('\r\n')
  }

  it('writes the scope line before the header and leaves the columns untouched', async () => {
    const lines = await captured(
      ['Time (UTC)', 'Action'],
      [['2026-11-05 10:30:00 UTC', 'Create event']],
      '对象检索只含已落地的写',
    )

    expect(lines[0]).toBe('# 对象检索只含已落地的写')
    expect(lines[1]).toBe('Time (UTC),Action')
    expect(lines[2]).toBe('2026-11-05 10:30:00 UTC,Create event')
  })

  it('writes no scope line when the export is not an object search', async () => {
    const lines = await captured(['Action'], [['Create event']])

    expect(lines[0]).toBe('Action')
    expect(lines[1]).toBe('Create event')
  })

  it('quotes a scope line that contains a comma rather than splitting it into columns', async () => {
    const lines = await captured(['Action'], [], 'blocked, pending and declined calls are out')

    expect(lines[0]).toBe('"# blocked, pending and declined calls are out"')
  })
})
