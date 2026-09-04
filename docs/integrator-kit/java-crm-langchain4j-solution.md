# Customer Scenario Solution — Legacy Java CRM × Existing LangChain4j Recommend Agent

> 客户场景样板：存量 Java CRM + 已有 LangChain4j「推荐 Agent」→ 加一层 Business-safe AI 治理，不替换任何既有栈。
> One-page topology + phased PoC plan for a concrete customer scenario: a legacy Java CRM and an existing LangChain4j-based recommendation agent — add a layer of business-safe AI governance without replacing the existing stack.

> 用途：客户对接方案讨论底稿，可直接挂到方案/README。引用前请以 [ai-bridge.md](../manual/ai-bridge.md)、[ai-governance-protocol.md](../protocols/ai-governance-protocol.md)、[KeelBase-java-starter](https://github.com/rain6fish/KeelBase-java-starter) 为准核对口径。
> For customer-facing solutioning. Cross-check terminology against ai-bridge / ai-governance-protocol / KeelBase-java-starter before presenting.

---

## 0. Scenario 场景与客户诉求

**Scenario.** Customer runs a **legacy Java CRM** (Spring Boot + own database, in production, will not be rewritten). They already built a **LangChain4j recommendation agent** (e.g. "which customers deserve follow-up / which to prioritize") that today calls the LLM and the CRM REST API directly. They keep full ownership of that agent.

**Customer goals (what they are buying).**
| # | Goal 诉求 | KeelBase answer |
|---|---|---|
| G1 | 每一笔 AI 调用可审计、可回溯、可算成本 (visible & auditable) | sidecar 旁路：调用摘要/模型/tokens/耗时 → 治理台哈希链 |
| G2 | AI 操作真实业务数据必须按「谁的身份」授权，写要人确认、可撤销 | 委托身份桥 + 风险分级 + 确认门控 + revokePath 补偿 |
| G3 | 推荐结论要落在**真实、有权读**的客户数据上（读 R1 自动，本人/角色范围） | 代理读工具（java-starter 导出）身份作用域化 |
| G4 | 不替换 LangChain4j agent、不重写 CRM、不上云迁移 | 全部为**旁路/旁挂**接入（见 §3 不做清单） |
| G5 | （可选）写回：AI 建跟进任务等，确认后执行 | create_* 写工具 R3 确认 + 副作用可撤销 |

---

## 1. One-Page Topology 一页拓扑

`Legacy Java CRM` stays the **data plane** (business data never leaves it). `LangChain4j agent` stays the **customer-owned orchestrator**. `KeelBase` sits beside both as the **governance plane** — it answers *who / may / confirm / what / revoke*, and never touches the CRM database.

```text
                         CUSTOMER SIDE (untouched)
┌────────────────────────  legacy Java CRM  ────────────────────────┐
│                                                                    │
│   CRM DB (customers/orders/tasks)  ◄──── data stays in-domain ────┤
│        ▲                                  ▲                        │
│        │ existing REST                     │ @KeelbaseTool          │
│   ┌────┴──────────────┐              ┌─────┴──────────────┐         │
│   │ LangChain4j       │              │ java-starter       │         │
│   │ recommend agent   │              │ (delegation filter │         │
│   │ (keep orchestr.)  │              │  / tool export      │         │
│   └────┬──────────────┘              │  / compensation)    │         │
│        │ LLM call (OpenAI-compat)     └──────────▲─────────┘         │
└────────┼─────────────────────────────────────────┼───────────────────┘
         │  base_url → sidecar :3200                │ Bearer delegation JWT
         ▼                                          │ (aud=legacy-crm, 300s)
   ┌────────── sidecar :3200 ──────────┐            │
   │ audit proxy + tool gating         │            │
   │  R5 block · R3/R4 confirm(hold)   │            ▼
   │  R0-R2 pass-through               │   ┌──────────── KeelBase :3000 ────────────┐
   └──────────────┬────────────────────┘   │  Proxy tools (read R1 auto / write R3   │
                  │ x-api-key (service)    │   confirm) → call CRM with user ident.  │
                  ▼                        │  POST /auth/delegation-token            │
   ┌──────── governance console :3100 ────┐│  side-effect registry · revokePath      │
   │ unified audit hash chain (all AI)    ││  AI audit hash chain · policy · memory  │
   │ policy push · revoke routing         ││  conversation · eval · optional RAG     │
   └──────────────────────────────────────┘└─────────────────────────────────────────┘
   Admin review UI = Web-Admin-Vue console    AI chat entry = workbench / CRM entry
```

**Three governed edges (numbered).**

| Edge 边 | Path 通路 | Governance applied 治理 | PoC phase |
|---|---|---|---|
| ① | agent LLM base_url → **sidecar** `:3200/v1` → upstream LLM | every AI call audited (source=sidecar); tool_calls gated R3/R4/R5 | 1 |
| ② | agent business reads → **KeelBase MCP export** `POST /api/v1/mcp` → proxy tool → CRM REST | identity-scoped read (R1 auto), audited (provider=mcp) | 2 |
| ③ | confirmed write → CRM REST; revoke → **compensation endpoint** `revokePath` | R3 human confirmation, side-effect registered, revocable/idempotent | 3 |
| (opt) | end-user asks via **KeelBase chat** instead of agent | full runtime path (optional 2nd orchestrator) | 4 |

> 身份永远是「被委托的那个 CRM 用户」，不是 LangChain4j 服务本身——AI 替某个人干活，权限按其行级归属，审计记到这个人头上。
> Identity is always the delegated CRM *user*, never the LangChain4j service — the AI acts for a person, is authorized as that person, and is audited to that person.

---

## 2. What Gets Connected 对接构件清单（本场景）

| # | Artifact 构件 | Owner 侧 | Config 形态 |
|---|---|---|---|
| 1 | Shared secret `DELEGATION_SECRET` | both | env（生产独立，≥32 字符） |
| 2 | Delegation issue `POST /api/v1/auth/delegation-token` | KeelBase | audience=`legacy-crm` |
| 3 | `DelegationAuthFilter` + user mapper | CRM (starter) | maps `oidcSub` / `local:<userId>` → local CRM user |
| 4 | `@KeelbaseTool` + export `GET /keelbase/proxy-tools/export` | CRM (starter) | read R1 / write R3 declared on REST endpoints |
| 5 | Tool registration (hot reload) | KeelBase | `PUT /settings/ai_proxy_tools` |
| 6 | Compensation endpoint (`revokePath`, idempotent) | CRM (starter scaffold) | e.g. `DELETE /tasks/{id}` |
| 7 | `POST /v1/confirmations/:token` (hold-and-release) | agent shim (small) | approve/reject returns original tool_calls |
| 8 | Governance console service key `GOVERNANCE_API_KEY` | governance console | x-api-key (service identity) |
| 9 | Diagnostics `GET /keelbase/status` | CRM (starter) | delegation config / tool count (no secret leak) |

Nothing else. No CRM DB access, no shared schema, no agent rewrite, no cloud migration.

---

## 3. Deliberately NOT Done 不做清单（防范围蔓延）

- ❌ 不迁移/重建 CRM 数据库 —— data stays in-domain（§1）
- ❌ 不重写、不替换 LangChain4j agent —— 它是客户资产，KeelBase 只旁挂治理
- ❌ 不引入第二套身份 —— 复用同一用户目录（`oidcSub` 或显式映射表）
- ❌ 不做内建低代码/无代码生成器改造 —— 业务模块仍是普通代码
- ❌ 不改 CRM 既有 UI / 既有调用路径 —— 新增的是旁路，不是替换

> 诚实口径：**B 路径（API 代理）才兑现"不迁移、不重写、操作在线数据"**；A 路径（Schema 重建）是另一类需求（同库接管 + 换栈），本方案不涉及。
> Honest framing: only the **API-proxy path (B)** delivers "no migration, no rewrite, operate on live data"; the schema-rebuild path (A) is a different need and out of scope here.

---

## 4. Phased PoC Plan 分阶段 PoC

**决策前提（先行核对，最常卡点）**：① 用户目录/`oidcSub` 映射是否两边一致；② CRM 待开放 API 清单 + 读/写/风险级盘点；③ sidecar 只读推荐无写 → Phase 1 零代码；若涉及写，agent 需一个 ~几十行 confirm shim（Edge ⑦）。
**Prereqs to settle first (top blocker)**：① shared identity directory / `oidcSub` mapping；② CRM API inventory + read/write/risk taxonomy；③ read-only agent ⇒ Phase 1 is zero-code; writes need a small confirm shim in the agent.

| Phase | Goal 目标 | Change surface 改动面 | Exit / verifiable 验收（可运行） | Effort 投入 |
|---|---|---|---|---|
| **P1 治理叠加** (wk1) | 每一笔 agent AI 调用可见、可审计、可算账 | 客户侧：agent LLM `base_url` → sidecar（1 行配置）；KeelBase：起 sidecar + 治理台 | `scripts/verify-moat-adoption.mjs` 8/8 通过；治理台出现 `source=sidecar` 审计（含摘要/tokens/耗时）；哈希链 `/audit/verify` 通过 | 客户 1h / KB 0.5d |
| **P2 有权读+结论落地真实数据** (wk2–3) | 推荐结论基于「本人/角色可读」的真实客户数据，读全部留痕 | CRM：把 agent 需要的读端点标 `@KeelbaseTool`（list_customers / get_customer / orders / activity…）→ 导出注册；agent：数据读改走 KeelBase MCP 出口（Edge ②） | 导出 `ai_proxy_tools` 注册后热更新生效；agent 经 MCP 调读工具返回本人范围数据；越权（他人数据）403 且工具失败透传；每次读落 `provider=mcp` 审计 | 客户 2–3d / KB 1–2d |
| **P3 写=确认+可撤销** (wk3–4) | AI 写回（建跟进任务/改状态/提醒）确认后执行，可撤销 | CRM：写端点标 R3 + 给 `revokePath` 补偿端点（幂等）；agent：加 confirm shim（Edge ⑦）走 sidecar hold-and-release，或经 KeelBase 确认流 | 写未确认不执行（审计 `isError=false`）；approve 后 CRM 收到携委托身份的写；副作用在 `/ai/tool-effects` 可见；撤销演练：revoke → CRM 记录恢复、重复撤销不报错 | 客户 3–5d / KB 2–3d |
| **P4 扩展（可选）** | 多系统一控制面 / 结论接地 / 交付合规证据 | 治理台接入第 2 个系统；RAG 喂内部话术/政策；导出审计证据包 | 统一审计视图含 N 系统；`external-crm-demo`/`multi-system-demo` 类比跑通；证据包离线验签（`verify-evidence.mjs`） | 按范围另估 |

**每阶段独立价值**：P1 即可交付"AI 可见可审计"（零代码）；P2 交付"结论基于有权读的数据"；P3 才涉及写闭环。若客户只想先看治理，停 P1/P2 也成立——不要一上来推全量。

**Each phase is independently valuable.** P1 alone delivers "AI visible & auditable" (zero code). Stop after P1/P2 is a valid landing point. Do not sell the full scope up front.

**Reference scripts & demos（对接后逐项对照验收）**
- Java 侧联调/自检：`keelbase-java-example` 5-min trial → `verify-java-local.mjs`；真实 CRM 样板 e2e → `verify-crm-e2e.mjs`
- 代理桥（B 路径）e2e：`test/proxy-bridge.e2e-spec.ts`（读注入身份 / 写 R3 确认 / 越权 403）
- MCP/框架接入验证：`scripts/verify-framework-adapter.mjs`（Identity / tools/list / 读本人 / 写门控 / 审计 5 项）
- 30 分钟治理接入：`scripts/verify-moat-adoption.mjs`；多系统单控制面：`scripts/demo-multi-system.mjs`

**Success metrics 验收指标（建议与客户对齐）**
| Metric | Target |
|---|---|
| AI 调用审计覆盖率 | 100%（治理台逐笔可查，含摘要/模型/tokens/耗时） |
| 写操作确认+审计+可撤销 | 100%；撤销演练 ≥1 次通过、幂等 |
| 越权/跨用户读 | 0（授权被拒且留痕） |
| 业务指标（推荐采纳率 / 复核工时） | 客户基线自定，PoC 记录前后对比 |

---

## 5. Risks & Notes 风险与注意点（诚实提示）

- **身份目录是前提**：`oidcSub`（同一 IdP）或 `local:<userId>` 映射表必须在 P1 前对齐，否则"以谁的身份"是空的。
- **MCP 写确认无内建 UI**：外部 agent 经 MCP 调用写工具只返回"需确认"信号，确认 UI/回调需在 agent 或入口自建（P3 的 Edge ⑦）。
- **当前 MCP 出口为无状态 JSON-RPC**（initialize/tools/list/tools/call），Streamable HTTP/SSE 推送升级未做——覆盖本场景足够。
- **审计链完整性 ≠ 业务语义**：哈希链保证"没被篡改"，"谁批准了什么"依赖确认记录本身，方案需把确认/副作用一并纳入证据包。
- 部署默认自托管单容器；多系统/统一证据链才上独立治理台 + sidecar 编排。

---

## 6. Related 相关文档

- AI Bridge（A/B 两路 + 委托身份）：[ai-bridge.md](../manual/ai-bridge.md)
- 治理协议（审计链/委托 token/风险分级 R0–R5）：[ai-governance-protocol.md](../protocols/ai-governance-protocol.md)
- Java Starter 接入层：[GitHub: rain6fish/KeelBase-java-starter](https://github.com/rain6fish/KeelBase-java-starter)（architecture / quickstart / delegated-identity / tool-declaration / compensation 均含中文）
- 30 分钟治理接入：[adoption-30min.md](../manual/adoption-30min.md) · 多系统演示：[multi-system-demo.md](../manual/multi-system-demo.md)
- 外部 CRM 演示（业务闭环样板）：[external-crm-demo.md](../manual/external-crm-demo.md)
- MCP 出口：[hs10-mcp-adapter.spec.md](../hs10-mcp-adapter.spec.md) · [framework-adapter.md](../manual/framework-adapter.md)
