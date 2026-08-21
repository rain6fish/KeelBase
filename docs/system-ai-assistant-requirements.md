# System AI Assistant（系统 AI 助手）— 需求确认书 / Requirements Confirmation

> 基于私有仓评估文档《KeelBase_System_AI_Assistant_定位与架构建议》立项。本功能是既有 AI-22（管理端 AI 助手 `POST /admin/ai/chat`）的演进，不是从零新增。

## 1. 功能概述 / 1. Feature Overview

把 AI-22 从「带 3 行平台统计的聊天」升级为 **KeelBase System AI Assistant**——面向管理控制台的系统管理员，既懂「系统怎么用」，也懂「系统当前是什么状态」，还能指导管理员完成操作。

不是普通的「帮助中心 AI」，而是定位为 AI 基座能力的一部分：**An AI assistant that understands, explains, and operates the KeelBase system and the applications running on it.**

Evolve AI-22 (admin AI chat) into a **System AI Assistant** for the admin console — it understands, explains and operates the KeelBase platform, as an AI-foundation capability rather than a standalone help center.

## 2. 用户角色 / 2. User Roles

| 角色 / Role | 说明 / Description |
|------|------|
| 系统管理员 / System Admin | 管理控制台登录用户（`role === 'admin'`，CASL `manage-all`）。唯一使用者。对话以**真实管理员身份**运行——会话/记忆/限额/审计按管理员隔离 / Admin console users. Sole audience. Chat runs under the **real admin identity** — conversations/memory/quota/audit are isolated per admin |

## 3. 确认事项（已达成一致） / 3. Confirmed Decisions (Agreed)

| # | 事项 / Item | 结论 / Conclusion |
|---|------|------|
| 1 | 定位 / Positioning | **系统级 AI Assistant（平台/系统 Agent）**，不与业务 Agent（AI CRM 等）平级竞争，是 AI 基座的用户入口层 / **System-level assistant**, not competing with business agents; it is the user entry layer of the AI foundation |
| 2 | 能力分层 / Capability Layers | 本次落地 **L1 Explain + L2 Guide + L3 Navigate**；**L4 Act 明确延后**（见 non-goals） / This release lands L1 Explain + L2 Guide + L3 Navigate; **L4 Act is explicitly deferred** |
| 3 | 与 AI-22 关系 / Relation to AI-22 | 直接演进 `POST /admin/ai/chat`，保持接口路径与守卫不变，响应新增 `navigateTo` / `toolCalls` 字段 / Evolve `POST /admin/ai/chat` in place; path and guards unchanged; response adds `navigateTo` / `toolCalls` |
| 4 | 系统上下文来源 / System Context Source | 复用 `GET /app/capabilities`（MODULES_MANIFEST 描述，已标注「AI 可消费」）、`AiService.getToolInventory()`（HS-2）、治理策略、应用版本、现有实时统计 / Reuse `/app/capabilities`, `getToolInventory()`, governance policy, app version, existing live stats |
| 5 | 系统提示词 / System Prompt | 新增管理端专属 `ADMIN_SYSTEM_PROMPT`，通过可选 `ChatRequest.systemPrompt` 覆盖（向后兼容，用户侧 `/ai/chat` 不受影响）；绕过 Settings `ai_system_prompt`（by design） / New admin-only `ADMIN_SYSTEM_PROMPT` via optional `systemPrompt` override (backward-compatible) |
| 6 | 管理端导航 / Admin Navigation | 新增 `navigate_admin_page` 工具 + `ADMIN_PAGE_ROUTES`（镜像前端 `routes.ts`），`adminOnly` 元数据首次强制执行；`adminMode` 关闭 Flutter 关键词导航短路 / New `navigate_admin_page` tool + page map; `adminOnly` metadata enforced for the first time; `adminMode` disables the Flutter nav keyword shortcut |
| 7 | 会话身份 / Identity | **真实管理员身份**（`@CurrentUser().sub`），会话/记忆/限额/审计按管理员隔离；`navigate_admin_page` 的 `adminOnly` 门按角色（`role === 'admin'`）放行，`'0'` 仅 eval/兼容保留 / **Real admin identity**; `adminOnly` gate checks role; `'0'` kept only for eval/compat |
| 8 | 前端 / Frontend | Web-Admin-Vue 从零新建「系统 AI 助手」聊天页（当前无任何 admin chat UI）/ Greenfield admin chat page in Web-Admin-Vue |
| 9 | 文档 / Docs | 先文档后编码（§11.3）；接口表、模块列表、私有 roadmap 同步（§11.2/§11.5）/ Docs before code; sync endpoint tables, module list, private roadmap |

