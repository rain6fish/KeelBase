# AI Action Center（我的 AI 行为）— 功能规格说明 (Spec) / AI Action Center ("My AI Activity") — Functional Specification

> 版本 / Version: v0.1（MVP）
> 日期 / Date: 2026-09-04
> 状态 / Status: Implemented（2026-09-04，后端 `GET /ai/my/tool-effects` + 工作台页已落地，单测/vitest/e2e 全绿；「待我确认中心」等 Out 项按 §9 排冻结后）/ Implemented (2026-09-04; backend endpoint + workbench page shipped; unit/vitest/e2e green; Out-scope items deferred per §9)

> 基于 / Based on：私库 roadmap §22.17（审计证据线深化收口，2026-09-04 产品负责人定案）；专家团 09-03《产品深化阶段战略方案》「1 北极星：AI Action Center」；现有用户侧两面（AiTraceView / BusinessActionDetailView）。
> Related: private roadmap §22.17; 2026-09-03 expert report (North Star: AI Action Center); existing user-side surfaces AiTraceView / BusinessActionDetailView.

> 关联文档 / Related docs：docs/audit-authz-snapshot.spec.md、docs/operation-audit.spec.md、docs/system-ai-assistant.spec.md（机制复用，非改接口）

---

## 1. 概述 / 1. Overview

### 1.1 功能目标 / 1.1 Feature Goals

给业务用户（普通用户，工作台）提供「我的 AI 行为」统一中心页——把 AI 对自己数据做过的写操作、以及产生这些操作的对话，收束成一条可行动的清单：**看状态 → 撤销 → 查完整证据**。它是现有两级视图（per-conversation AiTraceView、per-entity 业务详情抽屉）之上的第三级「本人聚合面」，让 Trust 变成业务用户可感知、可操作的产品，而非后台审计表。

Provide business users (non-admin, workbench surface) a unified "My AI Activity" center page that consolidates AI write actions on their own data plus the conversations behind them into one actionable feed: **see status → revoke → inspect full evidence**. It is the third, user-aggregated surface above the two existing levels (per-conversation AiTraceView, per-entity business-detail drawer), turning Trust into something a business user can see and act on — not a backend audit table.

### 1.2 定位 / 1.2 Positioning

- 这是 **Trust 北极星的产品化切片**：同一后端证据线（副作用 → 决策轨迹 → 授权依据 → 审计链），从「管理端可查」延伸到「本人可行动」。
- 不是新的审计页面：不展示 HTTP/JSON/UUID/tool 底层技术噪声；列表只给业务语言（目标对象标题 + 人类工具标签 + 状态）。
- 只服务 **user 工作台**，不进 admin 控制台（admin 已有 AI 审计/工具与副作用页）。

This is the productized slice of the Trust North Star: the same backend evidence line (side effect → decision trace → authorization → audit chain), extended from "admin can query" to "the user can act." It is not another audit page — no HTTP/JSON/UUID/tool internals on the feed; only business language (target title + human tool label + status). It lives only in the **user workbench**, not the admin console (admin already has AI audit and tool/side-effect pages).

### 1.3 用户角色 / 1.3 User Roles

| 角色 / Role | 说明 / Description |
|------|------|
| 普通用户（工作台）/ Business user (workbench) | 唯一目标角色。只能看本人数据：本人 AI 副作用 + 本人会话。所有权在 service 层强制（非本人 404/隔离，不 403 泄漏存在性） |
| 管理员 / Admin | 不在本页服务范围；走既有 admin AI 审计 / 工具副作用面 |

---

## 2. 范围 / 2. Scope

### 2.1 In（MVP 交付）/ 2.1 In (MVP deliverables)

