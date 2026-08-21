# KeelBase — Enterprise Capability Statement / 企业级能力声明

> 面向企业选型评审：逐项声明 KeelBase 提供的能力，并附**证据**（端点 / 文档 / 测试 / 工具），而非空泛宣传。
> 内部差距与待办见 [enterprise-readiness.md](enterprise-readiness.md)（活清单）；安全策略与披露见 [SECURITY.md](../SECURITY.md)。
> This statement declares KeelBase's enterprise capabilities with concrete evidence (endpoints / docs / tests / tooling). Gaps live in enterprise-readiness.md; security policy lives in SECURITY.md.

**双叙事 / Dual narrative**（§7.4 #4）：KeelBase 对外并列为两大叙事，不以前者遮蔽后者——
1. **AI 能力**：Business-safe Agent——AI 不只会答，更在权限/确认/审计边界内真实干活（§9 Agent 治理 + 旗舰应用证明）；
2. **数据主权 / Private AI**：数据不出域的私有化 AI 闭环——本地 LLM + 本地 Embedding + 本地审计全链路可验证（§10）。

---

## 1. 认证 / Authentication

**能力**：注册登录 / JWT access+refresh 轮换（SHA-256 哈希存储）/ 多设备会话管理 / 连续失败锁定 / 防枚举统一响应 / 随机延迟防时序 / 邮箱·手机验证 / 忘记密码 / OAuth 第三方（微信·支付宝·Google·Apple）/ **TOTP 双因素（MFA）** / 强制改密 / 自助注销 / 数据可携带导出。

**证据**：`/auth/*`（login / refresh / sessions / oauth / mfa / change-password / deactivate / export-data）；[session-management.spec.md](session-management.spec.md)、[account-compliance](account-compliance.spec.md)、[oauth-config.md](oauth-config.md)、[web-front.spec.md](web-front.spec.md)（MFA）。

## 2. 授权 / Authorization

**能力**：角色（user / admin）+ 路由级策略（`@CheckPolicies`）+ 服务层 subject 校验；admin 专属端点 CASL 门控（普通用户 403）。

**证据**：全局 `PoliciesGuard` + `CaslAbilityFactory`；`/users`、`/events/admin/*`、`/admin/*` 等。

## 3. 数据级权限 / CASL

**能力**：行级授权（本人所有权 / 同组织可见 / 管理员全量）+ 软删后仍可校验（withDeleted）+ 组织维度数据隔离（ORG-3）。

**证据**：events / todos 加 `org_id`，「本人 OR 同组织」查询；`subject('Event', entity)` + `ability.cannot(...)`；[org5-ai-tools.spec.md](org5-ai-tools.spec.md)。

## 4. 审计 / Audit

**能力**：操作审计（写操作 who/what/when/IP）+ AI 审计（工具调用 / 确认决策 / 副作用）+ **HMAC 哈希链防篡改（HS-11）** + 按用户/组织/反馈过滤 + 成本看板。

**证据**：`/audit/logs`、`/audit/operations/logs`、`/audit/verify`、`/audit/operations/verify`、`/audit/cost`；[hs11-audit-chain.spec.md](hs11-audit-chain.spec.md)。

## 5. 加密 / Encryption

**能力**：密码 bcrypt(12)；refresh token SHA-256 哈希存储；敏感字段（phone / providerId / mfa_secret）AES-256-GCM 静态加密；providerHash HMAC-SHA256 派生；上传魔数校验 + 签名 URL 访问控制（CR-21）。

**证据**：`EncryptionService`、`UploadSignService`；[storage-abstraction.spec.md](storage-abstraction.spec.md)、[hs10-mcp-adapter.spec.md](hs10-mcp-adapter.spec.md)。

## 6. 可观测性 / Observability

**能力**：结构化日志（pino）+ Prometheus 指标 + OpenTelemetry 链路（业务 span + TypeORM db.query span）+ Loki 集中日志 + Grafana 面板 + Prometheus 告警（ServerDown/错误率/延迟/并发）+ 异常告警 Webhook（钉钉/飞书/Slack）+ 管理台「监控中心」「运维」聚合页 + 健康检查依赖详情。

**证据**：`/metrics`、`/health?detail=true`、`/admin/ops/summary`；`docker-compose.observability.yml`；[operations.md](manual/operations.md)。

## 7. 备份与恢复 / Backup & Restore

**能力**：定时数据库备份 + 轮转保留（默认 7 份）+ 恢复脚本 + 运维健康巡检含备份新鲜度。

**证据**：`npm run backup` / `npm run restore -- <file>`；`scripts/healthcheck.ts`；[backup-restore.spec.md](backup-restore.spec.md)。

