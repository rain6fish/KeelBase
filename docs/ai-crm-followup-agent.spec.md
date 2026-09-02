# AI CRM AI Follow-up Agent — 功能规格说明 (Spec) / AI Follow-up Agent — Functional Specification

> 版本 / Version：v1.0
> 基于 / Based on：私有 roadmap §18.3「A1 — AI Follow-up Agent」（2026-09-01 定案：不做全面升级、纵向打穿）
> 关联项目 / Related project：KeelBase（Business-safe AI Application Platform）

---

## 1. 概述 / 1. Overview

### 1.1 功能目标 / 1.1 Feature Goals

给 AI Agent 增加**主动发现「该跟进谁」**的能力：检测请求用户名下**长期未跟进（默认 30 天无任何跟进活动）**的客户 → AI 汇总建议（哪些客户、多少天未联系、为何值得跟进）→ 用户确认后复用既有 `create_followup_task` 建任务 → 全链审计。

补上 Golden Flow「AI 主动发现问题」一环——此前 AI CRM 是纯被动问答（用户问才查），Follow-up Agent 让 AI 能主动识别业务信号并建议受控行动。

Give the AI Agent the ability to **proactively surface "who needs follow-up"**: detect the requesting user's **customers with no activity for a long time (default 30 days)** → AI summarizes suggestions (which customers, how many days idle, why worth following up) → on user confirmation reuses the existing `create_followup_task` to create a task → fully audited.

This closes the "AI proactively finds problems" loop in the Golden Flow — previously AI CRM was purely reactive (query-on-ask); the Follow-up Agent lets AI spot business signals and propose governed actions.

### 1.2 关联需求 / 1.2 Related Requirements

- 私有 roadmap §18.3「A1 — AI Follow-up Agent」（采纳纵向打穿，非全面升级）
- `create_followup_task`（既有写工具：R3 确认门控 + 副作用 `crm_task` 可撤销）
- `query_customers` / `analyze_customer_risk`（既有读工具，数据同源）
- Human-in-loop（SPC §5.3）：所有写操作须人工确认
- HS-2：所有 AI 工具过同一治理层（权限 + 确认 + 审计）

---

## 2. 工具规格 / 2. Tool Specification

### 2.1 新增只读工具 / New read-only tool: `detect_idle_customers`

| 项 Item | 值 Value |
|--------|---------|
| 名称 Name | `detect_idle_customers` |
| 读写 Read/Write | 读（R1，自动执行）Read-only |
| 参数 Parameters | `minIdleDays?`（默认 30）、`limit?`（默认 20，上限 50） |
| 数据范围 Scope | 仅请求用户本人客户（`userId` 范围，同 `query_customers`） |

**返回结构 / Result shape（确定性数据，AI 只做理解→汇总→建议）：**

```json
{
  "thresholdDays": 30,
  "count": 3,
  "items": [
    { "customerId": 5, "customerName": "辰光建材", "company": "辰光集团",
      "status": "active", "riskLevel": "medium",
      "lastContactAt": "2026-07-20T08:00:00.000Z", "idleDays": 43, "neverContacted": false },
    { "customerId": 9, "customerName": "瀚宇制造", "company": "瀚宇集团",
      "status": "lead", "riskLevel": "low",
      "lastContactAt": null, "idleDays": null, "neverContacted": true }
  ]
}
```

**判定规则 / Rules：**

- **最近联系时间 = 该客户 `crm_activities` 中 `happenedAt` 的最大值**（跨 `call/meeting/email/note` 全部类型；按 `userId` 范围聚合）。**不新增 `lastContactedAt` 存储字段、无迁移**（派生而非冗余）。
- `idleDays = (now - lastContactAt) 的天数`（向下取整）。
- **从未联系**（无任何 activity）：`neverContacted: true`、`lastContactAt: null`、`idleDays: null` —— 命中「需跟进」，按 `createdAt` 升序排最前（越早建立越该优先）。
- 命中条件：`idleDays >= minIdleDays` 或 `neverContacted`。
- 排序：从未联系优先 → idleDays 降序。
- 不含已软删客户（`deletedAt`）。

### 2.2 对话闭环 / 2.2 Dialog Loop

```
用户：哪些客户很久没跟进了？
  → detect_idle_customers (minIdleDays=30)   [R1 自动，审计]
  → AI 汇总：N 个客户 X 天未联系 + 原因（高价值/流失风险/逾期订单…）
  → AI 建议：为「辰光建材」创建跟进任务？（附 dueDate 建议）
  → 用户确认
  → create_followup_task (customerId, title, dueDate)   [R3 确认门控 + 副作用可撤销，审计]
  → 完成 + AiTrace 可见
```

### 2.3 数据边界 / 2.3 Data Boundary

- 工具以请求用户 `userId` 过滤（本人客户 + 本人 activity），跨用户零泄露（同 `query_customers`）。
- 纯后端聚合，无 LLM 参与数据判定——结果确定性，AI 仅负责解释与建议（对齐「风险评分确定性」原则）。

---

## 3. 变更范围 / 3. Change Scope

| 文件 File | 改动 Change |
|-----------|------------|
| `src/crm/crm.service.ts` | 新增 `detectIdleCustomers(userId, minIdleDays, limit)`（聚合 + 判定） |
| `src/ai/tools/detect-idle-customers.tool.ts` | 新增只读工具（R1） |
| `src/ai/tools/detect-idle-customers.tool.spec.ts` | 工具测试 |
| `src/ai/ai.module.ts` | 注册工具 |
| `src/crm/crm.service.spec.ts` | service 单测（idle 命中/从未联系/边界） |

**明确不做 / Non-goals：**
- 不加 `lastContactedAt` 存储字段（activity 派生即够，无迁移）
- 不做专门 UI 页（通过现有 AI Copilot 对话闭环；dashboard 增补留待后续）
- 不主动推送/通知（「建议」停在对话，写操作始终人工确认——符合 Human-in-loop 与 AI 不擅自行动红线）
