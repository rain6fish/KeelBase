# AI Agent 智能助手 — 需求确认书 / AI Agent Smart Assistant — Requirements Confirmation

## 1. 功能概述 / 1. Feature Overview

在 App 全栈开发平台上集成 AI Agent 能力，通过自然语言对话和数据洞察分析，为用户提供智能交互体验。后端设计为多 LLM 供应商可插拔架构，首批集成 DeepSeek 和 Qwen（阿里通义千问），同时预留 OpenAI 兼容接口的扩展能力。

Integrate AI Agent capabilities into the full-stack app development platform, delivering an intelligent interactive experience through natural-language conversation and data-insight analysis. The backend is designed as a pluggable multi-LLM-provider architecture, integrating DeepSeek and Qwen (Alibaba Tongyi Qianwen) in the first batch while reserving extensibility for OpenAI-compatible interfaces.

## 2. 用户角色 / 2. User Roles

| 角色 / Role | 说明 / Description |
|------|------|
| 已认证用户 / Authenticated User | 所有登录用户均可使用 AI 助手功能。AI 数据权限与用户现有权限一致（只能查询本人数据） / All logged-in users can use the AI assistant. AI data access is consistent with the user's existing permissions (can only query their own data) |

## 3. 确认事项（已达成一致） / 3. Confirmed Decisions (Agreed)

| # | 事项 / Item | 结论 / Conclusion |
|---|------|------|
| 1 | AI 功能入口 / AI Feature Entry | **不新增 AI 按钮**，直接替换底部导航栏上的 Profile（个人）Tab / **Do not add a new AI button**; directly replace the Profile tab in the bottom navigation bar |
| 2 | Profile 页面去向 / Profile Page Destination | Profile 核心功能（编辑资料、设置、退出登录）迁移至「更多」菜单（`ellipsis_circle` Tab 的 bottom sheet） / Profile core features (edit profile, settings, logout) are migrated to the "More" menu (the bottom sheet of the `ellipsis_circle` tab) |
| 3 | 模型选型策略 / Model Selection Strategy | 首批集成 **DeepSeek**（日常对话）+ **Qwen**（数据洞察），两者均为 OpenAI 兼容格式，代码复用度高 / Integrate **DeepSeek** (everyday conversation) + **Qwen** (data insights) in the first batch; both use the OpenAI-compatible format, maximizing code reuse |
| 4 | 后端架构 / Backend Architecture | NestJS 原生模块，不引入 LangChain 等重框架，保持轻量和可控 / Native NestJS modules, no heavy frameworks such as LangChain, keeping it lightweight and controllable |
| 5 | 通信协议 / Communication Protocol | REST + SSE 流式（主要）+ WebSocket（预留扩展） / REST + SSE streaming (primary) + WebSocket (reserved for future extension) |
| 6 | 对话持久化 / Conversation Persistence | 内存存储 + 会话过期清理（1 小时无活动），不落库 / In-memory storage + session expiry cleanup (1 hour of inactivity), not persisted to the database |
| 7 | 工具/函数调用 / Tool/Function Calling | 基于 LLM 原生 Function Calling 能力，不走 Agent 编排框架 / Based on the LLM's native Function Calling capability, without an agent orchestration framework |

## 4. 功能点列表 / 4. Feature List

### P0 — 必须（MVP 上线条件） / P0 — Must-Have (MVP Launch Criteria)

- [P0] 后端 LLM Provider 工厂（DeepSeek + Qwen + OpenAI 兼容格式）
  Backend LLM provider factory (DeepSeek + Qwen + OpenAI-compatible format)
- [P0] AI 对话 REST API（POST /api/v1/ai/chat + SSE 流式）
  AI chat REST API (POST /api/v1/ai/chat + SSE streaming)
- [P0] Tool Calling 系统（查询事件列表、分析事件趋势、查用户数据、查统计）
  Tool-calling system (query event list, analyze event trends, query user data, query statistics)
- [P0] 对话上下文管理（多轮记忆 + 会话过期清理）
  Conversation context management (multi-turn memory + session expiry cleanup)
- [P0] 前端 AI 聊天页面（消息气泡 + 流式展示）
  Frontend AI chat page (message bubbles + streaming display)
- [P0] 底部导航栏 Profile → AI 替换（含 Profile 功能迁移到「更多」菜单）
  Bottom navigation bar Profile → AI replacement (including migrating Profile features to the "More" menu)
