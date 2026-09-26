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
2. **外部可撤**：工具/导入配置提供 `revokePath` 补偿端点；撤销请求发出且 2xx → 状态 `compensating`；**该状态下任何路径都不得报 `revoked`**（单条 / 组级 / 批量三处同向，见 §5.9）；**同一行的并发撤销只派发一次**（条件认领，见 §5.8）；**目标系统能回读/确认补偿结果**（不长期悬空）。
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

## 5. 撤销如实性：已闭合的缺口 / Revoke honesty: closed gaps

> 这些缺口都是「撤销可以在一次业务动作仍有部分存活时报告完成」的实例 —— 契约承诺的诚实，在实现上是否成立。
> 由第三篇对外文章《Revocation Is Not a Button》的读者在数轮反馈中提出。
>
> Every gap here is an instance of "a revoke can report complete while part of one business action is
> still live" — whether the honesty this contract promises actually holds in the implementation. They
> were raised by a reader of the third article in the series, across several rounds of feedback.

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

### 5.3 过度分裂：检出与**撤销时的闸门** / Over-splitting: detection and the revoke-time gate

组分键吃的是**调用身份**，其中 `conversationId` 会在工具毫不知情的情况下变（会话 id 缺失或查不到时
`_resolveConversation` **新建**会话；载荷多一个 continuation token 同理）⇒ 同一个 effect 落**两组**，
**两组各自内部自洽完整**、唯一冲突永不触发、幂等回放根本不执行、别处毫无异常信号 —— 比「少记录」更难发现。
撤销其中一组时，活下来的那一组**仍指着刚被撤销的 effect**，而它承载的业务动作并不随本次撤销结束。

检出：`GET /ai/tool-effects/splits` 报出「同一 `resultType + resultId` 横跨哪些补偿组」
（库侧 `GROUP BY … HAVING COUNT(DISTINCT compensation_group) > 1`；超过上限如实报 `truncated`）。
**闸门**：撤销路径**自己**再判一次 —— 对本次要撤销的组内每个成员，问「还有哪个**活着的**组也主张它」；
命中则该次撤销**不得报告完成**（`revoked:false` + 说明是哪个组、主张了哪个对象）。这是 `disputed` 的
第二个入口（第一个是 §5.1 的写时冲突）。为什么只能是撤销时：写时每组各自内部都正确，检查在那里**没有主语**。

**组键不动**：把组键改为吃**主体 effect 身份**（参数降为 `args_hash` 证据）会让两次**合法**调用触碰同一
主体行时被并组 —— 那是把**可恢复**的失败（少记录 / 分裂：撤销可以再跑一次）换成**不可恢复**的失败
（撤销够到没人要求够到的 effect，撤销不能倒着跑）。两把键答不同问题：调用键 = 是否同一请求（幂等留在它
上面），effect 键 = 撤销会碰到什么。

Detection reports the overlaps; the **gate** re-decides inside the revoke: for each member about to be undone,
ask which *other live* group still names that same effect. If one does, that revoke must not report complete.
Writing is not the place for this check — at write time every group is internally correct, so the check has no
subject. The group key stays on the call identity: deriving it from the effect would trade a recoverable
failure (run the revoke again) for an unrecoverable one (a revoke reaching effects nobody asked it to reach).

### 5.4 effect 身份：成组成员必须承载「变更」 / Effect identity: a grouped member must carry the change

effect 身份要**同时**答出**目标**与**变更**。目标由 `result_type` + `result_id` 恒有值地承载；变更其实有捕获
（`before_snapshot` / `after_snapshot`），但**可空** —— 只在接了快照捕获器时填。**身份不能是可选的**：
缺了变更，跨组判定只能答「两组碰了同一行」，答不出「是否做了同一变更」。
恒有值的 `args_hash` 顶不上：它是**请求**指纹、同时是组键输入，工具非确定性时做同一变更的两次调用参数
字节不同（那正是组被拆开的成因）—— 恒有值的字段恰在「是否同一件事」上自相矛盾。

