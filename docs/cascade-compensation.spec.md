# Cascade Compensation / 级联撤销与业务级补偿

> 规格文档。闭合 [revoke-contract.spec.md](revoke-contract.spec.md) §3 验收矩阵 **Case B2（级联，原 ⚠️ 未建模）** 与 §4 缺口 **G3**（「出现复合写工具时给父子 effect 引用最小契约」）。
>
> Closes acceptance-matrix case **B2 (cascade)** and gap **G3** of the revoke contract: when one AI tool call writes rows across several tables, compensating it must undo the whole business action in one shot — and the compensation itself must be recorded on the operation-audit hash chain.
>
> 状态：✅ 已完成。日期：2026-09-16。语义源：私有 roadmap §22.17 ④ 业务级补偿（护城河核心第二块，其中「级联撤销」一半；「影响预览」另一半另有 [impact-preview.spec.md](impact-preview.spec.md)）。
> 补（2026-09-24）：§4.1 重放前比对（少记录 → `disputed`）、§4.2 跨组重叠检出（REV-1 / REV-3，撤销如实性，
> 见 [revoke-contract.spec.md](revoke-contract.spec.md) §5）；同轮续补 §4.2 撤销时**闸门**（REV-5）与
> §4.3 effect 身份（REV-6）。

## 1. 问题 / Problem

`revoke-contract.spec.md` 把撤销形式化为档位契约（`none` / `local_compensate` / `governed_external` / `transactional`）。但截至本规格，**一次 AI 工具调用只落一行副作用**（`ai.service.ts` 读 `result.data.id` 单值），撤销也只软删该单行。于是：

- 一个业务动作跨表写成多行时（«建项目 + 拆 N 个任务»），撤销只还原了一部分 → **伪造的「已撤销」**，比不撤销更危险（用户以为干净了）。
- 部分失败无清晰语义：一批里成几条败几条，既无原子保证也无汇总。
- 补偿这个动作**自身不入审计链**——「谁在什么时候撤销了什么」在操作审计里没有可举证的行。

## 2. 概念 / Concepts

| 概念 | 定义 |
|---|---|
| **复合写工具 Composite write tool** | 一次 `execute` 内跨表写多行的 AI 写工具。声明方式：`ToolResult.data.effects: DeclaredSideEffect[]`（见 §3）。 |
| **补偿组 Compensation group** | 同一次工具调用产生的全部副作用行。组标识 `compensation_group` = **该次调用的幂等基键**（`sha256(userId:conversationId:toolName:stableArgs)`），故**重试天然映射到同一组**，无需另生成 uuid。 |
| **根副作用 Root effect** | 组内 `parent_effect_id IS NULL` 的那条（= 组内第 0 条）。承载「这个业务动作的主体对象」。 |
| **级联撤销 Cascade revoke** | 撤销组内任意一条 → 补偿**整组**。 |

无 `compensation_group` 的历史行 = 单目标副作用，行为与本次改动前**逐字节一致**。

## 3. 声明契约 / Declaration contract

复合工具在 `ToolResult.data` 里声明它写了什么：

```ts
// src/ai/tool-effects/effect-composition.ts
interface DeclaredSideEffect { resultType: string; resultId: number }
```

- **根成员恒为数组中第 0 条**（工具按「主体对象在前」声明）。不设 `parent` 标记：多个根、根不在首位的歧义不值得为它引入一个标记位与重排逻辑。
- 形状非法（非数组 / 空数组 / 成员缺 `resultType` 或 `resultId` / 类型不对）→ **fail-closed 返回 null**，调用方回落既有单目标路径，**绝不猜**。
- 不声明 `effects` 的工具：即使 `execute` 内部真写了多行，系统也只登记 `data.id` 那一行——诚实（登记范围 = 声明的范围），但**属于工具契约缺陷**，不是系统的。

## 4. 登记 / Recording

- 组内成员的幂等键**必须互异**（`idempotency_key` 有唯一约束）：
  - member 0 用**既有基键公式**（既有历史键不得漂移，且基键被 member 0 占住）；
  - member i>0 = `sha256(baseKey + ':' + i + ':' + resultType + ':' + resultId)`。
  漏掉区分度 → 整组被唯一约束塌成一行。
