# AI Agent 智能助手 — 功能规格说明 (Spec) / AI Agent Assistant — Functional Specification (Spec)

> 版本：v1.0
> Version: v1.0

> 基于：《AI Agent 智能助手 — 需求确认书》
> Based on: "AI Agent Assistant — Requirements Confirmation"

> 关联项目：KeelBase（App 全栈开发平台）
> Related project: KeelBase (App full-stack development platform)

---

## 1. 概述 / 1. Overview

### 1.1 功能目标 / 1.1 Feature Goals

为 App 平台提供 AI Agent 能力——用户可通过自然语言对话与系统交互，获取数据洞察（事件趋势、统计摘要等），无需手动翻查页面。后端采用多 LLM 供应商可插拔架构，首批集成 DeepSeek（日常对话）+ Qwen（数据洞察）。

Provide AI Agent capability to the App platform — users can interact with the system through natural-language chat to obtain data insights (event trends, statistical summaries, etc.) without manually browsing pages. The backend uses a pluggable multi-LLM-provider architecture; the first integrations are DeepSeek (daily chat) + Qwen (data insights).

### 1.2 关联需求 / 1.2 Related Requirements

- 后端：NestJS 11 + TypeScript + TypeORM
  Backend: NestJS 11 + TypeScript + TypeORM
- 前端：Flutter 3.x + Material 3 + Provider + GoRouter
  Frontend: Flutter 3.x + Material 3 + Provider + GoRouter
- 原有导航：4 个底部 Tab（Home / Events / Explore / Profile）+ 1 个「More」按钮
  Existing navigation: 4 bottom tabs (Home / Events / Explore / Profile) + 1 "More" button
- 认证：JWT（全局 JwtAuthGuard）
  Auth: JWT (global JwtAuthGuard)

### 1.3 用户角色 / 1.3 User Roles

| 角色 / Role | 说明 / Description |
|------|------|
| 已认证用户 / Authenticated user | 所有登录用户均可使用 AI 对话和洞察。数据权限与用户现有身份一致，只能查询本人数据 / All logged-in users can use AI chat and insights. Data permissions match the user's existing identity; they can only query their own data |

### 1.4 定位：业务安全的 Agent Harness / 1.4 Positioning: A Business-Safe Agent Harness

KeelBase 的 Agent 不是"玩具助手"，而是可安全作用于**真实业务数据**的运行时（harness）：

KeelBase's Agent is not a "toy assistant" but a runtime (harness) that can safely operate on **real business data**:

- **数据隔离**：每次工具调用都携带登录用户上下文（`ToolRegistry.execute(name, args, userId)`），查询/写入一律限定本人数据
  **Data isolation**: every tool call carries the logged-in user's context (`ToolRegistry.execute(name, args, userId)`); all queries/writes are scoped to the user's own data
- **人工确认**：写操作（创建事件/待办、生成图片等）标记 `requiresConfirmation`，流式对话先发 `confirmation_request`，用户确认后才真正执行
  **Human confirmation**: write operations (create event/todo, generate images, etc.) are marked `requiresConfirmation`; streaming chat first sends a `confirmation_request` and executes only after the user confirms
- **权限约束**：底层实体走 CASL 行级权限，Agent 无法越权访问他人数据或管理端点
  **Permission constraints**: underlying entities go through CASL row-level permissions; the Agent cannot access others' data or admin endpoints beyond its authority
- **全链路审计**：每次对话/工具调用落 `ai_audit_logs`，支持反馈闭环（AI-18）、成本统计（AI-21）与评测（AI-20）
  **End-to-end audit**: every chat/tool call is logged to `ai_audit_logs`, supporting the feedback loop (AI-18), cost statistics (AI-21), and evaluation (AI-20)

> 与通用 Agent harness（LangChain/Claude Code 等）的区别：KeelBase 的工具是**有权限边界的业务 API**，而非文件/命令操作——这是"业务安全"的核心。
> Difference from general Agent harnesses (LangChain/Claude Code, etc.): KeelBase's tools are **permission-bounded business APIs**, not file/command operations — this is the core of "business security".

---

## 2. 功能清单 / 2. Feature List

