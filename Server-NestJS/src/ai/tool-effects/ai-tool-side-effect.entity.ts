// SPDX-License-Identifier: Apache-2.0

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * HS-3 AI 写操作副作用记录：每次 AI 写工具（create_event/create_todo）成功执行后落一条。
 * - idempotencyKey 唯一 → 同会话同参数重复调用返回已有结果（幂等），防 LLM 重试/并发重复创建
 * - resultType + resultId → 管理台可定位并软删对应记录（AI 副作用可撤销，衔接 RG-3 回收站）
 * - conversationId 索引：会话级批量撤销（revokeConversation）/轨迹查询按会话过滤，表随每次 AI 写单调增长
 */
@Index(['conversationId'])
@Entity('ai_tool_side_effects')
export class AiToolSideEffect {
  @PrimaryGeneratedColumn()
  id!: number;

  /** 幂等键：sha256(userId:conversationId:toolName:argsHash)，唯一 */
  @Column({ length: 64, unique: true, name: 'idempotency_key' })
  idempotencyKey!: string;

  @Column({ name: 'user_id' })
  userId!: string;

  @Column({ name: 'conversation_id', nullable: true })
  conversationId?: string;

  /**
   * KB-5 run 授权 id（= run 确认 token；docs/revoke-contract.spec.md §4 G1）——该副作用由哪次 run 一次性授权产生。
   * 仅 run 成员的副作用有值；单条确认/免确认写为 null。供 run 级批量撤销精确圈定（比 conversationId 更细）。
   */
  @Column({ length: 64, name: 'run_id', nullable: true })
  runId?: string;

  @Column({ length: 64, name: 'tool_name' })
  toolName!: string;

  /** 参数 hash（用于展示与追溯） */
  @Column({ length: 64, name: 'args_hash' })
  argsHash!: string;

  /** 副作用类型（旗舰别名 event/todo/crm_task/pm_task/app_request/contract/proxy_call；生成模块为其模块名，如 invoice） */
  @Column({ length: 64, name: 'result_type' })
  resultType!: string;

  /** 副作用目标记录 id（events/todos 主键） */
  @Column({ name: 'result_id' })
  resultId!: number;

  /** E-1 字段级变更审计：写操作目标记录变更前快照（JSON 字符串；create 类为 null，B 路径外部写无本地快照） */
  @Column({ type: 'text', nullable: true, name: 'before_snapshot' })
  beforeSnapshot?: string | null;

  /** E-1 字段级变更审计：写操作目标记录变更后快照（JSON 字符串，目标实体全量字段） */
  @Column({ type: 'text', nullable: true, name: 'after_snapshot' })
  afterSnapshot?: string | null;

  /** G-3（§internal.17 ① G-3）：副作用行哈希链——前一条已哈希行 hash（历史行 null → 不参与链；首个哈希行 genesis） */
  @Column({ type: 'varchar', length: 64, nullable: true, name: 'prev_hash' })
  prevHash?: string | null;

  /** G-3（§internal.17 ① G-3）：本条副作用内容 HMAC（防篡改/防插入；仅新行有值） */
  @Column({ type: 'varchar', length: 64, nullable: true, name: 'hash' })
  hash?: string | null;

  /**
   * KB-6：副作用发生时刻的撤销能力分档快照（none / local_compensate / governed_external / transactional）。
   * 工具/ProxyTool 配置可随 ai_proxy_tools 变更，副作用是历史事实须固化当时档位（语义源 protocol-trust-proof-card R9）。
   * 不入副作用哈希链 payload（防旧链化行验链失败）。
   */
  @Column({ type: 'varchar', length: 32, nullable: true, name: 'revoke_class' })
  revokeClass?: string | null;

  /**
   * KB-6：撤销结果运维态（null=未撤 / revoked=本地软删 / compensating=已请求外部补偿·结果未知 / revoke_failed=补偿失败）。
   * 不入哈希链 payload（可变运维态）。
   */
  @Column({ type: 'varchar', length: 32, nullable: true, name: 'revoke_status' })
  revokeStatus?: string | null;

  /**
   * docs/cascade-compensation.spec.md：级联补偿组 = 该次工具调用的**幂等基键**
   * （sha256(userId:conversationId:toolName:stableArgs)）——同组即同一次业务动作的多表副作用，
   * 撤销任一条即补偿整组。用基键而非另生成 uuid：重试天然映射到同一组。
   * null = 历史/单目标副作用行（行为不变）。**链外注解列**，不入 _chainPayload（加 key 会使历史链验签失败）。
   */
  @Index('IDX_ai_tool_side_effects_compensation_group')
  @Column({ type: 'varchar', length: 64, nullable: true, name: 'compensation_group' })
  compensationGroup?: string | null;

  /**
   * docs/cascade-compensation.spec.md：组内根成员（主体业务对象）的 effect id；
   * null = 该行即根成员，或单目标副作用行。**链外注解列**，不入 _chainPayload。
   */
  @Column({ type: 'integer', nullable: true, name: 'parent_effect_id' })
  parentEffectId?: number | null;

