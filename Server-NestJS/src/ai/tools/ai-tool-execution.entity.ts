// SPDX-License-Identifier: Apache-2.0

import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * ACT-5: **one row per attempt to run a write tool** — the execution identity.
 *
 * `executeWrite` used to be `check → execute → record`: the idempotency probe read a key and the
 * anchor row carrying that key was written only *after* the tool ran. Between the two there was
 * nothing, so two concurrent calls with the same arguments each missed the probe and each executed,
 * and a retry after a crash re-executed a write that may already have landed
 * (`docs/failure-path-corpus.spec.md` FP-10 has recorded that window all along). The unique key
 * guarded the **ledger**, never the **action**. This row is fixed *before* the tool runs, which is
 * what turns the probe into a gate.
 *
 * **The key is the existing one** — `AiToolEffectsService.buildKey`, not a parallel invention. Both
 * this row and the side-effect row it leads to are derived from it, which is why they need no
 * reference column between them: `compensationGroup ?? idempotencyKey` on an effect **is** this
 * row's `idempotency_key` by construction (single-target rows use the latter, group members the
 * former). And because this row also carries the authorization it relied on, the record can now
 * answer what REV-7 left open: which authorization, and therefore which window, this write stood on.
 *
 * **The execution axis keeps R4's column shape** (`claimed → settled | error`, one lease) so a
 * reader does not have to learn a second vocabulary — but its *stale* reading deliberately differs:
 * see `tool-execution-claim.ts`.
 *
 * ACT-5：**一次写工具的执行尝试一行** —— 执行身份。
 *
 * `executeWrite` 此前是 `check → execute → record`：幂等探测读一个键，而承载该键的锚行**跑完才写**。
 * 两者之间**什么都没有**，于是并发两次同参数调用**各miss探测、各执行一次**，崩溃后的重试也会把
 * 可能已经落地的写**再执行一次**（`docs/failure-path-corpus.spec.md` 的 FP-10 一直记着这个窗口）。
 * 唯一键护的是**账**，从不是**动作**。本行在工具跑起来**之前**落定，这正是把探测变成闸门的那个东西。
 *
 * **键就是既有的那个** —— `AiToolEffectsService.buildKey`，不是另造的平行物。本行与它引出的副作用行
 * 都从它派生，故两者之间**不需要引用列**：副作用行上的 `compensationGroup ?? idempotencyKey` **构造上
 * 就是**本行的 `idempotency_key`（单目标行取后者、成组成员取前者）。又因为本行还带着它依据的那次授权，
 * 记录从此答得出 REV-7 留的那个口子：这次写站在哪次授权、因而在哪个窗口上。
 */
@Entity('ai_tool_executions')
export class AiToolExecution {
  @PrimaryGeneratedColumn()
  id!: number;

  /**
   * The claim key — the same value `AiToolEffectsService.buildKey` produces for this call
   * (`sha256(userId:conversationId:toolName:canonicalArgs)`). Unique, and therefore the arbitration
   * point: of two racers, exactly one inserts.
   *
   * 认领键 —— 与 `buildKey` 为这次调用产出的值**同一个**。唯一，故它就是仲裁点：两个并发者里只有一个插得进。
   */
  @Column({ length: 64, unique: true, name: 'idempotency_key' })
  idempotencyKey!: string;

  @Column({ name: 'user_id' })
  userId!: string;

  @Column({ type: 'varchar', length: 64, nullable: true, name: 'conversation_id' })
  conversationId?: string | null;

  /** The run-level authorization this write belonged to, when it had one (`= run` confirmation token). */
  @Column({ type: 'varchar', length: 64, nullable: true, name: 'run_id' })
  runId?: string | null;

  @Column({ length: 64, name: 'tool_name' })
  toolName!: string;

  /**
   * Where this write was aimed, resolved the same way the **trust scope** resolves it (ACT-3's
   * `destinationOf`). Kept because a write to another destination is a different write — the same
   * call against another system is not a replay of this one.
   *
   * 这次写指向哪里，与**免确认作用域**同一套解析（ACT-3 的 `destinationOf`）。留着是因为写到另一个
   * 目的地就是另一次写 —— 同一次调用打到另一个系统，并不是这一次的重放。
   */
  @Column({ type: 'varchar', length: 64, nullable: true, name: 'destination' })
  destination?: string | null;

  /**
   * REV-7's missing reference: **the authorization this execution relied on** (the confirmation /
   * approval token). `null` = no authorization was involved (an auto write inside a trusted scope),
   * which is itself the honest answer — there is no window because there was no approval.
   *
   * REV-7 缺的那条引用：**这次执行依据的那次授权**（确认 / 审批 token）。`null` = 没有授权参与
   * （受信任作用域内的自动写），而这本身就是诚实的答案 —— 没有审批，也就没有窗口。
   */
  @Column({ type: 'varchar', length: 64, nullable: true, name: 'authorization_ref' })
  authorizationRef?: string | null;

  /** Who was acting for the user (same source as the audit row's `agent_id`); fixed before execution. */
  @Column({ type: 'varchar', length: 64, nullable: true, name: 'agent_id' })
  agentId?: string | null;

  /**
   * The `ai_audit_logs` row written for this execution — what lets the evidence root pair an effect
   * with **its own** trigger instead of guessing among same-named calls in a conversation (ACT-2).
   * `null` on rows whose audit row was not linked (a driver without the audit, a degraded assembly).
   *
   * 本次执行写下的那条 `ai_audit_logs` 行 —— 证据根因此能配到 effect **自己**的那条触发行，而不必在
   * 会话里的同名调用之间猜（ACT-2）。`null` = 这条执行行没被挂上审计行（没有审计的驱动、降级装配）。
   */
  @Column({ type: 'integer', nullable: true, name: 'audit_row_id' })
  auditRowId?: number | null;

  /**
   * Settled at — written when the tool returned **success**. A row that is never settled is *not* a
   * failure: we cannot tell a crash from a hang, and calling it either way would be a claim we cannot
   * support (see `deriveToolExecutionState`).
   *
   * 落定时刻 —— 工具**成功**返回时写。从未落定的行**不是**失败：崩溃与挂起无从分辨，两者任称其一
   * 都是我们支撑不起的断言（见 `deriveToolExecutionState`）。
   */
  @Column({ type: Date, nullable: true, name: 'settled_at' })
  settledAt?: Date | null;

  /** A **recorded** failure message (the tool returned one). Distinct from "never settled". */
  @Column({ type: 'text', nullable: true, name: 'error' })
  error?: string | null;

  /**
   * When the claim was made — the row's own creation. R4 keeps a separate `execution_claimed_at`
   * because there the row (a confirmation) predates its claim; here the row **is** the claim, so a
   * second column would be the same instant under two names.
   *
   * 认领时刻 —— 就是本行的创建时刻。R4 另立 `execution_claimed_at`，是因为那里行（确认）先于认领存在；
   * 这里行**就是**认领，再加一列只会是同一个时刻的两个名字。
   */
  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