| ID | 名称 / Name | 优先级 / Priority | 简述 / Summary |
|----|------|--------|------|
| F1 | LLM Provider 工厂 | P0 | 支持 DeepSeek + Qwen，可插拔扩展 / Supports DeepSeek + Qwen, pluggable extension |
| F2 | AI 对话 API（REST） | P0 | POST /api/v1/ai/chat，同步响应 / POST /api/v1/ai/chat, synchronous response |
| F3 | AI 对话 API（SSE 流式） | P0 | POST /api/v1/ai/chat/stream，Server-Sent Events / POST /api/v1/ai/chat/stream, Server-Sent Events |
| F4 | Tool Calling 系统 | P0 | 工具注册、执行、结果回传给 LLM / Tool registration, execution, result returned to the LLM |
| F5 | 对话上下文管理 | P0 | 多轮记忆、会话生命周期、过期清理 / Multi-turn memory, session lifecycle, expiry cleanup |
| F6 | 数据洞察 API | P1 | POST /api/v1/ai/insights，结构化分析报告 / POST /api/v1/ai/insights, structured analysis report |
| F7 | 对话历史 API | P1 | GET/DELETE /api/v1/ai/conversations |
| F8 | 前端 AI 聊天页面 | P0 | 消息气泡、流式打字机效果 / Message bubbles, streaming typewriter effect |
| F9 | 底部导航替换 | P0 | Profile Tab 替换为 AI Tab / Replace the Profile tab with the AI tab |
| F10 | Profile 功能迁移 | P0 | 编辑资料、设置、退出移至「更多」菜单 / Edit profile, settings, logout moved to the "More" menu |
| F11 | 权限与限流 | P0 | 数据隔离 + 30 次/分钟限流 / Data isolation + 30 requests/minute rate limit |
| F12 | 模型热切换 | P1 | 前端可选 DeepSeek / Qwen / Frontend can choose DeepSeek / Qwen |
| F13 | Fallback 机制 | P1 | 主模型不可用自动降级 / Auto fallback when the primary model is unavailable |
| F14 | RAG 知识库问答（AI-3） | P1 | 管理员维护知识库，AI 检索知识库基于真实文档回答（全文检索降级） / Admins maintain the knowledge base; AI retrieves it and answers based on real documents (full-text search fallback) |

---

## 3. 界面规格 / 3. UI Specification

### 3.1 底部导航变更 / 3.1 Bottom Navigation Change

**变更前：** / **Before:**

```
[🏠 Home]  [📅 Events]  [⋯ More]  [▦ Explore]  [👤 Profile]
```

**变更后：** / **After:**

```
[🏠 Home]  [📅 Events]  [⋯ More]  [▦ Explore]  [🤖 AI]
```

### 3.2 「更多」菜单新增 Profile 入口 / 3.2 Adding a Profile Entry to the "More" Menu

原有的 `showMoreMenuSheet()` 中新增以下入口：

The following entries are added to the existing `showMoreMenuSheet()`:

```
┌──────────────────────────┐
│  [👤] 个人资料           │
│  [⚙️] 设置              │
│  [ℹ️] 隐私政策           │
│  [ℹ️] 服务条款           │
│  ────────────────────────│
│  ❌ 退出登录（红色）     │
└──────────────────────────┘
```

`/profile` 路由从 `StatefulShellBranch` 中移出，改为独立顶层路由。

The `/profile` route is removed from the `StatefulShellBranch` and becomes a standalone top-level route.

### 3.3 AI 对话页面 / 3.3 AI Chat Page

#### 3.3.1 页面布局 / 3.3.1 Page Layout

```
┌─────────────────────────────────┐
│ ← AI 助手              [⋮]     │
├─────────────────────────────────┤
│  ┌─────────────────────────┐    │
│  │ 你好！我是 AI 助手...   │    │
│  └─────────────────────────┘    │
│           ┌──────────────┐      │
│           │ 帮我看看本周  │      │
│           │ 有哪些事件    │      │
│           └──────────────┘      │
│  ┌─────────────────────────┐    │
│  │ 以下是本周的事件列表... │    │
│  └─────────────────────────┘    │
├─────────────────────────────────┤
│ [输入消息...]               📎  │
└─────────────────────────────────┘
```

#### 3.3.2 状态覆盖 / 3.3.2 State Coverage

| 状态 / State | 展示内容 / Display content |
|------|---------|
| 空状态（首次进入） / Empty state (first entry) | 居中显示欢迎消息 + 2~3 条建议提问 / Centered welcome message + 2-3 suggested questions |
| 加载中（AI 思考） / Loading (AI thinking) | TypingIndicator 三个弹跳圆点 / TypingIndicator with three bouncing dots |
| 流式输出中 / Streaming output | 实时追加文字 / Text appended in real time |
| 错误状态 / Error state | 气泡中显示错误消息 / Error message shown in the bubble |
| 工具调用中 / Tool calling | 灰色提示文字「正在查询数据…」 / Gray hint text "querying data..." |

