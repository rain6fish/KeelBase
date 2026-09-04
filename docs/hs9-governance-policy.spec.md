# HS-9 治理策略化 — 功能规格说明 (Spec) / HS-9 Governance-as-Policy — Functional Specification

> 版本：v1.1（§22.15(4) 治理策略可视化编辑扩展：门控档位 mode + R4 审批策略化 + 差异化保存）
> Version: v1.1 (§22.15(4) visual policy editing: gate-mode `mode` + policy-driven R4 approval + diff-save)

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

策略存于独立表 `ai_governance_policy`（治理台独立持有，不依赖业务 settings 表——独立治理库前提），单行 JSON 值实时生效。`rg-2` 动态配置仍负责其余开关（维护模式等）。

The policy lives in its own `ai_governance_policy` table (held by the governance console, independent of the business Settings table — a prerequisite of the standalone governance DB), a single JSON value row taking effect in real time. RG-2 dynamic config still covers the other switches (e.g. maintenance mode).

```json
{
  "tools": {
    "create_event": { "enabled": false },
    "create_todo": { "requiresConfirmation": false },
    "create_customer": { "mode": "approval" },
    "web_search": { "allowedRoles": ["admin"] }
  },
  "audit": { "granularity": "all" }
}
```

| 字段 Field | 类型 Type | 说明 Description |
|-----------|----------|------------------|
| `tools.<name>.enabled` | boolean | 工具开关；`false` 禁用该工具（默认 `true`）。Tool on/off; `false` disables it (default `true`). |
| `tools.<name>.mode` | `"auto" \| "confirm" \| "approval"` | **§22.15(4) 门控档位覆盖**：`auto`=自动执行 / `confirm`=需本人确认(R3) / `approval`=需审批人双人审批(R4)。缺省 = 按工具声明风险级推导（R5→阻断、R4→approval、R3→confirm、R0-2→auto）。Gate-mode override: auto / confirm (R3) / approval (R4, two-person). Defaults derive from the tool's declared risk (R5→blocked, R4→approval, R3→confirm, R0-2→auto). |
| `tools.<name>.requiresConfirmation` | boolean | **legacy**（HS-9 布尔确认覆盖）：§22.15(4) 起新保存改用 `mode`，本键保留以兼容解析旧数据/预设。`false`=降级到 auto；`true`（R0-2 工具）=提升到 confirm。Legacy boolean override (new saves use `mode`); kept for compatibility. |
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
  "requiresApproval": false,
  "gateMode": "confirm",
  "allowedRoles": [],
  "permissions": { ... }
}
```

新增 `enabled`、`allowedRoles` 字段，`requiresConfirmation` / `requiresApproval` / `gateMode` 反映策略实际生效的**门控档位**（策略覆盖 mode > legacy 布尔 > 工具声明风险级推导；R5 工具 `gateMode: "blocked"`）。

New `enabled` / `allowedRoles` fields; `requiresConfirmation` / `requiresApproval` / `gateMode` reflect the **effective gate mode** (policy `mode` > legacy boolean > declared-risk derivation; R5 tools report `gateMode: "blocked"`).

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
6. **门控档位（§22.15(4) 治理策略可视化编辑）**：生效档位 = 策略 `mode`（auto/confirm/approval）> legacy `requiresConfirmation` 布尔 > 工具声明风险级推导。**R4 审批档可由策略把任意 R3 及以下写工具升档/设置**——运行层 R4 双人审批分支（创建持久化审批请求、不阻塞 operator）改读策略档位，不再只认工具声明 R4；工具清单暴露 `gateMode`/`requiresApproval` 供管理台可视化。
   **Gate mode (visual policy editor)**: effective mode = policy `mode` (auto/confirm/approval) > legacy `requiresConfirmation` boolean > declared-risk derivation. **The R4 two-person-approval gate can be policy-escalated onto any R3-or-lower write tool** — the runtime approval branch reads the policy tier instead of only the declared R4; the tool inventory exposes `gateMode`/`requiresApproval` for the console UI.
7. **R5 不可放宽**：声明 R5（阻断）的工具恒阻断，策略/可视化编辑不可把其改为 auto/confirm/approval；策略中心对该行只读展示。
   **R5 is immutable**: tools declared R5 (block) stay blocked regardless of policy; the policy editor shows them read-only.
8. **差异化保存**：管理台保存只写入与工具默认不同的覆盖项（`enabled:false` / 档位≠声明 / `allowedRoles` 非空），未列出工具沿用声明默认——避免全量显式覆盖把未来默认升级卡死。
   **Diff-save**: the console persists only overrides differing from defaults; unlisted tools keep declared defaults, so future default changes still propagate.

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
