# KeelBase v1.0.0 — Business-safe AI Application Base

> **AI doesn't just answer. It acts — within your rules.**
>
> KeelBase 1.0 is the first stable release of the AI-driven enterprise application engineering base. It proves the **"trio"**: **AI CRM (Golden Application)** one-pass closed loop (Customer → Risk Analysis → Create Follow-up Task → Confirm → Write → Audit → Revoke) + **Application Protocol generator** (protocol-driven config → business modules with permissions / AI tools / confirmation / audit) + **Runtime governance** (CASL / write confirmation / audit hash chain / side-effect revocation / Explainable Authz).
>
> KeelBase 1.0 是 AI 驱动的企业应用工程体系首个稳定版。1.0 只证明「三件套」：**AI CRM（Golden Application）** 一次跑通闭环（客户 → 风险分析 → 建跟进 → 确认 → 写 → 审计 → 撤销）+ **Application Protocol 生成器**（协议化配置 → 生成带权限/AI 工具/确认/审计的模块）+ **Runtime 治理**（CASL / 写操作确认 / 审计哈希链 / 副作用撤销 / Explainable Authz）。FLOW / 插件 / MCP / Headless / 模板市场等能力已实现，**1.0 后按需激活**。

## The 1.0 Promise / 1.0 承诺

- **Build** — *AI Application Engineering:* the system provides Application Protocols (conventions), AI generates the business modules — no low-code engine. `keelbase init` turns a protocol (or an existing OpenAPI / SQL schema) into a full-stack module in minutes.
- **Run** — *Business-safe Agent Runtime:* runtime AI does real work — every tool call user-scoped, every write human-confirmed, every action audited and reversible.
- **Trust / Private Deploy** — *Data Sovereignty:* data stays on-prem; AI stays accountable. `release-gate.sh` proves Build / Gate 1 / Trust / Private / Adversarial in one command (deterministic 10/10, CI-able).

## New in v1.0.0 / 新增

- **AI CRM flagship (backend + Flutter/Web UI)**: Customer/Order/Activity/Task/Risk entities, CRUD/CASL, 5 AI tools (read + write-with-confirmation revocable), risk scoring, real seed, feature flag `crm`.
  **AI CRM 旗舰（后端 + Flutter/Web UI）**：客户/订单/跟进/任务/风险实体，CRUD/CASL，5 个 AI 工具（读 + 写需确认可撤销）、风险打分、真实 Seed、feature flag `crm`。
- **AI Project Management flagship (backend + Flutter/Web UI)**: Project/Member/Milestone/Task/Risk entities, CRUD/CASL, 4 AI tools (read + write-with-confirmation revocable), delay-risk scoring, real seed, feature flag `pm`.
  **AI Project 旗舰（后端 + Flutter/Web UI）**：项目/成员/里程碑/任务/风险实体，CRUD/CASL，4 个 AI 工具（读 + 写需确认可撤销）、延期风险打分、真实 Seed、feature flag `pm`。
- **AI Approval flagship (backend + Flutter/Web UI)**: ApprovalRequest/ApprovalPolicy entities, CRUD/CASL, AI pre-review with policy-tiered rules (low-risk auto-approve / over-threshold → human review) + manual decide, 4 AI tools, real seed, feature flag `approval`.
  **AI Approval 旗舰（后端 + Flutter/Web UI）**：审批请求/政策实体，CRUD/CASL，AI 预审按政策分级（低风险自动通过 / 超阈值转人工复核）+ 人工 decide，4 个 AI 工具，真实 Seed、feature flag `approval`。
- **Gate 1 Golden Application = AI CRM one-pass closed loop**: `verify-golden-application.sh` (9/9) + `golden-application.e2e-spec.ts` (7-step deterministic) — the 1.0 full product proof.
  **Gate 1 Golden Application = AI CRM 一次跑通闭环**：`verify-golden-application.sh`（9/9）+ `golden-application.e2e-spec.ts`（7 步确定性闭环）——1.0 完整产品证明。
- **Application Protocol generator + AIization (P0-12)**: `keelbase init --spec` generates modules with permissions / AI tools / confirmation / audit; `--import-openapi` / `--import-schema` turn legacy systems into protocols → generated modules.
  **Application Protocol 生成器 + AIization（P0-12）**：`keelbase init --spec` 生成带权限/AI 工具/确认/审计的模块；`--import-openapi`/`--import-schema` 把老系统转协议 → 生成模块。
- **Private AI Golden Path (W1 / POV-1)**: `verify-private-ai.sh` proves "data never leaves the perimeter" end-to-end — Cloud OFF → local Ollama chat → local embedding → CRM read → AI audit → hash-chain valid.
  **私有 AI 全链路（W1 / POV-1）**：`verify-private-ai.sh` 端到端证明「数据不出域」——Cloud OFF → 本地 Ollama → 本地 embedding → CRM 读 → AI 审计 → 哈希链 valid。