---

## 4. 数据规格 / 4. Data Specification

### 4.1 核心类型定义 / 4.1 Core Type Definitions

```typescript
interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  name?: string;
}

interface GenerateParams {
  messages: ChatMessage[];
  model?: string;
  tools?: ToolDefinition[];
  maxTokens?: number;
  temperature?: number;
}

interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}

interface GenerateResult {
  content: string;
  toolCalls?: ToolCall[];
  usage?: { promptTokens: number; completionTokens: number };
}

interface StreamChunk {
  type: 'text' | 'tool_call' | 'done' | 'error';
  content?: string;
  toolCall?: ToolCall;
  error?: string;
}

interface Conversation {
  id: string;
  userId: string;
  messages: ChatMessage[];
  provider: string;
  model: string;
  createdAt: string;
  lastActivityAt: string;
}
```

### 4.2 知识库表（ai_knowledge_articles） / 4.2 Knowledge Base Table (ai_knowledge_articles)

| 字段 / Field | 类型 / Type | 说明 / Description |
|------|------|------|
| id | integer PK | 自增主键 / Auto-increment primary key |
| title | varchar(200) | 标题 / Title |
| content | text | 正文 / Body |
| category | varchar(64) | 分类（可空） / Category (nullable) |
| createdAt / updatedAt | datetime | 时间戳 / Timestamps |

> 检索当前为全文搜索降级（LIKE 匹配 title/content/category），后续接入 Embedding + 向量数据库时替换 `KnowledgeService.search` 实现。
> Retrieval currently falls back to full-text search (LIKE matching on title/content/category); when Embedding + a vector database are integrated later, replace the `KnowledgeService.search` implementation.

---

## 5. API 规格 / 5. API Specification

所有接口以 `/api/v1` 为前缀，继承全局 JwtAuthGuard。

All endpoints are prefixed with `/api/v1` and inherit the global JwtAuthGuard.

### 5.1 接口列表 / 5.1 Endpoint List

| Method | Path | 说明 / Description | 权限 / Permission |
|--------|------|------|------|
| POST | /ai/chat | 非流式对话 / Non-streaming chat | 登录 / Logged-in |
| POST | /ai/chat/stream | SSE 流式对话 / SSE streaming chat | 登录 / Logged-in |
| GET | /ai/conversations | 对话历史列表 / Conversation history list | 登录 / Logged-in |
| GET | /ai/conversations/:id | 单个对话完整消息 / Full messages of a single conversation | 本人 / Self |
| GET | /ai/conversations/:id/trace | 对话执行轨迹（P0-14：工具调用/确认决策/副作用/结果） / Conversation execution trace (tool calls/confirmations/effects/results) | 本人 / Self |
| DELETE | /ai/my/tool-effects/:id | 撤销本人 AI 创建的记录（P0-15：所有权校验，软删可经回收站恢复） / Revoke own AI-created record (ownership-checked, soft-deleted, restorable from trash) | 本人 / Self |
| DELETE | /ai/conversations/:id | 删除指定对话 / Delete a specified conversation | 本人 / Self |
| DELETE | /ai/conversations | 清空所有对话 / Clear all conversations | 本人 / Self |
| POST | /ai/knowledge | 创建知识条目 / Create knowledge entry | 管理员 / Admin |
| GET | /ai/knowledge | 知识条目列表/搜索（?q=关键词&page&limit） / Knowledge entry list/search (?q=keyword&page&limit) | 管理员 / Admin |
| GET | /ai/knowledge/:id | 知识条目详情 / Knowledge entry details | 管理员 / Admin |
| PATCH | /ai/knowledge/:id | 更新知识条目 / Update knowledge entry | 管理员 / Admin |
| DELETE | /ai/knowledge/:id | 删除知识条目 / Delete knowledge entry | 管理员 / Admin |

### 5.2 请求/响应示例 / 5.2 Request/Response Examples

```
POST /api/v1/ai/chat
{
  "message": "本月有哪些事件？",
  "provider": "deepseek",
  "model": "deepseek-v4-flash",
  "conversationId": "uuid"
}

→ {
  "code": 200,
  "message": "操作成功",
  "data": {
    "conversationId": "uuid",
    "reply": "本月你有 5 个事件...",
    "provider": "deepseek",
    "model": "deepseek-v4-flash",
    "usage": { "promptTokens": 450, "completionTokens": 120 }
  },
  "timestamp": "2026-07-28T10:00:00Z"
}
```

