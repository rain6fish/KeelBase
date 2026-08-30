# Security Showcase — 可运行的安全验证展示

> 定位：给验证者 / 评审一份**可自行运行**的安全证明路径——每个能力「跑什么命令 + 看什么页面 + 期望什么」。
> 与内部门禁 [release-gate.md](release-gate.md) 互补：门禁看 PASS/FAIL，本指南看「怎么跑、看什么」。
> 覆盖：越权拒绝 / 工具治理与风险分级 / 人工批准 / 审计哈希链 / Agent 行为基准。
> 中文 · [English](security-showcase-en.md)

## 0. 一键起环境（约 2 分钟）

**方式 A — 单容器镜像（推荐，零配置）**

```bash
docker run -d --name keelbase -p 3000:3000 ghcr.io/rain6fish/keelbase:latest
```

> 镜像内置**确定性 Demo Provider**：无 LLM key 也能跑通 AI 黄金流程（分析→确认→创建→审计→撤销）；配 `-e DEEPSEEK_API_KEY=...` 用真实 LLM。
> 重置到干净状态：`docker rm -f keelbase && docker run -d --name keelbase -p 3000:3000 ghcr.io/rain6fish/keelbase:latest`

**方式 B — 本地开发**

```bash
cp Server-NestJS/.env.example Server-NestJS/.env
cd Server-NestJS && npm install && npm run start:dev
```

账号：`alex / Alex@2026$Demo`（工作台）· `admin / Admin@2026$KeelBase`（管理台）· 越权演示再注册一个 `bob`（`POST /auth/register`，任意密码）。

## 1. 越权拒绝（Permission Denied，授权矩阵）

**证明**：跨用户数据访问被**行级策略**拒绝（运行时边界，非提示建议）。

- 跑：工作台登录 `bob` → 直接打开 `/workbench/crm/1`（alex 的客户详情）→ 前端显示「**无权访问该客户**」
- 或 API：`GET /crm/customers/1`（bob token）→ `403 无权访问此客户`
- **一键自动验证（V-2）**：`node Server-NestJS/scripts/verify-permission-denied.mjs`（注册 bob → 越权访问 CRM 客户/事件/用户详情 403 + admin 200 对照 + 本人 200 对照，实测 8/8，报告 `docs/benchmark/permission-denied-*`）
- 系统化覆盖：[security-verification-matrix.md](security-verification-matrix.md)——敏感资源 × 越权场景，13 个 e2e suite（跨用户读写删 / 非管理员访问 / 跨组织 / AI 工具越权）

## 2. 工具治理与风险分级

**证明**：AI 工具按风险分级（R0–R5）+ 读写分类，全程可治理。

- 跑：管理台 → **AI 工具**（`/admin/#/ai-tools`）→ 工具清单：风险级标签（R1 读自动 / R3 写确认 / R4 双人审批 / R5 阻断）+ 权限元数据（读写、featureFlag、adminOnly）
- 实测：AI 对话工具调用时 `tool_start` 事件携带 `riskLevel` + **授权依据**（为什么允许执行）

## 3. 人工批准（确认门控 + R4 双人审批）

**证明**：AI 写操作必须人工确认才执行，高影响动作需第二人批准。

- 跑：工作台 AI 对话「为辰光建材创建跟进任务」→ 弹**确认卡**（R3 写操作：风险级 + 授权技术详情 + 批准/拒绝/本会话信任）→ 批准 → 落库 →「已确认 · 可撤销」
- 管理台 → **AI 审批**（`/admin/#/ai-approvals`）→ R4 高影响动作的双人审批记录（人工复核）
- API：`POST /ai/confirmations/:token`（approve / reject）

## 4. 审计哈希链

**证明**：所有 AI 调用 / 工具执行入审计，哈希链可验证（防篡改、可纠错）。

- 跑：管理台 → **AI 审计**（`/admin/#/audit`）→ `GET /audit/verify` → `valid:true`
- 并发压测：`cd Server-NestJS && npm run audit:chain:load`（1000 条基线：分叉 0 + verify 全绿 + 吞吐 / P95）
- 撤销：AI 创建记录可在 AI 执行轨迹页一键撤销（软删，可经回收站恢复）

## 5. Agent 行为基准（攻击集 + Golden 闭环）

**证明**：AI Agent 对攻击（prompt 注入 / 越权 / 确认绕过 / 撤销绕过）**全挡**；黄金流程闭环可复现。

- 攻击集：`./scripts/verify-security-eval.sh` → **12/12 全挡**（reject 8/8 + confirmation-bypass / cross-org-read / revoke-bypass 等）
- Golden 闭环：`./scripts/verify-golden-application.sh` → **8/8**（客户→风险→建跟进→确认→写→审计→撤销）
- LLM 行为基准：`LLM_ENV=1 ./scripts/release-gate.sh`（Run/Adversarial 维度，agent-benchmark 15 用例 Run/Trust/Safety）

## 验收清单（验证者自行勾选）

- [ ] 越权访问他人数据 → 403 + 前端明确「无权访问」
- [ ] AI 工具按风险分级（R0–R5）可治理，调用携带授权依据
- [ ] AI 写操作需人工确认，R4 高影响动作双人审批
- [ ] 审计哈希链 `valid:true`，并发压测分叉 0
- [ ] 攻击测试集 12/12 全挡，Golden 闭环 8/8

## 相关

- 越权矩阵：[security-verification-matrix.md](security-verification-matrix.md) · 内部门禁：[release-gate.md](release-gate.md)
- 演示脚本：[golden-demo-script.md](golden-demo-script.md) · 30min Build：[onboarding-30min.md](onboarding-30min.md)
- **全部可复现验证一站式清单**：[verification-index.md](verification-index.md)（护城河 + 产品证明 + 私有化，命令/前置/报告）