**落地取舍（三选一：拒绝登记 / 回填历史 / 显式豁免并如实标注）取第三条。** 拒绝登记会把**可恢复**换成
**不可恢复**：业务行已经写进目标表，此时拒登只会让这次写**没有任何副作用行**（撤销够不到它）—— 与
「不换组键」同一条取舍。历史行**回填变更**不可能如实：变更当时的样子无法从任何落库列重建，如今重查目标
只会把**后来**的状态写成**当时**的变更。故：成组成员缺变更快照时，该行被**如实标注**为
`identity_incomplete`（链外注解列），管理端列表可读出；迁移对历史成组行按**既存列**回填同一标注（只标
「本来就缺变更」的那些，单目标行不标）。REV-6 **不据此改任何撤销结论** —— 它只让身份可依赖。

A grouped member whose change snapshot is missing is **marked** (`identity_incomplete`, a chain-external
annotation column) rather than silently treated as a complete identity. Rejecting the registration was
ruled out: the business rows are already written, so refusing to record would leave this write with no
side-effect row at all — an effect the revoke can never reach, trading a recoverable failure for an
unrecoverable one. Backfilling the *change* is not honestly possible; the migration backfills only the
annotation, from existing columns. This changes no revoke conclusion.

### 5.6 中间写：撤销前问一句「还是不是我写的那条」 / Mid-write: ask "is it still the record I wrote"

撤销路径原先只读「**是不是软删了**」（`revoke_status` 与目标 `deletedAt`），`after_snapshot` **从不参与判定**
—— 它只被写入（`record` / `recordGroup`）、被展示（列表 / 追踪）、被拿去做人读摘要。⇒ AI 写入之后、撤销之前
若**有人或别的系统改过该目标行**，撤销**照样软删并报成功**：那次改动被一并抹掉，且没有任何提示。

现在在本地软删**之前**重读目标，用**同一个捕获器**（与写入时同一套归一化，否则形状不可比）拿当前内容，
与 `after_snapshot` 比对；不同则**点名变化的字段**，写进那条通路的可见面（单条结果的 `message`；组内成员
逐条带 `message`，并**并进组级摘要**——否则摘要会把逐成员消息遮住）。**两条路径同一处比对**，免得又落进
本仓反复修的那类缺陷（同一状态、两条路两个结论）。

**比对只认内容**：剔除 `createdAt` / `updatedAt` 这两个由 ORM 维护的记账列。留着它们，**任何一次触碰**
都会被读成「目标被改过」，而**用噪音报出来的东西没人会看**——那等于把这次检查关掉。如实写出的边界：某个业务列
若也会为无关原因自行变动（计数器之类），它仍会被读成漂移，那属于**误报**而非漏报，且会点名是哪个字段。

**边界**：只做「**可检出、不静默**」——**不**拒绝、**不**改判定、**不**写争议列。走既有 `message` 而非新增
结构化键，理由不是「契约不许加」，而是**两条路的开放度不同**：单条 `revokeResult` 是
`additionalProperties: true`（加键不破契约），而**批量逐条** `item` 与 `revokeBatch` 是 `false`（加键要升
版本）。漂移两条路都要答，只在单条加键就成了「同一状态、两条路两个形状」——正是本仓反复修的那类缺陷。
**判不了就如实不报**（无捕获器 / 该行本就无 `after_snapshot` / 当前行读不到）：不假装未漂移，也不假装漂移。
**未做**：保留他人改动、只撤 AI 那部分（需字段级回滚，另一个量级）。

The revoke path judged only *whether the target had been soft-deleted*; `after_snapshot` never entered the
decision, so a change made between the AI's write and the revoke was erased with the delete and reported
as a clean success. It now re-reads the target **through the same captor** (same normalisation, or the two
sides are not comparable) before the local soft delete, compares against `after_snapshot`, and names the
fields that moved on the readable surface of that path — the single result's `message`, and for grouped
members their per-member `message` **and** the group summary, which would otherwise hide them. Both paths
share one comparison, so the verdict cannot differ by route.