1. 后端新端点 `GET /ai/my/tool-effects`（本人作用域，分页）——返回本人 AI 写副作用清单 + 归一状态 + 目标富化，**不回显原始工具参数/args**（数据最小化）。
2. 工作台新页「我的 AI 行为」/ My AI Activity，含两个模块：
   - **AI 写操作（主要）**：每行 = 目标对象标题 + 人类工具标签 + 时间 + 状态 chip（已执行 / 已撤销）+ 行操作（撤销 / 查看证据 / 业务对象历史 / 所在会话轨迹）。
   - **最近 AI 会话（次要）**：最近会话列表 → 一键打开该会话决策轨迹。
3. 状态归一（服务端算）：`executed | revoked`（revoked = 目标已软删 `targetSoftDeleted=true`）。
4. 前端 4 处注册（路由 / 工作台侧边栏 / zh+en i18n / 主页快捷入口卡）。
5. 文档与测试：单测 + e2e + typecheck + vitest + 手工演示脚本。

### 2.2 Out（明确不做，防伪深化）/ 2.2 Out (explicitly not in scope)

- ❌ **「待我确认 / 待审批」中心**：R3 确认是实时事件、无落库可查列表；R4 待审批是 admin 职责。做它需先改确认落库（安全热路径），**排冻结后**（见 §9）。
- ❌ **跨会话「AI 被拒 / 越权尝试」聚合**：副作用表只记真实发生的写；拒绝/越权属证据叙事，留在 per-conversation trace 与 admin 审计。诚实边界，不做合并。
- ❌ **admin 审计视图合并 / 用户查审计**：审计查询保持 admin-only，本页只暴露"本人发生过的写"这一最小面。
- ❌ **AI 口头导航到本页**：`navigate-page.tool.ts` PAGE_ROUTES 是 App/Flutter 路径、无 /workbench 条目，跨客户端 page registry 未成——记已知限制（§9），不从 MVP 硬接。
- ❌ **执行前影响预览（§22.17④ 切片）**：属确认卡体验，独立切片另行排；本页只管"发生后"的动作清单。

---

## 3. 用户故事 / 3. User Stories

- **US-1 看到**：业务用户在 CRM 里让 AI 建了个跟进任务，几天后想确认"AI 到底都干了什么"——打开「我的 AI 行为」看到该动作，目标标题可读、状态"已执行"、标签是"创建跟进任务"而非 create_followup_task。
- **US-2 撤销**：发现该跟进任务建错了 → 行内「撤销」，系统软删目标、chip 变"已撤销"、toast 确认（回收站可恢复的提示沿用现协议）。
- **US-3 追因**：想弄明白为什么 AI 这么做 → 「查看证据」进入既有 Business Action Detail（Who/Why/Approval/Effect/Recovery/Integrity），或「所在会话」打开原对话轨迹回看提示词与决策。
- **US-4 边界**：另一位同事登录看不到我的任何动作（本人隔离）；未登录访问 401。
- **US-5 语言**：页面在中/英界面下文案完整，无硬编码。

---

## 4. 信息架构 / 4. Information Architecture

页面：`/workbench/my-ai-actions`（route name `workbench-my-ai-actions`），位于工作台侧边栏「我的」分组（现 `workbench-ai-trace` 旁）。

```
我的 AI 行为 / My AI Activity
│
├─ AI 写操作 / AI write actions   （主模块，倒序，分页）
│   每行：
│   [人类工具标签] [目标对象 chip: resultType+targetTitle]
│   时间 · 状态 chip(已执行|已撤销) · [撤销]（仅可撤销时显示） · [查看证据] · [对象历史] · [会话轨迹]
│   空态：还没让 AI 写过数据 —— 去 CRM/PM 让 AI 帮你建个跟进任务试试
│
└─ 最近 AI 会话 / Recent AI conversations   （次模块，倒序，前 N 条）
    每行：[会话标题/首条] · 时间 · [打开轨迹] → /workbench/ai-trace 定位到该会话
```

