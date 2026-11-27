// SPDX-License-Identifier: Apache-2.0

import { parseReleaseReadings } from './release-readings';

/**
 * The off-chain `releaseLookups` column is the single source for a release's reading kind. These
 * cases pin the parser the six-answer export and the evidence packages share: the newest kind is
 * judged by the export's existing rule, an unrecognised word is never echoed, and a malformed column
 * is «unreadable» rather than «no readings».
 *
 * 链外 `releaseLookups` 列是释放读数种类的唯一来源。这些用例钉住六问导出与证据包共用的解析器：
 * 最新种类沿用导出既有规则，认不出的词绝不回显，畸形列读作「读不出」而不是「没有读数」。
 */
describe('parseReleaseReadings', () => {
  const column = (items: unknown[], extra: Record<string, unknown> = {}): string =>
    JSON.stringify({ count: 2, askable: true, items, ...extra });

  it('returns the newest kind and the structured readings, newest first', () => {
    const parsed = parseReleaseReadings(
      column([
        { id: 12, at: '2026-11-01T10:00:00.000Z', conclusion: 'not_executed', reason: null, basis: 'receipt', lookedUpBy: 'admin' },
        { id: 11, at: '2026-11-01T09:00:00.000Z', conclusion: 'not_executed', reason: null, basis: 'current_state', lookedUpBy: 'admin' },
      ]),
    );

    expect(parsed).not.toBeNull();
    expect(parsed!.count).toBe(2);
    expect(parsed!.askable).toBe(true);
    expect(parsed!.askUnrecorded).toBe(false);
    expect(parsed!.latest).toBe('receipt');
    expect(parsed!.readings.map((r) => [r.id, r.basis])).toEqual([
      [12, 'receipt'],
      [11, 'current_state'],
    ]);
  });

  it('does not echo a kind this vocabulary does not know', () => {
    const parsed = parseReleaseReadings(
      column([{ id: 1, at: '2026-11-01T10:00:00.000Z', conclusion: 'not_executed', basis: 'event_log', lookedUpBy: 'admin' }]),
    );
    expect(parsed!.latest).toBe('unknown');
    expect(parsed!.readings[0].basis).toBe('unknown');
    expect(JSON.stringify(parsed)).not.toContain('event_log');
  });

  it('R-6b: `recorded: false` says this ask left no row', () => {
    const parsed = parseReleaseReadings(
      column([{ id: 1, at: '2026-11-01T10:00:00.000Z', conclusion: 'not_executed', basis: 'receipt', lookedUpBy: 'admin' }], {
        recorded: false,
      }),
    );
    expect(parsed!.askUnrecorded).toBe(true);
  });

  it('no copied items ⇒ latest null, readings empty; the release still has an entry', () => {
    const parsed = parseReleaseReadings(JSON.stringify({ count: 0, askable: true, items: [] }));
    expect(parsed).not.toBeNull();
    expect(parsed!.latest).toBeNull();
    expect(parsed!.readings).toEqual([]);
  });

  it('absent or unreadable ⇒ null (not a release), never a fabricated empty reading', () => {
    expect(parseReleaseReadings(null)).toBeNull();
    expect(parseReleaseReadings(undefined)).toBeNull();
    expect(parseReleaseReadings('')).toBeNull();
    expect(parseReleaseReadings('not-json')).toBeNull();
    expect(parseReleaseReadings('[]')).toBeNull();
  });

  it('the newest raw item decides `latest`, even when malformed items follow the established rule', () => {
    // An object without a kind is `unknown`; a non-object first item is as good as no item (`null`).
    // The structured list skips malformed entries instead of inventing them.
    // 对象但没有种类为 `unknown`；首个条目不是对象则当作没有条目（`null`）。结构化清单跳过畸形条目，
    // 而不是编造它们。
    expect(parseReleaseReadings(column([{ id: 1 }]))!.latest).toBe('unknown');
    expect(parseReleaseReadings(column(['broken', { id: 2, basis: 'receipt' }]))!.latest).toBeNull();
  });
});
