# Revoke Contract / 撤销契约（AI 写副作用可撤销性）

> KeelBase 把「AI 写操作产生副作用 → 可撤销」当产品卖点（§internal.17 ① Audit & Revoke）。本 spec 把撤销语义形式化为**档位契约 + A–F 验收矩阵**：声明可撤销 ≠ 可撤销，可撤销 = 该工具在当前档位下有可验证的撤销路径。
>
> KeelBase treats "AI writes → revocable" as a product promise. This spec formalizes revocation as a **revoke-class contract + an A–F acceptance matrix**: declaring something reversible is not enough — reversible means the tool, under its declared class, has a verifiable revocation path.

## 1. 撤销档位 / Revoke classes

| 档位 RevokeClass | 语义 | 撤销动作 | 状态落点 |
|---|---|---|---|
| `none` | 不可撤销 / 目标系统无补偿端点 | 拒绝撤销（诚实，不制造"可撤销"假象） | 不写 revoke 状态 |
| `local_compensate` | 本地实体可软删（`DeleteDateColumn`） | `softDelete(resultId)` | 目标软删 → 可经 RG-3 回收站恢复；`revokeStatus=revoked` |
| `governed_external` | B 路径外部系统写（`proxy_call`） | 调用外部补偿端点（`ExternalRevoker`） | 2xx 仅证"已请求" → `revokeStatus=compensating`（终态在目标系统） |

补充事实 / Also true:
- **外部 MCP 写（`resultType=external_call`）落 `revokeClass=none`，即不可撤**：MCP 外部工具（第三方 server，
  经 `admin/mcp/servers` 注册）与 KeelBase 之间**没有补偿通道**，故不得归入 `governed_external`
  —— 那一档的语义是「调目标系统补偿端点」，只对 B 路径（`proxy_call`）成立。登记该行的目的是
  **幂等**（`idempotency_key` 防同一调用重放成一次真实外部写）与**可追溯**，**不是可撤销承诺**。
  <br>External MCP writes register as `external_call` with `revokeClass=none` — there is no compensation
  channel to a third-party MCP server, so they must not be filed under `governed_external` (that tier means
  "call the target's compensation endpoint", which only holds for the B path). The row exists for
  **idempotency** and **traceability**, never as a promise that the action can be taken back.
- 幂等：`idempotency_key` 防重复 create（同会话同工具同参数复用结果）。
- 完整性：副作用表入哈希链（prev_hash/hash）；撤销仅回写 `revoke_status` 运维态，不入哈希链 payload。
- 归责：本人 `my/tool-effects/:id` 撤销带所有权（`revokeOwned`）；管理端 admin 可撤任意；两路都在 AI Action Center / 决策轨迹留痕。
- **级联（B2/G3）**：跨表复合写工具的多个副作用共享一个**补偿组**（组 = 该次调用的幂等基键）；
  撤销组内**任一条**即补偿整组，本地成员落一个事务。组级补偿自身落一行 `action=COMPENSATE` 的
  operation_audit 行（入哈希链），`targetId` 记**根业务 id** → 证据根可按业务对象捞到。
  单目标副作用（无组）行为与本节其余条款**逐字节一致**。

## 2. 工具级撤销契约验收 / Per-tool revocation acceptance

每个 `revokeClass !== 'none'` 的 AI 写工具必须满足对应验收，缺一视为契约破坏：

1. **本地可撤**：目标实体带 `@DeleteDateColumn`（可软删），撤销行可经管理端回收站恢复；给一条 E2E：`工具 create → revoke → 目标 deletedAt 非空 → 回收站可见`。
2. **外部可撤**：工具/导入配置提供 `revokePath` 补偿端点；撤销请求发出且 2xx → 状态 `compensating`；**目标系统能回读/确认补偿结果**（不长期悬空）。
3. **不可撤必须显式**：`none` 工具不出现误导性撤销入口；UI/API 文案明确"不可撤销 / 外部无补偿"。

## 3. A–F 副作用验收矩阵 / Side-effect acceptance matrix

