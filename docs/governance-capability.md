# KeelBase AI 治理能力与演进方向 / AI Governance Capability & Direction

> **定位**：事实性说明 KeelBase 的 AI 治理能力现状与演进方向（供用户 / 集成商评估路线）。本文只描述能力，不含市场定位与竞争表述。
> **Scope**: Factual description of KeelBase's AI governance capabilities and their evolution direction, for users and integrators to evaluate. No market-positioning or competitive statements.

---

## 一、现状能力 / Current Capabilities

| 能力 | 说明 | 入口 |
|---|---|---|
| **审计哈希链** | AI 审计 + 操作审计链式 SHA-256，`/audit/verify` 可验证完整性，篡改即失败 | [hs11-audit-chain.spec.md](hs11-audit-chain.spec.md) |
| **AI 写操作确认 + 撤销** | 写工具需人工确认（不确认不执行）；副作用登记可撤销（软删 + 回收站恢复） | `/ai/confirmations/:token` · `/ai/tool-effects` |
| **工具风险分级 + 策略中心** | 工具注册 R1–R5 风险级；启用开关 / 角色白名单 / 审计粒度可配置，实时生效 | [hs9-governance-policy.spec.md](hs9-governance-policy.spec.md) |
| **决策轨迹 + Explainable Authz** | 用户请求 → 工具调用 → 授权检查（含拒绝原因）→ 确认 → 数据变化全链路可追溯；权限决策附依据 | `/ai/conversations/:id/trace` · `/auth/permissions/explain` |
| **MCP 出口 + 委托身份** | AI 工具经 MCP 开放（JSON-RPC）；跨系统调用携委托 JWT（aud 限定 + 短时效） | [hs10-mcp-adapter.spec.md](hs10-mcp-adapter.spec.md) |
| **跨系统 AI Bridge** | 存量系统 OpenAPI → 代理工具 → 治理管线（读 R1 自动 / 写 R3 确认 / 撤销走补偿端点） | [integrator-kit.md](integrator-kit.md) |

---

## 二、演进方向 / Direction

以下方向为**事实性的能力路线**（不涉内部排期与优先级，按市场与客户反馈推进）：

1. **治理协议标准化** —— 审计哈希链（算法 / 格式 / verify 语义）、委托 token（claim 语义）、工具风险分级 R1–R5 的 **spec 公开文档化**，供跨语言实现（Java Starter / Node 等）对齐与互通。
2. **审计粒度增强** —— AI 写操作**字段级变更审计**（before/after diff 入链）+ **行为级审计**（参数 / 上下文 / 决策依据完整入链），支撑更细粒度的合规证据。
3. **审计可视化** —— AI 行为回放图形化（工具调用链 / 决策树）、审计哈希链 **verify 结果可视化**、审计趋势与异常视图。
4. **独立治理控制平面** —— 治理能力（Agent Registry / 策略中心 / 风险中心 / 审计）可作为**独立部署的治理台**，统一管理多个业务系统的 AI 操作（同一策略 + 同一审计链）。
5. **易用性 / 可用性** —— 新手引导（onboarding）、可行动的错误提示（拒绝原因附「怎么办」）、关键路径性能优化。

---

## 三、相关 / Related

- [hs11-audit-chain.spec.md](hs11-audit-chain.spec.md) · [hs9-governance-policy.spec.md](hs9-governance-policy.spec.md) · [hs10-mcp-adapter.spec.md](hs10-mcp-adapter.spec.md)
- [operation-audit.spec.md](operation-audit.spec.md) · [integrator-kit.md](integrator-kit.md) · [ai-agent.spec.md](ai-agent.spec.md)