## 4. 功能点列表 / 4. Feature List

### L1 — Explain（解释系统，本次） / L1 — Explain (this release)

- 平台有哪些模块、每个模块做什么、启用特性（基于 `/app/capabilities` 能力清单动态回答，非写死 README）
  Which modules exist, what each does, enabled features (dynamic from `/app/capabilities`)
- 系统架构、应用版本、AI 工具清单与治理状态
  System architecture, app version, AI tool inventory, governance status
- 回答须基于上下文，不编造不存在的模块/功能；涉及用户数据只谈统计聚合，不泄露明文个人数据
  Answers grounded in context; no fabrication; aggregate-only for personal data

### L2 — Guide（指导用户，本次） / L2 — Guide (this release)

- 操作性问题：「怎么配置权限」「如何开启某个模块」「在哪里看审计」等，给出管理控制台内具体操作路径
  How-to guidance with concrete admin-console steps
- 必要时调用 `navigate_admin_page` 跳转到对应页面
  Optionally navigates to the relevant page

### L3 — Navigate（带用户去做，本次） / L3 — Navigate (this release)

- 管理员说「打开系统信息页」「去用户管理」→ 调用 `navigate_admin_page` 完成跳转，前端收到 `navigateTo` 执行 `router.push`
  Admin nav requests → `navigate_admin_page` → frontend executes `navigateTo`
- 覆盖 `ADMIN_PAGE_ROUTES` 中的管理台页面（系统信息/用户/监控/审计/工具等）
  Covers all admin console pages in `ADMIN_PAGE_ROUTES`

### L4 — Act（替用户执行，延后 / deferred）

- **明确延后，不在本次实现**。创建/复制业务模块、部署应用等写操作需要：确认通道（流式 + confirmation UI）、与「不做内建低代码/生成器」红线的对齐（模块生成须委托 `keelbase init` 约定式流程，而非 App 内生成器）。
  **Deferred.** Write/Act needs streaming + confirmation UI and red-line alignment (module generation must delegate to the convention-based `keelbase init`, never an in-app generator).

## 5. Non-Goals（本次不做，文档记录） / 5. Non-Goals

| # | 事项 / Item | 说明 / Rationale |
|---|------|------|
| 1 | L4 Act（模块生成/部署/复制） | 需确认通道 + 红线对齐；列为延后项 |
| 2 | 管理端流式 + 确认通道 | 非流式写工具无法确认；流式 admin chat 延后 |
| 3 | 端用户侧系统助手（生成应用自解释） | §8「自解释闭环」为长期愿景，单独立项，不在本次 |

## 6. 验收标准 / 6. Acceptance Criteria

- [ ] 管理台新增「系统 AI 助手」菜单与聊天页，中英双语
- [ ] 提问「系统有哪些模块？」返回基于能力清单的真实模块列表（含 CRM/PM/Approval 等描述）
- [ ] 提问「怎么配置权限」给出管理控制台内的操作指引
- [ ] 提问「打开系统信息页」→ 返回 `navigateTo: '/system'` 且前端跳转成功
- [ ] 提问「显示某用户手机号/邮箱」→ 拒绝且不泄露明文个人数据
- [ ] `POST /admin/ai/chat` 响应含 `navigateTo`/`toolCalls`，旧调用方（仅 `{reply, conversationId}`）不受破坏
- [ ] eval `admin-assistant` 分类用例通过（Explain 正确性 / 权限边界 / 导航 / 隐私）
- [ ] 后端全量测试 + 覆盖率门槛 + security gate 全绿；前端 `typecheck` + `build` 通过