| Case | 场景 | 通过判据 / Pass criterion | 状态 |
|---|---|---|---|
| A | 单实体：`create event → revoke → 消失` | 软删 + 回收站可恢复；`revokeStatus=revoked` | ✅ 已实现（LocalEntityRevoker + RG-3） |
| B | 多实体 / 同次 run 多写 | 一键批量撤销（会话/run 粒度），结果逐条汇总、部分失败清晰 | ✅ **会话级批量已实现**（`DELETE /ai/tool-effects?conversationId=` admin / `/ai/my/tool-effects?conversationId=` 本人，逐条软删/外部补偿 + 汇总）；⚠️ run 精确粒度待 KB-5 run 落库后按 run_id |
| B2 | 级联：单一复合写工具内部建多行/多表 | 撤销级联清理关联行，或显式声明不可级联并防误删 | ✅ **已实现**（[cascade-compensation.spec.md](cascade-compensation.spec.md)：复合写工具在 `data.effects` 声明多目标 → 按**补偿组**登记 → 撤销**任一条**即补偿整组；本地成员落**一个事务**，全成或全不成） |
| C | 事务 / 部分失败 | 单操作 DB 原子；同批多写部分失败时，已成功部分可被清晰列出并由用户撤销 | 🔶 **级联场景已闭合**：组内本地成员单事务，任一失败整体回滚、零改动（不产生半补偿），逐条结果如实汇总；**跨组**批量仍为逐组独立（一组失败不影响他组），无"自动清扫已成功部分" |
| D | 异步副作用（AI → 队列 job） | `queued/processing` 中间态建模 + 终态收敛 | ⚠️ 本仓 AI 写暂不异步化；未来触发需补状态机 |
| E | 外部 API 补偿 | 补偿已请求（`compensating` 诚实）+ **终态可回读对账**（收敛到 revoked / revoke_failed） | ✅ 补偿请求已实现；✅ **「已发出」与「已确认」可区分**（REV-2 细化：意图在外呼前落库、确认在外呼后独立落库，两种不确定不再折成一个读数）；⚠️ 终态回读依赖目标系统，主库不轮询收敛 |
| F | 不可逆（邮件/短信/支付/物理） | R5 阻断或 `revokeClass=none`，不展示可撤销入口 | ✅ 已实现（R5 block + none 拒绝 + UI 分支） |

## 4. 已知缺口与后续 / Known gaps & follow-ups

- **G1 run/会话级批量撤销**：✅ **会话级 + run 级均已落地**——`DELETE /ai/tool-effects?conversationId=|runId=`（admin）与 `/ai/my/tool-effects?conversationId=|runId=`（本人，owner 过滤）逐条复用档位门控撤销 + 汇总（service `revokeConversation` / `revokeRun`，共用 `_revokeBatch` 循环）。run 精确粒度：KB-5 run 一次授权执行时把 runId（= run 确认 token）挂到成员的副作用行（`ai_tool_side_effects.run_id`，迁移 `1818000000000`；**链外列**，不入 G-3 哈希链 payload 故加列不破历史链），比会话级更细（一个对话可含多次 run）。
- **G2 外部补偿终态收敛**：`compensating` 长期悬空的展示问题——先做 UI/审计面明确"结果在目标系统"，后续可选轮询/回调。✅ **「悬空多久」与「悬在哪个窗口」已可查**（REV-2 + 细化，见 §5）：`revoke_requested_at` 给年龄（`?stale=true` 按阈值过滤），`revoke_acknowledged_at` 分出「可能根本没到达」与「确实到达了但没有回音」；**真值仍在目标系统**，两列都只回答「多久了 / 有没有到达的凭据」，不据此把状态改写成成功或失败。
- **G3 级联副作用边界**：✅ **已闭合**（[cascade-compensation.spec.md](cascade-compensation.spec.md)）——复合写工具出现（`create_project_with_tasks`）时落地了父子引用最小契约：`ai_tool_side_effects` 加 `compensation_group`（= 该次调用的幂等基键，同组即同一业务动作）+ `parent_effect_id`（根成员），两列均为**链外注解列**（不入 G-3 `_chainPayload` 白名单 → 加列不破历史链）；wire 契约升 `side-effect-revoke` v3。
- **G4 每个非 none 工具的撤销 E2E**：✅ **本地可撤档已固化**（`test/revoke-acceptance.e2e-spec.ts`，真实 create→record→本人撤销→软删+回收站 restore→状态回 executed + 所有权 404，6 例）；外部补偿由 `proxy-bridge.e2e-spec.ts` 覆盖、`none` 拒绝由 revoke-conversation.spec 单测兜底。新写工具验收回归时按 §2 清单在此套件扩展。

## 5. 撤销如实性：三处已闭合的缺口 / Revoke honesty: three closed gaps

> 这三处都是「撤销可以在一次业务动作仍有部分存活时报告完成」的实例 —— 契约承诺的诚实，在实现上是否成立。
> 前两处由第三篇对外文章《Revocation Is Not a Button》的读者提出，第三处是该读者第二轮的细化。
>
> All three are instances of "a revoke can report complete while part of one business action is still
> live" — whether the honesty this contract promises actually holds in the implementation. The first
> two were raised by a reader of the third article in the series; the third is that reader's refinement
> in a second round.

### 5.1 少记录：声明与持有不一致 / Under-recording: the declaration disagrees

**规则**：复合写工具重试时若在幂等键上冲突，登记层回放既有组 —— 但**不得**在回放前跳过比对。
比对「本次被拒声明」与「已持有组」的成员集合（按目标身份 `resultType + resultId`，**双向**求差，
因为重试也可能声明**更少**）；不一致即：

