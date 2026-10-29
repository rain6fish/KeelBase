# 独立治理控制平面：部署与接入 / Standalone Governance Control Plane: Deploy & Integrate

> KeelBase 的 AI 治理能力（审计 / Agent Registry / 策略 / 审批 / 副作用）可作为**独立治理台**部署，统一管理多个业务系统的 AI 操作。本文是事实性部署/接入说明。
> The AI governance capabilities (audit / Agent Registry / policy / approvals / side effects) can be deployed as a **standalone control plane** that centrally governs AI operations across multiple business systems. This is a factual deploy/integration guide.

---

## 一、治理台部署 / Deploy the Control Plane

### 本地 / Local

```bash
cd Server-NestJS
GOVERNANCE_PORT=3100 npm run start:governance
# 独立治理库（sqlite）：data/governance.sqlite（自动建表）；端口默认 3100
```

### Docker / Compose

```bash
# 一键：治理控制平面 + sidecar（零代码接入网关）
docker compose up governance sidecar
# governance：复用 Dockerfile server target，独立容器连 postgres 的 governance 库（自动建表）；健康 GET /api/v1/ai/health
# sidecar：业务系统 LLM base_url → http://sidecar:3200/v1 即零代码接入（审计 + 工具门控）；健康 GET /v1/health
#   env 覆盖：SIDECAR_UPSTREAM_URL/KEY（转发真实 LLM）、SIDECAR_TOOLS（工具风险级清单，默认全 R1 自动）
```

> 治理库连接配置：`GOVERNANCE_DB_PATH`（sqlite）或 `GOVERNANCE_DB_HOST/PORT/NAME`（postgres，默认库名 `governance`）。未配置时回落主库连接信息，但**库名/路径独立**（避免治理台连业务库）。

### 升级既有的治理库 / Upgrading an Existing Governance Database

The control plane owns its own database but **has no migration runner**. `src/config/governance-data-source.ts` declares entities and `synchronize` only, and `synchronize` is off when `NODE_ENV=production`. A **fresh** database is created either by a development run or by the business-side migrations; an **existing** production governance database is not altered by any KeelBase upgrade. The seven tables it shares with the business database — `ai_audit_logs`, `ai_daily_usage`, `ai_tool_side_effects`, `ai_agents`, `ai_confirmation_requests`, `ai_governance_policy`, `ai_governance_policy_history` — must therefore be brought forward by hand whenever a release changes one of them. Running the business migration is not enough: the console reads those tables through the same entity classes, so a column the business database has and the governance database does not is a runtime failure (`column "write_claim_id" does not exist`), not a degraded read.

Check the two schemas against each other and apply the difference to the governance database **before** starting the console. Since the console's release notes name the change, the statement is one line — for example, the statement added with the audit → claim forward edge (`1845000000000-AddAuditWriteClaimLink`):

```sql
-- postgres and sqlite alike / 两种方言同一条
ALTER TABLE "ai_audit_logs" ADD "write_claim_id" integer;
```

这段要单独写成一条规矩：**治理库没有迁移运行器**。`src/config/governance-data-source.ts` 只声明实体与 `synchronize`，而 `NODE_ENV=production` 时 `synchronize` 是关的。**全新**的库由开发态启动或业务侧迁移建出来；**既有的**生产治理库**不会**被任何 KeelBase 升级改动。因此，只要某个版本改了它与业务库共用的七张表（`ai_audit_logs`、`ai_daily_usage`、`ai_tool_side_effects`、`ai_agents`、`ai_confirmation_requests`、`ai_governance_policy`、`ai_governance_policy_history`），就必须**手工**把它们补到同一个形状。只跑业务侧迁移**不够**：治理台读的是同一批实体类，业务库有、治理库没有的那一列不是「降级读」，而是运行时失败（`column "write_claim_id" does not exist`）。

启动治理台**之前**，先把两边 schema 对一遍，把差集应用到治理库。因为发布说明会点名这一处，语句通常只有一行 —— 例如随「审计行 → 占位行正向边」一起加的那条（`1845000000000-AddAuditWriteClaimLink`）：

```sql
-- 两种方言同一条 / postgres and sqlite alike
ALTER TABLE "ai_audit_logs" ADD "write_claim_id" integer;
```

---

## 二、业务系统接入 / Integrate a Business System

业务系统（KeelBase 主应用 / Java / Node / Python）配两个环境变量即接入：

```bash
GOVERNANCE_URL=http://<governance-host>:3100   # 治理台地址
GOVERNANCE_API_KEY=<shared-key>                 # 与治理台共享的服务身份密钥
```

接入后效果：
- **审计双写**：AI 审计事件写本地库 + 异步上报治理台（`source` 保留业务系统来源）
- **副作用双写**：AI 写副作用写本地 + 上报治理台（幂等键去重）
- **策略下发**：业务系统可拉取治理台实时策略（工具开关 / 确认 / 角色白名单 / 审计粒度）
- **撤销回调**：治理台撤销副作用 → 回调业务系统软删目标（`GOVERNANCE_TARGET_URL` 配置业务系统地址）

