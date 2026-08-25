# MCP：外部 Agent Framework 的 Business-safe Adapter（AR-2）

> 定位：KeelBase 不重造 Agent 编排、不替代业务系统——它是 AI Framework 之上的 **Enterprise AI Trust Runtime**，**MCP 开放标准即最佳 Adapter**（AR-1 已具备，本文件是 AR-2 的接入验证与指南）。
> 状态：✅ 已实测（e2e + verify 脚本 5/5）。市场定位表述见私有 roadmap，本文件保持事实性。

---

## 1. 一句话

主流 Agent Framework（LangChain / LlamaIndex / Claude Desktop / Cursor / 自研 agent）作为 **MCP client** 连接 KeelBase 的 `POST /api/v1/mcp`，KeelBase 把内置 AI 工具暴露为 MCP server（JSON-RPC：`initialize` / `ping` / `tools/list` / `tools/call`）。工具**以调用者身份**过同一治理层（权限 + 确认 + 审计），外部框架不需要知道 KeelBase 内部工具实现。

> **出口 vs 入口**：本文件是 **MCP 出口（KeelBase 作为 MCP server 被外部框架接入，HS-10）**；「入口」即 Secure MCP Gateway（KeelBase 调用外部 MCP server）见 [ai-bridge.md](ai-bridge.md) / CLAUDE.md §9 `/admin/mcp/*`。

---

## 2. 治理映射（Identity → Permission → Audit）

| 治理点 | 外部框架视角 | KeelBase 行为 |
|---|---|---|
| **Identity** | `Authorization: Bearer <用户 JWT>` | 工具以该用户身份执行，返回**本人作用域**数据（非全量） |
| **Permission** | 读工具（R1/R2）调用 | 自动执行，返回结果 |
| **Permission** | 写工具（R3+）调用 | **确认门控**：返回「requires confirmation」，**不静默执行**——人工确认在 KeelBase 侧（`/ai/confirmations` / 对话流），框架不代确认（Human-in-the-loop） |
| **Audit** | 每次调用 | 落 AI 审计，`provider=mcp`，左联用户表带出 `username`（谁做的） |
| **协议** | MCP JSON-RPC over HTTP | 未知方法返回 `-32601`；未认证返回 `401` |

---

## 3. 接入步骤（外部框架视角）

### 3.1 端点与鉴权

```text
POST {BASE}/api/v1/mcp
Authorization: Bearer <user JWT>
Content-Type: application/json
```

用户 JWT 来自 `POST /api/v1/auth/login`（或 `register`）。MCP client 每次请求携带该 JWT 即建立身份。

### 3.2 握手

```bash
curl -s -X POST {BASE}/api/v1/mcp \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26"}}'
```

```json
{ "jsonrpc": "2.0", "id": 1, "result": { "protocolVersion": "2025-03-26", "capabilities": { "tools": {} }, "serverInfo": { "name": "keelbase", "version": "0.9.1" } } }
```

### 3.3 发现工具

```bash
curl -s -X POST {BASE}/api/v1/mcp \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
```

返回内置 AI 工具（如 `query_events` / `create_event` / `query_customers` …），即外部框架「看得见的」能力清单。

### 3.4 读工具（自动执行）

```bash
curl -s -X POST {BASE}/api/v1/mcp \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"query_events","arguments":{"start":"2026-01-01","end":"2026-12-31"}}}'
```

返回该用户本人的事件数据（`result.isError=false`）。

### 3.5 写工具（确认门控）

```bash
curl -s -X POST {BASE}/api/v1/mcp \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"create_event","arguments":{"title":"gated"}}}'
```

```json
{ "jsonrpc": "2.0", "id": 4, "result": { "content": [{ "type": "text", "text": "Tool \"create_event\" requires confirmation and was not executed." }], "isError": false } }
```

写操作不静默执行；确认由业务用户（该 JWT 持有者）在 KeelBase 侧完成，外部框架始终拿到「需确认」而非「已执行」。

### 3.6 审计回环

每次 MCP 调用（含被门控的写尝试）都写入 AI 审计：`GET /api/v1/audit/logs?userId=...`（admin）可查 `provider=mcp` 且带 `username` 的记录——回答「谁让外部 Agent 做了什么」。

---

## 4. 验证

| 层 | 方法 | 内容 |
|---|---|---|
| 确定性 CI | `npm run test:e2e -- mcp-export` | `test/mcp-export.e2e-spec.ts`：401 / initialize / tools/list / 读工具本人作用域 / 写工具确认门控 / **审计 provider=mcp 归因** / 未知方法 |
| 实机脚本 | `node scripts/verify-mcp-adapter.mjs` | 登录 → 握手 → 发现工具 → 读执行 → 写门控 → 审计回环，5 项断言 + 报告 `docs/benchmark/mcp-adapter-*.md` |

`verify-mcp-adapter.mjs` 环境变量：`BASE_URL`（默认 `http://localhost:3000/api/v1`）/ `BENCH_USER`（默认 alex）/ `BENCH_PASS` / `ADMIN_USER`（默认 admin）/ `ADMIN_PASS`。前置：后端已启动且演示账号存在（development 首启自动 seed）。

---

## 5. 边界（守住）

- **不建官方 SDK 适配**：MCP / OpenAPI 开放标准即 Adapter，官方 SDK 不造（roadmap §20）。
- **不代确认**：写工具一律人工确认，外部框架拿不到「静默执行」的写通道。
- **不绕过治理**：MCP 调用与站内 AI 对话走**同一** `AiService.executeToolForExternal` 治理层（权限 → 确认规则 → 审计），无旁路。
- **身份即归因**：每次调用以 JWT 持有者身份落审计，外部集成同样可归责（Business-safe AI Security）。
