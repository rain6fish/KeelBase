# AI Agent 智能助手 — 需求确认书

## 1. 功能概述

在 App 全栈开发平台上集成 AI Agent 能力，通过自然语言对话和数据洞察分析，为用户提供智能交互体验。后端设计为多 LLM 供应商可插拔架构，首批集成 DeepSeek 和 Qwen（阿里通义千问），同时预留 OpenAI 兼容接口的扩展能力。

## 2. 用户角色

| 角色 | 说明 |
|------|------|
| 已认证用户 | 所有登录用户均可使用 AI 助手功能。AI 数据权限与用户现有权限一致（只能查询本人数据） |

## 3. 确认事项（已达成一致）

| # | 事项 | 结论 |
|---|------|------|
| 1 | AI 功能入口 | **不新增 AI 按钮**，直接替换底部导航栏上的 Profile（个人）Tab |
| 2 | Profile 页面去向 | Profile 核心功能（编辑资料、设置、退出登录）迁移至「更多」菜单（`ellipsis_circle` Tab 的 bottom sheet） |
| 3 | 模型选型策略 | 首批集成 **DeepSeek**（日常对话）+ **Qwen**（数据洞察），两者均为 OpenAI 兼容格式，代码复用度高 |
| 4 | 后端架构 | NestJS 原生模块，不引入 LangChain 等重框架，保持轻量和可控 |
| 5 | 通信协议 | REST + SSE 流式（主要）+ WebSocket（预留扩展） |
| 6 | 对话持久化 | 内存存储 + 会话过期清理（1 小时无活动），不落库 |
| 7 | 工具/函数调用 | 基于 LLM 原生 Function Calling 能力，不走 Agent 编排框架 |

## 4. 功能点列表

### P0 — 必须（MVP 上线条件）

- [P0] 后端 LLM Provider 工厂（DeepSeek + Qwen + OpenAI 兼容格式）
- [P0] AI 对话 REST API（POST /api/v1/ai/chat + SSE 流式）
- [P0] Tool Calling 系统（查询事件列表、分析事件趋势、查用户数据、查统计）
- [P0] 对话上下文管理（多轮记忆 + 会话过期清理）
- [P0] 前端 AI 聊天页面（消息气泡 + 流式展示）
- [P0] 底部导航栏 Profile → AI 替换（含 Profile 功能迁移到「更多」菜单）
- [P0] 权限隔离（工具调用时注入 userId，只查本人数据）
- [P0] 单独速率限制（AI 端点 30 次/分钟）

### P1 — 重要（核心体验）

- [P1] 数据洞察端点（POST /api/v1/ai/insights，返回结构化分析）
- [P1] 对话历史查看/清空 API
- [P1] 模型热切换（前端可选使用 DeepSeek 或 Qwen）
- [P1] 错误处理和 Fallback 机制（主模型不可用时自动降级）

### P2 — 可选（后续迭代）

- [P2] WebSocket 实时对话
- [P2] 对话记录持久化到数据库（可选 Redis）
- [P2] 多模态支持（图片理解）
- [P2] 管理后台 AI 使用统计

## 5. 核心业务规则

### 5.1 模型路由策略

| 场景 | 推荐模型 | 理由 |
|------|---------|------|
| 日常对话 | DeepSeek-V4-flash (deepseek-v4-flash) | 快速响应，中文好 |
| 数据洞察/分析 | Qwen-Max (qwen-max) | 中文理解最优 |
| Fallback | GPT-4o-mini (预留) | Tool calling 稳定 |

用户可在前端手动切换模型，默认走 `AI_CHAT_MODEL` 环境变量配置。

### 5.2 工具调用规则

- 所有工具执行时必须注入 `userId` 参数
- 工具内部复现现有的 Service 所有权逻辑（如 `EventsService.findOne()` 的 `userId` 检查）
- 工具结果以结构化数据返回给 LLM，由 LLM 组织为自然语言
- 工具调用失败时，LLM 需向用户说明错误原因

### 5.3 对话管理规则

- 每条对话关联 `userId`，天然隔离
- 会话过期时间默认为 1 小时无活动
- 消息列表超过 LLM 上下文窗口上限时做摘要压缩
- 不支持多轮对话之间的持久化（MVP 阶段不落库）

### 5.4 安全规则

- AI 端点单独限流：30 次/分钟（对比全局 60 次/分钟）
- 用户输入做基本的 Prompt 注入防护（System Prompt 边界 + 工具参数校验）
- API Key 仅从环境变量读取，不暴露给前端
- 对话内容不包含密码、token 等敏感字段
- 所有 AI 接口继承 JwtAuthGuard（全局默认认证）

## 6. 参考

- 前端底部导航实现：`Front-Flutter/lib/core/widgets/app_shell.dart`
- 路由配置：`Front-Flutter/lib/core/router/app_router.dart`
- 后端架构：`Server-Nodejs/src/`
- 项目架构文档：`CLAUDE.md`
