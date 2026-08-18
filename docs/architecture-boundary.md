# KeelBase 架构边界（Architecture Boundary）

> 2026-08-18 制定（依据《KeelBase_后续发展调整建议》§8-9、§23）。本文件定义 **Core 与 UI 框架的边界**、**Renderer 契约**与**前端战略**——把「Core 与 UI 无关」从"碰巧正确"变成"被写死、被守住"（CI 门禁见 `scripts/check-core-boundary.mjs`）。

---

## 1. 分层总览

```text
                         KeelBase
                            │
                 Application Protocol        ← 语义核心（Application/Runtime/Trust Model）
                            │
          ┌─────────────────┼─────────────────┐
          │                 │                 │
        Build              Run              Trust
          │                 │                 │
    Development AI     Agent Runtime      Governance
          │                 │                 │
          └─────────────────┼─────────────────┘
                            │
                    Business Applications
                            │
              ┌─────────────┼─────────────┐
              │             │             │
             CRM          Project       Approval
                            │
                     Private Deployment
                            │
                     Plugin / Skill / Template
                            │
                     External Ecosystem
```

## 2. Core 边界

**Core = Server-NestJS 后端**（实体 / CASL / AI 运行时 / 治理 / 审计 / Protocol / 生成器消费的契约）。

### Core MUST NOT depend on

```text
Vue
React
Vuetify
Element Plus
MUI
Ant Design
Flutter
Taro
```

即：Core 的 `package.json` 不得引入任何 UI 框架；Core 模块不得 `import` 前端目录代码。（CI 门禁：`npm run check:boundary`。）

### Core MAY define

```text
Application Model      Entity / Field / Relation / API / Page / Navigation
Runtime Model          Tool / Skill / Agent / Context / Workflow
Trust Model            Permission / Policy / Confirmation / Audit / SideEffect / Approval
API Contract           REST/SSE/WS 契约（统一响应包装 / camelCase / ISO8601）
Tool Contract          name / args / readOnly / requiresConfirmation / requireVerifiedEmail / featureFlag
Permission Model       CASL 能力规则
Audit Model            ai_audit_logs + operation_audit_logs + HS-11 哈希链
```

## 3. Renderer 契约：UI 框架是 Renderer，不是 Application Model

UI 框架全部位于 Core 之下、作为实现层。一个新渲染器的接入方式（**不改 Core**）：

1. **消费能力声明**：`GET /app/capabilities`（MOD-4）→ 后端声明业务模块/能力/描述，渲染器据此渲染导航与功能入口
2. **消费 API**：REST（统一响应包装）/ SSE（`/ai/chat/stream`）/ WS（`/ws`）
3. **生成器适配**：`keelbase init` 的 per-framework 模板（`scripts/generator/templates-{backend,frontend,admin,taro}.mjs`）——新增渲染器 = 新增模板文件，不动 Core

**语义路由契约**：`src/ai/tools/navigate-page.tool.ts` 的 `PAGE_ROUTES` 是**跨端语义路由 key → route** 的映射（如 `events: '/events'`），Flutter 与 Vue 各自消费同一 key 渲染到自己的路由实现。**route 是跨端契约，不是某框架专用路径**——改动须同步各端。

## 4. 前端战略（2026-08-18）

| 前端 | 框架 | 定位 | 状态 |
|---|---|---|---|
| **Web-Admin-Vue** | Vue 3 + **Element Plus**（自 Vuetify 迁移中） | **国内市场主前端**（企业 Web 工作台 + 管理控制台同一壳） | 迁移中（见 `docs/frontend-migration.md` 或迁移计划） |
| **Web-Admin-React** | React 19 + MUI | **国际市场路径** | 预览版 0.1.0；正式化以真实国际用户需求为准 |
| **Front-Flutter** | Flutter | 移动主 App（iOS/Android）；Web 预览形态 | 主版本 |
| **Front-Taro** | Taro Vue3 | H5 / 小程序 | 渠道版 |

> 原则：**Renderer / Protocol 是主线，不是某个 UI 框架**。不为"技术栈完整"维护 Vue 与 React 双 admin 的长期同步；Element Plus 是国内企业应用主流 UI 库的官方渲染器/适配器。

## 5. 验收红线

- 后端 `npm run check:boundary` 必须通过（CI 门禁）
- 新增前端功能只改 Renderer；Core 契约变更须先更新对应协议文档
- `navigate-page.tool` 的 route 变更须同步所有消费端
