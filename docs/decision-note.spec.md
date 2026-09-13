# Decision Note（人读「决策说明」）— 功能规格 (Spec) / Decision Note — Functional Specification

> 版本 / Version: v1.0（定稿 / Finalized）
> 日期 / Date: 2026-09-12
> 状态 / Status: **定稿（设计先行）** —— 落地在 1.1 后（对齐 roadmap §22.18 D-3）
> 归属 / Home: 审计交付物层（**不新增证据事实**，只做人读化）

> 基于 / Based on：既有 **审计解释器** `Server-NestJS/src/ai/audit/audit-interpreter.service.ts`（`summarizeAudit` 已把审计行渲染成人读句：谁/做了什么/结果/越权·高风险阻断/流程节点/确认决策），+ 授权快照 `authorization.{allowed,denied}`（W5-⑦：`allowed{tool,checks[],policy{revision,updatedAt}}` / `denied{reasons[]}`）+ **P-③ policy-history 回放**（`replayDecision`，已实现）。
> 关联 / Related：D-2 `docs/evidence-report.spec.md`（授权段复用本说明）｜ D-1 `docs/period-audit-report.spec.md`（"为什么允许"列复用本说明）｜ docs/manual/compliance-mapping.md（证据 → 控制项）｜ docs/policy-history-reproducible.spec.md ｜ roadmap §22.18 D-3

---

## 1. 概述 / 1. Overview

### 1.1 问题 / 1.1 Problem

审计员最常追问的不是"谁做了什么"（解释器已答），而是「**凭什么允许**」。当前 `authorization.allowed` 里其实**记了**依据（角色/行级范围/策略版本 `policy.revision` + `checks[]{name,ok}`），但它是**技术结构**，且解释器对"放行"只印一句「执行「businessEvent」」——**凭什么允许被丢失在人读层**。策略历史回放（P-③）能证"当时哪版规则 + 是否仍可复现"，同样未人读化。

### 1.2 目标 / 1.2 Goal

**扩展现有审计解释器**（不新建服务）：对一条审计行/动作，在既有"谁/什么/结果"之外，产出**人读「决策说明」**——
> 「允许：角色=user，范围=本人数据（userId 匹配），策略版本=r7（2026-09-10 更新），检查=策略启用✓ / 角色白名单✓ / 邮箱验证✓；按当时策略回放：**一致**」
并对**拒绝**产出「哪个检查未过」的可读理由。产出 = **句子 + 语义 key + 结构化字段**（沿用解释器既有 `{sentence, key, businessEvent, stats}` 形态，供 UI/i18n 与 D-2/D-1 消费）。

### 1.3 非目标 / 1.3 Non-goals

- ❌ **不新建解释器/服务**——扩展 `audit-interpreter.service`（单一真源；对齐 Code Economy 15.7）。
- ❌ 不新增端点/表/列/证据来源（授权快照 + policy-history 均已存在）。
- ❌ 不新增"决策"信息——只把**已在快照里**的依据人读化（缺字段则如实标注"未记录"，不推断）。
- ❌ 不用 LLM 生成说明（确定性模板；审计说明须可复现，不得随模型漂移）。
- ❌ 不承诺回放一定可达（无 `policy.revision` 时不可回放，如实降级）。

---

## 2. 范围 / 2. Scope

- 扩展 `summarizeAudit(row, convRows, ctx?)`（或新增同级 `explainAuthorization(row)`，被 `summarizeAudit` 调用）：对 `authorization.allowed` / `authorization.denied` 产出人读依据句 + 结构化字段。
- **消费方（复用，不重复渲染）**：D-2 报告的「授权依据」段、D-1 报告的「为什么允许」列、AI 审计列表 / B4 治理视图 / Action Center。
- 回放判定：给定 `policy.revision` 时调 P-③ `replayDecision`（沿用 `audit.service` 证据根装配点的同一逻辑，**单源**），得「一致 / 漂移 / 不可回放（无 revision）」三态。

---

## 3. 决策说明内容 / 3. Decision Note Content

| 情形 | 输入（快照） | 人读说明（句） | 结构化字段 |
|---|---|---|---|
| **允许** | `authorization.allowed{tool, checks[]{name,ok}, policy{revision,updatedAt}}` + 身份 | 「允许：角色=…，范围=…，策略版本=…（更新于 …），检查=…全过」 | `{decision:'allow', role, scope, policyRevision, policyUpdatedAt, checks:[{name,ok}], replay:'consistent'|'drift'|'unavailable'}` |
| **拒绝** | `authorization.denied{reasons[]}`（= AuthorizationDeniedError.reasons） | 「拒绝：检查=…未过（原因…）」 | `{decision:'deny', failedChecks:[…], reasons}` |
| **无快照** | `authorization = null` | 「未记录授权依据（该动作早于快照或非治理路径）」 | `{decision:'unknown'}` |