SSE 流式响应格式：

SSE streaming response format:

```
event: text
data: {"type":"text","content":"以下是"}

event: text
data: {"type":"text","content":"本月的事件列表"}

event: done
data: {"type":"done"}
```

执行轨迹（P0-14，本人）：

Execution trace (P0-14, self):

```
GET /api/v1/ai/conversations/:id/trace

→ {
  "code": 200,
  "message": "操作成功",
  "data": {
    "conversation": { "id": "uuid", "provider": "deepseek", "model": "deepseek-v4-flash", "createdAt": "...", "lastActivityAt": "..." },
    "steps": [
      { "id": "msg-1", "type": "input", "time": "...", "content": "帮我创建明天的事件" },
      { "id": "tool-101", "type": "tool_call", "time": "...", "toolName": "create_event", "args": "{\"title\":\"meeting\"}", "success": true },
      { "id": "conf-102", "type": "confirmation", "time": "...", "toolName": "create_event", "args": "{}", "outcome": "approve", "trusted": false },
      { "id": "effect-9", "type": "effect", "time": "...", "toolName": "create_event", "effect": { "resultType": "event", "resultId": 7, "targetTitle": "meeting", "revocable": true } },
      { "id": "msg-5", "type": "assistant", "time": "...", "content": "已创建事件「meeting」" }
    ]
  },
  "timestamp": "2026-07-28T10:00:00Z"
}
```

> step.type：`input`（用户提问）/ `assistant`（AI 文本回复）/ `tool_call`（工具调用，含 success/errorMessage）/ `confirmation`（写操作确认，outcome=approve|decline|timeout，trusted=本会话免确认）/ `effect`（AI 实际创建的记录，resultType+resultId+targetTitle+revocable）/ `notice`（chat/knowledge/plan/analyze/error 等摘要）。数据来自 ai_messages + ai_audit_logs + ai_tool_side_effects 三表聚合，只读不写库。

---

## 6. 业务规则 / 6. Business Rules

### 6.1 Tool 清单 / 6.1 Tool List

| 工具名 / Tool name | 描述 / Description | 参数 / Parameters | 调用 Service / Called Service |
|--------|------|------|-------------|
| query_events | 按日期范围查询事件列表 / Query event list by date range | startDate, endDate, status?, limit? | EventsService.getEventsForRange() |
| count_events_by_status | 按状态统计事件数量 / Count events by status | startDate?, endDate? | EventsService.getEventsForRange() |
| get_user_stats | 查询当前用户统计 / Query current user statistics | — | UsersService.findOne() + EventsService |
| query_events_by_keyword | 按关键词搜索事件 / Search events by keyword | keyword, startDate?, endDate? | EventsService.search() |

### 6.2 Fallback 链 / 6.2 Fallback Chain

```typescript
const FALLBACK_CHAIN = {
  deepseek: ['deepseek', 'qwen', 'openai'],
  qwen:     ['qwen', 'deepseek', 'openai'],
  openai:   ['openai', 'qwen', 'deepseek'],
};
```

### 6.3 对话管理 / 6.3 Conversation Management

- 内存 Map 存储，key 为 `conversationId`
  In-memory Map storage, keyed by `conversationId`
- TTL：3600 秒无活动自动过期
  TTL: expires automatically after 3600 seconds without activity
- 消息上限：50 条，超限裁剪最旧对话对
  Message cap: 50; when exceeded, the oldest turns are trimmed

### 6.4 RAG 知识库问答 / 6.4 RAG Knowledge Base Q&A

- **意图路由**：RouterAgent 新增 `knowledge` 意图。关键词（知识库/政策/规定/手册/指南/文档/说明/规则）优先于 query 匹配；LLM 分类器同步支持。
  **Intent routing**: RouterAgent adds a `knowledge` intent. The keywords (知识库/政策/规定/手册/指南/文档/说明/规则) take precedence over query matching; the LLM classifier is also supported.
- **检索**：`KnowledgeService.search()` 全文检索（LIKE 匹配标题/内容/分类，updatedAt 降序，默认取 5 条）。
  **Retrieval**: `KnowledgeService.search()` full-text search (LIKE matching title/content/category, updatedAt descending, 5 results by default).
- **增强 Prompt**：RagAgent 将命中文档以 `[标题] 正文` 形式注入 system 消息（参考文档），并要求 LLM 标注来源标题；检索为空时退化为标准对话，不注入参考文档。
  **Enhanced prompt**: RagAgent injects matched documents into the system message in `[title] body` form (reference documents) and asks the LLM to cite the source titles; when retrieval is empty it degrades to standard chat without injecting reference documents.
