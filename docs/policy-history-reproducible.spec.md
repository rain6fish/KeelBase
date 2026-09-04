# Policy History & Cross-Version Replay（策略历史表 + 跨版本回放）— 功能规格 (Spec)

> 版本 / Version: v0.1（设计，roadmap §22.17 冻结后 P-③）
> 日期 / Date: 2026-09-04
> 状态 / Status: Draft（9/25 冻结前只出规格，落地含迁移，排冻结后）/ Draft (spec only pre-freeze; implementation incl. migration post-freeze)

> 基于 / Based on：roadmap §22.17 P-③；Policy Evidence（docs/audit-authz-snapshot.spec.md §5，`verifyReproducible` 边界）；Evidence Root（docs/evidence-root.spec.md §5.3 衔接点）。
> Related: docs/audit-authz-snapshot.spec.md ｜ docs/evidence-root.spec.md ｜ Server-NestJS/src/ai/governance/governance-policy.service.ts

---

## 1. 问题 / 1. Problem

③ Policy Evidence 已实现「**内容指纹 revision + verifyReproducible 当前重放 + 漂移检出**」：放行授权快照冻结 `policy.revision`，verifyReproducible 用**当前**策略重演决策，返回 未漂移 / 漂移但该工具判定未变 / 漂移且判定变 三态 + recorded/current revision。

**缺口（诚实边界，已在 audit-authz-snapshot §5.4 / evidence-root §5.3 记录）**：无策略历史——若策略已漂移，只能报「漂移」，**不能拿当时那版策略对象真重演**去证明「若用旧规则，仍会/不会放行」。强监管审计的问题是"当时依据 v17 规则放行，v17 规则下重演应同结果"——现只能自证"当前规则不一致"，不能给"历史版一致"的闭环证据。

## 2. 方案 / 2. Approach

新增 `ai_governance_policy_history` 历史表：**每次 `setPolicy` 快照**（revision + 规范化 value + appliedAt）；`replayDecision(recorded)` **按 recorded.policyRevision 查历史行 → 用当时策略对象真重演**该工具的放行判定；`verifyReproducible` 升级为「**历史优先，历史未命中回落当前指纹**」。全程零 schema 破坏（新增表/迁移），不重写既有 revision/指纹语义。

## 3. 数据规格 / 3. Data Spec

`ai_governance_policy_history`（新表，TypeORM 迁移 `AddAiGovernancePolicyHistory`，双方言）：

| 列 | 类型 | 说明 |
|---|---|---|
| `id` | bigint PK 自增 | 历史行主键 |
| `revision` | varchar(16) | 该次快照的**内容指纹**（同 setPolicy 返回的 revision；同内容重复写 → 同 revision，语义幂等）|
| `value` | text | 规范化后的策略 JSON（`normalizePolicy` 输出，含 mode）|
| `applied_at` | datetime | 写入时间（setPolicy 时点）|
| `created_at` | datetime | 行创建（= applied_at；预留拆分）|

索引：`[revision]`（回放查找）、`[applied_at]`（历史列表倒序）。

- 写侧：`GovernancePolicyService.setPolicy` 保存当前行后，同事务/紧随插入历史行 `{revision: 新指纹, value: normalized, appliedAt: now}`（revision 同 → 可插重复行或去重；**定案：可重复插入**——语义幂等、查找取最新，保留"何时改过"痕迹；表增长按策略变更频度极低，无需裁剪，仍保留可选保留策略见 §6）。
- 读侧（复用现有指纹口径）：`getPolicy` 不变；新增 `getPolicyRevisionHistory(limit)`、`getPolicySnapshotByRevision(revision)`。

## 4. 跨版本回放 / 4. Cross-Version Replay

`GovernancePolicyService.replayDecision(recorded: { tool, checks, policyRevision })`:

1. `history = getPolicySnapshotByRevision(recorded.policyRevision)`；
2. **命中历史** → 用该历史 `value` 重构该工具当时判定：`tool_enabled = snapshot.tools[tool].enabled ?? true`；`role_allowed` 依 `allowedRoles` 与 `recorded` 上下文（checks 里已含 role 判定结果时可直接对拍 `tool_enabled` 是否 == recorded 的 `tool_enabled.ok`，角色判定因需用户角色快照不在策略内，见 §6 边界）；
3. **历史未命中**（早于历史表建立/被裁剪）→ 回落现有 `verifyReproducible` 语义（当前指纹重放 + 漂移检出），返回带 `mode:'current-fallback'`；
4. 返回：`{ mode:'history'|'current-fallback', recordedRevision, replayedValue?: { toolEnabled }, toolDecisionChanged: boolean, reproducible: boolean, note }`——`reproducible = 历史版 toolEnabled 判定与 recorded.checks 一致`。