- **范围人读化**：`checks` 形如 `scope=all|own` / `role=…` / `emailVerified` / `featureFlag` → 映射为可读短语（沿解释器既有语义 key 机制，前端 i18n）。
- **回放附注（P-③）**：`policy.revision` 存在 → 调 `replayDecision` 得「按当时策略回放：一致 / 漂移」；缺失 → 「快照未含策略版本，无法回放（如实降级）」。
- **策略快照附随**：说明可携带 `policy` 的 `revision + updatedAt`（+ 需要时由 policy-history 提供当时对象），供 D-2/D-1 附「当时哪版规则」。

---

## 4. 诚实边界 / 4. Honest Limits

- 说明**只反映快照记录**：快照缺 `policy.revision`/`checks` 时，如实说"未记录"，**不推断、不回填**。
- 回放 = 拿 policy-history 的**当时版本**重演**该次决策输入**；不等于"当时一定没漂移"（历史表覆盖范围内才可回放）。
- 说明是**确定性模板**（非 LLM）——可复现、可归档；措辞对齐 product-language。
- 不引入新证据主张：「说明」是被验证据的人读投影，本身不是新证据。

---

## 5. 单一真源与 i18n / 5. Single Source & i18n

- **单一真源**：授权人读化只在 `audit-interpreter.service` 一处实现；D-2/D-1/UI 一律**消费其产物**，不各自渲染（禁平行实现）。
- **i18n**：沿用解释器既有 `key`（语义 key → 前端 `src/i18n` 渲染）+ `sentence`（默认中文）；新增 key 如 `authz.allow`/`authz.deny`/`authz.replay.*`；中英齐全。

---

## 6. 端点与交互 / 6. Endpoint, Interaction

- **无新端点**。人读说明随既有响应下发：AI 审计列表 / B4 治理视图（`/ai/governance/action/:t/:id`）/ Action Center / 证据根（D-2 段）/ 期间报告（D-1 列）。
- 若快照在返回体中已含 `authorization`，则由**前端**调同一解释器语义（key）渲染；服务端已有处补 `decisionNote` 字段即可（实现期定，**不加端点**）。

---

## 7. 验收与测试 / 7. Acceptance & Testing

- **允许说明**：给定 `allowed{checks 全 ok, policy.revision}` → 产出含「角色/范围/策略版本/检查全过」的句子 + `replay:'consistent'`（mock replayDecision）。
- **拒绝说明**：`denied{reasons}` → 句含失败检查与原因。
- **降级**：`authorization=null` → `decision:'unknown'` 且句含"未记录"；无 `policy.revision` → `replay:'unavailable'`（不抛错、不推断）。
- **回放三态**：一致 / 漂移 / 不可回放 各一断言（复用 policy-history 既有测试桩）。
- **单一真源**：断言无第二处授权人读化实现（或：D-2/D-1 消费同一函数）。
- **i18n**：`key` 覆盖 allow/deny/replay 三态，中英均有。
- **确定性**：同输入两次 → 同句（非 LLM）。

---

## 8. 文件改动清单 / 8. File Change List

| 文件 | 改动 |
|------|------|
| `Server-NestJS/src/ai/audit/audit-interpreter.service.ts` | 新增授权人读化（`explainAuthorization` / 并入 `summarizeAudit`）+ 结构化字段 + replay 三态 |
| `Server-NestJS/src/ai/audit/audit-interpreter.service.spec.ts` | 允许/拒绝/降级/回放三态断言 |
| 消费处（D-2/D-1 渲染器、现有审计/B4 响应） | 消费同一产物（实现期接线）|
| **不改** | 无新端点、无迁移、无新表、无新服务 |

---

## 9. 关联 / 9. Related

本规格即其设计先行 ｜ **D-2** / **D-1**（授权段 / "为什么允许"列消费本说明）｜ `audit-interpreter.service.ts`（被扩展的单一真源）｜ `docs/policy-history-reproducible.spec.md`（replayDecision）｜ authorization（W5-⑦ Explainable Authz：`/auth/me/permissions`、`/auth/permissions/explain`）｜ docs/manual/compliance-mapping.md ｜ roadmap §22.18 D-3

---

## 10. 决议（已锁定，2026-09-12）/ 10. Decisions (locked)

1. **实现形态 = 扩展现有审计解释器**（`audit-interpreter.service`），**不新建**服务/端点；D-2/D-1/UI 消费同一产物（单一真源）。
2. **双语 = 沿用解释器 `key`（前端 i18n）+ `sentence`**；新增 `authz.*` 语义 key，中英齐全。
3. **回放 = 复用 P-③ `replayDecision` 单源**，三态（一致/漂移/不可回放）如实；无 `policy.revision` 时降级不推断。
