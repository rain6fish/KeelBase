# Adversarial Proof — 对抗性证明证据链统一汇总（Gate 2）

> 日期：2026-08-21
> 定位：development-plan §7.3 **Gate 2**（Adversarial Proof）的统一汇总——把分散在多个套件/脚本/报告的对抗性证据收敛为一条**可重复验证的证据链**，从「安全能力存在」升级为「安全能力有可重复证明」。
> 覆盖维度：越权 / 提示注入 / Tool Abuse / 数据范围 / 未确认写 / 审计完整性 / 撤销。
> 全部证据均可重新运行（重跑命令见各表）；聚合判定见文末。

---

## 1. 证据链总览

| # | 维度 | 证据源 | 结果（最近一次实测） | 重跑命令 |
|---|------|--------|--------------------|---------|
| 1 | **越权（跨用户读/写/删、admin 端点、跨组织）** | 越权矩阵 e2e（[authorization.e2e-spec.ts](../../Server-NestJS/test/authorization.e2e-spec.ts)）+ 13 个资源 suite | **39 用例全过**（V1.0 Blocker 回归） | `cd Server-NestJS && npx jest --config test/jest-e2e.json test/authorization.e2e-spec.ts` |
| 2 | **提示注入 / Confirmation Bypass / Revoke Bypass / Cross-org / PII / 写拒绝** | Agent Security Eval（[verify-security-eval.sh](../../scripts/verify-security-eval.sh)） | **12/12 全挡**（DeepSeek 实测，门槛 90%） | `BASE_URL=<backend> ./scripts/verify-security-eval.sh` |
| 3 | **Tool Abuse / 数据范围 / 边界（五类任务 × 三旗舰）** | Agent Benchmark（[agent-benchmark.mjs](../../scripts/benchmark/agent-benchmark.mjs)） | **15/15**：Run 100% / Trust 100% / Safety 100% | `PROVIDER=deepseek MODEL=deepseek-v4-flash node scripts/benchmark/agent-benchmark.mjs` |
| 4 | **未确认写（确认门控不确认不执行）+ 撤销 + 审计** | Golden Application 闭环（[golden-application.e2e-spec.ts](../../Server-NestJS/test/golden-application.e2e-spec.ts)）| **7 步确定性闭环 PASS** | `./scripts/verify-golden-application.sh` |
| 5 | **同一闭环的 LLM 真实对话视角** | [verify-golden-crm.mjs](../../scripts/verify-golden-crm.mjs) | **8/8**（DeepSeek，18s） | `PROVIDER=deepseek MODEL=deepseek-v4-flash node scripts/verify-golden-crm.mjs` |
| 6 | **审计完整性（哈希链）** | `/api/v1/audit/verify` + `/api/v1/audit/operations/verify`（HS-11）+ 审计链 e2e | **valid: true**（含 agentId/sessionId 后） | `curl /api/v1/audit/verify`（ADMIN）|
| 7 | **真实陌生人对 onboarding/闭环** | 合成陌生人（[stranger-challenge-report-2026-08-21.md](./stranger-challenge-report-2026-08-21.md)）| 30min Build ✅ + 60min Business ✅（确认门控实证） | `./scripts/challenge/run.sh` |

> 详细维度矩阵见 [security-verification-matrix.md](../manual/security-verification-matrix.md)（敏感资源 × 操作 × 入口 × 覆盖来源标注）。

---

## 2. 维度详情与证据

### 2.1 越权（Unauthorized Access）— 39 用例

- **入口**：[authorization.e2e-spec.ts](../../Server-NestJS/test/authorization.e2e-spec.ts)（V1.0 Blocker 级回归套件）
- **结构**：`it.each` 矩阵（资源 × 操作，跨用户一律 403/404 非 2xx 非 5xx）+ 显式用例：
  - 列表隔离（B 列表不含 A 数据）
  - admin 端点保护（普通 user 访问 `/users`、`/audit/logs` → 403）
  - **AI 工具数据隔离**：读（A 查客户不含 B）+ 写（A 对 B 客户建任务 → 拒绝）
  - **Headless 越权**：无/伪造 x-api-key → 401
  - **撤销越权**：B 撤销 A 副作用 → 404；A 撤销自己 → 200
- **佐证**：13 个资源 e2e（events/todos/crm/pm/approval/suppliers/contracts/org/points/settings/admin/ai/forms）跨用户 403 全覆盖。
- **残余待补**（security-verification-matrix §3）：无（SSE/WS 长连接越权、管理台脱敏字段级、跨组织 AI 工具越权均已补，2026-08-21）。

### 2.2 提示注入 / 确认绕过 / 撤销绕过 / 跨组织（Agent Security Eval）— 12/12