  /**
   * REV-1：**声明与持有不一致**的证据（JSON 字符串；null = 该组未被争议）。
   *
   * 场景：同参数重试在 `idempotency_key` 上冲突 → 整组回滚 → 回放既有组。若工具非确定性、重试声明的成员
   * 与首次**不同**（多声明或少声明），这个差异此前**被静默吞掉**：撤销该组只补偿已持有的那些行，汇总却报全绿
   * ——这正是「假撤销」。本列把被拒的那份声明连同双向差集一并留存，整组遂被标为争议，撤销路径据此**拒绝报告完成**。
   *
   * **链外注解列**，不入 `_chainPayload`（`_chainPayload` 是白名单，加 key 会使历史链验签失败；
   * 同 `run_id` / `parent_effect_id` 先例）。
   */
  @Column({ type: 'text', nullable: true, name: 'revoke_dispute' })
  revokeDispute?: string | null;

  /**
   * REV-2：**补偿请求时刻** —— 进入 `compensating` 时写入的时刻（重试则更新为最近一次请求）。
   *
   * 解决的问题：`compensating`（已请求外部补偿·结果未知）此前**没有年龄**——只有 `created_at`（副作用发生时刻）
   * 与 `revoke_status`（分类），于是「当前未了结」的聚合里，上个月卡住的行与五分钟前的读数**完全相同**，
   * 逐行诚实而聚合不诚实。加这一列后，端点/管理台可回答「哪些 `compensating` 超过 N 分钟未了结」。
   *
   * **只回答「多久了 / 可能已陈旧」**：真值仍在目标系统，**不得**据此把状态改写成成功或失败。
   * **链外注解列**，不入 `_chainPayload`（加 key 会使历史链验签失败）。
   */
  @Column({ type: Date, nullable: true, name: 'revoke_requested_at' })
  revokeRequestedAt?: Date | null;

  /**
   * REV-2 细化：**外呼确认时刻** —— 补偿端点**返回之后**写入（`revoke_requested_at` 写的是发出**之前**的意图）。
   *
   * 两列合起来回答一个此前答不出的问题：
   * - `compensating` + **无确认** = 「可能**根本没到达**外部系统」（进程在调用中途死掉即此形，此前一个字段都不写，
   *   该行读起来像从未请求过补偿）；
   * - `compensating` + **有确认** = 「确实到达了、对方没给终态」。
   *
   * 此前两者折进同一个 `compensating` 取值，聚合视图分不出这两种不确定。**只记窗口，不改判结果**
   * （真值仍在目标系统，不得据本列把状态改写成 revoked / revoke_failed）。
   * **链外注解列**，不入 `_chainPayload`。
   */
  @Column({ type: Date, nullable: true, name: 'revoke_acknowledged_at' })
  revokeAcknowledgedAt?: Date | null;

  /**
   * REV-6：**effect 身份不完整** —— true = 该行登记时**未能承载「变更」**（`after_snapshot` 为空）。
   *
   * effect 身份要同时答出**目标**（`result_type` + `result_id`）与**变更**（`before_snapshot` / `after_snapshot`）。
   * 目标两列恒有值；变更那对**可空**（仅在写了快照捕获器时填）。身份不能是可选的：缺了变更，
   * 建在 effect 键上的索引只能答「两个补偿组碰了同一行」，答不出「它们是否做了同一变更」。
   * 恒有值的 `args_hash` 顶不上——它是**请求**指纹、同时是组键输入，非确定性工具下同一变更的两次调用
   * 参数字节不同（那正是组被拆开的成因）：恒有值的字段恰在「是否同一件事」上自相矛盾。
   *
   * **落地取舍（REV-6 三选一：拒绝登记 / 回填历史 / 显式豁免并标注）**：取**显式豁免并标注**。
   * 拒绝登记会把「可恢复」换成「不可恢复」——业务行已经写进目标表，此时拒登只会让这次写**没有任何副作用行**
   * （撤销够不到它），与本仓对「换组键」的裁决同理；历史行回填不可能如实——变更当时的样子无法从任何
   * 落库列重建，如今重查目标只会把**后来**的状态写成**当时**的变更。
   *
   * 只标**成组**成员（单目标行不属于任何组，不参与跨组身份判定，无此问题）。成因（无捕获器 / 抓取失败 /
   * 目标行不存在）记在服务端 warn 日志；本列承载的是那件**持久事实**：这一行的身份缺了变更那半。
   * **链外注解列**，不入 `_chainPayload`（白名单加 key 会使历史链验签失败）。
   */
  @Column({ type: 'boolean', default: false, name: 'identity_incomplete' })
  identityIncomplete!: boolean;

