// SPDX-License-Identifier: Apache-2.0

import { sortKeys } from '../../common/canonical-json';

/**
 * REV-6 — the identity verdict is **three-valued**, and the third value carries its reason.
 *
 * An effect identity answers two questions at once: *which target* (`result_type` + `result_id`,
 * always present) and *which change* (`before_snapshot` / `after_snapshot`, nullable — captured only
 * when a snapshot captor is wired). Before this slice the only identity reading was a boolean, so
 * "nobody captured this member" and "captured and matched" produced the same verdict, and an
 * incomparable member defaulted to `complete`.
 *
 * The third state is `incomparable`; it is never derived from a placeholder. Backfilling `''`,
 * `'null'` or `hash('')` would give every uncaptured row *the same* identity, every reverse index
 * would collide, and the gate would end up switched off as noise. `null` is the one value a reader
 * can exclude explicitly — so an uncomparable member carries `change: null`, never a constant.
 *
 * This judgement changes no revoke conclusion (REV-5 stands): it only makes the identity readable.
 *
 * REV-6 —— 身份判定是**三值**的，且第三值携带理由。
 *
 * effect 身份同时回答两件事：*哪个目标*（`result_type` + `result_id`，恒有值）与*哪个变更*
 *（`before_snapshot` / `after_snapshot`，可空 —— 只在接了快照捕获器时捕获）。本切片之前唯一的身份读数
 * 是个布尔，于是「没人捕获过」与「捕获到且一致」给出同一个判定，不可比成员默认落进 `complete`。
 *
 * 第三态是 `incomparable`；它绝不从占位值推导。回填 `''` / `'null'` / `hash('')` 会让所有未捕获行
 * 共享**同一个**身份、反向索引全部碰撞，闸门最终被当噪音关掉。`null` 是读者唯一能显式排除的值 ——
 * 故不可比成员携带 `change: null`，绝不是常量。
 *
 * 本判定不改任何撤销结论（REV-5 不动）：它只让身份可读。
 */

/** Why a member's change half cannot be compared. */
export type IdentityIncomparableReason =
  /** Neither side recorded — nothing was captured (the no-captor / external-write shape). */
  | 'not_captured'
  /** The prior state was recorded but the resulting state was not (only one side). */
  | 'after_missing'
  /** Recorded, but carries nothing (`null`, `{}`, `[]`, whitespace). */
  | 'empty_snapshot'
  /** Recorded, but is not valid JSON — a fault, never read as content. */
  | 'unparsable';

/** The identity-bearing columns of one side effect. */
export interface IdentityCarrier {
  id?: number | null;
  beforeSnapshot?: string | null;
  afterSnapshot?: string | null;
}

export interface IdentityMemberReading {
  effectId: number | null;
  /**
   * Canonical `{ before, after }` content — the identity value — or `null` when this member cannot
   * be compared. `null` is the explicit absence sentinel; it is never replaced by a placeholder.
   */
  change: string | null;
  /** Present only when `change` is `null`. */
  reason?: IdentityIncomparableReason;
}

export type EffectIdentityVerdict =
  | { state: 'complete'; members: IdentityMemberReading[] }
  | { state: 'disputed'; members: IdentityMemberReading[]; differences: string[] }
  | { state: 'incomparable'; members: IdentityMemberReading[] };

type SideReading =
  | { kind: 'absent' }
  | { kind: 'empty' }
  | { kind: 'unparsable' }
  | { kind: 'content'; value: unknown };

function readSide(raw: string | null | undefined): SideReading {
  if (raw == null) return { kind: 'absent' };
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { kind: 'empty' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { kind: 'unparsable' };
  }
  // `"null"`, `{}`, `[]` all *look* like a snapshot but carry nothing. Reading them as content is
  // exactly the placeholder trap: every such row would then share one comparable identity.
  if (parsed == null) return { kind: 'empty' };
  if (Array.isArray(parsed)) return parsed.length === 0 ? { kind: 'empty' } : { kind: 'content', value: parsed };
  if (typeof parsed === 'object' && Object.keys(parsed as Record<string, unknown>).length === 0) {
    return { kind: 'empty' };
  }
  return { kind: 'content', value: parsed };
}

