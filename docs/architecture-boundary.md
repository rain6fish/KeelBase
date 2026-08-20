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

**Experience / UI Contract（2026-08-19 明确，即三模型之外的 Experience Model 边界）**：Core 定义「AI 交互体验的**数据形状 + 状态机**」，Renderer 自由实现视觉——只契约数据，不定义 UI 组件规范（避免滑向 UI DSL）：
- **confirmation**：SSE `confirmation_request` / `confirmation_decision` 事件载荷（token / tool / args 摘要）+ 状态机（`pending → approve | decline | timeout`）。Trust Model 决定「**是否**需确认」（`requiresConfirmation` / 治理策略），Renderer 决定「**怎么**展示确认 UI」。
- **decision trace**：`GET /ai/conversations/:id/trace` 返回的步骤数据（input / tool_call / confirmation / effect / assistant）。Core 定义步骤形状，Renderer 决定「时间线 / 工具卡怎么画」。
- **通知 / 审批 UI** 同理：Core 给事件与数据，Renderer 给形态。
- 新增 Renderer 只需消费这些事件契约 + `GET /app/capabilities` + REST/SSE/WS；**不新增跨端 UI 组件规范**。

## 4. Renderer Matrix（前端战略，2026-08-18 / 2026-08-19 升级）

UI 框架是 Core 的 **Renderer**（见 §3）——**新框架 = 新 Renderer，不影响 Core**。核心竞争力不被 UI 技术绑定。当前渲染器矩阵：

| Renderer | 框架 | 定位 | 状态语义 |
|---|---|---|---|
| **Web-Admin-Vue** | Vue 3 + **Element Plus**（自 Vuetify 迁移，2026-08 完成） | 企业 Web 工作台 + 管理控制台同一壳 | **Official**（官方 Web 渲染器，主版本） |
| **Web-Admin-React** | React 19 + MUI | 备选前端（React 技术方案预览） | **Experimental**（预览版 0.1.0；正式化以真实用户需求为准，不预设） |
| **Front-Flutter** | Flutter | 移动主 App（iOS/Android）；Web 预览形态 | **Official Mobile**（移动主渲染器） |
| **Front-Taro** | Taro Vue3 | H5 / 小程序 | **Channel**（渠道渲染器） |

> 原则：**Renderer / Protocol 是主线，不是某个 UI 框架**。不为"技术栈完整"维护多前端长期同步（Capability Drift）；新增渲染器 = 新增生成器 per-framework 模板 + 消费同一 Core 契约，不进 Core 路线。Element Plus 是企业应用主流 UI 库的官方渲染器。

## 5. 安全分层防线：Injection Guard 是辅助，治理层是最终防线

AI 安全采用**纵深防御**——正则/检测类防护只是「减少诱导」的辅助层，**绝不作为最终防线**（2026-08-20 明确）：

```text
Injection Guard（正则检测，HS-8，上下文注入防线）   ← 可被绕过，无妨
    ↓ 被绕过
Permission（CASL 行级 + HS-9 治理策略）             ← 最终防线 ①：越权拒绝
    ↓
Confirmation（requiresConfirmation + 确认流）       ← 最终防线 ②：写操作人工确认
    ↓
Audit（HS-11 哈希链，无条件记录）                   ← 最终防线 ③：全程可审计可撤销
```

**原则**：
- `detectInjection`（`src/ai/security/injection-guard.ts`）只处理「记忆/RAG/摘要」上下文内容注入（敏感字段掩码 + 系统边界标注 + 基础正则检测）；**不控制工具执行权限**。
- 工具执行（AI 对话 `runToolLoop` 与 MCP 出口 `executeToolForExternal` 同一链路）无条件经过：`_assertToolAllowed`（HS-9 工具开关 + 角色白名单）→ `_requiresConfirmation`（写操作确认门控）→ `auditService.log`（`chat`/`tool_call`/`tool_confirmation`，HS-11）。
- **即使 Injection Guard 被绕过**（正则未匹配恶意指令、LLM 被诱导调工具）：写操作仍需人工确认、越权仍被 CASL 拒绝、全程仍审计；确认被社会工程骗过时，CASL `userId` 数据范围仍限定只能操作本人数据。
- 任何新检测/防护（正则 / 分类器 / 提示词加固）都只是第一层，**不得替代或弱化 Permission / Confirmation / Audit 三关**。

## 6. 验收红线

- 后端 `npm run check:boundary` 必须通过（CI 门禁）
- 新增前端功能只改 Renderer；Core 契约变更须先更新对应协议文档
- `navigate-page.tool` 的 route 变更须同步所有消费端