Only ORM bookkeeping timestamps (`createdAt` / `updatedAt`) are excluded: keeping them would make *any*
touch read as drift, and a check that shouts on everything is a check nobody reads — which is the same as
turning it off. Stated limit: a business column that moves for unrelated reasons still reads as drift; that
is a false positive, not a miss, and it names the column.

Boundary: detectable, not silent — no refusal, no verdict change, no dispute mark, no wire change (the
existing `message` carries it). **Undeterminable cases report nothing** rather than guessing. Not done:
preserving the other party's edit and revoking only the AI's part (field-level rollback, a different order
of work).

### 5.7 已恢复的行再撤销：幂等判据与读侧同源 / A restored row: the idempotency criterion matches the read side

幂等判据此前只看 `revoke_status === 'revoked'`，而读侧 `isRestored` 要求「`revoked` **且** 目标仍未软删」——
**同一条状态、两条路两个结论**：一条撤销后从回收站恢复的行（目标又活了），撤销侧仍报 `already_revoked`
（即 `revoked: true`），而列表侧早已按 `targetSoftDeleted` 把它读成 `executed`。于是用户看到「已撤销」，
而那条业务动作**活着**。而回收站恢复**只清 `deletedAt`、不动 `revoke_status`**（§3 / RG-3），故这个组合是
**真实可达**的，不是假想。

现取**同一判据**：`revoked` **且目标仍在软删态**才算完成；目标已复活 ⇒ 不算完成 ⇒ 走正常撤销路径
（读侧本来就是这么建模的：恢复 ⇒ 这条又活了 ⇒ 可再撤）。**目标读不到**（无撤销器 / 行不存在）⇒
**判不了**，按完成处理——保守方向是「不因读不到就去重复补偿」。

**只在有本地软删语义时**才这么判。`describeTarget` 对**外部**副作用返回的是**占位** `{deletedAt: null}`
（「撤销语义在外部」，不是「目标活着」）；照它判会把外部行读成未完成而**重复外呼补偿**——那正是本仓反复
修的那类「同一状态、两条路两个结论」，只是这次会以真金白银的形式出现。故以 `_classOf === 'local_compensate'`
且撤销器认这个 resultType 为门。

The idempotency criterion read only `revoke_status === 'revoked'` while the read side's `isRestored` requires
the target to *still* be soft-deleted — one state, two verdicts. A row that was revoked and then restored from
the recycle bin has a live target again, yet the revoke side still called it done. The two now share one
criterion: revoked **and** the target still soft-deleted. An unreadable target is treated as done — the
conservative direction is not to compensate again merely because the state could not be read. The check is
gated on local soft-delete semantics: `describeTarget` returns a *placeholder* `{deletedAt: null}` for external
effects, and reading that as "alive" would re-dispatch a real external compensation.

### 5.8 外部补偿派发：先认领再外呼 / Dispatch a compensation only after claiming it

派发此前是**裸 read-modify-write**：无条件写「意图」（`compensating`），再外呼。两次并发撤销会**各自读到
`revoke_status = null`**、各自写意图、**各派发一次**。退款 / 取消订单这类端点若非幂等，那是**真双发**；而且
先成功后失败的那一次会把 `revoke_failed` **覆盖**掉先前的成功读数。

现把「写意图」这一步变成**条件更新（认领）**：只有仍处「未派发」（NULL）或「上次失败、可重试」
（`revoke_failed`）的行才放行派发，命中 0 行 ⇒ **不派发**，如实回报（`skipped` + `reason: 'compensating'`）。
认领落地后，这一轮派发里本行**只有一个写者**，故上面那条覆盖风险随之一并消失——**不需要**再给回写加条件。

条件更新是唯一仲裁点，与 `ConfirmationStore.resolve` / `R4ApprovalService._claimExecution` 同先例。
**谓词必须写成 `revoke_status IS NULL OR revoke_status = 'revoke_failed'`**：SQL 里 `x IN (NULL, …)` 对 NULL
恒不成立，写成 `In([null, 'revoke_failed'])` 会让**首次派发**永远认领不到（本仓用 `Raw` 显式写这条谓词）。

**边界**：只做「不重复派发」。**不**做自动重试（`revoke_failed` 可重试仍走同一入口；`compensating` 的死活
由 REV-2 的年龄/窗口读数交给人判），也**不**因此把任何状态改写成成功或失败。

