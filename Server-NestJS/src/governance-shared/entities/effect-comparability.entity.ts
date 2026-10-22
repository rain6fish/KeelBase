// SPDX-License-Identifier: Apache-2.0

import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

/**
 * REV-17: **one row per revoke attempt** that reached the comparison — the comparability record's history.
 *
 * REV-14 put "what this revoke promised to compare but could not" on a single column of the root row.
 * One column holds one reading, so the next attempt overwrote it: a pass with nothing to report wrote
 * `null`, and a later `null` is indistinguishable from "this row was never revoked". A promise broken in
 * attempt 1 could be gone by attempt 2 with nothing left to show it happened.
 *
 * Append-only, one row per attempt, because the thing being recorded is an **event**, not a state. The
 * `checked` value keeps the two readings apart at the source: `diff` carries the promised/uncomparable
 * sets, `clean` records that this attempt reached the comparison and had nothing to report. `clean` is
 * therefore *knowledge* — the absence of a row is the absence of a check.
 *
 * **Not a chain concern by construction**: the previous carrier was a chain-external column, and a
 * separate table cannot enter `_chainPayload` at all. Nothing here can break an existing chain.
 *
 * REV-17：**每次走到比对的撤销尝试一行** —— 可比性记录的历史。
 *
 * REV-14 把「这次撤销承诺要查、却没能查到的那些」放在根行的**单列**上。一列只装一个读数，于是下一次尝试
 * 会把它覆盖：一次无可报的比对写 `null`，而事后的 `null` 与「该行从未被撤销」分不开。第一次尝试里被
 * 破掉的承诺，到第二次尝试可能已消失，且不留任何痕迹。
 *
 * 追加式、每次尝试一行，因为被记录的是**事件**而不是状态。`checked` 把两种读数在源头就分开：`diff` 带
 * promised/uncomparable 两个集合，`clean` 记下「这次走到了比对、无可报」。故 `clean` 是**知识**——
 * 而没有行就是没有查过。
 *
 * **结构上不涉链**：原载体是链外列，而独立表根本无法进入 `_chainPayload`。这里不会有任何东西弄坏既有链。
 */
@Index(['effectId'])
@Entity('ai_tool_effect_comparability')
export class EffectComparability {
  @PrimaryGeneratedColumn()
  id!: number;

  /** 根副作用行 id（组级写在组根上、单目标行写在自己身上）——读侧按它取历史 */
  @Column({ name: 'effect_id' })
  effectId!: number;

  /** `diff` = 这次有承诺却比不到的成员；`clean` = 走到了比对、无可报 */
  @Column({ length: 16 })
  checked!: 'diff' | 'clean';

  /** `checked='diff'` 时的承诺集合（JSON）；`clean` 时为 null */
  @Column({ type: 'text', nullable: true })
  promised?: string | null;

  /** `checked='diff'` 时比不到的成员（JSON，含 reason）；`clean` 时为 null */
  @Column({ type: 'text', nullable: true })
  uncomparable?: string | null;

  @CreateDateColumn({ name: 'at' })
  at!: Date;
}