- 状态 chip：绿=已执行，灰/紫=已撤销；撤销按钮仅当行状态 = executed 且目标 `targetSoftDeleted=false` 显示（撤销后即时变灰）。
- 行「查看证据」→ 跳 `/workbench/action/:resultType/:resultId`（复用 B4 详情页，含完整性哈希展示）。
- 行「对象历史」→ 打开 BusinessHistoryDrawer（复用 A-2，`GET /ai/governance/entity/:resultType/:resultId`）。
- 行「会话轨迹」→ 跳到 `/workbench/ai-trace` 并选中该会话（现有 trace 页能力）。

---

## 5. 后端契约 / 5. Backend Contract

### 5.1 `GET /api/v1/ai/my/tool-effects`（本人）/ 5.1 GET /api/v1/ai/my/tool-effects (own)

- 鉴权 / Auth：JWT（全局 JwtAuthGuard），`@CurrentUser`；无 admin 策略。所有权在 `AiToolEffectsService.listOwned(userId)`：`where { userId }` + `_loadTarget` 富化（复用现有 `list()` 的既成逻辑去 admin 化）。
- 参数 / Params：`page`(≥1, 默认 1)、`limit`(1–50, 默认 20)、`sort=createdAt&order=desc`（白名单 sort，沿用全局惯例）。
- 响应（标准 ApiResponse 包装） / Response (standard ApiResponse wrapper)：

```jsonc
{
  "code": 200, "message": "ok",
  "data": {
    "items": [{
      "id": 9281,                 // AiToolEffect.id —— 契约主键（§22.17 ① AUDIT-ID 键集）
      "toolName": "create_followup_task",  // 人类标签由前端 D2 toolLabel util 映射（单源，后端不重复映射）
      "resultType": "crm_task",                       // 见 business-history REST_RESOURCE_PATHS
      "resultId": "42",
      "targetTitle": "跟进：辰光建材 逾期回款",         // 目标当前标题（_loadTarget）
      "targetExists": true,
      "targetSoftDeleted": false,
      "status": "executed",        // 服务端归一：targetSoftDeleted ? 'revoked' : 'executed'
      "conversationId": 318,       // 关联会话 → 轨迹下钻
      "createdAt": "2026-09-04T09:30:00Z"
    }],
    "total": 1, "page": 1, "limit": 20
  }
}
```

- 数据最小化 / Data minimization：列表**不返回**原始 `args`/`argsHash`/`before/after` 快照；需要字段级证据时经「查看证据」走 B4/审计面（管理端既有脱敏/打码纪律不变）。
- 边界 / Edge cases：空 → `items: []`；无该副作用 → 不进列表；非本人查询他人 → 结果恒空（不 403，防存在性枚举）；管理员调用 → 返回其本人（管理员账号自己的动作），不回全部。

### 5.2 复用、不改 / 5.2 Reused as-is (no changes)

`DELETE /ai/my/tool-effects/:id`（P0-15 撤销）｜`GET /ai/governance/action/:resultType/:resultId`（B4 证据详情）｜`GET /ai/governance/entity/:resultType/:resultId`（A-2 实体账本）｜`GET /ai/conversations` + `GET /ai/conversations/:id/trace`（会话轨迹）。这些端点的鉴权/语义保持不变。

### 5.3 契约锁定（§22.17 ① 前置）/ 5.3 Contract lock (prerequisite for §22.17 ①)

本列表的行主键 = `effectId`，证据下钻统一走 `resultType+resultId`（B4）。**前端只消费这三个键**——未来证据根（AUDIT-ID 跨链锚定、国密签名、Policy 版本）升级只动后端/导出格式，本页面零改动。实现后在新端点 spec 里登记此契约，供 §22.17 ① 实现时遵守。

---

## 6. 前端规格 / 6. Frontend Specification

