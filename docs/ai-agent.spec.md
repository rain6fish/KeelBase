# AI Agent 智能助手 — 功能规格说明 (Spec)

> 版本：v1.0
> 基于：《AI Agent 智能助手 — 需求确认书》
> 关联项目：KeelBase（App 全栈开发平台）

---

## 1. 概述

### 1.1 功能目标

为 App 平台提供 AI Agent 能力——用户可通过自然语言对话与系统交互，获取数据洞察（事件趋势、统计摘要等），无需手动翻查页面。后端采用多 LLM 供应商可插拔架构，首批集成 DeepSeek（日常对话）+ Qwen（数据洞察）。

### 1.2 关联需求

- 后端：NestJS 11 + TypeScript + TypeORM
- 前端：Flutter 3.x + Material 3 + Provider + GoRouter
- 原有导航：4 个底部 Tab（Home / Events / Explore / Profile）+ 1 个「More」按钮
- 认证：JWT（全局 JwtAuthGuard）

### 1.3 用户角色

| 角色 | 说明 |
|------|------|
| 已认证用户 | 所有登录用户均可使用 AI 对话和洞察。数据权限与用户现有身份一致，只能查询本人数据 |

### 1.4 定位：业务安全的 Agent Harness

KeelBase 的 Agent 不是"玩具助手"，而是可安全作用于**真实业务数据**的运行时（harness）：

- **数据隔离**：每次工具调用都携带登录用户上下文（`ToolRegistry.execute(name, args, userId)`），查询/写入一律限定本人数据
- **人工确认**：写操作（创建事件/待办、生成图片等）标记 `requiresConfirmation`，流式对话先发 `confirmation_request`，用户确认后才真正执行
- **权限约束**：底层实体走 CASL 行级权限，Agent 无法越权访问他人数据或管理端点
- **全链路审计**：每次对话/工具调用落 `ai_audit_logs`，支持反馈闭环（AI-18）、成本统计（AI-21）与评测（AI-20）

> 与通用 Agent harness（LangChain/Claude Code 等）的区别：KeelBase 的工具是**有权限边界的业务 API**，而非文件/命令操作——这是"业务安全"的核心。

---

## 2. 功能清单

| ID | 名称 | 优先级 | 简述 |
|----|------|--------|------|
| F1 | LLM Provider 工厂 | P0 | 支持 DeepSeek + Qwen，可插拔扩展 |
| F2 | AI 对话 API（REST） | P0 | POST /api/v1/ai/chat，同步响应 |
| F3 | AI 对话 API（SSE 流式） | P0 | POST /api/v1/ai/chat/stream，Server-Sent Events |
| F4 | Tool Calling 系统 | P0 | 工具注册、执行、结果回传给 LLM |
| F5 | 对话上下文管理 | P0 | 多轮记忆、会话生命周期、过期清理 |
| F6 | 数据洞察 API | P1 | POST /api/v1/ai/insights，结构化分析报告 |
| F7 | 对话历史 API | P1 | GET/DELETE /api/v1/ai/conversations |
| F8 | 前端 AI 聊天页面 | P0 | 消息气泡、流式打字机效果 |
| F9 | 底部导航替换 | P0 | Profile Tab 替换为 AI Tab |
| F10 | Profile 功能迁移 | P0 | 编辑资料、设置、退出移至「更多」菜单 |
| F11 | 权限与限流 | P0 | 数据隔离 + 30 次/分钟限流 |
| F12 | 模型热切换 | P1 | 前端可选 DeepSeek / Qwen |
| F13 | Fallback 机制 | P1 | 主模型不可用自动降级 |
| F14 | RAG 知识库问答（AI-3） | P1 | 管理员维护知识库，AI 检索知识库基于真实文档回答（全文检索降级） |

---

## 3. 界面规格

### 3.1 底部导航变更

**变更前：**

```
[🏠 Home]  [📅 Events]  [⋯ More]  [▦ Explore]  [👤 Profile]
```

**变更后：**

```
[🏠 Home]  [📅 Events]  [⋯ More]  [▦ Explore]  [🤖 AI]
```

### 3.2 「更多」菜单新增 Profile 入口

原有的 `showMoreMenuSheet()` 中新增以下入口：

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

### 3.3 AI 对话页面

#### 3.3.1 页面布局

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

#### 3.3.2 状态覆盖

| 状态 | 展示内容 |
|------|---------|
| 空状态（首次进入） | 居中显示欢迎消息 + 2~3 条建议提问 |
| 加载中（AI 思考） | TypingIndicator 三个弹跳圆点 |
| 流式输出中 | 实时追加文字 |
| 错误状态 | 气泡中显示错误消息 |
| 工具调用中 | 灰色提示文字「正在查询数据…」 |

---

## 4. 数据规格

### 4.1 核心类型定义

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

### 4.2 知识库表（ai_knowledge_articles）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | integer PK | 自增主键 |
| title | varchar(200) | 标题 |
| content | text | 正文 |
| category | varchar(64) | 分类（可空） |
| createdAt / updatedAt | datetime | 时间戳 |

> 检索当前为全文搜索降级（LIKE 匹配 title/content/category），后续接入 Embedding + 向量数据库时替换 `KnowledgeService.search` 实现。