**fail-closed**：认领判据取 `!claim?.affected` 而**不是** `=== 0` —— `affected` 缺失是「**没读到**」，
不是「读到了许可」。拿不到可判定的结果一律当认领失败、不派发（口径同 `ConfirmationStore.resolve`）。
宁可少派发一次（可重试），也不多执行一次**不可逆**的外部操作。

Dispatch used to be a bare read-modify-write: write the intent unconditionally, then call out. Two concurrent
revokes each read `revoke_status = null`, each wrote the intent, and each dispatched — a real double refund
where the endpoint is not idempotent, with a later `revoke_failed` overwriting an earlier success. The intent
write is now a conditional claim: only a row that is still undispatched (`NULL`) or retryable (`revoke_failed`)
may dispatch; zero rows hit means no dispatch and an honest report. The claim leaves one writer for the row in
that round, which is why the overwrite risk disappears without adding a condition to the outcome write. The
predicate must test `IS NULL` explicitly — `x IN (NULL, …)` is never true in SQL.

### 5.5 落点与验收 / Landing points

| 缺口 | 实现落点 | 证据（**对旧实现为红**） |
|---|---|---|
| 5.1 少记录 | `recordGroup` 冲突分支 + `_markDisputeIfDeclarationDiffers` / `_groupResult` / `_withDisputeNote` / 迁移 `1828000000000` | `revoke-dispute.spec.ts`（旧实现：不写标记、汇总 `revoked:true`） |
| 5.2 两个窗口 | `_doRevokeSingle` 外部分支（意图→外呼→确认）+ `_patchRevoke` + `revokeWindow()` | `revoke-intent-ack.spec.ts`（旧实现：外呼时零写入、确认列从不写） |
| 5.3 检出 | `findSplitGroups()` + `GET /ai/tool-effects/splits` | `revoke-split-detection.spec.ts`（真 sqlite；旧实现无此能力） |
| 5.3 闸门 | `_crossGroupClaims` + `_concludeSingle` / `_compensateGroup` / `_revokeBatch` / `_disputeNotes` | `revoke-split-gate.spec.ts`（旧实现：汇总恒 `revoked:true`，从不问别的组） |
| 5.4 身份 | `recordGroup` 标注 + `list()` 读出 + 迁移 `1829000000000` | `revoke-identity.spec.ts`（真 sqlite；旧实现连该列都不存在） |
| 5.6 中间写 | `_targetDrift` / `_contentOnly` / `_withDriftNote`（`_doRevokeSingle` 与 `_compensateGroup` 共用）+ `_groupResult` 的漂移车道 | `revoke-content-drift.spec.ts`（真 sqlite + 真捕获器；旧实现从不比对 `after_snapshot`） |
| 5.7 已恢复行 | `_skipReason`（改读目标；三处调用点随之 `await`） | `revoke-restored-row.spec.ts`（真 sqlite；旧实现走跳过 → 报完成而目标仍活） |
| 5.8 派发认领 | `_doRevokeSingle` 外部分支的**条件更新**（`Raw` 写 `IS NULL OR revoke_failed`；判据 `!claim?.affected`，fail-closed） | `revoke-dispatch-claim.spec.ts`（真 sqlite；旧实现并发两次会派发两次；fail-closed 对 `=== 0` 变体为红） |
| 5.9 compensating 计成什么 | `_doRevokeSingle` 外部返回值 + `_compensateGroup` / `_revokeBatch` 计数 | `ai-tool-effects.service.spec.ts` · `revoke-conversation.spec.ts` · `proxy-bridge.e2e-spec.ts`（旧实现：把 `compensating` 算进 `revoked`） |

九处均不改 wire 契约：新列是**链外注解列**（`_chainPayload` 白名单不加 key），`revokeResult` 本就是
`additionalProperties: true` 而结论只走 `revoked` + `message`（不新增键），`item` / `traceItem` 的形状未动，
`identity_incomplete` 只出现在管理端列表（不在 `item` / `traceItem` 的同名形状里）；§5.6 的漂移事实也走
`message`，未新增键。