> **未配置 `GOVERNANCE_URL` 时完全本地**——默认行为不变，双写是可选的渐进接入。

---

## 三、双向能力矩阵 / Capability Matrix

| 方向 | 端点 | 认证 |
|---|---|---|
| 业务系统 → 治理台 | `POST /api/v1/external/audit`（审计上报）· `POST /api/v1/external/effects`（副作用上报）· `GET /api/v1/external/governance/policy`（策略下发） | `GOVERNANCE_API_KEY`（x-api-key / Bearer） |
| 治理台 → 业务系统 | `POST /api/v1/internal/effects/revoke`（撤销回调） | `GOVERNANCE_API_KEY` |
| 治理台管理 | `/api/v1/audit/*` · `/api/v1/ai/agents` · `/api/v1/ai/governance/policy` · `/api/v1/ai/confirmations/pending\|decided` · `/api/v1/ai/tool-effects` | admin JWT（共享 `JWT_SECRET`） |

治理台管理端认证复用 JWT（与业务系统共享 `JWT_SECRET`，`role: admin` 可访问治理端点）；服务身份（业务系统互调）用 `GOVERNANCE_API_KEY`。

---

## 四、治理 sidecar：零代码接入 / Governance Sidecar: Zero-Code Access

> **S-1（治理能力 2.0 嵌入广度）**：业务系统**不写任何集成代码**，只把 LLM base URL 指向 sidecar，AI 调用即自动上报治理台审计（AI 流量可见性）。语言无关（任意 OpenAI 兼容 client：LangChain / LangChain4j / 自研）。

```bash
# 启动 sidecar（转发真实 LLM + 上报治理台审计）
SIDECAR_UPSTREAM_URL=https://api.deepseek.com SIDECAR_UPSTREAM_KEY=<key> \
GOVERNANCE_URL=http://<governance>:3100 GOVERNANCE_API_KEY=<shared-key> \
npm run start:sidecar          # 默认 :3200
```

**接入**：业务系统 LLM 配置 `base_url = http://<sidecar>:3200/v1`（+ 可选 `x-user-id` 头归因）。AI 调用经 sidecar → 治理台审计（请求消息摘要 + 响应 tokens/耗时，`source=sidecar`）。

**S-2 ✅ 已完成（工具调用门控 / 确认 / 策略应用）**：sidecar 从「审计代理」升级为「策略执行点」——解析 LLM 响应中的 `tool_calls`，按工具风险级（[ai-governance-protocol.md](../protocols/ai-governance-protocol.md) §4.3）门控：
- **R5 阻断**：工具调用被替换为拒绝说明，不落到业务系统；
- **R3/R4 确认**：hold-and-release——响应剥离 tool_calls 并附 `confirmation` token，业务系统 `POST /v1/confirmations/:token { decision: "approve" }` 取回原工具调用，`reject` 得拒绝响应；
- **R0-R2 自动**：原样放行；
- **治理策略实时生效**：sidecar 周期拉取 `GET /external/governance/policy`（enabled / requiresConfirmation 覆盖），治理台改策略 60s 内生效；**B2 实时推送**：配置 `SIDECAR_CALLBACK_URL`（sidecar 可访问地址）后，启动时向治理台注册回调，策略变更（apply-preset / PUT policy）**秒级推送**到 sidecar（`POST /v1/policy`，服务身份），轮询保留作兜底；
- 每次工具调用的风险级 + 决策 + 参数摘要上报治理台审计（`action=tool_call` / `confirmation`）。

```bash
# 业务系统工具清单（name → 风险级，S-2 门控依据；未配置工具默认 R1 自动）
SIDECAR_TOOLS='[{"name":"send_email","riskLevel":"R3"},{"name":"get_weather","riskLevel":"R1"}]' \
SIDECAR_DEFAULT_TOOL_RISK=R1 \
SIDECAR_CALLBACK_URL=http://sidecar:3200 \
npm run start:sidecar
```

> **30 分钟上手**：按 [adoption-30min.md](adoption-30min.md) 5 步接入，配套 `verify-governance-adoption.mjs` 一键验收。
> **多系统演示**：`demo-multi-system.mjs` 一个治理台管两个异构业务系统（统一审计 + 共享门控 + 跨系统哈希链），见 [multi-system-demo.md](multi-system-demo.md)。

## 五、相关 / Related

- [governance-capability.md](../governance-capability.md) — 治理能力与演进方向
- [ai-governance-protocol.md](../protocols/ai-governance-protocol.md) — 治理协议（审计链 / 委托 token / 风险分级）
- [ai-bridge.md](ai-bridge.md) — 存量系统 AI 化接入