---

## 5. API 规格

所有接口以 `/api/v1` 为前缀，继承全局 JwtAuthGuard。

### 5.1 接口列表

| Method | Path | 说明 | 权限 |
|--------|------|------|------|
| POST | /ai/chat | 非流式对话 | 登录 |
| POST | /ai/chat/stream | SSE 流式对话 | 登录 |
| GET | /ai/conversations | 对话历史列表 | 登录 |
| GET | /ai/conversations/:id | 单个对话完整消息 | 本人 |
| DELETE | /ai/conversations/:id | 删除指定对话 | 本人 |
| DELETE | /ai/conversations | 清空所有对话 | 本人 |
| POST | /ai/knowledge | 创建知识条目 | 管理员 |
| GET | /ai/knowledge | 知识条目列表/搜索（?q=关键词&page&limit） | 管理员 |
| GET | /ai/knowledge/:id | 知识条目详情 | 管理员 |
| PATCH | /ai/knowledge/:id | 更新知识条目 | 管理员 |
| DELETE | /ai/knowledge/:id | 删除知识条目 | 管理员 |

### 5.2 请求/响应示例

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

```
event: text
data: {"type":"text","content":"以下是"}

event: text
data: {"type":"text","content":"本月的事件列表"}

event: done
data: {"type":"done"}
```

---

## 6. 业务规则

### 6.1 Tool 清单

| 工具名 | 描述 | 参数 | 调用 Service |
|--------|------|------|-------------|
| query_events | 按日期范围查询事件列表 | startDate, endDate, status?, limit? | EventsService.getEventsForRange() |
| count_events_by_status | 按状态统计事件数量 | startDate?, endDate? | EventsService.getEventsForRange() |
| get_user_stats | 查询当前用户统计 | — | UsersService.findOne() + EventsService |
| query_events_by_keyword | 按关键词搜索事件 | keyword, startDate?, endDate? | EventsService.search() |

### 6.2 Fallback 链

```typescript
const FALLBACK_CHAIN = {
  deepseek: ['deepseek', 'qwen', 'openai'],
  qwen:     ['qwen', 'deepseek', 'openai'],
  openai:   ['openai', 'qwen', 'deepseek'],
};
```

### 6.3 对话管理

- 内存 Map 存储，key 为 `conversationId`
- TTL：3600 秒无活动自动过期
- 消息上限：50 条，超限裁剪最旧对话对

### 6.4 RAG 知识库问答

- **意图路由**：RouterAgent 新增 `knowledge` 意图。关键词（知识库/政策/规定/手册/指南/文档/说明/规则）优先于 query 匹配；LLM 分类器同步支持。
- **检索**：`KnowledgeService.search()` 全文检索（LIKE 匹配标题/内容/分类，updatedAt 降序，默认取 5 条）。
- **增强 Prompt**：RagAgent 将命中文档以 `[标题] 正文` 形式注入 system 消息（参考文档），并要求 LLM 标注来源标题；检索为空时退化为标准对话，不注入参考文档。
- **历史过滤**：发送给 RAG 的消息剔除 system 与 tool 消息，仅保留用户/助手对话。
- **知识库管理**：CRUD 端点仅管理员（CASL `manage all`）；普通用户通过 AI 对话消费知识库。

### 6.5 模型热切换（F12 / AI-4）

- **入口**：AI 聊天页导航栏 trailing 显示当前模型名，点击弹出 ActionSheet（DeepSeek / 通义千问，当前选中标记），仿设置页语言选择器。
- **请求**：`AiChatProvider` 维护 `provider` 状态（默认 `deepseek`），`sendMessage` 的 body 携带 `provider`；`model` 不传，后端 `resolveProvider` 按 provider 使用各自默认模型（qwen → qwen-max）。
- **会话一致性**：加载历史会话（`loadConversation`）时同步会话的 `provider`，继续对话使用原模型。
- **降级**：前端仅硬编码 DeepSeek/Qwen 两选项；若某 provider 未配置 key，后端 FALLBACK_CHAIN 自动降级到可用 provider。

---

## 7. 环境变量

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

## 8. 测试规格

### 单元测试覆盖

| 模块 | 测试数 | 关键场景 |
|------|--------|---------|
| ProviderFactory | 8 | 注册/获取/重复/未找到 |
| OpenAICompatibleProvider | 15 | generate/stream/tools/错误 |
| ToolRegistry | 14 | 注册/查找/执行/参数校验 |
| 4 个具体 Tool | 29 | 正常/空/错误/参数过滤 |
| ConversationService | 18 | CRUD/过期/裁剪/权限 |
| AiService | 14 | 对话/工具循环/Fallback/SSE/RAG 分支 |
| KnowledgeService | 8 | CRUD/全文检索/分页 |
| RagAgent | 4 | 注入检索结果/空检索降级/过滤 tool 消息 |

### 端到端测试

- 完整 AI 对话流程
- 数据隔离验证
- 限流验证
- 导航切换状态保持
- Profile 迁移验证
- 退出登录验证
- 知识库 CRUD（管理员增查改删 + 普通用户 403）