### 5.9 `compensating` 被计成什么：四条撤销路径同向 / What `compensating` counts as, on all four paths

ARC-3（派发前先认领）见 §5.8。**剩下两条与它同源**，共同点是**账上的读数比事实更确定**——编号见私有
roadmap §2.1.10（ARC-2 / ARC-7）。`compensating` 意为「已请求外部补偿、结果未知」，而：

| 缺口 | 形状 |
|---|---|
| **ARC-2** | 单条外部分支用 `revoked: r.ok`，而组级 `_groupResult` 守卫 `!compensating`：**同一条 `compensating`、同一状态，单条说「已撤销」而组级说「未完成」** |
| **ARC-7** | 批量与级联把 `compensating` 计进 `revoked`（`revoked++` 只看 `it.revoked`），而管理台 toast 念的正是这三个数（`aiCenterConvRevokeDone`）——一次**已请求但未完成**的补偿被显示成「已撤销 N 项」。组级更自相矛盾：`cascade.revoked` 报 2 而 `result.revoked` 报 false |

**修法**：**四条路径同向** —— 新派发不再报 `revoked`，且给出与「本就在 `compensating` 的行」**完全相同**的读数
（`skipped` + `reason: 'compensating'`）；逐条结果把这个读数带进汇总，故批量的 `revoked` 计数与级联的
`cascade.revoked` 都不再含待目标系统的成员。对方**拒绝**（非 2xx）仍是 `revoke_failed`、**不进 `skipped`**
——「失败」与「未完成」在汇总里必须分得开。

**落点与验收**

| 缺口 | 实现落点 | 证据（**对旧实现为红**） |
|---|---|---|
| ARC-2 单条 | `_doRevokeSingle` 外部分支返回值 | `ai-tool-effects.service.spec.ts`（旧实现：`res.revoked === true`）· `revoke-conversation.spec.ts`（旧实现：`r.revoked === 1`）· `proxy-bridge.e2e-spec.ts` |
| ARC-7 级联计数 | `_compensateGroup` 外部队列携带 `skipped` / `reason` | `ai-tool-effects.service.spec.ts`（旧实现：`cascade.revoked === 2` 而组级 `revoked === false`） |
| ARC-7 批量计数 | `_revokeBatch` 非组分支 `else if (r.skipped)` | `revoke-conversation.spec.ts`（旧实现：`r.revoked === 1`、`r.skipped === 0`） |

**不改 wire 契约**：`skipped` / `reason` / `revokeStatus` / `external` 都是 `item` **既有**的字段
（`compensating` 早经 `_skipReason` 的跳过分支返回这一组读数），本次只是让**新派发**与**跳过**同形；
`revokeResult` 的结论仍只走 `revoked` + `message`，未新增键。**变的是这三个数的取值口径**，不是形状。

> **边界（刻意不做的）**：`compensating` 在汇总里落 `skipped` 而**不**新增一个 `pending` 桶 ——
> `RevokeBatchResult` 的顶层键是契约的一部分，加桶要动 wire。**代价**：「跳过」这个词本身不区分
> 「没动」与「已请求、在等」，要区分只能读 `reason`。这是**已知的不精确**，不是遗漏 —— 真正的出口是 §4 G2 的终态收敛。

## 6. 相关文档 / Related

- [cascade-compensation.spec.md](cascade-compensation.spec.md)（级联撤销 / 业务级补偿——闭合本契约 B2 / C / G3）
- docs/evidence-root.spec.md（授权快照 + 证据根；撤销目标状态在证据包内）
- docs/hs11-audit-chain.spec.md（审计哈希链）· docs/ai-action-center.spec.md（我的 AI 行为/撤销入口）
- docs/audit-lifecycle-elsteps.spec.md（A-3 生命周期；撤销节点显示级联条数、恢复节点据 `restored` 转 finish）
- docs/integrator-kit/java-compensation-example.md（B 路径外部补偿示例）
- docs/manual/code-review-severity.md（把扫描/评审发现分级，本契约归 Trust 核心 P1）
