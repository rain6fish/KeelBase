# HS-10 MCP 代理适配 — 功能规格说明 (Spec) / HS-10 MCP Adapter — Functional Specification

> 版本：v1.0
> Version: v1.0

> 基于：私有 roadmap「HS 系列（业务安全的 Agent harness）」章节
> Based on: "HS series (business-safe Agent harness)" section of the private roadmap

> 关联项目：KeelBase（App 全栈开发平台）
> Related project: KeelBase (App full-stack development platform)

---

## 1. 概述 / 1. Overview

### 1.1 功能目标 / 1.1 Feature Goals

把现有 AI 工具（ToolRegistry 注册的 query_events / create_event / create_todo / web_search 等）**出口**为 MCP server：外部 MCP 客户端（如 Claude Desktop / 其他 MCP 宿主）可发现并调用 KeelBase 的工具，且每个调用**强制过同一治理层**（权限门控 → 确认规则 → 审计），复用 HS-2/HS-9/HS-11 链路。MCP 是治理覆盖的**新边界**而非并列功能——兼容后外部工具与内部工具面对同一套权限/确认/审计约束。

Expose the existing AI tools (registered in ToolRegistry: query_events / create_event / create_todo / web_search etc.) as an MCP server: external MCP clients (e.g. Claude Desktop / other MCP hosts) can discover and call KeelBase tools, with every call **forced through the same governance layer** (permission gating → confirmation rules → audit), reusing the HS-2/HS-9/HS-11 chains. MCP is a **new governance boundary**, not a parallel feature.

### 1.2 关联需求 / 1.2 Related Requirements

- HS-2 工具权限门控（_assertToolAllowed）
- HS-9 治理策略化（工具开关 / 确认规则覆盖）
- HS-3 写工具幂等与副作用
- HS-11 审计哈希链（MCP 调用同样落审计）

### 1.3 v1 范围 / 1.3 v1 Scope

- **出口（v1）**：HTTP JSON-RPC 子集——`initialize` / `ping` / `tools/list` / `tools/call`（+ 通知 ack）。
- **入口（v1，McpGatewayService）**：Settings 注册外部 MCP server（key=`mcp_servers`）→ 发现其工具 → 调用时**强制过治理层**（HS-9 权限/确认 + 审计）。admin 端点：`GET/POST/DELETE /admin/mcp/servers`、`GET /admin/mcp/tools`、`POST /admin/mcp/call`。
- **Agent 对话集成（v1）**：`ExternalToolProvider` 接口 + AiService 运行时注入（`registerExternalToolProvider`，McpModule 启动时注册，避免 AiModule↔McpModule 循环依赖）——外部工具（`mcp_<server>_<tool>` 键）并入 LLM 工具流，读工具经 gateway 执行、写工具走确认流程，同一治理层。
- Streamable HTTP 会话 / SSE 推送后续升级（当前无状态 JSON-RPC 足够覆盖工具发现与调用）。

---

## 2. 接口规格 / 2. API Specification