  /**
   * REV-13：`identity_incomplete = true` 时的**成因**，四值互不等价 ——
   * `no_captor`（装配缺席，设计上的可选）/ `no_entity_and_empty_fallback`（外部写的正常形态）/
   * `row_missing`（实体在、行不在，**异常**）/ `failed`（抓取抛错，**异常**）。
   *
   * 存在的理由：置标本是一件事，但**四种「没有」此前共用一个 bit**，于是「设计如此」与「出错了」
   * 在读数上不可分；而这两者的处置完全不同（前者不必管，后者要查）。
   *
   * **`null` 有两种读法，都不冒充已知**：① 该行未置标（`identity_incomplete = false`）；
   * ② 该行置了标但成因未记 —— 引入本列之前的历史行即此形，**原因不可考**（成因取决于当时的
   * 运行条件，无法从任何落库列重建）。**故不做占位值回填**：一个默认值会让「不可考」读成「已知」。
   * **链外注解列**，不入 `_chainPayload`。
   */
  @Column({ type: 'varchar', length: 32, nullable: true, name: 'identity_incomplete_reason' })
  identityIncompleteReason?: string | null;

  /**
   * REV-11: **who took this stuck compensation on**, and when — a person, recorded.
   *
   * Before this, a stuck row could say whether it was stuck, how, how long, and on whose behalf the
   * write happened — but not that anyone had picked it up. "There is somewhere to look" and "someone
   * has to look" are different things, and the second one needs a row, not an inference from
   * `user_id` (which names the accountable party, not the taker).
   *
   * **Only these two columns.** Claiming changes nothing else: it does **not** rewrite
   * `revoke_status`, does **not** touch the target, and does **not** claim the compensation finished —
   * the truth still lives in the target system. A claim is a statement about who is looking, never
   * about what happened out there.
   *
   * **Chain-external annotation columns** (not in `_chainPayload`), so existing chains verify
   * unchanged. `claimed_by IS NULL` on a stale row is what "needs claiming" means; it is derived,
   * never stored, so the two can never disagree.
   *
   * REV-11：**谁把这条卡住的补偿接了过去**，以及何时 —— 一个人，被记录下来。
   *
   * 在此之前，一条卡住的行能说清它卡没卡、怎么卡、卡了多久、以及那次写代表谁，却说不出**有没人接手**。
   * 「有的看」与「必须有人看」是两件事，而后者要的是一行记录，不是从 `user_id` 推断（那名字说的是
   * **责任人**，不是**接手人**）。
   *
   * **只加这两列。** 认领不改动别的任何东西：**不**改写 `revoke_status`、**不**碰目标、**不**声称补偿
   * 已完成 —— 真值仍在目标系统。认领陈述的是「谁在看」，从不是「外面发生了什么」。
   *
   * **链外注解列**（不入 `_chainPayload`），故既有链验签不受影响。滞留行上 `claimed_by IS NULL`
   * 就是「需认领」的含义；它是**派生**的、从不落库，故两者不可能互相矛盾。
   */
  @Column({ type: 'varchar', length: 64, nullable: true, name: 'revoke_claimed_by' })
  revokeClaimedBy?: string | null;

  @Column({ type: Date, nullable: true, name: 'revoke_claimed_at' })
  revokeClaimedAt?: Date | null;

  /**
   * REV-7: **who was acting for the user** when this write happened — the agent identity, on the row.
   *
   * The audit row already carries it (`agent_id` / `caller_agent_id` / `delegation_context`), so the
   * fact exists; it simply lived one structure away, with no direct key between the two. Answering
   * "which agent wrote this, for which user" therefore meant joining two structures and pairing them
   * by approximation (conversation / run / tool), which is exactly the sort of reading that drifts.
   * Put beside the side effect, the question is answered by the row itself.
   *
   * Source is the existing `actorContext` (the same value the audit row takes), read at the boundary
   * rather than chased here. `null` means no agent was in play (a user acting directly), and for rows
   * written before this column it means **unknown** — the two are not distinguished, and neither is
   * filled in with a guess.
   *
   * **Chain-external annotation column**, not in `_chainPayload`.
   *
   * REV-7：这次写发生时**谁在替用户执行** —— agent 身份，落在行上。
   *
   * 审计行本来就有它（`agent_id` / `caller_agent_id` / `delegation_context`），事实存在；只是它住在
   * 另一个结构里，两者之间没有直接外键。于是要答「哪个 agent 替哪个用户写了这条」就得**join 两个结构**
   * 再靠 conversation / run / tool **近似配对** —— 正是那种会漂移的读数。放在副作用行旁边，这个问题由
   * **该行自己**回答。
   *
   * 来源是既有的 `actorContext`（与审计行取的是同一个值），在边界处读、不在这里追。`null` 表示当时没有
   * agent 参与（用户本人直接操作）；引入本列之前的行同为此值，语义是**未知** —— 两者不区分，也都不猜。
   *
   * **链外注解列**，不入 `_chainPayload`。
   */
  @Column({ type: 'varchar', length: 64, nullable: true, name: 'agent_id' })
  agentId?: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
