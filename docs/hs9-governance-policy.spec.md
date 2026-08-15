# HS-9 治理策略化 — 功能规格说明 (Spec) / HS-9 Governance-as-Policy — Functional Specification

> 版本：v1.0
> Version: v1.0

> 基于：私有 roadmap「HS 系列（业务安全的 Agent harness）」章节
> Based on: "HS series (business-safe Agent harness)" section of the private roadmap

> 关联项目：KeelBase（App 全栈开发平台）
> Related project: KeelBase (App full-stack development platform)

---

## 1. 概述 / 1. Overview

### 1.1 功能目标 / 1.1 Feature Goals

将 AI Agent 的工具权限、确认规则、审计粒度从**代码硬编码**升级为**数据驱动策略**——策略存于动态配置（Settings，RG-2），管理台/运维可实时调整，无需发版。这是 KeelBase 与 mcp-firewall / Aegis 等外部控制平面的核心差异：**治理内建、装好即用、管理台里点**。

Upgrade AI Agent tool permissions, confirmation rules, and audit granularity from hardcoded code to **data-driven policy** — stored in dynamic settings (Settings, RG-2), adjustable at runtime by admins/ops without redeploying. This is the core differentiator vs. external control planes like mcp-firewall / Aegis: **governance is built-in, usable out of the box, configured via admin console**.

### 1.2 关联需求 / 1.2 Related Requirements

- HS-2 工具级权限治理（基础门控框架，本规格在其之上叠加策略覆盖层）
  HS-2 tool-level permission governance (base gating framework; this spec layers policy overrides on top)
- HS-3 写工具幂等与补偿（确认流程与副作用链路保持复用）
  HS-3 idempotency & compensation for write tools (reuses existing confirmation & side-effect chains)
- RG-2 动态配置（Settings 表 + PUT /settings/:key 实时生效）
  RG-2 dynamic config (Settings table + PUT /settings/:key taking effect in real time)

---

## 2. 数据规格 / 2. Data Specification

策略存于 Settings 表，key = `ai_governance_policy`，值为 JSON 字符串。

The policy lives in the Settings table under key `ai_governance_policy` as a JSON string.

```json
{
  "tools": {
    "create_event": { "enabled": false },
    "create_todo": { "requiresConfirmation": false },
    "web_search": { "allowedRoles": ["admin"] }
  },
  "audit": { "granularity": "all" }
}
```

| 字段 Field | 类型 Type | 说明 Description |
|-----------|----------|------------------|
| `tools.<name>.enabled` | boolean | 工具开关；`false` 禁用该工具（默认 `true`）。Tool on/off; `false` disables it (default `true`). |
| `tools.<name>.requiresConfirmation` | boolean | 覆盖工具定义的确认规则（默认取工具定义）。Overrides the tool's declared confirmation rule (defaults to the tool definition). |
| `tools.<name>.allowedRoles` | string[] | 角色白名单；非空时仅列内角色可调，空数组=不限制。Role allowlist; when non-empty, only listed roles may call it; empty = unrestricted. |
| `audit.granularity` | `"all" \| "write" \| "off"` | 审计粒度：`all`=对话+工具全记；`write`=只记工具/确认事件；`off`=不记 AI 审计。Audit granularity: `all`=log conversations+tools; `write`=log only tool/confirmation events; `off`=no AI audit. |

未配置的工具/维度沿用默认；非法 JSON 或非法 granularity 回退默认。

Unconfigured tools/dimensions fall back to defaults; invalid JSON or invalid granularity falls back to defaults.

---

## 3. 接口规格 / 3. API Specification

无新增端点——策略通过既有 `PUT /api/v1/settings/:key` 写入（RG-2）。

No new endpoints — the policy is written via the existing `PUT /api/v1/settings/:key` (RG-2).

`GET /api/v1/ai/tools`（admin）清单响应扩展：

The `GET /api/v1/ai/tools` (admin) inventory response is extended:

```json
{
  "name": "create_event",
  "description": "...",
  "parameters": [...],
  "enabled": false,
  "requiresConfirmation": true,
  "allowedRoles": [],
  "permissions": { ... }
}
```

新增 `enabled`、`allowedRoles` 字段，`requiresConfirmation` 反映策略实际生效值。

New `enabled` and `allowedRoles` fields; `requiresConfirmation` reflects the effective policy value.

---

## 4. 业务规则 / 4. Business Rules

1. **工具门控（执行前）**：`_assertToolAllowed` 依次校验——策略 `enabled` → 角色白名单 → 特性开关 → 邮箱验证。任一不满足即拒绝，错误消息返回给 LLM/用户。
   **Tool gating (pre-execution)**: `_assertToolAllowed` checks, in order — policy `enabled` → role allowlist → feature flag → email verification. Any failure rejects the call with an error surfaced to the LLM/user.
2. **确认规则**：策略可把某写工具改为免确认（`requiresConfirmation: false`）或强制确认（`true`），覆盖工具定义默认。
   **Confirmation rules**: policy can mark a write tool as no-confirmation (`false`) or force confirmation (`true`), overriding the tool definition default.
3. **审计粒度**：`all`（默认）记录对话+工具事件；`write` 只记录 `tool_call` / `tool_confirmation`；`off` 不记录 AI 审计（含每日限额计数的对话事件——该设置风险自负）。
   **Audit granularity**: `all` (default) logs conversations+tools; `write` logs only `tool_call`/`tool_confirmation`; `off` records no AI audit (including conversation events counted toward daily limits — use at own risk).
4. **headless 系统账号**（userId `0`）：由 headless API Key 鉴权，角色白名单不重复拦截；确认规则对其同样生效。
   **Headless system account** (userId `0`): authenticated via headless API Key, role allowlist not re-applied; confirmation rules still apply.
5. **子代理边界**：Sub-agent 不执行需确认的写工具（沿用工具定义默认，策略放宽免确认不影响子代理的安全边界）。
   **Sub-agent boundary**: sub-agents never run write tools requiring confirmation (tool-definition default applies; policy relaxation to no-confirmation does not widen the sub-agent safety boundary).

---

## 5. 配置与降级 / 5. Configuration & Degradation

- 未注入 `GovernancePolicyService`（单测/降级路径）时，全部策略校验跳过，行为等同 HS-2 硬编码版本。
  When `GovernancePolicyService` is not injected (unit-test/degraded path), all policy checks are skipped, behaving like the HS-2 hardcoded version.
- 策略 key 未设置 / JSON 非法：工具默认放行、确认按工具定义、审计 `all`。
  Unset/invalid policy key: tools allowed by default, confirmation per tool definition, audit `all`.

---

## 6. 测试 / 6. Tests

- `governance-policy.service.spec.ts`：策略解析（默认/覆盖/非法回退）+ 便捷方法（10 用例）。
  Policy parsing (default/override/invalid fallback) + convenience methods (10 cases).
- `ai.service.spec.ts`：既有门控用例回归（未注入策略时行为不变）。
  Existing gating cases regress (behavior unchanged when policy not injected).
- 全量：821 后端单测 + T.5 安全模块覆盖率门控（auth/casl/audit/ai-tools/governance/headless statements ≥ 60%）。
  Full: 821 backend unit tests + T.5 security-module coverage gate (auth/casl/audit/ai-tools/governance/headless statements ≥ 60%).