- `verifyReproducible(recorded)` **升级实现**：内部先试 `replayDecision`，history 命中则以其结果为准（`policyChanged` 语义并入：recorded.revision != 当前 revision 时由 replay 判定一致性）；未命中才走原当前重放。返回结构保持向后兼容（新增 `mode` 可选字段）。
- 装配点（未来）：Evidence Root v3（evidence-root.spec §5.3）把 authorization 里 `policy.revision` 接 `replayDecision`，给"为什么允许仍成立"提供历史版实证；合规段可带 recorded+current revision 与 replay 结果。

## 5. 端点 / 5. Endpoints（admin）

- `GET /api/v1/ai/governance/policy/history`（admin）：历史列表（revision/appliedAt/value 摘要，倒序，分页/limit 钳制）。
- `GET /api/v1/ai/governance/policy/history/:revision`（admin）：单版本快照（供回放/比对人读）。
- 回放助手为服务内方法（供 verifyReproducible 与证据装配），暂不单独开 HTTP 端点（防管理面膨胀）；如需可在策略中心加「重演某条决策」调试口（后续）。

## 6. 边界与诚实 / 6. Boundaries & Honesty

- **role_allowed 不能纯历史重演**：角色判定需要**当时的用户角色**，用户角色不在策略快照里（实时取库）。故历史重演只对**策略内输入**（tool_enabled / 该工具的 allowedRoles 集合存在性）给出确定性；角色判定一致性以 recorded.checks 中已冻结的 role 结果为准（事件时点即已定）。Spec 明示，不夸大"整条决策可重演"。
- revision 为内容指纹：历史重演对"同内容不同时间"幂等（同 revision 任意快照同结果），无歧义。
- 表增长低（策略低频变更）；如未来高频，加保留策略（如仅存最近 N 或按 appliedAt 保留期）——当前不引入。
- 不重写 ③ 的 revision 指纹/getPolicy 语义；新表仅承载"当时长啥样"。

## 7. 验收与测试 / 7. Acceptance & Testing

- 迁移：fresh DB 双方言可用；`revision` 历史可插重复行、查找取最新。
- 单元：setPolicy 后历史 +1；replayDecision 命中历史（toolEnabled 变 → toolDecisionChanged/reproducible 正确）；未命中回落 mode:'current-fallback'（行为等同现 verifyReproducible）；verifyReproducible 历史优先。
- e2e：改策略两次（v1 enabled / v2 disabled）→ 用 v1 revision 的 recorded 回放 → reproducible true；用 v2 快照的 recorded（当时 enabled:true 但 v2 disabled）→ false 且 note 指历史 disabled。
- 文档：audit-authz-snapshot §5.4 / evidence-root §5.3 的"需历史表"后续项勾销为 P-③ 落地。

## 8. 文件改动清单 / 8. File Change List

| 文件 | 改动 |
|---|---|
| `Server-NestJS/src/ai/governance/ai-governance-policy-history.entity.ts` | 新实体 |
| `Server-NestJS/src/migrations/*-AddAiGovernancePolicyHistory.ts` | 新迁移（双方言 + postgres 白名单）|
| `Server-NestJS/src/ai/governance/governance-policy.service.ts` | setPolicy 写历史；getHistory/getSnapshotByRevision；replayDecision；verifyReproducible 升级 |
| `Server-NestJS/src/ai/ai.controller.ts` | admin history 端点（挂治理策略段）|
| spec / tests | governance-policy.service.spec、migration 一致性 |
| 文档 | audit-authz-snapshot §5.4、evidence-root §5.3 勾销；docs/evidence README（如涉及）|

## 9. 关联 / 9. Related

roadmap §22.17 P-③（本规格）｜③（audit-authz-snapshot §5 verifyReproducible）｜① 证据根（evidence-root.spec §5.3）｜§22.17 ② SM2（历史包加签后续）