- **Audit hash chain (HS-11)**: tamper-evident, verifiable AI + operation audit chains with independent-key rotation support.
  **审计哈希链（HS-11）**：防篡改可验证的 AI + 操作审计链，独立密钥 + 轮换支持。
- **Explainable Authorization (W5-⑦)**: structured denial reasons + `GET /auth/me/permissions` capability list.
  **授权依据可解释化（W5-⑦）**：授权拒绝返回结构化原因 + `GET /auth/me/permissions` 能力清单。
- **Self-service AI side-effect revocation (P0-15)**: users revoke their own AI-created records; admin revoke + recycle-bin restore.
  **用户侧 AI 副作用撤销（P0-15）**：本人可撤销 AI 创建的记录；管理端撤销 + 回收站恢复。
- **Agent Security Eval attack set (W4)**: 12 security cases (injection-write / confirmation-bypass / revoke-bypass / cross-org / unauthorized-read), verified 12/12 blocked on DeepSeek; scripted regression with 90% gate.
  **Agent 安全评测攻击集（W4）**：12 个安全用例（注入写/确认绕过/撤销绕过/跨组织/越权读），DeepSeek 实测 12/12 全挡；脚本化安全回归（90% 门槛）。
- **Business-safe Agent Benchmark (W2)**: 15 cases (Normal/Unauthorized/Ambiguous/High-risk/Injection × three flagships) with Run/Trust/Safety scores; deterministic Trust via e2e.
  **Business-safe Agent Benchmark（W2）**：15 用例（五类任务 × 三旗舰）+ Run/Trust/Safety 评分；确定性 Trust 由 e2e 补足。
- **Generic OIDC SSO (P2-4)**, **plugin ecosystem CLI (P1-7)**, **Web-Admin-Vue Element Plus migration**, **Agent Decision Trace (P0-14)**, **webhooks (PL-14)**, **MCP adapter (HS-10)**, **generator DX**, **flagship demo templates (P1-9)**, **provenance manifest + `keelbase inspect`/`doctor`**.
  **通用 OIDC SSO（P2-4）**、**插件生态 CLI（P1-7）**、**管理台 Element Plus 迁移**、**AI 决策轨迹（P0-14）**、**Webhook（PL-14）**、**MCP 适配（HS-10）**、**生成器 DX**、**旗舰演示模板（P1-9）**、**来源指纹 manifest + `keelbase inspect`/`doctor`**。

## Trust & Adversarial Proof / 信任与对抗性证明

- **越权测试矩阵（39 用例）**：REST CRUD × 7 实体 + AI 工具读/写隔离 + Headless + 撤销，跨用户一律 403/404 拒绝。
- **Agent Security Eval 攻击测试集（12/12 全挡）**：Prompt Injection / 越权 / Confirmation Bypass / Revoke Bypass / Cross-org。
- **合成陌生人验证**：fresh-context AI 干净 clone 跑通 30min Build + 60min Business，卡点全部修复（含审计链并发分叉）。
- **Gate 1 Golden Application 双视角**：确定性 7 步闭环（9/9）+ LLM 真实对话 8/8。

## Quality / 质量

- Backend: **189 suites / 1591 unit tests** green + security-module tier gate (all ≥85%); **16 e2e suites / 245 tests** green; coverage **91.1% statements / 77.1% branches / 84.9% functions** (no regression vs v0.9.2).
  **后端**：**189 套件 / 1591 单测**全绿 + 安全模块分档门控（全 ≥85%）；**16 e2e 套件 / 245 测试**全绿；覆盖率 **91.1% / 77.1% / 84.9%**（较 v0.9.2 无降级）。
- Flutter: **519+ tests** green, line coverage **62.3%** (≥45%). Web-Admin-Vue: vitest green, coverage **39.5%** (≥32%).
  **Flutter**：**519+ 测试**全绿，行覆盖 **62.3%**（≥45%）。**Web-Admin-Vue**：vitest 全绿，覆盖 **39.5%**（≥32%）。
- Release Precheck（2026-08-22）：双重 code review（阿里 OCR + Claude）→ 修复 3 处（审计链 feedback 断链 / webhook SSRF 重定向 / emailVerified 重置）；全量测试全过；覆盖率达标。

---

**Docs / 文档**：`docs/manual/release-1.0-candidate.md`（Gate 4 冻结清单 + Exit Criteria 10 项）、`docs/manual/release-gate.md`（Build/Run/Trust/Private 四维 + Gate 1）、`docs/manual/release-precheck.md`（发布前标准程序）、`docs/enterprise-capabilities.md`（双叙事：AI 能力 + 数据主权）。私有仓 roadmap / development-plan 已同步。
