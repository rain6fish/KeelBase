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
- 幂等：`idempotency_key` 防重复 create（同会话同工具同参数复用结果）。
- 完整性：副作用表入哈希链（prev_hash/hash）；撤销仅回写 `revoke_status` 运维态，不入哈希链 payload。
- 归责：本人 `my/tool-effects/:id` 撤销带所有权（`revokeOwned`）；管理端 admin 可撤任意；两路都在 AI Action Center / 决策轨迹留痕。

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
| B2 | 级联：单一复合写工具内部建多行/多表 | 撤销级联清理关联行，或显式声明不可级联并防误删 | ⚠️ 未建模（revoke 仅删 `resultId` 单行） |
| C | 事务 / 部分失败 | 单操作 DB 原子；同批多写部分失败时，已成功部分可被清晰列出并由用户撤销 | ⚠️ 部分：DB 层原子已保证；无"失败自动清扫已成功部分" |
| D | 异步副作用（AI → 队列 job） | `queued/processing` 中间态建模 + 终态收敛 | ⚠️ 本仓 AI 写暂不异步化；未来触发需补状态机 |
| E | 外部 API 补偿 | 补偿已请求（`compensating` 诚实）+ **终态可回读对账**（收敛到 revoked / revoke_failed） | ✅ 补偿请求已实现；⚠️ 终态回读依赖目标系统，主库不轮询收敛 |
| F | 不可逆（邮件/短信/支付/物理） | R5 阻断或 `revokeClass=none`，不展示可撤销入口 | ✅ 已实现（R5 block + none 拒绝 + UI 分支） |

## 4. 已知缺口与后续 / Known gaps & follow-ups

- **G1 run/会话级批量撤销**：✅ **会话级 + run 级均已落地**——`DELETE /ai/tool-effects?conversationId=|runId=`（admin）与 `/ai/my/tool-effects?conversationId=|runId=`（本人，owner 过滤）逐条复用档位门控撤销 + 汇总（service `revokeConversation` / `revokeRun`，共用 `_revokeBatch` 循环）。run 精确粒度：KB-5 run 一次授权执行时把 runId（= run 确认 token）挂到成员的副作用行（`ai_tool_side_effects.run_id`，迁移 `1818000000000`；**链外列**，不入 G-3 哈希链 payload 故加列不破历史链），比会话级更细（一个对话可含多次 run）。
- **G2 外部补偿终态收敛**：`compensating` 长期悬空的展示问题——先做 UI/审计面明确"结果在目标系统"，后续可选轮询/回调。
- **G3 级联副作用边界**：近期无复合写工具则先文档化；出现时给父子 effect 引用最小契约。
- **G4 每个非 none 工具的撤销 E2E**：✅ **本地可撤档已固化**（`test/revoke-acceptance.e2e-spec.ts`，真实 create→record→本人撤销→软删+回收站 restore→状态回 executed + 所有权 404，6 例）；外部补偿由 `proxy-bridge.e2e-spec.ts` 覆盖、`none` 拒绝由 revoke-conversation.spec 单测兜底。新写工具验收回归时按 §2 清单在此套件扩展。

## 5. 相关文档 / Related

- docs/evidence-root.spec.md（授权快照 + 证据根；撤销目标状态在证据包内）
- docs/hs11-audit-chain.spec.md（审计哈希链）· docs/ai-action-center.spec.md（我的 AI 行为/撤销入口）
- docs/integrator-kit/java-compensation-example.md（B 路径外部补偿示例）
- docs/manual/code-review-severity.md（把扫描/评审发现分级，本契约归 Trust 核心 P1）