## 8. 部署 / Deployment

**能力**：一键 Docker Compose（HTTPS 可选）+ **单容器 all-in-one（`docker run` 一条命令）** + 离线内网部署 + K8s 清单 + 蓝绿/金丝雀 + Web-Admin 独立部署 + 读写分离（TypeORM replication）。

**证据**：`deploy/deploy.sh`、`deploy/deploy-offline.sh`、`Dockerfile.single`、`infra/k8s/`、`deploy/blue-green.sh`；[one-click-deploy.md](manual/one-click-deploy.md)、[offline-deploy.md](manual/offline-deploy.md)、[admin-deploy.md](manual/admin-deploy.md)、[blue-green-deploy.md](manual/blue-green-deploy.md)。

## 9. Agent 治理 / Agent Governance

**能力**：工具级权限（角色/邮箱/feature-flag 门控）+ 写操作人工确认（TTL 可配/会话信任）+ 副作用幂等与可撤销 + 上下文注入防线（敏感掩码/系统边界/注入检测）+ 工具结果 token 预算 + 治理策略可配置（enabled/requiresConfirmation/allowedRoles/审计粒度）+ MCP 出口入口同治理层 + 决策轨迹（用户侧读/写标注）+ AI 评测闭环 + 行为回放。

**证据**：HS-1~HS-11（[hs9-governance-policy.spec.md](hs9-governance-policy.spec.md)、[hs10-mcp-adapter.spec.md](hs10-mcp-adapter.spec.md)、[hs11-audit-chain.spec.md](hs11-audit-chain.spec.md)）；`/admin/ai/tools`、`/ai/tool-effects`、`/ai/eval/*`、Web-Admin「AI 行为回放」。

## 10. 私有 AI / Private AI

**能力**：本地 LLM（Ollama/vLLM OpenAI 兼容）无 Key 自动注册 + 本地 Embedding（bge-m3）+ 云→本地降级链 + 向量检索（pgvector）+ 离线镜像预置——「数据不出域」全链路可验证闭环（对话 → 审计 `provider:ollama` → 本地 embedding → 哈希链 valid）。

**证据**：`OLLAMA_BASE_URL` / `AI_PROVIDER=ollama`；[offline-deploy.md](manual/offline-deploy.md) + [private-ai-report.md](manual/private-ai-report.md)（2026-08-19 本机 Ollama Cloud OFF 全链路 8/8）+ `scripts/verify-private-ai.sh`（一键「数据不出域」验证）。

## 11. 测试与质量 / Testing & Quality

**能力**：后端单测 1300+ / e2e 126+（真实 HTTP）+ 覆盖率门槛（全局 65/55/60/65 + **安全模块分档门控** statements≥60）+ e2e 计覆盖率 + 迁移一致性 CI 校验 + CLI 生成器测试 + Flutter 测试 290+ / analyze + Web-Admin typecheck/lint/vitest。

**证据**：`npm run test:cov`、`scripts/check-security-coverage.mjs`、`.github/workflows/ci.yml`；[30min-acceptance.md](manual/30min-acceptance.md)。

## 12. 安全披露与供应链 / Security Disclosure & SBOM

**能力**：安全策略 + 漏洞私密披露流程（72h 确认 + PGP 可选）+ 依赖清单 / SBOM 生成 + npm audit + 生产安全默认值（非 root / 密钥随机化 / HSTS / CSP / CORS 收紧）。

**证据**：[SECURITY.md](../SECURITY.md)（SBOM 生成方式：cyclonedx-npm + dart pub deps）。

---

## 合规路径速查 / Compliance Path

| 法规/要求 | KeelBase 对应能力 | 证据 |
|---|---|---|
| 数据安全法 / 个保法 | 敏感数据静态加密、登录防爆破、最小化采集、数据可携带（export-data）、自助注销、审计留痕 | §5/§1/§4 |
| 数据不出域 / 私有化 | 本地 LLM/embedding + 离线镜像 + 外部依赖降级 | §10 |
| 企业安全评审（等保参考） | CASL 行级 + 审计哈希链 + MFA + 安全披露 | §3/§4/§1/§12 |

## 相关文档 / Related Docs

- [enterprise-readiness.md](enterprise-readiness.md) — 内部差距活清单（状态 + 待办 + 优先级）
- [SECURITY.md](../SECURITY.md) — 安全策略与漏洞披露
- [operations.md](manual/operations.md) — 运维手册（部署 / 环境变量 / 备份 / 可观测）
- [tutorial.md](manual/tutorial.md) — 从零到部署教程