- 新页 `Web-Admin-Vue/src/views/workbench/MyAiActionCenterView.vue`；注册 4 处：`src/router/routes.ts` → `workbenchRoute.children`（自动继承 `roles:['user']`）；`src/layouts/AdminLayout.vue` → `workspaceNavGroups`「我的」组（旁 `workbench-ai-trace`）；`src/i18n/zh.ts` + `src/i18n/en.ts`；`src/views/workbench/WorkbenchHomeView.vue` → `shortcutCards` 加「我的 AI 行为」。
- 数据加载：主模块调 `GET /ai/my/tool-effects`（分页/刷新）；次模块调 `GET /ai/conversations`（前 N）；行操作分别调撤销/跳转端点。
- 组件复用：工具人类标签走 D2 映射 util（同 AiTraceView）；BusinessHistoryDrawer 复用；跳转复用现有 route push 模式。
- 撤销交互：确认式（沿用 AiTraceView 撤销范式：成功后 reload + toast）；失败（已被他人撤销/目标已删）显示现有错误文案。
- 空态/加载/错误：沿用全局 AppEmpty / AppError 惯例；「我的 AI 行为」无数据时给行动引导文案（见 US）。

---

## 7. 验收与测试 / 7. Acceptance & Testing

- 单元（后端 spec）：`AiToolEffectsService.listOwned` —— 只返回本人；分页/排序；`_loadTarget` 富化（含 target 不存在 → targetExists:false 但仍列出）；status 归一（targetSoftDeleted → revoked）；空；非本人不可见。controller spec：鉴权 401；返回形状；admin 调用仅本人。
- e2e：alex 经确认创建 crm_task → `GET /ai/my/tool-effects` 见 1 条（targetTitle + status=executed + conversationId 非空）；撤销 → 再查 status=revoked；bob 查 → total 0（隔离）；未带 token → 401。
- 前端：vitest 状态归一 + 撤销 handler（成功/失败）；typecheck + build 全绿。
- 手工演示脚本：工作台 →「我的 AI 行为」→ 看到经确认创建的跟进任务 → 撤销 → chip 变已撤销 → 查看证据落到 B4 完整证据；全程中文/英文界面各走一遍。

---

## 8. 复用清单 / 8. Reuse Map

| 件 / Asset | 位置 / Where | 用途 / Use |
|---|---|---|
| 副作用查询富化逻辑 | `AiToolEffectsService.list()` / `_loadTarget`（去 admin 化） | 新端点主体 |
| 本人撤销 | `DELETE /ai/my/tool-effects/:id`（P0-15） | 行撤销 |
| 单动作完整证据 | `GET /ai/governance/action/:resultType/:resultId`（B4）+ BusinessActionDetailView | 查看证据 |
| 实体行为史 | `GET /ai/governance/entity/:resultType/:resultId`（A-2）+ BusinessHistoryDrawer | 对象历史 |
| 会话轨迹 | `GET /ai/conversations/:id/trace` + AiTraceView | 会话轨迹 |
| 工具人类标签 | D2 toolLabel / actionKey 映射 | 行标签渲染 |

---

## 9. 已知限制与后续 / 9. Known Limitations & Follow-ups

- **待我确认中心**（post-freeze）：需先让 R3 确认事件落库可查 + 新增本人 pending 端点（安全热路径改造，单独立项）。届时 Action Center 增第三模块。
- **跨客户端 AI 导航**：工作台页面清单（Web）与 `navigate-page.tool.ts`（App）尚未统一；记为主仓已知 gap，不阻塞本 MVP（菜单可达）。
- **恢复态边界**：副作用目标从回收站恢复后 `targetSoftDeleted=false` → chip 显示回「已执行」，与「恢复即回归生效」语义一致（沿用 A-3 状态机推导口径，不引入显式 status 列）。
- **统计头卡**（近 7 天写操作 N/可撤销 M）：本版不做，若演示需要再补轻量 count 端点。

## 10. 文档与 roadmap 关联 / 10. Doc & Roadmap Linkage

- 本 spec 评审通过后实施；实施完成后：主仓 CHANGELOG Unreleased 补记；私有 roadmap §22.17 相关项标进展、NC-1（AI Action Center）拆分子项回填状态。
- 数据面边界与 §5.5 产品红线一致：本页仅本人数据，管理端脱敏/掩码纪律不受影响。