- 整组在**一个事务**内登记，只取一次副作用链锁（postgres `audit_chain_lock` id=2），逐条顺序接链 → **组内链相邻**且登记原子（避免「提交一半」的半组）。副作用哈希链 `_chainPayload` 白名单**不含** `compensation_group` / `parent_effect_id`（链外注解列）→ 加列不破历史链。
- **幂等重放必须组感知**：`ai.service.ts` 的重复调用探测命中后，若有 `compensation_group` → 载入同组兄弟 → 回放 `data.effects`。否则复合工具要么重放丢组，要么探测永不命中而**重复落库**。

### 4.1 重放前必须比对：声明与持有不一致 → `disputed`

**规则**：同参数重试在 `idempotency_key` 上冲突 → 整组回滚 → 回放既有组。回放**之前**必须比对
「本次被拒声明」与「已持有组」的成员集合（目标身份 `resultType + resultId`，**双向**求差 ——
重试也可能声明**更少**）。不一致 → 证据留 `revoke_dispute`（JSON：被拒声明 + 双向差集 + 时刻），
整组标**争议**。

**为什么不比对就是缺陷**：工具若非确定性，重试声明的成员与首次不同时，多出来的那条**被静默丢弃**；
此后撤销该组只补偿已持有的那些行，汇总却报全绿 —— 「假撤销」，比不撤销更危险（用户以为干净了）。
撤销路径因此**拒绝在争议组上报完成**（`revoked:false` + 说明「已按持有的行补偿，而声明与持有不一致」；
组级 / 单条 / 幂等跳过 / 批量四条路径都拦）。详见 [revoke-contract.spec.md](revoke-contract.spec.md) §5.1。

**链外**：`revoke_dispute` 是注解列，**不得**入 `_chainPayload`（白名单加 key 会使历史链验签失败）。

### 4.2 跨组重叠：检出 + 撤销时闸门 / Cross-group overlap: detection and the revoke-time gate

One `resultType + resultId` landing in **several** groups means one business action was split in two. Each
group is internally coherent, so no unique-violation fires, no idempotent replay runs, and nothing else
signals anything. The cause is that the group key eats the call identity, and `conversationId` changes
behind the tool's back. When one of the groups is revoked, the surviving group still points at the effect
that was just undone.

- **Detection**: `GET /ai/tool-effects/splits` reports the overlaps (aggregated in the database; over the
  cap it honestly reports `truncated`).
