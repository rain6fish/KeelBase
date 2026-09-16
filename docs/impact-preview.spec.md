# Impact Preview（确认卡影响预览）— 功能规格 (Spec) / Impact Preview — Functional Specification

> 版本 / Version: v1.0（定稿 / Finalized）
> 日期 / Date: 2026-09-16
> 状态 / Status: **已实现（2026-09-16）**（见 §8）
> 归属 / Home: 确认门控（§22.17 ④「级联撤销 / 业务补偿」的**影响预览切片**；护城河核心第二块的第一步）
> 关联 / Related：`docs/run-level-approval.spec.md`（KB-5 run 聚合）｜ `src/ai/tool-effects/write-effect-type.ts`（副作用对象单源）｜ roadmap §22.17 ④

---

## 1. 概述 / 1. Overview

### 1.1 问题 / 1.1 Problem

写工具确认卡当前告知「**什么**将被执行」（`toolName` + `summary` + `arguments` + 授权依据），但**不告知「影响面」**——将执行几个写动作、涉及哪些业务对象。run 卡只给动作条数，单条卡什么都不给。用户答"确认"时，其实在为一个**只见动作、不见影响面**的操作背书。

### 1.2 目标 / 1.2 Goal

确认前给出**结构化影响预览**：

> 「预计影响：3 个写动作 · 涉及 crm_task ×2、contract ×1」

- **单一真源**：影响面的对象类型 = 副作用登记的同一单源（`writeEffectTypeFor` / proxy → `proxy_call`），**不新建映射表**，防两处漂移。
- **纯估计、不执行**：由工具名确定性推导，**不查库、不试跑、不 dry-run**（dry-run 会触达真实系统，违背确认门控的意义）。
- **诚实**：无法解析副作用对象者**不计入**（它们本就不产生可撤副作用），而不是编一个数字。

### 1.3 非目标 / 1.3 Non-goals

- 不做「将改 N 行」的**逐行精确**预览（需查库/试跑；当前写工具均为单行 create 语义，且外部系统行数不可知）。
- 不做级联撤销本身（§22.17 ④ 主体，另议）；本切片只提供其前提——**影响面的结构化描述**。
- 不改证据事实层：`impact` 是**呈现层派生**，不入哈希链 payload、不进证据包（性质同 trace/UI 派生）。

---

## 2. 数据形状 / 2. Data Shape

`impact` 为 `confirmation_request` 载荷的**可选**字段（`ConfirmationRequestData.impact`）：

```jsonc
{
  "actions": 3,                                  // 写动作数；恒等于 targets[].count 之和
  "targets": [                                   // 对象类型分组（resultType 取自副作用单源）
    { "resultType": "crm_task", "count": 2 },
    { "resultType": "contract", "count": 1 }
  ]
}
```

- **缺省即省略**：无可解析对象（如 `review_approval_request` 状态变更、`create_module` 干跑）→ 整个 `impact` 字段不出现，卡片不显示影响行。
- **契约**：wire Schema v2 `specs/protocol/schemas/v2/confirmation-request.schema.json`（v1 冻结留 `schemas/v1/`）；registry `confirmation-request` → v2。

---

## 3. 推导规则 / 3. Derivation

```
单条：targets = 该工具映射到的一个 resultType，count = 1
run ：对批内每个成员各计一次，按 resultType 分组求和
```

- 对象类型解析**复用** `writeEffectTypeFor(toolName)`（`create_followup_task → crm_task`、`create_<module> → <module>` 等）；proxy 写工具 → `proxy_call`（与登记副作用同一判据）。
- 解析为 null 的工具**跳过**（fail-closed：它们本就不登记可撤副作用）。
- 解析结果为空 → 省略 `impact`（不显示「0 个动作」这类噪声）。

---

## 4. 渲染 / 4. Rendering

- **Web**：`AiConfirmationCard.vue` 在摘要与授权区之间加一行影响预览（run 卡与单条卡同形）。
- **Flutter**：确认卡同形呈现。
- **双语**：文案走 i18n（`confirmImpact` / 对象类型按 `resultType` 原样显示——它是机器标识，不翻译，避免与撤销/审计页口径分叉）。

---

## 5. 边界与红线 / 5. Boundaries

| 项 | 立场 |
|---|---|
| 估计 vs 承诺 | 文案用「预计影响」，**不写**「将改 N 行」等确定性承诺（外部系统行数不可知） |
| 不触达系统 | 纯推导，**不查库不试跑** |
| 证据层 | `impact` 不入链、不进证据包（呈现层派生） |
| 单源 | 对象类型不得另建映射表；必须走 `writeEffectTypeFor` |

---

## 6. 验收 / 6. Acceptance

1. 单条写确认（`create_followup_task`）→ 载荷含 `impact{actions:1, targets:[{crm_task,1}]}`，卡片显示影响行。
2. run 确认（2×`create_followup_task` + 1×`create_contract`）→ `impact{actions:3, targets:[{crm_task,2},{contract,1}]}`。
3. 干跑/无副作用对象（`create_module`）→ **无** `impact` 字段、卡片无影响行。
4. wire Schema：两份 v2 样例过 `wire-schema.spec.ts`；registry 版本 = v2。
5. 回归：确认流（含 run 一次授权整批）行为不变，仅多带一个可选字段。

---

## 7. 测试 / 7. Tests

- 后端：推导单测（单条 / run 分组求和 / 无副作用对象省略 / proxy → `proxy_call`）+ payload 断言。
- Web：`AiConfirmationCard` 渲染影响行（run 与单条）。

---

## 8. 实现 / 8. Implementation

- 契约：`specs/protocol/schemas/v2/confirmation-request.schema.json` + 2 样例 + registry → v2（**先行**，CE-1 C1 单源规则）。
- 推导：`src/ai/tool-effects/write-impact.ts`（复用 `writeEffectTypeFor`）。
- 接线：`src/ai/ai.service.ts` 三处 `confirmation_request`（单条 / R4 审批 / run）。
- 渲染：`Web-Admin-Vue/src/components/AiConfirmationCard.vue` + Flutter 确认卡。
