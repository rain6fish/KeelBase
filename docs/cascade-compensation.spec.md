# Cascade Compensation / 级联撤销与业务级补偿

> 规格文档。闭合 [revoke-contract.spec.md](revoke-contract.spec.md) §3 验收矩阵 **Case B2（级联，原 ⚠️ 未建模）** 与 §4 缺口 **G3**（「出现复合写工具时给父子 effect 引用最小契约」）。
>
> Closes acceptance-matrix case **B2 (cascade)** and gap **G3** of the revoke contract: when one AI tool call writes rows across several tables, compensating it must undo the whole business action in one shot — and the compensation itself must be recorded on the operation-audit hash chain.
>
> 状态：✅ 已完成。日期：2026-09-16。语义源：私有 roadmap §22.17 ④ 业务级补偿（护城河核心第二块，其中「级联撤销」一半；「影响预览」另一半另有 [impact-preview.spec.md](impact-preview.spec.md)）。

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

## 5. 级联补偿 / Cascade compensation

撤销组内任意一条（单条 / 批量 / run 级 / 治理台回调）→ 补偿整组：

1. 按 `compensation_group` 载入全组。
2. **本地成员**（档位 `local_compensate`）：放进**一个 DB 事务**逐条软删。任一失败 → 回滚 → 整组报 failed，**一个字都没改**。这是「一次补偿」的字面实现，并顺带闭合验收矩阵 **Case C**（部分失败）在级联场景下的缺口。
3. **外部成员**（`governed_external`）：事务外顺序处理，诚实落 `compensating` / `revoke_failed`（严禁把「已请求补偿」显示为 `revoked`）。
4. 返回逐条结果 + 汇总（复用既有 `RevokeBatchItem` / `RevokeBatchResult` 形状）。
5. `none` 档位成员不参与补偿（诚实拒绝），其存在不阻塞其余成员的补偿。

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

`action` 无枚举约束、`changes` 是链外列 → **不改 operation-audit payload 契约**。

**只对组级补偿写显式行**：单目标撤销已有全局拦截器行（HTTP 级，`action=DELETE`），再写一行只是噪音；
而组级补偿的逐成员结果只有服务层知道，拦截器看不见 —— 故本行精确填的是那个缺口。

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

## 9. 相关 / Related

- [revoke-contract.spec.md](revoke-contract.spec.md) — 撤销档位契约 + A–F 矩阵（本规格闭合 B2/G3）
- [audit-lifecycle-elsteps.spec.md](audit-lifecycle-elsteps.spec.md) — A-3 生命周期 el-steps
- [hs11-audit-chain.spec.md](hs11-audit-chain.spec.md) — 审计哈希链
- [evidence-root.spec.md](evidence-root.spec.md) — ① 证据根（补偿行的跨链锚定）
- [keelbase-dna.md](keelbase-dna.md) — Design for Recovery（可撤销 / 可补偿）
