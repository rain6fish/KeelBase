// SPDX-License-Identifier: Apache-2.0

import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { TargetStatusConclusion } from '../../governance-core/target-status';

/**
 * AW-17: **one row per target-status lookup** — the evidence that a person asked the target whether a
 * write happened, and what it answered.
 *
 * The write claim row says *that* an external write's outcome is unknown; it cannot say *whether we
 * tried to find out*. Without this table, "never asked" and "asked and got no answer" would be the same
 * reading — the exact conflation REV-17 removed for comparability, and the reason this follows the
 * same shape: append-only, one row per attempt, because the thing recorded is an **event**.
 *
 * **Not a chain concern by construction**: a separate table cannot enter `_chainPayload`, so nothing
 * here can break an existing chain. It is evidence for a human, not a rewrite of any ledger state —
 * the ledger moves on the claim row, and only when the conclusion is a real answer.
 *
 * AW-17：**每次目标状态查询一行** —— 「有人问过目标这次写到底发生了没有、它怎么答的」这条证据。
 *
 * 占位行说的是「这笔外部写的结局未知」；它说不出「我们有没有去查」。没有这张表，「从没问过」与
 * 「问了没有答案」就是同一个读数 —— 正是 REV-17 为可比性消掉的那种混淆，也是本表沿用同一形状的理由：
 * 追加式、每次尝试一行，因为被记录的是**事件**。
 *
 * **结构上不涉链**：独立表进不了 `_chainPayload`，故这里没有任何东西会弄坏既有链。它是给人看的证据，
 * 不改写任何账本状态 —— 账本只在占位行上动，且只在结论是真答案时动。
 */
@Index(['idempotencyKey'])
@Entity('ai_target_status_lookups')
export class TargetStatusLookupRow {
  @PrimaryGeneratedColumn()
  id!: number;

  /** The claim's key (same value as `ai_write_claims.idempotency_key`) — what the query was about. */
  @Column({ length: 64, name: 'idempotency_key' })
  idempotencyKey!: string;

  @Column({ length: 64, name: 'tool_name' })
  toolName!: string;

  /** The administrator who asked. / 发起查询的管理员。 */
  @Column({ length: 64, name: 'looked_up_by' })
  lookedUpBy!: string;

  /**
   * Whose identity the query carried at the target. **The original writer, not the administrator** —
   * the target authorizes reading that user's record, and an admin's token would ask about a different
   * scope or be refused outright.
   *
   * 查询在目标侧携带的身份。**是原写入者，不是管理员** —— 目标按那个用户的权限放行读，管理员的 token
   * 要么看的是另一个范围、要么被直接拒。
   */
  @Column({ length: 64, name: 'as_user_id' })
  asUserId!: string;

  @Column({ length: 8, name: 'query_method' })
  queryMethod!: string;

  @Column({ length: 255, name: 'query_path' })
  queryPath!: string;

  /**
   * `executed` | `not_executed` | `unknown` — see `governance-core/target-status.ts`.
   *
   * The explicit `type: 'varchar'` is required: TypeORM infers a column type from the TS type, and a
   * union is inferred as `Object`, which sqlite refuses. Same writing as `release_reason` on the claim
   * row — the type stays narrow in code, the column stays a string.
   *
   * 显式 `type: 'varchar'` 是必需的：TypeORM 按 TS 类型推断列类型，联合类型会被推成 `Object`，而 sqlite
   * 拒绝它。写法与占位行的 `release_reason` 相同 —— 代码里的类型仍窄，列仍是字符串。
   */
  @Column({ type: 'varchar', length: 16 })
  conclusion!: TargetStatusConclusion;

  /** Why it is `unknown`; `null` for a real answer. / 为 `unknown` 的成因；真答案为 `null`。 */
  @Column({ type: 'varchar', length: 32, nullable: true })
  reason?: string | null;

  @CreateDateColumn({ name: 'at' })
  at!: Date;
}