- **Gate** (REV-5): the revoke path asks for itself — for each member of the group being revoked, which
  *other live* group still names it (live = that group's row for the same effect is not `revoked`). A hit
  means that revoke must not report complete, on all four paths (group summary, one-member group,
  idempotent skip, batch — the batch carries it as a per-item `disputed`). The judgement is deliberately
  conservative: it answers "another group still claims it", not "that group still has members this revoke
  cannot cover" — the former is recoverable (run the revoke again).

同一 `resultType + resultId` 落进**多个**组 = 一次业务动作被拆成两组。两组各自内部自洽 → 唯一冲突不触发、
幂等回放不执行、别处零信号。成因是组键吃**调用身份**，其中 `conversationId` 会在工具不知情时变
（会话 id 缺失/查不到 → `_resolveConversation` 新建会话；continuation token 同理）。撤销其中一组时，
活下来的那一组**仍指着刚被撤销的 effect**。**检出**报出这些重叠；**闸门**在撤销路径**自己**判 ——
对本次组内每个成员问「还有哪个**活着的**组也主张它」（活着 = 该组承载同一 effect 的那行 `revoke_status`
不是 `revoked`），命中则该次撤销**不得报告完成**，四条路径（组级汇总 / 单成员组 / 幂等跳过 / 批量）都拦，
批量以逐条 `disputed` 承载。判定**保守**：只回答「另一组还主张它」，答不出「那组是否还留有本次覆盖不到的
成员」—— 前者可恢复（撤销可以再跑一次）。

**组键不动**（2026-09-24 裁决）：组键改吃主体 effect 身份、参数降为 `args_hash` 证据，会让两次**合法**调用
触碰同一主体行时并组 —— 把**可恢复**失败换成**不可恢复**失败（撤销够到没人要求够到的 effect，撤销不能
倒着跑）。两把键答不同问题：调用键 = 是否同一请求（幂等留在它上面），effect 键 = 撤销会碰到什么。

### 4.3 effect 身份：成组成员必须承载变更 / Effect identity: a grouped member must carry the change

Effect identity has to answer **target and change together**. The target is carried unconditionally by
`result_type` + `result_id`; the change is captured (`before_snapshot` / `after_snapshot`) but only when a
snapshot captor is wired, so it is nullable — and an identity cannot be optional. Without the change, a
cross-group check can only say "two groups touched the same row", never "they made the same change". The
always-present `args_hash` is the wrong carrier: it fingerprints the request and feeds the group key, so a
non-deterministic tool produces different argument bytes for the same change — which is exactly how a
group splits.

**Decision (one of: reject the registration / backfill history / exempt explicitly and label it): the
third.** A grouped member with no change snapshot is labelled `identity_incomplete` (a chain-external
annotation column) and readable from the admin listing; the migration backfills the same label for
historical grouped rows from existing columns only. Rejecting the registration would trade a recoverable
failure for an unrecoverable one — the business rows are already written, so refusing to record would
leave this write with no side-effect row at all. Backfilling the *change* is not possible honestly. This
item changes no revoke conclusion.

effect 身份要同时答出**目标**（`result_type` + `result_id`，恒有值）与**变更**（`before_snapshot` /
`after_snapshot`，**可空** —— 只在接了快照捕获器时填）。身份不能是可选的：缺了变更，跨组判定只能答
「两组碰了同一行」，答不出「是否做了同一变更」。恒有值的 `args_hash` 顶不上：它是请求指纹、同时是组键
输入，工具非确定性时同一变更的两次调用参数字节不同（那正是组被拆开的成因）。

**取舍**：成组成员缺变更快照时**如实标注**（`identity_incomplete`，链外注解列）+ 管理端列表可读出 +
迁移对历史成组行按**既存列**回填同一标注。**不拒绝登记**（业务行已写进目标表，拒登等于这次写没有任何
副作用行 = 撤销够不到，把可恢复换成不可恢复）；**不回填变更本身**（当时的变更无法从任何落库列重建）。
本项**不据此改任何撤销结论**，只让身份可依赖 —— 详见 [revoke-contract.spec.md](revoke-contract.spec.md) §5.4。

### 4.4 两个判据分层 / Two judgements, two layers

Registration does not judge "is this split" — at write time each group is internally correct, so there is
no subject; it only labels whether the identity is complete (§4.3). The revoke layer is what judges
whether this revoke may report complete (§4.2 gate). Neither rewrites the other's reading.

登记层不判「是否分裂」（那里没有主语：每组各自内部都正确），只标注**身份是否完整**（§4.3）；撤销层才判
「这次撤销能不能说完成」（§4.2 闸门）。两个判据分层，互不改写对方的读数。

## 5. 级联补偿 / Cascade compensation

撤销组内任意一条（单条 / 批量 / run 级 / 治理台回调）→ 补偿整组：

1. 按 `compensation_group` 载入全组。
2. **本地成员**（档位 `local_compensate`）：放进**一个 DB 事务**逐条软删。任一失败 → 回滚 → 整组报 failed，**一个字都没改**。这是「一次补偿」的字面实现，并顺带闭合验收矩阵 **Case C**（部分失败）在级联场景下的缺口。
3. **外部成员**（`governed_external`）：事务外顺序处理，诚实落 `compensating` / `revoke_failed`（严禁把「已请求补偿」显示为 `revoked`）。
   逐条结果落 `skipped` + `reason: 'compensating'`（与「本就在 `compensating` 的行」同读数），否则它既不算 revoked 也不算 skipped、会被汇总计成 **failed**——一次**成功**的派发被报成失败（见 [revoke-contract.spec.md](revoke-contract.spec.md) §5.9）。派发本身带**条件认领**（ARC-3），见同文 §5.8。
4. 返回逐条结果 + 汇总（复用既有 `RevokeBatchItem` / `RevokeBatchResult` 形状）。
5. `none` 档位成员不参与补偿（诚实拒绝），其存在不阻塞其余成员的补偿。
6. **组有争议就不报完成**（§4.1 声明与持有不一致 / §4.2 闸门：另一活组仍主张）：全组持有行都补偿成功时，
   组级结论仍是 `revoked:false` + 说明 ——
   「持有的每一行都撤销了」与「这次业务动作已完全撤销」是两件事，被声明多出来的成员没有任何行承载。
   行级 `revoke_status` 不被改写（逐行事实），两个读数分轴。

**批量折叠**：会话级/run 级批量撤销**必须按 `compensation_group` 折叠**——同组只级联一次并把组内逐条结果摊平。否则一个 3 成员组会被重复补偿 3 次。

## 6. 补偿入 operation_audit + 哈希链 / Compensation audit anchor

补偿完成后写**一行** `operation_audit_logs`（该表本身入哈希链，故补偿自动入链）：

| 字段 | 值 |
|---|---|
| `action` | `COMPENSATE` |
| `method` / `path` | `DELETE` / `/ai/tool-effects/compensate` |
| `targetId` | **根副作用的业务 resultId**（使其可被 `findByTargetId` / `chainRowsByTarget` 按业务对象捞到） |
| `featureKey` / `featureFallback` | `ai.compensate` / `ai · compensate` |
| `businessEvent` | `AiSideEffectCompensated` |
| `changes` | 逐成员 JSON `[{resultType,resultId,role,revoked,revokeStatus}]`（**链外列**，≤4000，超长截断） |
| `requestBody` | `{groupId, requestedEffectId, total, authorization:{conversationId, runId, toolName}}` |

`action` 无枚举约束、`changes` 是链外列 → **不改 operation-audit payload 契约**。

**只对组级补偿写显式行**：单目标撤销已有全局拦截器行（HTTP 级，`action=DELETE`），再写一行只是噪音；
而组级补偿的逐成员结果只有服务层知道，拦截器看不见 —— 故本行精确填的是那个缺口。

### 6.0 `requestBody.authorization`：这一行**指回**它依据的那次授权 / the row points back at its authorization

REV-12：这行此前有组、有成员明细、有 target，**没有「这次撤销依据的是哪次授权」** ⇒「谁许可 / 执行 / 收回」
要靠证据包另行拼装，**行本身**答不出。现带上授权那条链的连接键。**只指回，不新建第二套授权存储**。

| 键 | 指到哪 | 如实边界 |
|---|---|---|
| `runId` | **run 级确认时它就是那次决定本身的标识**（token = runId，见 run-level-approval.spec.md §2.3）—— 直接引用 | 单条确认 / 免确认写为 `null`；**不编**一个决定标识 |
| `conversationId` + `toolName` | 单条确认唯一可靠的**定位键**：授权依据（含策略版本）在会话的 `tool_call` 审计行上，按这两键可定位到它 | **不把策略版本复制进来**：撤销时读到的策略版本是**此刻**的，抄进来只会把后来的策略写成当时的依据 |

REV-12: the row now carries the linkage back to the authorization it rests on — `runId` is the run-level
decision's own identifier (the run confirmation token, a direct reference), and `conversationId` +
`toolName` locate the conversation's `tool_call` audit row, which holds the authorization evidence. It
**points back; it does not store a second copy** — in particular the policy revision is not copied, because
the revision readable at revoke time is the one in force *then*, not the one that authorized the write.

### 6.1 两个必须诚实记录的取舍

1. **补偿审计是 best-effort，做不到 fail-closed。** `OperationAuditService.log()` 在 postgres 与 sqlite 两个分支都只 `logger.warn` 吞掉异常、**永不抛**。本仓 AU-5 的 fail-closed 先例抛的是**另一条链**（AI 审计 `AuditService`），不可混用。本规格遵从平台既定立场（操作审计拦截器注释即写明「审计不影响业务」）。
2. **不会出现「状态改了却无记录」。** 权威运维态是逐条 `revoke_status` 回写 + 软删后的 `target_soft_deleted`；op-audit 行是**链锚定的人读摘要**。进程若在「软删已提交、审计行未落」之间挂掉，丢失的是摘要，不是事实。

### 6.2 一次 HTTP 撤销产生两行链上记录（有意，不合并）

- 拦截器行：`DELETE /ai/tool-effects/:id`，`targetId` = **副作用 id**；
- 服务行：`COMPENSATE`，`targetId` = **业务 id**。

粒度不同、都是真事实。**架构先例**：这是首个由**服务**（而非全局拦截器）直写 `operation_audit_logs` 的路径——因为补偿的逐成员结果只有服务层知道，HTTP 拦截器看不见。

## 7. A-3 生命周期接续 / A-3 lifecycle link

- B4 治理视图（`GET /ai/governance/action/:resultType/:resultId`）的 `effect` 增
  `compensationGroup` / `parentEffectId` / `cascadeSize` / `revokeStatus` / `restored`。
- A-3 `el-steps`（[audit-lifecycle-elsteps.spec.md](audit-lifecycle-elsteps.spec.md)）：
  - **撤销**节点描述体现条数（«已撤销 N 条（同一次业务动作级联补偿）»）；
  - **恢复**节点由恒 `wait` 改为可推导。判据由服务端单一权威给出（`isRestored`）：
    `revoke_status='revoked'`（补偿发生过）**且** `targetSoftDeleted=false`（目标现已回生效态）——回收站 restore
    只清 `deletedAt`、**不动** `revoke_status`，两者组合即「撤销后又恢复」这一历史事实。
- **回收站覆盖（RG-3）**：复合写载体目标为 `pm_projects` / `pm_tasks`。二者虽带 `@DeleteDateColumn`，
  却**此前不在回收站内** → 「本地可撤」档位定义中「可经 RG-3 回收站恢复」对它们不成立（`create_project_task`
  早已如此，属既有缺口）。本次把 `project` / `task` 纳入 `GET /admin/trash` 与
  `POST /admin/trash/:type/:id/restore`，该缺口闭合，「A-3 恢复态」也才有可恢复的落点。
- 证据根：`_evidenceRootRestPaths` 为复合动作的 resultType 补条目并并入补偿路径
  （`/ai/tool-effects/compensate`），否则 COMPENSATE 行**捞不到**，证据包缺补偿锚。

## 8. 验收 / Acceptance

| # | 判据 |
|---|---|
| C1 | 复合工具一次调用 → N+1 条副作用同 `compensation_group`，成员键互异，组内链相邻，`verifySideEffectChain` 绿 |
| C2 | 重复调用（同 args）→ 探测命中 → 回放完整 `effects[]`，**不重复落库** |
| C3 | 撤销组内**任意一条** → 全组目标 `deletedAt` 非空 |
| C4 | 组内任一本地成员补偿失败 → **整组零改动**（事务回滚），结果如实报 failed |
| C5 | 恰一行 `action=COMPENSATE` 且 `GET /audit/operations/verify` 链绿 |
| C6 | 批量（会话/run）对同组**只补偿一次** |
| C7 | 无组的既有单目标副作用行为不变（回归） |
| C8 | 通知/审计等**外发类不可逆**成员仍 `none`，不参与补偿且不被伪装 |
| C9 | 重试声明与持有**不一致**（多声明或少声明，双向）→ 组标 `disputed` + 证据留存 + 撤销汇总 `revoked:false` |
| C10 | 重试声明与持有**一致** → 不标记（纯幂等重放，行为不变；不制造误报） |
| C11 | 同一 `resultType+resultId` 横跨多个组 → 可检出（`GET /ai/tool-effects/splits`），超上限如实 `truncated` |
| C12 | 撤销时另有**活着的**组主张本组任一 effect → 该次撤销**不得报完成**（组级汇总 / 单成员组 / 幂等跳过三条路径 `revoked:false` + 说明，批量逐条 `disputed:true`），而逐行 `revoke_status` 不被改写；另一组已 `revoked` 或只有本组的行 → **不拦** |
| C13 | 成组成员缺变更快照 → 该行标 `identity_incomplete`（缺变更者标、有变更者不标、逐行判定），管理端列表可读出；迁移对历史成组行按既存列回填同一标注（单目标行不标） |

## 9. 相关 / Related

- [revoke-contract.spec.md](revoke-contract.spec.md) — 撤销档位契约 + A–F 矩阵（本规格闭合 B2/G3）
- [audit-lifecycle-elsteps.spec.md](audit-lifecycle-elsteps.spec.md) — A-3 生命周期 el-steps
- [hs11-audit-chain.spec.md](hs11-audit-chain.spec.md) — 审计哈希链
- [evidence-root.spec.md](evidence-root.spec.md) — ① 证据根（补偿行的跨链锚定）
- [keelbase-dna.md](keelbase-dna.md) — Design for Recovery（可撤销 / 可补偿）