- **历史过滤**：发送给 RAG 的消息剔除 system 与 tool 消息，仅保留用户/助手对话。
  **History filtering**: messages sent to RAG exclude system and tool messages, keeping only user/assistant turns.
- **知识库管理**：CRUD 端点仅管理员（CASL `manage all`）；普通用户通过 AI 对话消费知识库。
  **Knowledge base management**: CRUD endpoints are admin-only (CASL `manage all`); regular users consume the knowledge base via AI chat.

### 6.5 模型热切换（F12 / AI-4） / 6.5 Hot Model Switching (F12 / AI-4)

- **入口**：AI 聊天页导航栏 trailing 显示当前模型名，点击弹出 ActionSheet（DeepSeek / 通义千问，当前选中标记），仿设置页语言选择器。
  **Entry**: the AI chat page nav bar trailing shows the current model name; tapping opens an ActionSheet (DeepSeek / Qwen, marking the current selection), modeled on the settings page language picker.
- **请求**：`AiChatProvider` 维护 `provider` 状态（默认 `deepseek`），`sendMessage` 的 body 携带 `provider`；`model` 不传，后端 `resolveProvider` 按 provider 使用各自默认模型（qwen → qwen-max）。
  **Request**: `AiChatProvider` maintains the `provider` state (default `deepseek`); `sendMessage` carries `provider` in the body; `model` is not passed, and the backend `resolveProvider` uses each provider's default model (qwen → qwen-max).
- **会话一致性**：加载历史会话（`loadConversation`）时同步会话的 `provider`，继续对话使用原模型。
  **Session consistency**: loading a history session (`loadConversation`) syncs the session's `provider`, so continued chat uses the original model.
- **降级**：前端仅硬编码 DeepSeek/Qwen 两选项；若某 provider 未配置 key，后端 FALLBACK_CHAIN 自动降级到可用 provider。
  **Fallback**: the frontend hardcodes only the DeepSeek/Qwen options; if a provider has no key configured, the backend FALLBACK_CHAIN automatically falls back to an available provider.

---

## 7. 环境变量 / 7. Environment Variables

```bash
AI_PROVIDER=deepseek
AI_CHAT_MODEL=deepseek-v4-flash
AI_MAX_TOKENS=4096
AI_TEMPERATURE=0.7
CONVERSATION_TTL=3600

DEEPSEEK_API_KEY=sk-...
DEEPSEEK_BASE_URL=https://api.deepseek.com

QWEN_API_KEY=sk-...
QWEN_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1

OPENAI_API_KEY=sk-...
OPENAI_BASE_URL=https://api.openai.com/v1
```

---

## 8. 测试规格 / 8. Test Specification

### 单元测试覆盖 / Unit Test Coverage

| 模块 / Module | 测试数 / Test count | 关键场景 / Key scenarios |
|------|--------|---------|
| ProviderFactory | 8 | 注册/获取/重复/未找到 / Register/get/duplicate/not-found |
| OpenAICompatibleProvider | 15 | generate/stream/tools/错误 / generate/stream/tools/errors |
| ToolRegistry | 14 | 注册/查找/执行/参数校验 / Register/lookup/execute/argument validation |
| 4 个具体 Tool | 29 | 正常/空/错误/参数过滤 / Normal/empty/error/argument filtering |
| ConversationService | 18 | CRUD/过期/裁剪/权限 / CRUD/expiry/trimming/permissions |
| AiService | 14 | 对话/工具循环/Fallback/SSE/RAG 分支 / Chat/tool loop/Fallback/SSE/RAG branches |
| KnowledgeService | 8 | CRUD/全文检索/分页 / CRUD/full-text search/pagination |
| RagAgent | 4 | 注入检索结果/空检索降级/过滤 tool 消息 / Inject retrieval results/empty-retrieval fallback/filter tool messages |

### 端到端测试 / End-to-End Tests

- 完整 AI 对话流程
  Complete AI chat flow
- 数据隔离验证
  Data isolation verification
- 限流验证
  Rate limit verification
- 导航切换状态保持
  Navigation switch state preservation
- Profile 迁移验证
  Profile migration verification
- 退出登录验证
  Logout verification
- 知识库 CRUD（管理员增查改删 + 普通用户 403）
  Knowledge base CRUD (admin create/read/update/delete + regular user 403)
