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
docker compose up governance
# 复用 Dockerfile server target，独立容器连 postgres 的 governance 库（自动建表）
# 健康检查：GET /api/v1/ai/health
```

> 治理库连接配置：`GOVERNANCE_DB_PATH`（sqlite）或 `GOVERNANCE_DB_HOST/PORT/NAME`（postgres，默认库名 `governance`）。未配置时回落主库连接信息，但**库名/路径独立**（避免治理台连业务库）。

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

## 四、相关 / Related

- [governance-capability.md](../governance-capability.md) — 治理能力与演进方向
- [ai-governance-protocol.md](../protocols/ai-governance-protocol.md) — 治理协议（审计链 / 委托 token / 风险分级）
- [ai-bridge.md](ai-bridge.md) — 存量系统 AI 化接入
