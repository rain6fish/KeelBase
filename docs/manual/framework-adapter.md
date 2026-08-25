# Agent Framework 接入验证（AR-2，MCP 即 Adapter）

> **定位（roadmap §22.2 生态定位收敛）**：KeelBase = AI Framework 之上的 **Enterprise AI Trust Runtime**——不重造编排。任意主流 Agent Framework（LangChain / OpenAI / Claude 等）通过 **MCP（开放标准）** 接入，即自动进入 KeelBase 治理层：Identity / Permission / Confirmation / Audit 全走通。本页演示并验证这条「MCP 即 Adapter」链路。

## 为什么是 MCP

Agent-Runtime-Adapter 分析结论（2026-08 采纳）：**正确形态的 Framework Adapter 是开放标准入口，MCP 已是最佳 Adapter**——不必为每个 Framework 写官方 SDK，协议层统一。官方 SDK 适配降级为「验证 + 文档」而非新代码。

## 链路

```text
Agent Framework（任何 MCP-compatible）
   ↓ MCP over HTTP（JSON-RPC：initialize / tools/list / tools/call）
POST /api/v1/mcp（HS-10 出口，@Raw 原始 JSON-RPC）
   ↓ 以调用者 JWT 身份（Identity）
executeToolForExternal（本人数据范围，CASL）
   ↓ Permission / Confirm（写工具需人工确认）
KeelBase 治理 + 落 AI 审计（provider=mcp）
```

## 验证脚本

```bash
# 前置：后端在跑 + seed（有 CRM 数据）
cd Server-NestJS && npm run seed:demo

# 无 LLM 依赖（读工具查询 + 确认门控均确定性）
node scripts/verify-framework-adapter.mjs
# BASE=... DEMO_USER=... DEMO_PASS=... 可覆盖默认（localhost:3000 + alex/123456）
```

脚本验证 5 项：

| # | 治理维度 | 验证点 |
|---|---------|--------|
| 1 | **Identity** | JWT 登录，tools/call 以调用者身份执行 |
| 2 | **协议 + 能力** | MCP initialize 握手 + tools/list 返回工具清单 |
| 3 | **Permission** | 读工具（query_customers）以本人身份成功（本人数据范围） |
| 4 | **Confirmation** | 写工具（create_customer）触发确认门控，未确认不执行（HS-10） |
| 5 | **Audit** | 每次 tools/call 落 AI 审计（provider=mcp） |

## 与其它文档的关系

- [hs10-mcp-adapter.spec.md](../hs10-mcp-adapter.spec.md) — MCP 出口协议规格（initialize/tools/list/tools/call + 治理接线）
- `test/mcp-export.e2e-spec.ts` — MCP 出口 e2e（协议层）
- `verify-golden-application.sh` — Gate 1 AI CRM 一次跑通（业务闭环）
- `synthetic-stranger.md` — 外部开发者视角 onboarding（含 Java 团队 P2 Persona）

## 验收标准

- ✅ MCP 出口已具备（HS-10）：initialize/ping/tools/list/tools/call，@Raw 原始 JSON-RPC
- ✅ 工具以调用者身份执行（executeToolForExternal + CASL 本人数据范围）
- ✅ 写工具确认门控（未确认不执行，审计 isError=false）
- ✅ MCP 调用落 AI 审计（provider=mcp 区分来源）
- 🔶 Framework 接入验证脚本已提供（`verify-framework-adapter.mjs`），需服务环境实测
