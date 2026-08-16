# ORG-5 AI 织入（组织边界 AI 工具）— 功能规格说明 (Spec) / ORG-5 Org-Boundary AI Tools — Functional Specification

> 版本：v1.0
> Version: v1.0

> 基于：私有 roadmap「ORG 组织架构」章节
> Based on: "ORG organization" section of the private roadmap

> 关联项目：KeelBase（App 全栈开发平台）
> Related project: KeelBase (App full-stack development platform)

---

## 1. 概述 / 1. Overview

### 1.1 功能目标 / 1.1 Feature Goals

给 AI Agent 提供**组织边界授权**的工具：查团队忙闲、组织成员目录——AI 只在请求用户所属组织的数据范围内运行（数据隔离复用 ORG-3 的 `org_id` 域 + OrgService 的成员脱敏白名单）。这是「其他系统式组织架构没有的用法」——AI 直接回答「团队这周谁有空」。

Provide AI Agent with **org-boundary authorized** tools: query team availability and the org member directory — AI only runs within the requesting user's org data scope (reusing ORG-3's `org_id` domain + OrgService's masked member allow-list). This is the usage that other system-style org architectures lack — AI directly answers "who on the team is free this week".

### 1.2 关联需求 / 1.2 Related Requirements

- ORG-1~4 / ORG-7 组织数据（org_id 域、成员脱敏）
- ORG-3 数据隔离（events/todos 带 org_id，查询按组织域过滤）
- HS-2 工具权限门控（所有 AI 工具过同一治理层）

---

## 2. 工具规格 / 2. Tool Specification

| 工具 Tool | 名称 Name | 参数 Parameters | 说明 Description |
|-----------|----------|-----------------|------------------|
| 团队忙闲 | `query_org_availability` | `startDate?`, `endDate?`（YYYY-MM-DD，默认今天） | 统计组织成员在某日期范围的事件数（忙闲度）。Aggregates org members' event counts in a date range (busy-ness). |
| 成员目录 | `query_org_members` | `deptName?` | 返回组织成员（昵称/部门/角色，脱敏白名单），可按部门筛选。Returns masked org members (nickname/dept/role), dept-filterable. |

### 2.1 数据边界 / 2.1 Data Boundary

- `getUserOrgId(userId)`：用户非组织成员返回 null → 工具返回「您不是任何组织的成员」，不泄露任何数据。
  `getUserOrgId(userId)`: non-member returns null → the tool returns "you are not in any organization", leaking nothing.
- `listMyMembers(userId)`：仅返回用户所属组织的成员，且仅脱敏白名单字段（id/nickname/avatarUrl/role/deptName）。
  `listMyMembers(userId)`: returns only the user's org members, masked fields only.
- `getEventsForRange(start, end, userId)`：ORG-3 域——本人事件 OR 同组织事件。
  `getEventsForRange(...)`: ORG-3 domain — own events OR same-org events.

---

## 3. 接口规格 / 3. API Specification

无新增 REST 端点——工具经现有 `POST /api/v1/ai/chat`（非流式）与 `/chat/stream`（流式）暴露给 LLM，走统一治理层（HS-2 门控 + HS-9 策略 + 审计）。

No new REST endpoints — the tools are exposed to the LLM via the existing `/ai/chat` and `/ai/chat/stream`, going through the unified governance layer.

---

## 4. 业务规则 / 4. Business Rules

1. **组织边界**：所有查询以请求用户的 orgId 为界；非成员直接拒绝。
   **Org boundary**: all queries scoped to the requester's orgId; non-members rejected.
2. **脱敏**：成员目录只返回昵称/部门/角色，不返回 email/phone/username。
   **Masking**: member directory returns only nickname/dept/role, never email/phone/username.
3. **只读**：两个工具均为只读，无写副作用。
   **Read-only**: both tools are read-only, no write side effects.
4. **治理**：与所有 AI 工具一致，过 `_assertToolAllowed`（HS-2/HS-9）+ 审计。
   **Governance**: like all AI tools, through `_assertToolAllowed` (HS-2/HS-9) + audit.

---

## 5. 局限 / 5. Limitations

- 「团队空闲」当前用事件数近似（有事件的成员视为忙），未做时间段相交判定——v2 可按起止时间精确算空闲。
  "Availability" currently approximates by event count (members with events are busy), not exact time-window intersection — v2 can compute precise free time.
- AI 审计暂未带 org 维度（审计已有 userId，可按 userId 关联 org）；org 维度审计留待后续。
  AI audit does not yet carry an org dimension (audit already has userId, which maps to org); org-dimension audit is a follow-up.

---

## 6. 测试 / 6. Tests

- `query-org-availability.tool.spec.ts`：非成员拒绝 / 成员事件数统计（组织边界）/ 默认日期 / 工具定义（4 用例）。
- `query-org-members.tool.spec.ts`：非成员拒绝 / 脱敏目录 / 部门筛选 / 工具定义（4 用例）。
- 全量：本功能 8 用例（其余套件的 data-import/notifications 失败为并发会话未提交重构）。
