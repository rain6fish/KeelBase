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
| SSE `/notifications/stream` | ✅ | 越权隔离 e2e（`test/notifications.e2e-spec.ts`：A 的流收不到 B 的通知）+ gateway 单测跨用户隔离 |
| WS `/ws` | ✅ | 握手鉴权 e2e（4401）+ **他人 room 推送越权隔离**（`test/ws-realtime.e2e-spec.ts`：双连接 emitToUser 互不可见）+ service 单测隔离 |
| MCP 出口 `/mcp` | ✅ | mcp-export e2e + HS-10 治理层（权限→确认→审计） |
| Headless `/headless` | ✅ | headless-keys e2e + HS-4 x-api-key |
| Plugin `/plugins/:path` | ✅ | plugins.flagship.integration.spec（requires 缺失跳过 / featureFlag 关闭跳过） |

## 3. 已知缺口（进 Trust 回归补测）

1. ~~SSE/WS 非 REST 入口越权~~（✅ 2026-08-21 已补：notifications.e2e + ws-realtime.e2e 隔离断言 + gateway/service 单测）。
2. ~~org/points 跨组织 AI 工具越权~~（✅ 2026-08-21 已补：`org.service.spec` 新增 `getOrgApprovalTaskStats` 双向跨组织隔离——A 在 org1 只见 org1 成员不见 org2，B 在 org2 反向隔离，且断言成员查询按调用者 org 过滤；query_org_tasks 工具非成员拒绝已有单测）。
3. ~~管理台脱敏的字段级断言~~（✅ 2026-08-21 已补：`test/admin-sanitize.e2e-spec.ts` 逐项断言 bio/dateOfBirth/firstName/lastName/avatarUrl/provider 不返回 + email 掩码 + password/refreshTokenHash 等不返回；phone 掩码实现同 maskEmail，经 bind-phone 需 SMS 码未在 e2e 绑定）。

## 4. 结论

- **REST 入口越权（跨用户读写删 + 非管理员访问 + 跨组织 + AI 工具越权）已系统覆盖**：13 e2e suite + SE 12/12 + AB 15/15 全过。
- **核心能力验证**：三旗舰 + 生成模块 + org 的越权拒绝、写确认、审计哈希链、撤销均有自动化回归。
- 缺口收窄为**跨组织 AI 工具**（SSE/WS 长连接越权已补）——作为 Trust 深化下一步（非阻塞 v1.0 对抗性证明的主体，因 REST + AI 工具主体已覆盖）。
