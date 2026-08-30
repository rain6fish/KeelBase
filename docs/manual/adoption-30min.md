# 30 分钟接入 AI 治理 / Adopt AI Governance in 30 Minutes

> **定位**：让不熟悉 KeelBase 的工程师（Java / Node / Python / Go）在 **30 分钟内**把自己的业务系统 AI 调用接进治理——零代码、不改业务逻辑。本文是 MOAT-1「可验证承诺」的落地指南，配套一键验收脚本 `Server-NestJS/scripts/verify-moat-adoption.mjs`。
> **Positioning**: Enable an engineer unfamiliar with KeelBase (Java / Node / Python / Go) to connect their business system's AI calls into governance within **30 minutes** — zero code, no business logic change. This is the MOAT-1 "verifiable promise" guide, with a one-command acceptance script `Server-NestJS/scripts/verify-moat-adoption.mjs`.

---

## 你得到什么 / What You Get

接入后（唯一改动 = 把 LLM base URL 指向 sidecar）：
- **AI 流量可见**：每次 AI 调用自动上报治理台审计（请求摘要 / 模型 / tokens / 耗时，`source=sidecar`）
- **可验证完整**：审计落独立治理库哈希链（篡改即断链，`/audit/verify` 可查）
- **多系统统一**：N 个业务系统的 AI 进同一个治理台，一个控制面管全部
- **不锁语言**：任意 OpenAI 兼容 client（LangChain / LangChain4j / 自研 SDK）

After integration (only change = point LLM base URL at the sidecar):
- **AI traffic visible**: every AI call is reported to the governance control plane (message summary / model / tokens / latency, `source=sidecar`)
- **Verifiably intact**: audit lands on the governance hash chain (tampering breaks the chain, checkable via `/audit/verify`)
- **One plane for N systems**: all business systems' AI under a single governance plane
- **Language-agnostic**: any OpenAI-compatible client (LangChain / LangChain4j / custom SDK)

---

## 前置 / Prerequisites

| 项 | 要求 |
|---|---|
| Node.js | ≥ 22（脚本用 `node:sqlite` 查治理库） |
| Server-NestJS | `npm run build` 一次（spawn 用 `dist/governance` 与 `dist/governance-sidecar`） |
| LLM 密钥 | 不需要（验收脚本自带 mock 上游；接真实 LLM 时配 `SIDECAR_UPSTREAM_KEY`） |

---

## 步骤 / Steps（约 30 分钟）

### 1. 起治理控制平面 + sidecar（≈2 分钟 / ~2 min）

**方式 A：本地进程（开发）**

```bash
cd Server-NestJS
GOVERNANCE_PORT=3100 GOVERNANCE_API_KEY=my-shared-key npm run start:governance
# 独立治理库 data/governance.sqlite 自动建表；健康检查 GET /api/v1/ai/health
```

**方式 B：Docker 一键（部署）**

```bash
SIDECAR_UPSTREAM_URL=https://api.deepseek.com SIDECAR_UPSTREAM_KEY=<llm-key> docker compose up governance sidecar
# 治理台 :3100 + sidecar :3200 一起起；健康 GET /api/v1/ai/health 与 GET /v1/health
```

### 2. 起治理 sidecar（本地进程方式才需要这一步）

```bash
GOVERNANCE_URL=http://localhost:3100 GOVERNANCE_API_KEY=my-shared-key \
SIDECAR_UPSTREAM_URL=https://api.deepseek.com SIDECAR_UPSTREAM_KEY=<llm-key> \
npm run start:sidecar          # :3200
```

> 想先不接真实 LLM？`SIDECAR_UPSTREAM_URL` 指到任意 OpenAI 兼容 mock 即可（验收脚本就是这么做）。

### 3. 业务系统接入——唯一改动（≈10 分钟 / ~10 min）

把业务系统里 LLM 客户端的 `base_url` 指向 sidecar，其余**一行不改**：

```js
// 以 Node 为例——任意 OpenAI 兼容 client 同此形态（Python openai / Java LangChain4j / Go 同理）
const client = new OpenAI({
  baseURL: 'http://localhost:3200/v1',   // ← 唯一改动：指向 sidecar
  apiKey: 'business-llm-key',            // 原样保留（sidecar 透传上游，若上游需 key）
});
// 可选：x-user-id 头标识调用者（审计归因；不传则记为 'sidecar'）
```

可选加 `x-user-id: <your-operator-id>` 请求头，治理审计就能按业务身份归因，而非笼统的 `sidecar`。

### 4. 观察治理审计（≈5 分钟 / ~5 min）

AI 调用一次后，治理台审计出现 `source=sidecar` 记录：

```bash
# 治理库直接查（演示/验收用）——或走管理台「AI 审计」页面（需 admin 登录）
sqlite3 data/governance.sqlite "SELECT user_id, model, duration_ms, hash FROM ai_audit_logs WHERE source='sidecar' ORDER BY id DESC LIMIT 5;"
```

每条含：请求消息摘要 / 模型 / tokens / 耗时；`hash` 非空、与上一条 `prev_hash` 连续（哈希链）。

### 5. 一键验收（≈1 分钟 / ~1 min）

```bash
node scripts/verify-moat-adoption.mjs
# 全自动：起 mock LLM + 治理台 + sidecar → 模拟业务系统调用 → 断言 8 项（含审计落库 + 哈希链连续）→ 报告 docs/benchmark/moat-adoption-*.md
```

验收脚本自包含（无需真实 LLM key），8/8 通过即证明「零代码接入 → 治理审计 → 哈希链」闭环可用。

---

## 接入后还能做什么 / What Else You Get

- **审计证据包**：管理台「合规报告」导出 Action Report + 哈希链校验 + 签名（D-4，可提交审计机构）
- **策略下发**：业务系统可拉取治理台实时策略（`GET /api/v1/external/governance/policy`）
- **副作用 + 撤销**：写操作副作用上报治理台，可跨系统撤销（D-2）
- **工具门控（S-2）**：sidecar 解析 `tool_calls` 按风险级门控——R5 阻断 / R3-R4 确认（hold-and-release）/ R0-R2 自动；治理策略实时生效（`SIDECAR_TOOLS` 配置工具风险级，见 [governance-deploy.md](governance-deploy.md)）

---

## 相关 / Related

- [governance-deploy.md](governance-deploy.md) — 治理控制平面部署与接入全解
- [ai-governance-protocol.md](../protocols/ai-governance-protocol.md) — 治理协议（审计链 / 委托 token / 风险分级）+ 兼容实现清单
- [governance-capability.md](../governance-capability.md) — 治理能力与演进方向
