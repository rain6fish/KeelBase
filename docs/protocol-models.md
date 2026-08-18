# KeelBase 协议模型（Application / Runtime / Trust Model）

> 2026-08-18 制定（依据《KeelBase_后续发展调整建议》§6-7）。Application Protocol 是平台与旗舰应用之间的**语义核心层**，分为三个逻辑层。Application Model 已有 v1（`docs/module-protocol.md`）；本文把 Runtime / Trust Model 从代码中**沉淀为显式契约**（doc + TS interface/schema 形态，不引入新运行时）。

```text
Application Protocol
├── Application Model   描述业务应用本身（Entity/Field/Relation/API/Page/Navigation）
├── Runtime Model       描述 AI 如何运行和参与业务（Tool/Skill/Agent/Context/Workflow）
└── Trust Model         描述 AI 在什么边界内执行（Permission/Policy/Confirmation/Audit/SideEffect/Approval）
```

---

## 1. Application Model（v1，已有）

见 `docs/module-protocol.md` + `specs/*.json`：
- **形态**：`{ module, plural, label, fields: [{ name, type, enum? }] }`
- **类型词汇表**：string / text / int / bool / date / enum（选项 2-10）
- **输入通道**（P0-12）：自然语言（`--desc`）/ 已有 DB / OpenAPI → Protocol（`--import-openapi` / `--import-schema`）
- **生成物**：`keelbase init --spec <json>` → 实体/DTO/API/迁移/权限/审计/页面/AI 工具/测试（普通源代码）
- **红线**：关系/复杂逻辑保持手写；协议是语义源，不是低代码运行时

## 2. Runtime Model（本文新沉淀）

描述 AI 如何运行与参与业务。以下契约当前存在于代码中，本文将其显式化：

### 2.1 Tool 契约（`src/ai/interfaces/tool.interface.ts` + `src/ai/tools/tool-registry.ts`）

```ts
interface AiTool {
  name: string;                    // 工具名（LLM 识别）
  description: string;
  parameters: ToolParameter[];     // { name, type, description, required, enum? }
  requiresConfirmation?: boolean;  // 写操作标记：true → 人工确认后执行
  permissions?: ToolPermissions;   // { requireVerifiedEmail?, featureFlag?, adminOnly? }
  toToolDefinition(): ToolDefinition; // 传给 LLM 的 JSON Schema
  execute(args, userId): Promise<ToolResult>; // { success, data?, error? }
}
```

注册：`ai.module.ts` useFactory 内 `toolRegistry.register(new XxxTool(service))`。**数据隔离由 execute 的 userId 参数保证**（HS-2）。

### 2.2 Skill 契约（`src/ai/skills/skills-registry.ts` + `skill.interface.ts`）

```ts
interface SkillDefinition {
  name: string;
  triggerKeywords: string[];    // 命中 → 确定性子代理组合（零 LLM 分解）
  description: string;
  tasks: Array<{ subAgent: string; query: string }>; // 固定任务序列
}
```

注册：`DEFAULT_SKILLS`（当前 week-plan）；SkillsRegistry.match 按关键词命中。未命中 → SubAgentOrchestrator LLM 分解。

### 2.3 Agent 契约（`src/ai/agents/sub-agent-orchestrator.service.ts`）

- 子代理分解：把复杂请求按 tool 域拆为顺序子代理任务（calendar/stats/organizer 等），聚合结果 + 反思精化
- 与 Skill 的关系：Skill = 确定性模板；Orchestrator = LLM 动态分解兜底

### 2.4 Context（`src/ai/`）

- 对话上下文：`ai_conversations` + `ai_messages`（ConversationService + ConversationCompactor 压缩）
- 长期记忆：`user_memories`（MemoriesService.extractFromTurn）
- RAG 知识：`ai_knowledge_articles` + embeddings（KnowledgeService）

### 2.5 Workflow（`src/flows/`，FLOW v1）

- 流程定义（schema JSON）+ 状态机 FlowInstance + 三类节点（human_task / ai_task / condition）+ 节点级 roles
- 护栏优先混合编排：Explicit Guardrails + AI Dynamic Decision

## 3. Trust Model（本文新沉淀）

描述 AI 在什么边界内执行。以下契约当前存在于代码中，本文将其显式化：

### 3.1 Permission（CASL，`src/common/casl/casl-ability.factory.ts`）

```text
admin → can('manage', 'all')
user  → can('manage', 'User', { id: user.sub })
        can('manage', 'Event', { userId: user.sub })
        can('manage', '<GeneratedModule>', { userId: user.sub })   // keelbase init 自动接线
```

实例校验：`subject('Event', obj)` + `ability.cannot('read', subject) → 403`。

### 3.2 Policy（`src/ai/governance/governance-policy.service.ts`，HS-9）

数据驱动策略，存于 Settings `ai_governance_policy`（JSON），实时生效无需发版：

```json
{
  "tools": { "create_event": { "enabled": false }, "create_todo": { "requiresConfirmation": false } },
  "audit": { "granularity": "all" | "write" | "off" }
}
```

每工具：`enabled` / `requiresConfirmation` / `allowedRoles`；未配置沿用工具定义默认。

### 3.3 Confirmation（`src/ai/confirmation/confirmation.store.ts`）

- 写工具执行前生成短时 token（TTL 默认 60s），SSE `confirmation_request` → 用户 POST `/ai/confirmations/:token`（approve/decline + trustTool）
- outcome：`approve | decline | timeout`；HS-6 trustTool → 本会话免确认

### 3.4 Audit（`src/ai/audit/` + `src/operation-audit/`，HS-11）

- AI 审计：`ai_audit_logs`（action=chat/tool_call/tool_confirmation/error/…，detail=`name(args)`，HS-11 HMAC 哈希链）
- 操作审计：`operation_audit_logs`（全局拦截 POST/PATCH/PUT/DELETE，敏感字段打码）
- 用户可见轨迹：`GET /ai/conversations/:id/trace`（P0-14 聚合 messages+audit+effects）

### 3.5 SideEffect（`src/ai/tool-effects/ai-tool-effects.service.ts`，HS-3 / P0-15）

```text
ai_tool_side_effects: { idempotencyKey(唯一), userId, conversationId, toolName, argsHash, resultType, resultId }
```

- 幂等：同会话同参数重复调用返回已有结果
- 撤销：admin `DELETE /ai/tool-effects/:id` + 本人 `DELETE /ai/my/tool-effects/:id`（所有权校验）→ 目标软删（RG-3 回收站可恢复）
- resultType：event / todo / crm_task / pm_task / app_request

### 3.6 Approval（`src/approval/`，AI Approval 旗舰）

- ApprovalRequest / ApprovalPolicy 实体 + AI 预审（review_approval_request：低风险自动通过 / 高风险转人工复核）+ 人工 decide
- 衔接 FLOW 审批流（assigneeOrgRole）

---

## 4. 三模型关系

```text
Application Model（应用长什么样）→ Runtime Model（AI 怎么跑）→ Trust Model（AI 的边界）
     │                              │                        │
 module-protocol.md              tool/skill/agent           permission/policy/
 specs/*.json                    workflow 契约               confirmation/audit/
                                                             side-effect/approval
```

- **新增业务模块**：Application Model（keelbase init）自动附带 Runtime（query/create 工具）+ Trust（CASL 规则 + 确认 + 审计 + 副作用）
- **平台能力进化**：新能力若能强化三模型任一层且让旗舰更好 → 进入 P0；否则默认 Later/Reject
