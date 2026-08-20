# 越权测试矩阵（W4① 自证：敏感实体 × 操作 × 入口系统化）

> 目标：把越权测试从「攻击集」升级为**系统化矩阵**，进 Release Gate Trust 回归（v1.0 对抗性证明之一，2026-08-20 基线重排「自证」形态）。
> 覆盖来源标注：**E**=e2e（`Server-NestJS/test/*.e2e-spec.ts`）、**SE**=Agent Security Eval（`scripts/verify-security-eval.sh`，12 攻击集 12/12 全挡）、**AB**=Agent Benchmark（`scripts/benchmark/agent-benchmark.mjs`，15 用例 Run/Trust/Safety 100%）、**FF**=flagships 验收（`scripts/verify-flagships.sh`）。

## 1. 敏感资源 × 越权场景

| 资源 | 跨用户读 | 跨用户写 | 跨用户删 | 非管理员访问 admin | 跨组织 | AI 工具越权 | 管理台脱敏 |
|------|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| **users** | E(app) | E(app) | E(app) | E(app/auth) | — | — | E(app) |
| **events** | E(app) | E(app) | E(app) | E(auth) | E(app) | AB+SE | — |
| **todos** | E(app) | E(app) | E(app) | E(auth) | E(ORG-3) | AB | — |
| **crm** | E(crm) | E(crm) | E(crm) | E(crm)+SE | — | **AB+SE** | — |
| **pm** | E(pm) | E(pm) | E(pm) | E(pm)+SE | — | **AB+SE** | — |
| **approval** | E(approval) | E(approval) | E(approval) | E(approval)+SE | — | **AB+SE** | — |
| **contracts/suppliers** | E(generated) | E(generated) | E(generated) | E(auth) | — | SE | — |
| **org** | E(org) | E(org) | E(org) | SE | E(ORG) | — | — |
| **points** | E(forms-points) | — | — | SE | — | — | — |
| **settings** | E(app) | E(app) | — | E(auth) | — | — | — |
| **admin/\*** | E(app)+E(auth) | E(app) | E(app) | — | — | — | E(app) |
| **ai/\*** | E(app) | E(app)+SE | E(app) | — | — | **SE+AB** | E(app) |

## 2. 入口覆盖

| 入口 | 越权断言覆盖 | 说明 |
|------|:--:|------|
| REST（HTTP） | ✅ 密集 | 13 个 e2e suite + verify-security-eval 全覆盖 |
| SSE `/notifications/stream` | 🔶 部分 | 未做「他人订阅自己流」的越权断言（待补） |
| WS `/ws` | 🔶 部分 | 握手鉴权有 e2e；未做「他人 room 推送越权」断言（待补） |
| MCP 出口 `/mcp` | ✅ | mcp-export e2e + HS-10 治理层（权限→确认→审计） |
| Headless `/headless` | ✅ | headless-keys e2e + HS-4 x-api-key |
| Plugin `/plugins/:path` | ✅ | plugins.flagship.integration.spec（requires 缺失跳过 / featureFlag 关闭跳过） |

## 3. 已知缺口（进 Trust 回归补测）

1. **SSE/WS 非 REST 入口越权**：他人数据订阅/推送的越权断言未系统化（REST 密集，长连接少）。
2. **org/points 跨组织 AI 工具越权**：AI 工具按 `org_id` 域限定（ORG-5 已实现），但 benchmark 未含「跨组织工具越权」用例。
3. **管理台脱敏的字段级断言**：`sanitizeForAdmin` 掩码有 e2e，但字段级（bio/生日/名姓不返回）矩阵未逐项核对。

## 4. 结论

- **REST 入口越权（跨用户读写删 + 非管理员访问 + 跨组织 + AI 工具越权）已系统覆盖**：13 e2e suite + SE 12/12 + AB 15/15 全过。
- **核心护城河验证**：三旗舰 + 生成模块 + org 的越权拒绝、写确认、审计哈希链、撤销均有自动化回归。
- 缺口集中在**长连接入口（SSE/WS）与跨组织 AI 工具**——作为 Trust 深化下一步（非阻塞 v1.0 对抗性证明的主体，因 REST + AI 工具主体已覆盖）。