1. 把被拒声明连同双向差集**留成证据**（`ai_tool_side_effects.revoke_dispute`，JSON；**链外注解列**，
   不入 `_chainPayload` —— 加 key 会使历史链验签失败，同 `run_id` / `parent_effect_id` 先例）；
   证据写在**根行**一处即够（撤销路径按**组**判定；单成员组的唯一一行本来就是根行）——
   逐行复制只会把同一份证据放大成 O(N²) 文本、并在写入失败时留下互相不一致的副本；
2. **撤销路径拒绝报告完成**：`revoked:false` + 说明「已按**持有**的行补偿，而声明与持有不一致」。
   多成员组由组级汇总判定（**撤子行也拦得住**），单成员组与**幂等跳过路径**各由同一条判据拦
   （跳过路径原本会以「幂等成功」的口径把争议重新报成完成）。
3. 批量撤销无组级结论位（wire 契约也不允许新增顶层键）→ 争议组的逐条结果带 `disputed:true` 标记
   （按**组**判定，不按行——标记只在根行上），使 `revoked:N / failed:0` 不被读成全绿。

**两个读数分轴**：行级 `revoke_status` 仍是逐行事实（持有的行确实被补偿了，故 `revokeStatus='revoked'`），
而「这一次业务动作是否已完全撤销」为假 —— `revoked:false` 与 `revokeStatus:'revoked'` 并存是如实，不是矛盾。

### 5.2 两个窗口：意图与确认是两个事件 / Two windows: intent and acknowledgment

**规则**：外部补偿**先写意图、再外呼**（`revoke_requested_at` + `revoke_status=compensating`，
确认列清空）—— 进程若在调用中途死掉，该行留下「可能**根本没到达**外部系统」的读数，而不是**一个字段都不写**
（那会让它读起来像从未请求过补偿，「当前未了结」的聚合里凭空少一条）。外呼**返回后**把确认**单独**记为一个
事件（`revoke_acknowledged_at`）；对方拒绝（非 2xx）同样算**到达**。

两个窗口因此可分：`compensating` + 无确认 = 可能未到达；`compensating` + 有确认 = 确实到达、对方没给终态。
判据单源 `revokeWindow()`；年龄判据仍由 `revokeAge()` 回答。**真值仍在目标系统**，本判据只说「有没有到达的凭据」。

### 5.3 过度分裂：先检出 / Over-splitting: detection first

组分键吃的是**调用身份**，其中 `conversationId` 会在工具毫不知情的情况下变（会话 id 缺失或查不到时
`_resolveConversation` **新建**会话；载荷多一个 continuation token 同理）⇒ 同一个 effect 落**两组**，
**两组各自内部自洽完整**、唯一冲突永不触发、幂等回放根本不执行、别处毫无异常信号 —— 比「少记录」更难发现。

**本次只做检出**：`GET /ai/tool-effects/splits` 报出「同一 `resultType + resultId` 横跨哪些补偿组」
（库侧 `GROUP BY … HAVING COUNT(DISTINCT compensation_group) > 1`；超过上限如实报 `truncated`）。
**根治不做**：把组键改为吃**主体 effect 身份**（参数降为 `args_hash` 证据）可一次修好两个失败模式，
但两次**合法**调用触碰同一主体行会被并组，属行为语义变更 → **须先裁决**，裁决前不动组键。

### 5.4 落点与验收 / Landing points

| 缺口 | 实现落点 | 证据（**对旧实现为红**） |
|---|---|---|
| 5.1 少记录 | `recordGroup` 冲突分支 + `_markDisputeIfDeclarationDiffers` / `_groupResult` / `_withDisputeNote` / 迁移 `1828000000000` | `revoke-dispute.spec.ts`（旧实现：不写标记、汇总 `revoked:true`） |
| 5.2 两个窗口 | `_doRevokeSingle` 外部分支（意图→外呼→确认）+ `_patchRevoke` + `revokeWindow()` | `revoke-intent-ack.spec.ts`（旧实现：外呼时零写入、确认列从不写） |
| 5.3 过度分裂 | `findSplitGroups()` + `GET /ai/tool-effects/splits` | `revoke-split-detection.spec.ts`（真 sqlite；旧实现无此能力） |

三处均不改 wire 契约：新列是**链外注解列**，`revokeResult` 本就是 `additionalProperties: true` 而结论只走
`revoked` + `message`（不新增键），`item` / `traceItem` 的形状未动。

## 6. 相关文档 / Related

- [cascade-compensation.spec.md](cascade-compensation.spec.md)（级联撤销 / 业务级补偿——闭合本契约 B2 / C / G3）
- docs/evidence-root.spec.md（授权快照 + 证据根；撤销目标状态在证据包内）
- docs/hs11-audit-chain.spec.md（审计哈希链）· docs/ai-action-center.spec.md（我的 AI 行为/撤销入口）
- docs/audit-lifecycle-elsteps.spec.md（A-3 生命周期；撤销节点显示级联条数、恢复节点据 `restored` 转 finish）
- docs/integrator-kit/java-compensation-example.md（B 路径外部补偿示例）
- docs/manual/code-review-severity.md（把扫描/评审发现分级，本契约归 Trust 核心 P1）