- **入口**：[verify-security-eval.sh](../../scripts/verify-security-eval.sh)（seed 攻击用例 → 跑评测批 → 断言门槛）
- **覆盖**：越权 / Prompt Injection / Confirmation Bypass / Revoke Bypass / Cross-org / PII / 写拒绝
- **实测**：DeepSeek 12/12 全挡（越权/注入/确认绕过/撤销绕过/跨组织全拒，正常用例通过），安全回归门槛 90% 达成（见 [release-gate.md](../manual/release-gate.md) §5）。
- **进 CI 状态**：`verify-security-eval.sh` 需 LLM 环境（云端 key），当前 LLM_ENV=1 标注、非阻塞。

### 2.3 Tool Abuse / 数据范围 / 边界（Agent Benchmark）— 15/15

- **入口**：[agent-benchmark.mjs](../../scripts/benchmark/agent-benchmark.mjs)
- **结构**：五类任务（Normal / Unauthorized / Ambiguous / High-risk / Injection）× 三旗舰（CRM/PM/Approval）= 15 用例，SSE 流式断言工具调用/确认门控/拒绝语义。
- **实测**：DeepSeek deepseek-v4-flash **Run 100% / Trust 100% / Safety 100%**（报告 [agent-benchmark-2026-08-20-05-59-21.md](./agent-benchmark-2026-08-20-05-59-21.md)）。7B CPU 曾低分（33/17/33）证实系模型/环境限制非能力缺陷。

### 2.4 未确认写 + 撤销 + 审计（Golden Application 闭环）— 7 步

- **入口**：[golden-application.e2e-spec.ts](../../Server-NestJS/test/golden-application.e2e-spec.ts) + [verify-golden-application.sh](../../scripts/verify-golden-application.sh)（8 项：7 业务步 + Build）
- **闭环**：Customer → Risk Analysis → Create Follow-up Task → 确认 → 写 → 审计 → 撤销
  - **确认门控**：`executeToolForExternal` 走真实治理层 → `requiresConfirmation` 不确认不执行
  - **审计**：AI 审计 + 操作审计哈希链 verify valid（HS-11）
  - **撤销**：`revokeOwned` 软删 + 越权撤销 404（所有权）
- **LLM 视角**：[verify-golden-crm.mjs](../../scripts/verify-golden-crm.mjs) 8/8（同一闭环经真实 Agent 对话，含 confirmation_request 非静默 → approve → 落库 → 轨迹审计 → 撤销）。

### 2.5 审计完整性（哈希链）

- **入口**：`GET /api/v1/audit/verify`（AI 审计链）+ `GET /api/v1/audit/operations/verify`（操作审计链），均 ADMIN。
- **实现**：SHA-256 逐条哈希 + prev_hash 链接 + HMAC 独立密钥（`AUDIT_HMAC_KEY` + version 轮换），并发写串行化防链分叉（2026-08-21 修复）。
- **实测**：`valid: true`；agentId/sessionId 入审计列（W4 ⑤ 最小切片）后哈希链仍 valid。

### 2.6 合成陌生人（真实新人视角）

- **入口**：[stranger-challenge-report-2026-08-21.md](./stranger-challenge-report-2026-08-21.md) + [challenge/run.sh](../../scripts/challenge/run.sh)
- **实测**：无上下文 AI 从干净 clone 30min Build ✅（生成+编译+测试全通）+ 60min Business ✅（读→写→确认→执行→审计→撤销全通）；新增发现已修复（审计链并发分叉、接线告警等）。
- **CI**：stranger-smoke job 持续防回归。

---

## 3. 聚合判定（Gate 2）

```text
Adversarial Proof 判定：
- 越权矩阵 39/39 ✅（CI 回归，V1.0 Blocker）
- Agent Security Eval 12/12 ✅（LLM，门槛 90%）
- Agent Benchmark 15/15 ✅（Run/Trust/Safety 100%）
- Golden 闭环（确定性 7 步 + LLM 8/8）✅
- 审计哈希链 valid ✅
- 合成陌生人 30min/60min ✅
→ Gate 2：PASS（维度 1-7 均有可重复证据）

待补（不阻塞 Gate 2 主体）：
- ~~SSE/WS 的「他人 room 推送越权」断言~~（✅ 已补：notifications.e2e + ws-realtime.e2e，2026-08-21）
- ~~管理台脱敏字段级断言~~（✅ 已补：admin-sanitize.e2e 逐项核对隐私字段不返回，2026-08-21）
- Run/Adversarial 进 CI（LLM 云端 key 非阻塞标注，§7.4 #2）
```

## 4. 相关

- [security-verification-matrix.md](../manual/security-verification-matrix.md) — 越权矩阵维度明细
- [release-gate.md](../manual/release-gate.md) — 五维 Release Gate 判定（含对抗性证明 §5）
- [agent-benchmark-2026-08-20-05-59-21.md](./agent-benchmark-2026-08-20-05-59-21.md) — 15/15 报告
- [golden-crm-2026-08-21T04-13-45-289Z.md](./golden-crm-2026-08-21T04-13-45-289Z.md) — Gate 1 LLM 8/8 报告
- [stranger-challenge-report-2026-08-21.md](./stranger-challenge-report-2026-08-21.md) — 合成陌生人报告
