// SPDX-License-Identifier: Apache-2.0

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * 0-B retention: the body of one tool call, kept off-chain so a truncated result can be checked.
 *
 * Why a table and not a column on `ai_audit_logs`: that table is the main table every audit list,
 * statistic and export reads, and a body column would ride along on all of them. The side-effect
 * snapshots already answer the same question the same way — a separate table, not part of the hash
 * chain, pure display/evidence content.
 *
 * One row per audited tool call, anchored by `audit_row_id` (unique, hence idempotent on retry). The
 * chain is untouched: nothing here enters `buildPayload`, so `/audit/verify` behaves word for word as
 * before, and the audit row's width never grows.
 *
 * 0-B 留存：一次工具调用的结果正文，链外存放，使被截断的结果事后可核对。
 *
 * 为什么是独立表而不是给 `ai_audit_logs` 加列：那是所有审计列表、统计与导出读的主表，正文列会被
 * 每一次读取拖上。副作用快照早已用同一种答案回答过同一个问题 —— 独立表、不入哈希链、纯展示/证据内容。
 *
 * 每条有审计行的工具调用一行，以 `audit_row_id` 唯一锚定（因此重试幂等）。链不受影响：这里没有任何
 * 东西进 `buildPayload`，故 `/audit/verify` 行为逐字不变，审计行行宽也从不增长。
 */
@Entity('ai_tool_result_bodies')
@Index(['conversationId'])
@Index(['expiresAt'])
export class AiToolResultBody {
  @PrimaryGeneratedColumn()
  id!: number;

  /**
   * The `ai_audit_logs.id` this body belongs to. Logical link only — no foreign key, matching the
   * rest of the repository. Unique: one retained body per audited call.
   *
   * 本正文所属的 `ai_audit_logs.id`。仅逻辑关联 —— 不建外键，与仓内其余表一致。唯一：一次有审计的
   * 调用只留一份正文。
   */
  @Index(['auditRowId'], { unique: true })
  @Column({ name: 'audit_row_id' })
  auditRowId!: number;

  // Explicit `type` on every nullable union: `string | null` reflects as `Object` and TypeORM throws
  // `DataTypeNotSupportedError` (same reason as `AiAuditLog.guestId`).
  // 所有 nullable 联合类型都显式写 `type`：`string | null` 反射为 `Object`，TypeORM 会抛
  // `DataTypeNotSupportedError`（与 `AiAuditLog.guestId` 同一理由）。
  @Column({ type: 'varchar', length: 64, nullable: true, name: 'conversation_id' })
  conversationId?: string | null;

  @Column({ length: 64, name: 'user_id' })
  userId!: string;

  @Column({ length: 64, name: 'tool_name' })
  toolName!: string;

  /** `executed` | `failed` — the same two words `toolCallOutcome` uses for a ran call. */
  @Column({ length: 16 })
  outcome!: string;

  /**
   * `stored` — the full (masked) body is in `body_text`;
   * `capped` — the body exceeded `TOOL_RESULT_BODY_MAX_BYTES`, so only the model-facing projection
   *            (if any) and the size/hash commitment are kept;
   * `expired` — the retention window passed; all text is gone, the commitments remain.
   *
   * `stored` —— 完整（已脱敏）正文在 `body_text`；
   * `capped` —— 正文超过 `TOOL_RESULT_BODY_MAX_BYTES`，只留模型投影（若有）与大小/哈希承诺；
   * `expired` —— 保留期已过，文本清空，承诺仍在。
   */
  @Column({ length: 16, name: 'body_state' })
  bodyState!: string;

  /** Masked full body (UTF-8 text). Null for `capped` / `expired`. */
  @Column({ type: 'text', nullable: true, name: 'body_text' })
  bodyText?: string | null;

  /** UTF-8 bytes of the *original* full serialized result, whether or not the text was stored. */
  @Column({ name: 'body_bytes' })
  bodyBytes!: number;

  /** UTF-8 bytes of `body_text` as stored. Null when no text is stored. */
  @Column({ type: 'integer', nullable: true, name: 'stored_bytes' })
  storedBytes?: number | null;

  /**
   * sha256 of `body_text` as stored, computed at write time. Kept after expiry as a commitment: it
   * can no longer be recomputed once the text is gone, so the API must not call it "verifiable".
   *
   * 写入时 `body_text` 的 sha256。过期后保留为承诺：文本一旦清除便不可再复算，故 API 不得把它
   * 说成「可复核」。
   */
  @Column({ type: 'varchar', length: 64, nullable: true, name: 'body_sha256' })
  bodySha256?: string | null;

  /**
   * sha256 of the original (pre-masking) full serialized result. A commitment to a value that is not
   * retained; it means something only if a copy exists elsewhere. Never presented as "preserved".
   *
   * 原始（未脱敏）完整序列化结果的 sha256。对**未留存**值的承诺；只有别处另有副本时才有意义。
   * 永不对外宣称「已保全」。
   */
  @Column({ type: 'varchar', length: 64, nullable: true, name: 'original_sha256' })
  originalSha256?: string | null;

  /**
   * Exactly the text handed to the model (≤ the 4000-char projection budget, already masked). Null on
   * paths where no model saw the result (R4 executor, MCP export).
   *
   * 交给模型的那份原样文本（≤4000 字符预算，已脱敏）。没有模型看到结果的路径（R4 执行器、MCP 出口）
   * 为 null。
   */
  @Column({ type: 'text', nullable: true, name: 'model_text' })
  modelText?: string | null;

  @Column({ type: 'integer', nullable: true, name: 'model_chars' })
  modelChars?: number | null;

  @Column({ type: 'varchar', length: 64, nullable: true, name: 'model_sha256' })
  modelSha256?: string | null;

  /** Whether the model-facing projection dropped anything from the full result. */
  @Column({ default: false, name: 'was_truncated' })
  wasTruncated!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @Column({ type: 'datetime', name: 'expires_at' })
  expiresAt!: Date;
}