function readMember(carrier: IdentityCarrier): {
  reading: IdentityMemberReading;
  before: SideReading;
  after: SideReading;
} {
  const before = readSide(carrier.beforeSnapshot);
  const after = readSide(carrier.afterSnapshot);
  const effectId = carrier.id ?? null;

  if (after.kind === 'absent') {
    // `before` absent too = nothing captured; `before` present = only one side captured.
    const reason: IdentityIncomparableReason =
      before.kind === 'absent' ? 'not_captured' : 'after_missing';
    return { reading: { effectId, change: null, reason }, before, after };
  }
  if (after.kind === 'empty') return { reading: { effectId, change: null, reason: 'empty_snapshot' }, before, after };
  if (after.kind === 'unparsable') return { reading: { effectId, change: null, reason: 'unparsable' }, before, after };
  // An absent `before` is legitimate (create tools have no prior state); an unreadable one is not.
  if (before.kind === 'empty') return { reading: { effectId, change: null, reason: 'empty_snapshot' }, before, after };
  if (before.kind === 'unparsable') return { reading: { effectId, change: null, reason: 'unparsable' }, before, after };

  const change = JSON.stringify(
    sortKeys({ before: before.kind === 'content' ? before.value : null, after: after.value }),
  );
  return { reading: { effectId, change }, before, after };
}

function objectOf(side: SideReading): Record<string, unknown> | null {
  return side.kind === 'content' && side.value && typeof side.value === 'object' && !Array.isArray(side.value)
    ? (side.value as Record<string, unknown>)
    : null;
}

/**
 * Which fields differ across members. Same shape as the revoke comparability reading: name the
 * fields, not a verdict, so a reader can act on the difference instead of guessing at it.
 *
 * 成员之间哪些字段不同。与撤销可比性读数同形：给出字段名而非结论，读者能据此行动，而不是猜。
 */
function diffFields(readings: Array<{ before: SideReading; after: SideReading }>): string[] {
  const fields = new Set<string>();
  for (const side of ['before', 'after'] as const) {
    const values = readings.map((r) => objectOf(r[side]));
    // Whole-side presence differs (one has the prior state, another does not): report the side.
    if (new Set(values.map((v) => (v == null ? 'absent' : 'present'))).size > 1) fields.add(side);
    const keys = new Set(values.flatMap((v) => (v ? Object.keys(v) : [])));
    for (const key of keys) {
      const rendered = values.map((v) => JSON.stringify(v ? v[key] : null));
      if (new Set(rendered).size > 1) fields.add(`${side}.${key}`);
    }
  }
  return [...fields].sort();
}

/**
 * Judge the identity of the effects that claim one target.
 *
 * - any member whose change cannot be read ⇒ `incomparable` (**never** `complete`);
 * - all readable and equal ⇒ `complete`;
 * - all readable but different ⇒ `disputed`, naming the differing fields.
 *
 * Callers pass the effects sharing one `result_type` + `result_id`; an empty list is nothing to
 * compare and is reported as `incomparable` rather than as a vacuous `complete`.
 *
 * 判定主张同一目标的那些 effect 的身份。
 *
 * - 任一成员的变更读不出来 ⇒ `incomparable`（**绝不** `complete`）；
 * - 全部可读且相等 ⇒ `complete`；
 * - 全部可读但不同 ⇒ `disputed`，并给出不同字段。
 *
 * 调用方传入共享同一 `result_type` + `result_id` 的 effect；空列表没有可比较的东西，如实报
 * `incomparable`，而不是空洞的 `complete`。
 */
export function judgeEffectIdentity(members: IdentityCarrier[]): EffectIdentityVerdict {
  const readings = members.map(readMember);
  const projected = readings.map((r) => r.reading);

  if (readings.length === 0 || projected.some((m) => m.change === null)) {
    return { state: 'incomparable', members: projected };
  }
  if (projected.every((m) => m.change === projected[0].change)) {
    return { state: 'complete', members: projected };
  }
  return { state: 'disputed', members: projected, differences: diffFields(readings) };
}