- [P0] 权限隔离（工具调用时注入 userId，只查本人数据）
  Permission isolation (inject userId when calling tools; only query the user's own data)
- [P0] 单独速率限制（AI 端点 30 次/分钟）
  Dedicated rate limit (30 requests/minute for AI endpoints)

### P1 — 重要（核心体验） / P1 — Important (Core Experience)

- [P1] 数据洞察端点（POST /api/v1/ai/insights，返回结构化分析）
  Data-insight endpoint (POST /api/v1/ai/insights, returns structured analysis)
- [P1] 对话历史查看/清空 API
  Conversation-history view/clear API
- [P1] 模型热切换（前端可选使用 DeepSeek 或 Qwen）
  Hot model switching (frontend can choose DeepSeek or Qwen)
- [P1] 错误处理和 Fallback 机制（主模型不可用时自动降级）
  Error handling and fallback mechanism (auto-degrade when the primary model is unavailable)

### P2 — 可选（后续迭代） / P2 — Optional (Later Iterations)

- [P2] WebSocket 实时对话
  WebSocket real-time conversation
- [P2] 对话记录持久化到数据库（可选 Redis）
  Persist conversation history to the database (optionally Redis)
- [P2] 多模态支持（图片理解）
  Multimodal support (image understanding)
- [P2] 管理后台 AI 使用统计
  Admin-console AI usage statistics

## 5. 核心业务规则 / 5. Core Business Rules

### 5.1 模型路由策略 / 5.1 Model Routing Strategy

| 场景 / Scenario | 推荐模型 / Recommended Model | 理由 / Reason |
|------|---------|------|
| 日常对话 / Everyday conversation | DeepSeek-V4-flash (deepseek-v4-flash) | 快速响应，中文好 / Fast responses, strong at Chinese |
| 数据洞察/分析 / Data insight/analysis | Qwen-Max (qwen-max) | 中文理解最优 / Best Chinese comprehension |
| Fallback | GPT-4o-mini (预留 / reserved) | Tool calling 稳定 / Stable tool calling |

用户可在前端手动切换模型，默认走 `AI_CHAT_MODEL` 环境变量配置。

Users can manually switch models in the frontend; the default follows the `AI_CHAT_MODEL` environment-variable configuration.

### 5.2 工具调用规则 / 5.2 Tool-Calling Rules

- 所有工具执行时必须注入 `userId` 参数
  All tool executions must inject the `userId` parameter
- 工具内部复现现有的 Service 所有权逻辑（如 `EventsService.findOne()` 的 `userId` 检查）
  Tools internally reproduce the existing service ownership logic (e.g., the `userId` check in `EventsService.findOne()`)
- 工具结果以结构化数据返回给 LLM，由 LLM 组织为自然语言
  Tool results are returned to the LLM as structured data, and the LLM organizes them into natural language
- 工具调用失败时，LLM 需向用户说明错误原因
  When a tool call fails, the LLM must explain the error reason to the user

### 5.3 对话管理规则 / 5.3 Conversation Management Rules

- 每条对话关联 `userId`，天然隔离
  Each conversation is associated with a `userId`, providing natural isolation
- 会话过期时间默认为 1 小时无活动
  Session expiry defaults to 1 hour of inactivity
- 消息列表超过 LLM 上下文窗口上限时做摘要压缩
  When the message list exceeds the LLM context-window limit, summarize and compress it
- 不支持多轮对话之间的持久化（MVP 阶段不落库）
  No persistence across multi-turn conversations (not persisted to the database during the MVP phase)

### 5.4 安全规则 / 5.4 Security Rules

- AI 端点单独限流：30 次/分钟（对比全局 60 次/分钟）
  Dedicated rate limit for AI endpoints: 30 requests/minute (vs. the global 60 requests/minute)
- 用户输入做基本的 Prompt 注入防护（System Prompt 边界 + 工具参数校验）
  Basic prompt-injection protection on user input (system-prompt boundary + tool-parameter validation)
- API Key 仅从环境变量读取，不暴露给前端
  API keys are read only from environment variables and never exposed to the frontend
- 对话内容不包含密码、token 等敏感字段
  Conversation content does not include sensitive fields such as passwords or tokens
- 所有 AI 接口继承 JwtAuthGuard（全局默认认证）
  All AI endpoints inherit JwtAuthGuard (global default authentication)

## 6. 参考 / 6. References

- 前端底部导航实现：`Front-Flutter/lib/core/widgets/app_shell.dart`
  Frontend bottom-navigation implementation: `Front-Flutter/lib/core/widgets/app_shell.dart`
- 路由配置：`Front-Flutter/lib/core/router/app_router.dart`
  Route configuration: `Front-Flutter/lib/core/router/app_router.dart`
- 后端架构：`Server-Nodejs/src/`
  Backend architecture: `Server-Nodejs/src/`
- 项目架构文档：`CLAUDE.md`
  Project architecture documentation: `CLAUDE.md`