| Method | Path | Auth | 说明 Description |
|--------|------|------|------------------|
| POST | `/api/v1/mcp` | JWT | MCP JSON-RPC 端点（外部 MCP 客户端以用户 token 认证）。MCP JSON-RPC endpoint (external MCP clients authenticate with a user's token). |

支持方法 / Supported methods:

| 方法 Method | 说明 Description |
|------------|------------------|
| `initialize` | 返回协议版本 / capabilities（tools）/ serverInfo。Returns protocol version / capabilities (tools) / serverInfo. |
| `ping` | 健康。Heartbeat. |
| `tools/list` | 返回现有工具（尊重 HS-9 策略 enabled 开关）为 MCP 工具，声明携带治理契约扩展（§4.4：`annotations` + `_meta.keelbase` 的 R0-R5 风险级/策略/确认要求）。Lists existing tools (respecting HS-9 enabled policy) as MCP tools, each carrying the governance contract extension (ai-governance-protocol §4.4: `annotations` + `_meta.keelbase` risk level / strategy / confirmation requirement). |
| `tools/call` | 执行工具。Executes a tool. |
| `notifications/initialized` / `notifications/cancelled` | 通知 ack，无响应。Notification ack, no response. |

`tools/call` 行为 / Behavior:

```json
{ "jsonrpc": "2.0", "id": 1, "method": "tools/call",
  "params": { "name": "query_events", "arguments": { "status": "active" } } }
```

- **读工具**（无需确认）→ 权限门控通过后直接执行，返回 `CallToolResult`（text JSON）。
  **Read tools** (no confirmation) → execute after permission gate, return `CallToolResult` (text JSON).
- **写工具**（requiresConfirmation）→ **不自动执行**，返回需确认提示，由 MCP 客户端处理。
  **Write tools** (requiresConfirmation) → **not auto-executed**, return a confirmation-required notice for the MCP client to handle.
- 权限/确认失败 → JSON-RPC 错误（-32603）或需确认结果。
  Permission/confirmation failure → JSON-RPC error (-32603) or confirmation-required result.

---

## 3. 数据规格 / 3. Data Specification

无新增表。MCP 调用经 `AiService.executeToolForExternal` 执行读工具，并调用 `AuditService.log` 落 `ai_audit_logs`（action=tool_call，provider=mcp，detail=工具名(参数)）——审计哈希链（HS-11）自动覆盖。

No new tables. MCP calls execute read tools via `AiService.executeToolForExternal` and log to `ai_audit_logs` via `AuditService.log` (action=tool_call, provider=mcp, detail=toolName(args)) — the HS-11 hash chain applies automatically.

---

## 4. 业务规则 / 4. Business Rules

1. **同一治理层**：`executeToolForExternal` = `_assertToolAllowed`（HS-2 门控 + HS-9 策略 enabled/角色白名单）→ `_requiresConfirmation`（HS-9 可覆盖）→ 读工具执行 / 写工具返回需确认。
   **Same governance layer**: `executeToolForExternal` = `_assertToolAllowed` (HS-2 gate + HS-9 policy enabled/roles) → `_requiresConfirmation` (HS-9 overridable) → read executes / write returns confirmation-required.
2. **身份**：工具以 JWT 用户身份执行（userId 传入），数据隔离沿用所有权规则。
   **Identity**: tools execute as the JWT user (userId passed in); data isolation follows existing ownership rules.
3. **写工具安全**：MCP v1 不自动执行写工具——无交互确认通道时返回需确认信号，防止绕过确认的无感写操作。
   **Write-tool safety**: MCP v1 never auto-executes write tools — without an interactive confirmation channel it returns a confirmation-required signal, preventing silent writes that bypass confirmation.
4. **审计**：每次 `tools/call` 落审计（provider=mcp 区分来源），HS-11 哈希链自动生效。
   **Audit**: every `tools/call` is audited (provider=mcp to distinguish source); the HS-11 hash chain applies automatically.
5. **错误码**：`-32601` 未知方法，`-32603` 内部/权限/确认异常。
   **Error codes**: `-32601` method not found, `-32603` internal/permission/confirmation error.

---

## 5. 配置 / 5. Configuration

- 新依赖：`@modelcontextprotocol/sdk`（仅用于协议类型校验，schema 校验用 SDK zod）。
  New dependency: `@modelcontextprotocol/sdk` (used for protocol type validation via SDK zod schemas).
- 无新增 env；JWT 认证复用现有守卫。
  No new env; JWT auth reuses existing guards.

---

## 6. 局限 / 6. Limitations

- 无状态 JSON-RPC：不支持 Streamable HTTP 会话 / SSE 服务端推送（后续升级）。
  Stateless JSON-RPC: no Streamable HTTP sessions / SSE server push (future upgrade).
- 写工具经 MCP 需确认但无内建确认 UI；确认流与「入口」一起迭代。
  Write tools via MCP require confirmation but have no built-in confirmation UI; the confirmation flow ships with the "entry" iteration.
- MCP「入口」gateway + Agent 对话集成（v1）已实现：外部 server 经 Settings 注册、发现/调用过治理层，`ExternalToolProvider` 把外部工具并入 LLM 工具流（读执行/写确认）。plan-execute / delegate 子代理路径暂不并入外部工具。
  The MCP "entry" gateway + Agent-chat integration (v1) is implemented: external servers registered via Settings, discover/call through governance; `ExternalToolProvider` merges external tools into the LLM tool flow (read executes / write confirms). plan-execute / delegate sub-agent paths do not include external tools yet.
- 外部工具默认确认策略：`readOnlyHint=true` 免确认；非只读默认需确认（第三方安全默认），HS-9 策略可覆盖。
  External tool confirmation default: `readOnlyHint=true` skips confirmation; non-read-only defaults to requiring confirmation (safe third-party default), overridable via the HS-9 policy.

---

## 7. 测试 / 7. Tests

- `mcp.controller.spec.ts`：initialize / ping / tools/list / tools/call（读执行 / 写需确认 / 失败 isError / 异常 -32603）/ 未知方法 / 通知 ack（9 用例）。
- `ai.service.spec.ts`：listMcpTools 映射 + executeToolForExternal（读执行 / 写需确认）。
- 全量：863 后端单测 + build 0 error。
