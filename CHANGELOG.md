# Changelog / 更新日志

This file records all notable changes to KeelBase. The format follows [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/), and versioning follows [Semantic Versioning](https://semver.org/lang/zh-CN/).

本文件记录 KeelBase 所有值得关注的变更。格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循[语义化版本](https://semver.org/lang/zh-CN/)。

## [1.0.3] - 2026-08-30

> **KeelBase 1.0.3 — Trust & Governance Hardening / 治理加固与产品证明版**
> 1.0 后第三个补丁：护城河 2.0（独立治理台 + sidecar 零代码接入 + 多系统单控制面）+ 审计可视化 E-1/E-2（字段级审计/哈希链视图/证据包导出）+ 关键路径性能 E-3 + 产品证明包（Trust 证明包六场景/越权 V-2/演示复位 V-4）+ 发布前三方评审加固（哈希链锁行/操作审计并发/副作用类型映射/sidecar 鉴权/迁移白名单）。**1.1 仍未触发**（产品证明期 4 项验收未达）。

### Added / 新增

- **Trust Proof Package (P0-6)**: `verify-trust-proof.mjs` six-scenario one-command verification (success / permission-denied 403 / R5 blocked / human confirmation / revoke / Java guidance), verified 15/15 (provider=demo, deterministic no-LLM); new `delete_customer` R5 block tool (irreversible action, policy-blocked, never executes) + DemoProvider always registered (`provider:'demo'` usable even with cloud keys)
  **Trust 证明包（P0-6）**：六场景一键验证脚本（正常成功/越权 403/R5 阻断/人工确认/撤销/Java 引导，实测 15/15）+ delete_customer R5 阻断工具 + DemoProvider 无条件注册；security-showcase 双语入口 + 60s 视频分镜双语
- **Java probe observation window**: `check-java-probe.mjs` collects Maven Central/GitHub demand signals (8/8 artifacts @0.1.1) + KeelBase4J trigger definition (integrator feedback "product good but can't bid without all-Java") + observation cadence
  **Java 探针观察窗口**：keelbase-java-starter 需求信号采集 + KeelBase4J 启动依据（需求驱动）+ 观察节奏
- **Governance Moat 2.0**: standalone governance control plane (D-2) + external report endpoints (service identity) + audit/effect dual-write + cross-service revoke/approve callbacks + docker orchestration + sidecar AI-gateway audit proxy (S-1) + tool-call gating (S-2: R5 block / R3-4 confirm) + MOAT-1 30-min adoption + MOAT-3 multi-system single control plane (10-entry continuous hash chain verified)
  **治理护城河 2.0**：独立治理台 + sidecar 零代码接入 + 工具门控 + 多系统单控制面 + 跨服务撤销/审批回调
- **Audit visualization (E-1/E-2/D4)**: E-1 field-level change audit (before/after snapshot + FieldDiff) + E-2 hash-chain view / daily trend / behavior replay + D4 evidence-package export (HMAC-signed, audit-committee verifiable) + HashChainView component
  **审计可视化**：字段级审计 + 哈希链可视化 + 行为回放 + 证据包导出
- **Performance (E-3)**: aggregate-endpoint caching (audit stats/cost/report/verify 60s TTL) + getAllStats column projection + users list cache/index + nginx gzip + vite manualChunks + frontend loading states
  **关键路径性能（E-3）**：聚合缓存 + 列投影 + gzip + chunk 拆分
- **AI-23 content safety (deep)**: dynamic sensitive-word/jailbreak table (Settings live) + hit audit + RAG/memory interception + Admin config card
  **AI 内容安全深度化**：动态词表 + 全链路拦截 + 审计 + 管理台配置卡
- **AI-config guidance banner**: `/app/capabilities` ai.{enabled,providerConfigured,provider} probe + Flutter/Web AI-page guidance banner
  **AI 配置引导**：后端能力探测 + 双端 banner
- **Front-end RBAC (WEB-FRONT-2)**: permission-point constants + `v-permission` directive + permission center page + actionable 403 guidance + first-visit onboarding
  **前端 RBAC 权限点**：权限点/指令/中心页 + 403 可行动引导 + onboarding
- **CLI**: generator next-steps full loop (backend/migration/frontend/AI-tool/deploy verification) + `doctor --env` environment preflight
  **CLI 增强**：next-steps 全闭环 + doctor 环境预检
- **weapp**: 23-page i18n migration + `build:weapp` fix + CI weapp regression guard
  **weapp 专项**：i18n 全量 + 构建修复 + CI 防回归
- **Product proof**: V-2 permission-denied verification (8/8) + V-4 one-command demo reset + V-6 30-min build instrument + verification-index
  **产品证明**：越权 V-2 + 演示复位 V-4 + 30min V-6 + 验证索引
- （承接既有）M2 Guard 深化 / Integrator Kit / Live demo / P0-0 DemoProvider / 部署加固 / CORS / 审计链压测

### Fixed / 修复

- **Three-way review hardening (2026-08-30, pre-release)**: `create_contract` side-effect resultType mis-recorded as `'todo'` (revoke would soft-delete wrong Todo) → mapped `contract`; `audit_chain_lock` lock row only seeded by migration (dev/governance-standalone locked 0 rows → concurrent hash-chain fork) → idempotent ensure before lock; operation-audit sqlite concurrent-transaction interleave → silent audit loss → process `_tail` serialization; getAllStats projection missing detail/authorization/errorMessage → E-2 trend distortion → completed; sidecar `POST /confirmations` unauthenticated token disclosure → requires shared service key; GovernanceDataSource production `synchronize:true` → non-production only; entityFor unknown type defaulted to `Todo` (wrong delete) → fail closed; sidecar upstream fetch no timeout → 120s; external `isError` string parsing; delete_customer redundant requireVerifiedEmail; app.module postgres migration whitelist missing AddAuditChainLock/AddAiAuditUsername/AddAiGovernancePolicy; `reset-demo.sh --docker` no-op → rebuild postgres business DB
  **三方评审加固（阿里 ocr + Claude 自带 + code-review skill，2026-08-30）**：12 项后端 + 2 项前端阻塞/关键项修复——哈希链锁行/操作审计并发/副作用类型映射/审计趋势/侧边车鉴权/迁移白名单/演示复位等
- **Front-end (ocr)**: HashChainView `slice(0,n)` dropped newest chain tip → `slice(-n)`; CrmCopilotDrawer stale `executed` after tool failure → cleared on matched tool_end
  **前端修复（ocr）**：哈希链可视化保留最新证据 + Copilot executed 防残留
- （承接既有）P0 部署/安全加固 / CORS / 审计链压测

### Changed / 变更

- （承接既有）审计链压测入 release-gate（多实例模式复现分叉）

## Release Precheck（2026-08-30）

- 三方 code review：**阿里 ocr**（v1.11.0 全区间扫描）+ **Claude 自带多维审查** + **code-review skill**（Standards + Spec 双轴）→ 综合修复 14 项（阻塞项全修，余项记录为已知限制）
- 全量测试：后端单测 **216 套 / 1873 全绿** + e2e + Web-Admin vitest/typecheck + Flutter + 生成器/CLI + release-gate（详见发布记录）

## [Unreleased]

## [1.0.2] - 2026-08-27

> **KeelBase 1.0.2 — Governance & Product-Proof Release / 治理深化与产品证明版**
>
> 1.0 后第二个补丁：M2 KeelBase Guard 控制平面成型（Agent Registry / Policy Center / Risk Center / Guard Overview）+ Trust UX 深化（D1 CRM 闭环 / Action Detail / 人类语言审计标签 / 委托字段）+ 产品证明准备（onboarding-30min / 一键 Golden Flow demo / OIDC 企业 SSO / AR-2 MCP）+ 跨端与生成器维护（Taro i18n / README 双语 / React CI / 生成器幂等与锚点修复）。**1.1 仍未触发**（产品证明期 4 项验收未达）。

### Added / 新增

- **M2 KeelBase Guard (M2 deep)**: Agent Registry admin view (D5) + Policy Center standalone (HS-9 策略产品面) + Risk Center (工具风险 R1-R5 / 高风险清单 / 阻断统计) + Guard Overview posture page (一页总览五中心 + 风险分布 + 审计态势 + 哈希链验证) + security-governance nav group + Agent→audit/replay linkage
  **M2 KeelBase Guard（M2 深化）**：Agent Registry 管理视图（D5）+ Policy Center 独立页（HS-9 策略产品面）+ Risk Center 风险中心（工具风险 R1-R5 / 高风险清单 / 阻断统计）+ Guard Overview 治理总览（一页总览五中心 + 风险分布 + 审计态势 + 哈希链验证）+ 安全治理导航分组 + Agent↔审计/行为回放联动
- **Trust UX (D1/D2/D4)**: AI CRM closed loop (copilot streaming + inline confirmation + governance drill) + Business Action Detail page (Who/When/What/Why two-layer/Result/Side Effects/Integrity + Human-Agent-System timeline) + tool-level human-readable audit labels (D2) + Agent Delegation Chain fields (D4, parent_action_id/caller_agent_id/…) + `toolLabel` human labels
  **Trust UX（D1/D2/D4）**：AI CRM 业务闭环（Copilot 流式 + 内联确认卡 + 治理钻取）+ Action Detail 业务动作详情页（七段 + Why 双层 + Human-Agent-System 时间线）+ 工具级人类语言审计标签（D2）+ Agent 委托链字段（D4，parent_action_id/caller_agent_id/…）+ `toolLabel` 人类标签
- **Product-proof prep (P0·产品证明)**: onboarding-30min (Build an AI module in 30 minutes, invoices sample) + one-command AI CRM Golden Flow workbench demo (`deploy/demo.sh`) + golden-demo recording script aligned to D1 UI + OIDC enterprise SSO frontend + AR-2 MCP-as-Adapter verification
  **产品证明准备（P0·产品证明）**：onboarding-30min（30 分钟 Build 业务模块，invoices 示例）+ 一键 AI CRM Golden Flow 工作台演示（deploy/demo.sh）+ 录制剧本对齐 D1 UI + OIDC 企业 SSO 前端 + AR-2 MCP 即 Adapter 验证
- **Cross-client & tooling**: Taro i18n layer (201 keys zh/en) + README/CHANGELOG bilingual + Web-Admin-React CI job + topbar role switch (admin ↔ workbench) + `sync-issues-to-gitee` script + generator DX (idempotent file write / wiring anchor repair / invoices sample spec)
  **跨端与工具**：Taro i18n 层（zh/en 各 201 键）+ README 双语 + Web-Admin-React CI 接入 + 顶栏角色切换（管理台 ↔ 工作台）+ Gitee issue 同步脚本 + 生成器 DX（文件写入幂等 / 接线锚点修复 / invoices 示例 spec）

### Fixed / 修复

- **GET /events without range crashes on postgres**: `getEventsForRange` 对缺失/非法的 start/end 构造 `Invalid Date`，sqlite 不报错但 postgres 500——start/end 改可选，缺失时仅按所有权过滤
- **Generator overwrote flagship AI tools**: `writeGenerated` 无条件覆盖已存在的 `query-customers.tool.ts`（AI CRM 旗舰）——加「已存在则跳过」幂等（`--force` 覆盖）
- **Generator wiring anchors broken by code drift**: applyFile 加 CRLF 归一化（Flutter main.dart）+ modules-manifest todos 条目 description + Taro explore i18n label——生成接线 24/24 无未命中
- **AiAuditView tests missing useRoute mock**（M2 agentId 过滤引入）：补 mock，281/281 全绿
- **P0 deployment & security hardening (external review)**: env 模板补 ENCRYPTION_KEY/AUDIT_HMAC_KEY + 部署脚本「替换+追加缺失行」；Docker 依赖宿主 Flutter web 预构建 fail-fast；R4 decideApproval 拒绝 self-approve；SSRF 防护提取 common/utils/ssrf（webhook + MCP registerServer 复用）
  **P0 部署+安全硬化（外部评审）**：env 模板补 ENCRYPTION_KEY/AUDIT_HMAC_KEY + 部署脚本追加缺失行；Docker 依赖宿主 Flutter web 预构建 fail-fast；R4 审批拒绝自批；SSRF 防护提取 common/utils/ssrf（webhook + MCP 复用）
- **Deploy no longer hardcodes domain**: docker-compose.prod.yml CORS_ORIGINS 改 `${CORS_ORIGINS}` env 引用；nginx.https.conf server_name 改通配——换域名部署无需改源码
  **部署不再写死域名**：docker-compose.prod.yml CORS_ORIGINS 改 `${CORS_ORIGINS}` env 引用；nginx.https.conf server_name 改通配——换域名部署无需改源码
- **Web-Admin fixes**: 业务页 Copilot 按钮改「AI 分析」（与顶栏全局 AI 区分）+ StatCard 长值截断（邮箱溢出）
  **管理台修复**：业务页 Copilot 按钮改「AI 分析」（与全局 AI 区分）+ StatCard 长值截断（邮箱溢出）

## [1.0.1] - 2026-08-22

> **KeelBase 1.0.1 — Maintenance & Coverage Release / 维护与覆盖加固版**
>
> 首个 1.0 补丁：v1.0 发布前 review 的两项遗留（AI 每日限额并发原子化 / WS 节流窗口命名）+ 来源身份体系补齐（System AI 来源身份 / doctor 兼容矩阵）+ 测试覆盖大幅提升（后端 24 文件到 85%+、管理台 10 视图、Flutter 102 用例）。

### Added / 新增

- **System AI Assistant source identity (provenance §13.1 ③)**: `AdminAiService.buildSystemContext` now injects the source identity from `.keelbase/manifest.json` (identity / generator+version / protocol / schema / source modules) so the console AI can answer "what system is this / who generated it / which protocol version"; complements the public `GET /app/provenance` runtime fingerprint
  **System AI 来源身份集成（来源清单 §13.1 ③）**：`AdminAiService.buildSystemContext` 注入 `.keelbase/manifest.json` 的来源身份（identity/generator+version/protocol/schema/来源模块），管理台 AI 可回答「这是什么系统/谁生成的/什么协议版本」；与公开 `GET /app/provenance` 运行时指纹互补
- **`keelbase doctor` compatibility matrix (provenance §13.1 ⑤)**: fifth check compares the manifest `protocol`/`schema` against the current CLI's supported values (mismatch → FAIL, upgrade CLI or rebuild the source manifest), alongside the existing completeness/consistency/runtime/version checks
  **`keelbase doctor` 兼容矩阵（来源清单 §13.1 ⑤）**：新增第五查——manifest `protocol`/`schema` 对照当前 CLI 支持的版本（不匹配 → FAIL，需升级 CLI 或重建来源清单），与完整性/一致性/运行时/版本并列
- **Test coverage surge (maintenance)**: backend 24 low-coverage files raised to 85%+ (most 100%); Web-Admin-Vue 10 core view component tests (35 cases); Flutter flagship detail/list pages, repositories & core (102 cases) — overall backend statements 92.7% / branches 77.8% / functions 90.4%, vitest ~75.5%
  **测试覆盖大幅提升（维护）**：后端 24 个低覆盖文件提到 85%+（多数 100%）；管理台 10 个核心视图组件测试（35 用例）；Flutter 旗舰详情/列表页 + repository + core（102 用例）——后端 statements 92.7% / branches 77.8% / functions 90.4%，vitest ~75.5%

### Fixed / 修复

- **AI daily limit made concurrency-atomic (v1.0 review S3)**: `reserveDailyUsage` uses an atomic conditional increment (`WHERE count < limit`, same pattern as the headless quota) instead of read-check-write, so concurrent chats can no longer collectively exceed `ai_daily_limit`; failed chats release their reserved slot via `releaseDailyUsage` (only decrements when `count > 0`)
  **AI 每日限额并发原子化（v1.0 review S3）**：`reserveDailyUsage` 用原子条件递增（`WHERE count < limit`，同 headless 配额）替代「读-判-写」，并发请求不再集体越过 `ai_daily_limit`；对话失败经 `releaseDailyUsage` 释放预留槽（仅 `count > 0` 时递减）
- **WS `ai:chat` throttle window naming (v1.0 review S4)**: `AI_CHAT_LIMIT_PER_MIN` → `AI_CHAT_LIMIT_PER_WINDOW` with a comment — the window is the 30s heartbeat sweep, so the effective rate is 30/30s (≈60/min), matching the constant
  **WS `ai:chat` 节流窗口命名（v1.0 review S4）**：`AI_CHAT_LIMIT_PER_MIN` → `AI_CHAT_LIMIT_PER_WINDOW` 并注明窗口=30s 心跳 sweep（实际 30 次/30s ≈ 60/min），常量名与行为一致

## [1.0.0] - 2026-08-22

> **KeelBase 1.0 Release Notes**
>
> **KeelBase 1.0：Business-safe AI Application Base**——AI 驱动的企业应用工程体系首个稳定版。
> 1.0 只证明「三件套」：**AI CRM（Golden Application）** 一次跑通闭环（Customer → 风险分析 → 建跟进 → 确认 → 写 → 审计 → 撤销）+ **Application Protocol** 生成器（协议化配置 → 生成带权限/AI 工具/确认/审计的模块）+ **Runtime 治理**（CASL / 写操作确认 / 审计哈希链 / 副作用撤销 / Explainable Authz）。FLOW / 插件 / MCP / Headless / 模板市场等能力已实现，**1.0 后按需激活**。
>
> 关键交付（v0.9.2 后 94+ 提交）：
> - **Build → Run → Trust → Private Deploy 全链路可验证**：`release-gate.sh` 确定性 10/10 + Gate 1-4（Golden Application 双视角 9/9+8/8 / Adversarial 证据链：越权矩阵 39 + 攻击集 12/12 + 合成陌生人实测 / Release Gate 进 CI）
> - 三旗舰 AI 应用、私有 AI 全链路、插件生态 CLI、通用 OIDC SSO、管理台 Element Plus、审计哈希链、Agent 安全评测、Explainable Authz、AIization（OpenAPI/Schema 导入）、生成器 DX 等
>
> 完整变更见下。README 双叙事：AI 能力 + 数据主权（Private AI 独立叙事）。

Flagship AI applications, Private AI Golden Path, plugin ecosystem CLI, generic OIDC SSO, Web-Admin Element Plus migration. / 三旗舰 AI 应用、私有 AI 全链路验证、插件生态 CLI、通用 OIDC SSO、管理台 Element Plus 迁移。

### Added / 新增

- **AI CRM flagship (backend + Flutter/Web UI)**: Customer/Order/Activity/Task/Risk entities, CRUD/CASL, 5 AI tools (query_customers / query_customer_orders / query_customer_activities / analyze_customer_risk read + create_followup_task write-with-confirmation, revocable `crm_task` side effect), risk scoring (overdue / amount / open-risk tiers), real seed (8 customers / overdue orders / risks), feature flag `crm`
  **AI CRM 旗舰（后端 + Flutter/Web UI）**：客户/订单/跟进/任务/风险实体，CRUD/CASL，5 个 AI 工具（4 读 + 写需确认可撤销 `create_followup_task`，副作用 `crm_task`）、风险打分（逾期/金额/未解决风险分级）、真实 Seed（8 客户/逾期订单/风险）、feature flag `crm`
- **AI Project Management flagship (backend + Flutter/Web UI)**: Project/Member/Milestone/Task/Risk entities, CRUD/CASL, 4 AI tools (query_projects / query_project_tasks / analyze_project_risk read + create_project_task write-with-confirmation, revocable `pm_task` side effect), delay-risk scoring, real seed (4 projects / milestones / delayed tasks), feature flag `pm`
  **AI Project 旗舰（后端 + Flutter/Web UI）**：项目/成员/里程碑/任务/风险实体，CRUD/CASL，4 个 AI 工具（3 读 + 写需确认可撤销 `create_project_task`，副作用 `pm_task`）、延期风险打分、真实 Seed（4 项目/里程碑/延期任务）、feature flag `pm`
- **AI Approval flagship (backend + Flutter/Web UI)**: ApprovalRequest/ApprovalPolicy entities, CRUD/CASL, AI pre-review with policy-tiered rules (low-risk amount ≤ threshold auto-approve / over-threshold → human review) + manual decide, 4 AI tools, real seed (3 policies / 3 requests), feature flag `approval`
  **AI Approval 旗舰（后端 + Flutter/Web UI）**：审批请求/政策实体，CRUD/CASL，AI 预审按政策分级（金额≤阈值低风险自动通过 / 超阈值转人工复核）+ 人工 decide，4 个 AI 工具，真实 Seed（3 政策/3 请求），feature flag `approval`
- **Private AI Golden Path (W1 / POV-1)**: `scripts/verify-private-ai.sh` proves the "data never leaves the perimeter" chain end-to-end — Cloud OFF → local Ollama chat (provider=ollama) → local bge-m3 embedding → CRM read → AI audit `provider=ollama` → audit hash chain `valid`; evidence pack `private-ai-report.md` + `docs/benchmark/private-ai.json`; Release Gate Private dimension ✅
  **私有 AI 全链路验证（W1 / POV-1）**：`scripts/verify-private-ai.sh` 端到端证明「数据不出域」闭环——Cloud OFF → 本地 Ollama 对话（provider=ollama）→ 本地 bge-m3 embedding → CRM 读 → AI 审计 provider=ollama → 审计哈希链 valid；证据包 `private-ai-report.md` + `docs/benchmark/private-ai.json`；Release Gate Private 维度 ✅
- **Plugin ecosystem CLI (P1-7)**: `keelbase-plugin` add / remove / list / verify — host-independent manifest validation (name kebab-case / version semver / description / requires / featureFlag / capabilities), self-containment check (host-relative imports → portability warning), real third-party install cycle (approval-intake example)
  **插件生态 CLI（P1-7）**：`keelbase-plugin` add/remove/list/verify——宿主外 manifest 校验（结构/一致性/featureFlag 对照）、自包含检测（宿主相对导入→可移植性警告）、真实第三方安装闭环（approval-intake 示例）
- **Generic OIDC SSO backend (P2-4)**: dynamic `.well-known` discovery → token exchange → id_token signature verification (issuer/audience/JWKS, anti-confusion) → userinfo fallback to claims; enterprise provider group appears when `OIDC_ISSUER` / `OIDC_CLIENT_ID` / `OIDC_CLIENT_SECRET` are configured
  **通用 OIDC SSO 后端（P2-4）**：动态发现 `.well-known` → token 交换 → id_token 签名验证（issuer/audience/JWKS，防混淆）→ userinfo 降级 id_token 声明；配齐 `OIDC_ISSUER`/`OIDC_CLIENT_ID`/`OIDC_CLIENT_SECRET` 后 `/auth/oauth/providers` 出现 oidc（enterprise 组）
- **Web-Admin-Vue migrated to Element Plus**: Vuetify fully removed (zero `v-*` tags) — 12 shared components + 37 pages + layout migrated (el-table / el-form / el-menu / el-tag / el-dialog …), Vuetify tokens → EP CSS variables (incl. dark), on-demand tree-shaken import
  **管理台迁移到 Element Plus**：Vuetify 完全移除（零 `v-*` 残留）——12 个共享组件 + 37 个页面 + 布局迁移（el-table/el-form/el-menu/el-tag/el-dialog…），Vuetify token → EP CSS 变量（含 dark），按需 tree-shake 引入
- **Agent Decision Trace (P0-14)**: `GET /ai/conversations/:id/trace` aggregates messages / audit / tool-effects into a timeline (tool calls / confirmation decisions / side effects / results); Web workbench AiTraceView + Flutter AiTracePage; live tool cards show read/write badges + "needs confirmation" / "confirmed · revocable"
  **AI 决策执行轨迹（P0-14）**：`GET /ai/conversations/:id/trace` 聚合消息/审计/副作用为时间线（工具调用/确认决策/副作用/结果）；Web 工作台 AiTraceView + Flutter AiTracePage；实时工具卡显示「读/写」徽标 + 「需确认」/「已确认 · 可撤销」
- **Self-service AI side-effect revocation (P0-15)**: users revoke their own AI-created records (`DELETE /ai/my/tool-effects/:id`, ownership-checked, soft-delete → restorable from recycle bin); trace effect steps carry `effectId`
  **用户侧 AI 副作用撤销（P0-15）**：本人可撤销 AI 创建的记录（`DELETE /ai/my/tool-effects/:id`，所有权校验，软删可经回收站恢复）；轨迹 effect 步骤带 `effectId`
- **Existing-system AIization (P0-12)**: `keelbase init --import-openapi` (OpenAPI 3 / Swagger 2) + `--import-schema` (SQL CREATE TABLE — CHECK IN → enum, long VARCHAR → text) turn a legacy schema into a Protocol → generated module; `--out` writes only the Protocol JSON for later `--spec` reuse
  **已有系统 AI 化（P0-12）**：`keelbase init --import-openapi`（OpenAPI 3/Swagger 2）+ `--import-schema`（SQL 建表——CHECK IN→enum、长 VARCHAR→text）把老 schema 转成 Protocol → 生成模块；`--out` 只写协议 JSON 供 `--spec` 复用
- **AI-consumable module metadata (P1-3)**: `/app/capabilities` businessModules expose a `description` so AI agents know what each module does at a glance
  **AI 可消费模块元数据（P1-3）**：`/app/capabilities` businessModules 透出 `description`，AI 读模块地图即知每个模块做什么
- **Flagship demo templates (P1-9)**: template market gains `crm-demo` / `pm-demo` / `approval-demo` — one-click import of flagship scenario seeds (at-risk customers / delayed projects / approval policies)
  **旗舰演示模板（P1-9）**：模板市场新增 `crm-demo`/`pm-demo`/`approval-demo`——一键导入旗舰场景种子（流失风险客户/延期项目/审批政策）
- **Protocol reverse-engineering + business protocol specs**: generator supports `enum` fields (@IsIn / defaults + Flutter dropdown + admin/taro type mapping); `specs/` common business protocols (events / todos / books / notes) usable with `keelbase init --spec`
  **协议反推 + 业务协议示例**：生成器支持 enum 字段（`@IsIn`/默认值 + Flutter 下拉 + admin/taro 类型映射）；`specs/` 常用业务协议（events/todos/books/notes）可直接 `--spec` 生成
- **Generated modules ship AI tools + tests (30-min acceptance)**: `keelbase init` auto-attaches `query_<module>` (read) + `create_<module>` (write, requires confirmation + verified email) and registers them in ai.module; generated controller + AI-tool specs; 30-min acceptance script (`docs/manual/30min-acceptance.md`)
  **生成模块自带 AI 工具 + 测试（30min 验收）**：`keelbase init` 自动附带 `query_<module>`（读）+ `create_<module>`（写，需确认 + 已验证邮箱）并注册 ai.module；生成 controller/AI 工具单测；30min 验收脚本（`docs/manual/30min-acceptance.md`）
- **Flagship strict verification (Phase 2-1)**: `scripts/verify-flagships.sh` runs 4 e2e suites (crm / pm / approval / generated-modules — CRUD/CASL/confirmation/audit) with explicit security acceptance points; Release Gate Run dimension gains real LLM evidence (3/3 SUCCESS, DeepSeek)
  **三旗舰严格验证（Phase 2-1）**：`scripts/verify-flagships.sh` 跑 4 个 e2e suite（crm/pm/approval/generated-modules——CRUD/CASL/确认/审计）+ 显式安全验收点；Release Gate Run 维度补真实 LLM 实测证据（3/3 SUCCESS，DeepSeek）
- **Signed-URL upload access control (CR-21)**: `/uploads` files served via HMAC-SHA256 signed URLs with expiry (progressive default; `UPLOAD_REQUIRE_SIGN=1` forces 403) + path-traversal guard; avatar/upload responses return signed URLs
  **上传签名访问（CR-21）**：`/uploads` 经 HMAC-SHA256 签名 URL（含过期时间）访问（渐进默认放行；`UPLOAD_REQUIRE_SIGN=1` 强制 403）+ 路径穿越防护；头像/上传响应返回签名 URL
- **Web root → workbench, Flutter web as `/mobile` preview**: single-container/nginx root redirects to the Web workbench; Flutter web moves to `/mobile` as the mobile-app preview (Web business UI host = workbench)
  **Web 根路径切工作台 + Flutter web 移 `/mobile` 预览**：单容器/nginx 根路径重定向到 Web 工作台；Flutter web 移到 `/mobile` 作移动 App 预览（Web 业务 UI 唯一宿主=工作台）
- **Explainable Authorization (W5-⑦)**: authorization denials now carry structured reasons (which policy / why blocked); `GET /auth/me/permissions` exposes the caller's capability list
  **授权依据可解释化（W5-⑦）**：授权拒绝返回结构化原因（哪条策略/为何阻止）；`GET /auth/me/permissions` 暴露调用方能力清单
- **Agent Security Eval attack set (W4)**: security eval cases 6→12 (injection-write / confirmation-bypass / revoke-bypass / cross-org read·approve / unauthorized-read), verified 12/12 blocked on DeepSeek; `scripts/verify-security-eval.sh` scripts the regression with a 90% pass gate
  **Agent 安全评测攻击集（W4）**：评测用例 6→12（注入写/确认绕过/撤销绕过/跨组织读·审批/越权读），DeepSeek 实测 12/12 全挡；`scripts/verify-security-eval.sh` 脚本化安全回归（90% 门槛）
- **Stranger-challenge harness (W3)**: self-contained challenge card (30min Build + 60min Business) + `run.sh` clean-clone script for reproducible external-developer evaluation
  **合成陌生人挑战包（W3）**：自包含挑战卡（30min Build + 60min Business）+ `run.sh` 干净 clone 脚本，供外部开发者可复现评估
- **Audit-chain key separation + rotation (W4-②)**: `AUDIT_HMAC_KEY` (independent 64-hex) + `AUDIT_HMAC_KEY_PREVIOUS`; verify accepts `[current, previous, legacy]` candidate keys so old records stay verifiable after rotation
  **审计链密钥分离 + 轮换（W4-②）**：独立 `AUDIT_HMAC_KEY`（64 hex）+ `AUDIT_HMAC_KEY_PREVIOUS`；verify 用候选集 `[current, previous, legacy]` 任一匹配——轮换后旧记录仍可验证
- **AIization hardening (ai-bridge §3)**: `--import-openapi`/`--import-schema` extract `required`/label + skipped diagnostics; Protocol `required` propagates to DTO `@IsNotEmpty` and non-null model fields
  **已有系统 AI 化加固（ai-bridge §3）**：`--import-openapi`/`--import-schema` 提取 `required`/标签 + 跳过诊断；Protocol `required` 透传到 DTO `@IsNotEmpty` 与非空模型字段
- **Generator DX**: `--fields` supports inline enum options (`status:enum:active,paid`); create AI-tool files named with the plural module (consistent `jest <plural>` matching — 30-min acceptance "20 passed" now true); CLI tests 32→36
  **生成器 DX**：`--fields` 支持内联 enum 选项（`status:enum:active,paid`）；create 工具文件统一复数命名（`jest <plural>` 匹配一致——30min 验收「20 passed」成立）；CLI 测试 32→36
- **Business-safe Agent Benchmark (W2)**: `agent-benchmark.mjs` — 15 cases (Normal/Unauthorized/Ambiguous/High-risk/Prompt Injection × CRM/PM/Approval) with Run/Trust/Safety scores; deterministic Trust via `agent-benchmark.sh` (e2e 403/confirmation/audit-chain)
  **Business-safe Agent Benchmark（W2）**：`agent-benchmark.mjs`——15 用例（五类任务 × 三旗舰）+ Run/Trust/Safety 评分；确定性 Trust 由 `agent-benchmark.sh`（e2e 越权/确认/审计链）补足
- **Release Gate unified entry (W3 / 08-21)**: `scripts/release-gate.sh` — one command proving Build / Gate 1 / Trust / Private / Adversarial (deterministic 10/10, CI-able; `LLM_ENV=1` adds Run/Adversarial), wired as a `release-gate` CI job; Release Precheck standard program (Alibaba `ocr` + Claude double code review → full tests → coverage) as the pre-publish gate
  **Release Gate 统一入口（W3 / 08-21）**：`scripts/release-gate.sh`——一命令证明 Build/Gate 1/Trust/Private/Adversarial（确定性 10/10，可 CI；`LLM_ENV=1` 加 Run/Adversarial），接线 `release-gate` CI job；发布前标准程序（阿里 ocr + Claude 双重 code review → 全量测试 → 覆盖率）作为发布前置
- **Gate 1 Golden Application = AI CRM one-pass closed loop**: `test/golden-application.e2e-spec.ts` — 7-step deterministic loop (Customer → Risk Analysis → Create Follow-up Task → confirmation gate, no-write-without-approval → write + revocable side-effect → audit hash-chain verify → revoke soft-delete → cross-user revoke 404) + `scripts/verify-golden-application.sh` (8-item single acceptance, 9/9); release-gate gains a Gate 1 block
  **Gate 1 Golden Application = AI CRM 一次跑通闭环**：`test/golden-application.e2e-spec.ts`——7 步确定性闭环（客户 → 风险分析 → 建跟进 → 确认门控，不确认不写 → 写入 + 可撤销副作用 → 审计哈希链 verify → 撤销软删 → 越权撤销 404）+ `scripts/verify-golden-application.sh`（8 项单一验收，9/9）；release-gate 加 Gate 1 段
- **Gate 4 1.0 Candidate freeze list + policy**: `docs/manual/release-1.0-candidate.md` — scope slimming (1.0 proves only AI CRM + Protocol generator + Runtime governance; FLOW / plugin / MCP / Headless / template market marked "available, activate on demand after 1.0"), core-architecture freeze, Exit Criteria tracker (10 items); operations.md §3.1 v1.0 compatibility / upgrade policy (dual-driver migrations, v0.9.x→v1.0 path, honest technical-vs-market declaration)
  **Gate 4 1.0 Candidate 冻结清单 + 政策**：`docs/manual/release-1.0-candidate.md`——1.0 边界瘦身（只证明 AI CRM + Protocol 生成器 + Runtime 治理三件套；FLOW/插件/MCP/Headless/模板市场标「具备，1.0 后按需激活」）、核心架构冻结、Exit Criteria 状态表（10 项）；operations.md §3.1 v1.0 兼容与升级政策（双驱动迁移、v0.9.x→v1.0 升级路径、技术/市场诚实声明）
- **Private AI promoted to co-equal narrative (§7.4 #4)**: enterprise-capabilities.md "Dual narrative" — AI capability (Business-safe Agent acting within rules) and data sovereignty (data-never-leaves-perimeter Private AI) as parallel external narratives, with Private AI evidence strengthened (private-ai-report 8/8 + verify-private-ai.sh)
  **Private AI 升为独立叙事（§7.4 #4）**：enterprise-capabilities.md 加「双叙事」——AI 能力（Business-safe Agent 在规则内干活）与数据主权（数据不出域 Private AI）并列为对外叙事，并强化 §10 私有 AI 证据（private-ai-report 8/8 + verify-private-ai.sh）

### Fixed / 修复

- **Private AI chain repairs (W1)**: Joi schema accepts `AI_PROVIDER=ollama`; BullMQ workers register only when `QUEUE_ENABLED` (test env never connects Redis); ollama default model follows `OLLAMA_MODEL`
  **私有 AI 断链修复（W1）**：Joi 放行 `AI_PROVIDER=ollama`；BullMQ worker 条件注册（测试环境不连 Redis）；ollama 默认模型用 `OLLAMA_MODEL`
- **CI repair (6 failure domains)**: migration-consistency job (no-change exits 1 under `bash -e` → `|| true`), 2 flaky e2e timeouts, coverage gates (Flutter 46.1% / web-admin ≥30%), e2e queue stubbing (never connects Redis), email-verified cache clear
  **CI 修复（6 个失败域）**：migration-consistency job（`bash -e` 下无变化退出码 1 → `|| true`）、2 个抖动 e2e 超时、覆盖率门禁（Flutter 46.1% / web-admin ≥30%）、e2e 队列 stub（永不连 Redis）、email-verified 缓存清除
- **Queue disabled in test env**: BullMQ no longer hangs e2e when Redis is absent (conditional registration + stub overrides); `.env.test` auto-generated when missing
  **测试环境禁用队列**：无 Redis 时 BullMQ 不再挂起 e2e（条件注册 + stub override）；缺 `.env.test` 时自动生成
- **Redis exposed to host loopback**: compose `redis` now maps `127.0.0.1:6379:6379` (loopback-only) so local dev/e2e can reach it without binding 0.0.0.0
  **Redis 暴露到宿主机回环**：compose `redis` 加 `127.0.0.1:6379:6379` loopback-only 映射（本机可用、不绑 0.0.0.0 避免生产外网暴露）
- **Generated-module CASL wiring (30-min acceptance hardening)**: `keelbase init` modules now auto-wire `can('manage','<Module>',{userId})` — owner update/delete previously returned 403
  **生成模块 CASL 接线修复（30min 验收加固）**：`keelbase init` 生成模块自动接线 `can('manage','<Module>',{userId})`——此前本人更新/删除全 403
- **TypeORM logging type**: `app.module` logging `string[]` → `LogLevel[]` (build blocker from read/write-split)
  **TypeORM logging 类型**：`app.module` logging `string[]`→`LogLevel[]`（读写分离遗留的 build 阻塞）
- **W4 production bug fixes (security/robustness batch)**: MFA TOTP failures now accumulate lockout attempts (prevent per-IP brute force of the 6-digit code); WebP magic bytes require the `WEBP` marker at offset 8 (WAV/AVI can no longer masquerade); webhook delivery blocks private/loopback/link-local targets (SSRF guard); headless quota uses atomic UPDATE (concurrent requests can no longer exceed `quotaPerDay`); `PUT /users/:id` phone change syncs `phoneHash` + uniqueness; search returns safe-empty on missing `q`; op-audit / form-builder pagination clamped 1-100; flow instance marked `failed` when an AI node throws; single `ai:done` on WS stream close; admin analytics uses per-dialect date expression (Postgres no longer empty)
  **W4 生产 bug 修复（安全/健壮性批次）**：MFA TOTP 失败累计锁定（防换 IP 爆破 6 位码）；WebP 魔数补 offset8 "WEBP"（WAV/AVI 无法再伪装）；webhook 投递阻止私网/回环/链接本地（SSRF 防护）；headless 配额改原子 UPDATE（并发无法超 quotaPerDay）；`PUT /users/:id` 改手机号同步 phoneHash + 唯一性；search 缺 q 安全返回空；op-audit/form-builder 分页钳制 1-100；AI 节点抛错时流程实例置 failed；WS 流关闭单一 ai:done；admin 分析按库用日期表达式（Postgres 不再空）
- **DST-safe calendar-day iteration (events)**: Flutter events list page & provider use `DateTime(y,m,d+1)` instead of `+24h` — no infinite loop / repeated day on DST fall-back weeks
  **事件日历加法（DST 安全）**：Flutter 事件列表页与 provider 用 `DateTime(y,m,d+1)` 替代 `+24h`——DST 回拨周不再死循环/重复日期
- **Check-in streak no longer truncated**: `_checkinState` reads `checkin_date` keys without a 40-day window (>40-day streaks now counted)
  **连签不再截断**：`_checkinState` 按 `checkin_date` 键取全部签到（无 40 天窗口），>40 天连签正常统计
- **Events reminders removed on update**: clearing/cancelling a reminder or moving an event to the past removes the stale delayed job; range queries use interval-overlap (`startTime<=end AND endTime>=start`) so month view shows spanning events
  **事件提醒更新清理**：清空/取消提醒或事件改到过去时移除残留 delayed job；范围查询改区间重叠判断（跨月事件月视图完整）
- **Invite code not burned for existing members**: `redeemOrgInvite` returns false (no consume / no "new member" notification) when the user is already a member
  **邀请码重复兑换防护**：已是组织成员时 `redeemOrgInvite` 直接返回（不消耗邀请码、不发「新成员加入」通知）
- **Maintenance-mode string trap + marketing audience strictness**: `isMaintenanceMode` accepts string `'true'`; marketing `send` throws on unknown audience instead of silently emailing everyone
  **维护模式字符串陷阱 + marketing audience 严格化**：`isMaintenanceMode` 兼容字符串 'true'；marketing send 对未知 audience 抛错而非静默群发全员
- **Audit hash-chain concurrent fork fixed (W3 2nd stranger challenge)**: `AuditService` / `OperationAuditService` serialize chain writes (read last `prev_hash` → compute → insert atomically) — two writes in the same second no longer fork the chain (`brokenIndex` in `/audit/verify` fixed); concurrent unit tests assert `prev_hash` continuity
  **审计哈希链并发写分叉修复（W3 二次合成陌生人）**：`AuditService`/`OperationAuditService` 串行化链写（读 lastHash → 计算 → 插入原子化）——同一秒两次并发写不再分叉（`/audit/verify` 的 `brokenIndex` 修复）；并发单测验证 `prev_hash` 连续
- **W4 Fix hardening batches (5th–10th) + cross-module consistency**: flow instances marked `failed` when an AI node throws; single `ai:done` on WS stream close; form-builder pagination clamped; Flutter unread-count increment / search request-seq guard / route id redirect guard / avatar empty-name guard / table empty-state; AI tool contracts (create_contract `counterparty` required, create_followup_task customerId guard, query_contracts keyword); CASL manage rules for Book/Tag/Note/Post; proactive-ai date-range digest; metrics route labels on finish + close in-flight dec; AddSuppliers/AddContracts postgres dialect; approval pre-review scoped to policy owner; pm-demo status `planned`; broadcast default type `broadcast`; complete `FEATURE_*_ENABLED` schema
  **W4 Fix 加固批次（第 5-10 批）+ 跨模块一致性**：AI 节点抛错流程实例置 failed；WS 单一 ai:done；form-builder 分页钳制；Flutter 未读计数增量/search 请求序号/路由 id 守卫/头像空名守卫/表格空态；AI 工具契约（create_contract counterparty required、create_followup_task customerId 校验、query_contracts keyword）；CASL Book/Tag/Note/Post 规则；proactive-ai 区间查询；metrics route 标签/断连 in-flight；AddSuppliers/AddContracts postgres 方言；approval 预审按政策所有者；pm-demo 状态 planned；广播默认 broadcast；补全 FEATURE_*_ENABLED schema
- **W4-⑤ Agent Identity minimal slice**: `ai_audit_logs` gains `agent_id`/`session_id` columns + `AuditEntry` extension (answers "who asked whom to do what under which authorization"; excluded from hash-chain payload to preserve historical chain); bilingual migration `AddAiAuditIdentity` (pg ALTER / sqlite rebuild)
  **W4-⑤ Agent Identity 最小切片**：`ai_audit_logs` 补 `agent_id`/`session_id` 列 + `AuditEntry` 扩展（回答「谁让谁以什么授权做了什么」；不加入哈希链 payload 防破坏历史链）；双方言迁移 `AddAiAuditIdentity`
- **Pre-release double-review fixes (v1.0, 2026-08-22)**: AI audit hash chain stays valid after `POST /audit/feedback` — feedback/feedbackNote are treated as non-chain annotation columns (previously any thumbs-up/down broke `/audit/verify` from that row on, HS-11); webhook delivery validates every redirect hop (`redirect:'manual'`) so a public 302 can no longer bounce to private/cloud-metadata targets (SSRF hardening follow-on to W4-④); `PUT /users/:id` resets `emailVerified` when the email changes (prevents swapping to an unverified address while keeping "verified" — which would defeat the `requireVerifiedEmail` gate on AI write tools, HS-2)
  **发布前双重 review 修复（v1.0，2026-08-22）**：`POST /audit/feedback` 后 AI 审计哈希链仍 valid——feedback/feedbackNote 作为链外注解列（此前任意赞/踩会让 `/audit/verify` 从该行起断链，HS-11）；webhook 投递对每一跳重定向复用私网校验（`redirect:'manual'`，公网 302 不能再弹到内网/云元数据，W4-④ SSRF 加固后续）；`PUT /users/:id` 改 email 时重置 `emailVerified`（防换成未验证地址仍保有「已验证」，使 AI 写工具 `requireVerifiedEmail` 门失效，HS-2）
- **Security-matrix completions (v1.0)**: SSE/WS long-connection cross-user isolation asserted (A's notification stream cannot see B's + WS `emitToUser` mutually invisible), admin user-detail field-level sanitize asserted (bio / dateOfBirth / firstName / lastName / avatarUrl / provider not returned + email masked + password / refreshTokenHash / loginAttempts / lockedUntil hidden), cross-org AI tool isolation asserted (org approval task stats bidirectional) — security-matrix §3 known gaps all closed
  **安全矩阵补测（v1.0）**：SSE/WS 长连接跨用户隔离断言（A 的流收不到 B 的通知 + WS `emitToUser` 互不可见）、管理台用户详情字段级脱敏断言（bio/生日/名姓/头像/provider 不返回 + email 掩码 + password/refreshTokenHash/loginAttempts/lockedUntil 不返回）、跨组织 AI 工具隔离断言（组织审批统计双向隔离）——security-matrix §3 已知缺口全部闭环
- **books/notes backfilled to protocol specs (v1.0)**: books gains `status`/`rating`, notes gains `category` (entity / DTO / migration / Flutter model / admin model), consistency check extended to 4 verified modules + books/notes e2e coverage
  **books/notes 回填协议一致（v1.0）**：books 补 `status`/`rating`、notes 补 `category`（含 DTO/迁移/Flutter 模型/管理端模型），一致性检查从 contracts/suppliers 扩至 4 个已验证模块 + books/notes e2e
- **CI workflow parse restored (v1.0, 752066d)**: `run-adversarial` job referenced `secrets.DEEPSEEK_API_KEY` directly in step `if:` conditions — GitHub Actions forbids secrets in `if`, which failed to load the whole workflow (every CI run after merge 777a436 died in 0s with "workflow file issue", invalidating the earlier CI PASS record). Fixed by passing the secret through job-level `env` and gating steps on `env.DEEPSEEK_API_KEY`; CI back to green 14/14
  **CI workflow 解析恢复（v1.0，752066d）**：`run-adversarial` job 在步骤级 `if:` 直接引用 `secrets.DEEPSEEK_API_KEY`——GitHub Actions 禁止在 if 条件引用 secrets，导致整个 workflow 加载失败（merge 777a436 后每次 CI 都 0s 报 "workflow file issue"，此前 CI PASS 记录失效）。改为 job 级 env 透传 secret + 步骤 if 用 `env.DEEPSEEK_API_KEY` 判断；CI 恢复全绿 14/14

### Release Precheck / 发布前检查（2026-08-22）

```text
Release Precheck（2026-08-22）：
- 双重 code review：阿里 OCR（v1.9.8 delegate 规则）+ Claude 多维审查 → 修复 3 处（1 阻塞 B1 审计链 feedback 断链 + 2 建议 S1 webhook SSRF 重定向 / S2 emailVerified 重置）；S3/S4 记入 1.0 后加固
- 全量测试：后端单测 189 suite / 1591 全过（statements 91.1% / branches 77.1% / functions 84.9%，安全模块分档全 ≥85%）+ e2e 16 suite / 245 全过 + vitest 39.5%（≥32%）+ Flutter 62.3%（≥45%）+ CLI（init 44 / plugin 8）+ 端点-文档一致性 + verify-golden 9/9 + release-gate 确定性
- 覆盖率：较 v0.9.2 无降级、全部达标
```

## [0.9.2] - 2026-08-17

Preset guidance & capabilities-driven navigation, streaming resilience, WeChat mini-app, enterprise login security (MFA / forced password change), deployment scale-out. / 首启预设引导 + capabilities 三端导航联动、流式韧性与 SSE 重连、微信小程序、企业登录安全（TOTP / 强制改密）、部署扩展（读写分离 / K8s / 蓝绿）。

### Added / 新增

- **Audit hash chain (HS-11)**: `ai_audit_logs` & `operation_audit_logs` gain `prev_hash`/`hash` (HMAC chain, key domain-separated); tamper-evident and verifiable via `GET /audit/logs/verify` + `GET /audit/operations/logs/verify`
  **审计哈希链（HS-11）**：AI/操作审计表加 `prev_hash`/`hash`（HMAC 链，密钥域分离）；防篡改可验证，`GET /audit/logs/verify` + `/audit/operations/logs/verify`
- **MCP adapter (HS-10)**: export built-in AI tools as an MCP server (`POST /api/v1/mcp`, JSON-RPC) with the same governance (permission + confirmation + audit); entry gateway (`/admin/mcp/*`) registers external MCP servers via Settings and calls their tools through the same governance layer (tool key `mcp_<server>_<tool>`, non-read-only defaults to confirmation); agent chat integration (`ExternalToolProvider`) merges external tools into the LLM tool flow
  **MCP 适配（HS-10）**：内置 AI 工具出口为 MCP server（`POST /api/v1/mcp`，JSON-RPC）且过同一治理层（权限+确认+审计）；入口 gateway（`/admin/mcp/*`）经 Settings 注册外部 MCP server 并让其工具强制过治理层（工具键 `mcp_<server>_<tool>`，非只读默认需确认）；Agent 对话集成（`ExternalToolProvider`）把外部工具并入 LLM 工具流
- **Per-module coverage gate (T.5)**: `scripts/check-security-coverage.mjs` enforces statements ≥60% for critical modules (auth / casl / audit / ai-tools / governance / headless) after `test:cov`
  **关键模块覆盖率分档门控（T.5）**：`scripts/check-security-coverage.mjs` 在 `test:cov` 后按模块门控 statements ≥60%（auth/casl/audit/ai-tools/governance/headless）
- **Webhook subscriptions (PL-14)**: users register callback URLs for platform events (`feedback.created`, `todo.created`); delivery is HMAC-SHA256 signed, 5s-timeout non-blocking; self-service endpoints (subscribe / list / enable / delete / test delivery)
  **Webhook 订阅投递（PL-14）**：用户为平台事件（`feedback.created`、`todo.created`）注册回调 URL；投递 HMAC-SHA256 签名、5s 超时不阻断；自助端点（订阅/列表/启停/删除/测试投递）
- **Admin governance policy editor (HS-9)**: Web-Admin-Vue「AI Tools」page gains a governance editor — per-tool enabled / confirmation / allowed-roles toggles + audit granularity (all / write / off), saved to `ai_governance_policy` and effective immediately (no redeploy)
  **管理台治理策略编辑器（HS-9）**：Web-Admin-Vue「工具与副作用」页新增治理策略编辑——每工具启用/需确认/允许角色开关 + 审计粒度（全部/仅写/关闭），保存即写入 `ai_governance_policy` 实时生效
- **MCP integration admin page (HS-10)**: register / remove MCP servers, discover external tools (30s cache, force refresh), and call tools with a JSON argument template pre-filled from `inputSchema` — all through the governance layer (permission + confirmation + audit)
  **MCP 集成管理页（HS-10）**：注册/移除 MCP Server、发现外部工具（30s 缓存 + 强制刷新）、调用工具（按 `inputSchema` 预填 JSON 参数模板），全部过治理层
- **Flutter AI i18n hardening (T.8)**: AI chat error messages no longer hardcoded Chinese — injected i18n callbacks into the provider; stable keys on suggested-question chips; `UserModel.copyWith` can clear nullable fields; `ToolStepModel` extracted to a domain model
  **Flutter AI i18n 加固（T.8）**：AI 对话错误文案不再硬编码中文——向 provider 注入 i18n 回调；建议问题 chips 补稳定 key；`UserModel.copyWith` 支持清空可空字段；`ToolStepModel` 抽取到领域模型
- **Preset guidance & capabilities navigation (EASY-5 / MOD-4)**: Flutter shows a one-time first-login dialog for the active preset (full / small / lite) and hides the search entry when the `search` feature is disabled; Web-Admin-Vue filters console routes & nav by `businessModules` (route `meta.module` + guard interception + nav filtering)
  **首启预设引导 + capabilities 导航联动（EASY-5 / MOD-4）**：Flutter 首次登录弹一次性预设说明（full/small/lite），`search` 禁用时隐藏搜索入口；Web-Admin-Vue 按 `businessModules` 过滤控制台路由与导航（`meta.module` + 守卫拦截 + 导航过滤）
- **WeChat mini-app login + subscribe messages (MINI-3 / MINI-2)**: `/auth/oauth` supports `providerType: miniapp` (code2Session → openid), one-tap WeChat login in Taro + subscribe-message reminder authorization (`WxSubscribeService`, template messages on event reminders)
  **微信小程序登录 + 订阅消息（MINI-3 / MINI-2）**：`/auth/oauth` 支持 `providerType: miniapp`（code2Session→openid）；Taro 微信一键登录 + 订阅消息授权（`WxSubscribeService` 事件提醒模板消息）
- **Enterprise login security (WEB-FRONT-4)**: TOTP two-factor auth (RFC 6238, zero-dependency `MfaService` — setup / verify / disable endpoints + login integration with unified `MFA_REQUIRED` anti-enumeration) and forced password change (`/auth/change-password` + admin `must-change-password` marker)
  **企业登录安全（WEB-FRONT-4）**：TOTP 双因素（RFC 6238 零依赖 `MfaService`——setup/verify/disable 端点 + 登录集成，统一 `MFA_REQUIRED` 防枚举）+ 强制改密（`/auth/change-password` + admin 强制标记）
- **DB read/write splitting + K8s + blue-green/canary (3.3 / D.2 / D.3)**: TypeORM replication (`DB_READ_REPLICAS`), `infra/k8s/` manifests (rolling update / HPA / Ingress), and compose blue-green script + canary ingress with weight switching
  **读写分离 + K8s + 蓝绿/金丝雀（3.3 / D.2 / D.3）**：TypeORM 主从复制（`DB_READ_REPLICAS`）、`infra/k8s/` 清单（滚动更新/HPA/Ingress）、compose 蓝绿脚本 + 金丝雀 Ingress 权重切换
- **Webhook reliability (PL-14)**: exponential-backoff retry on delivery failure (default 3 attempts, injectable) + `event.created` trigger (3 real events now: feedback / todo / event)
  **Webhook 可靠性（PL-14）**：投递失败指数退避重试（默认 3 次，可注入）+ `event.created` 触发点（现覆盖 feedback/todo/event 三个真实事件）
- **Todos bulk import (POV-2)**: `POST /admin/import/todos` + admin page card with CSV template download (BOM + formula-injection guard)
  **待办批量导入（POV-2）**：`POST /admin/import/todos` + 管理台待办导入卡 + CSV 模板下载（BOM + 公式注入防护）
- **Online demo site (PM-1)**: `deploy/demo.sh` one-command read-only demo (Taro H5 + seeded backend + static hosting) + README Live Demo block
  **在线演示站（PM-1）**：`deploy/demo.sh` 一键起只读体验站（Taro H5 + 种子数据后端 + 静态托管）+ README Live Demo 区块
- **Org-dimension AI audit (ORG-5 v3)**: `GET /audit/logs?orgId=X` filters AI audit by organization (org_members subquery) for admin per-org oversight
  **AI 审计组织维度（ORG-5 v3）**：`GET /audit/logs?orgId=X` 按组织过滤 AI 审计（org_members 子查询），管理台按组织看 AI 行为

### Fixed / 修复

- **Streaming provider fallback (CR-28)**: `chatStreamImpl` now falls back to the next provider when the primary errors before emitting any content (previously a broken primary failed the whole stream); `tryFallback` keeps the actually-successful provider
  **流式 provider fallback（CR-28）**：`chatStreamImpl` 在主 provider 未产出内容即失败时自动切换下一个 provider（此前主 provider 故障整个流失败）；`tryFallback` 用实际成功的 provider
- **SSE reconnect + 401 refresh (CR-17)**: `SseClient.postStream` gains exponential-backoff reconnect (opt-in, max attempts) and refresh-then-retry on 401 via `ApiClient.refreshNow()` (single-flight); notifications SSE fallback enables reconnect
  **SSE 断流重连 + 401 刷新（CR-17）**：`SseClient.postStream` 加指数退避重连（可选、限次）+ 401 经 `ApiClient.refreshNow()`（single-flight）刷新后重试；通知 SSE 兜底开启重连
- **Eval isolation (CR-18)**: eval runs use a per-run identity `eval:<ts>` instead of the shared system account `'0'` — no longer polluting quota / memory / audit
  **评测隔离（CR-18）**：评测跑批用每次独立身份 `eval:<ts>` 替代共享系统账号 `'0'`——不再污染配额/记忆/审计
- **Provider race cleanup (CR-26)**: Flutter `AiChatProvider` dispose-guard (`_safeNotify`), day/week calendar scroll hijack fixed (once per date); Taro search request-seq guard + notification-store try/catch
  **Provider 竞态清理（CR-26）**：Flutter `AiChatProvider` dispose 守卫（`_safeNotify`）、日历日/周视图抢滚动修复（每日期一次）；Taro 搜索请求序号守卫 + 通知 store try/catch
- **Streaming tool-round apology (CR-29)** + **PII log removal / non-streaming fallback (CR-28/CR-30)**
  **流式超轮次道歉（CR-29）** + **PII 日志移除 / 非流式 fallback（CR-28/CR-30）**

- Migration schema consistency: named/placeholder constraint names (post_likes, user_follows, ai_daily_usage, …) caused CI `migration:generate` drift; `AddSchemaConsistencyConstraints` reconciles the chain (fresh-DB generate → "No changes")
  **迁移一致性**：可读/占位约束名（post_likes、user_follows、ai_daily_usage 等）导致 CI 迁移一致性校验漂移；`AddSchemaConsistencyConstraints` 修正迁移收敛（全新库 generate → No changes）
- MCP admin DTO validation: `RegisterServerDto` / `CallExternalToolDto` lacked class-validator decorators, so the global `whitelist + forbidNonWhitelisted` pipe stripped them and `POST /admin/mcp/servers` / `POST /admin/mcp/call` returned 400 (service unit tests bypass the HTTP pipe, so this was a blind spot); added decorators + DTO spec
  **MCP 管理 DTO 校验**：`RegisterServerDto`/`CallExternalToolDto` 缺 class-validator 装饰器，被全局 `whitelist + forbidNonWhitelisted` 管道整条剥掉致 register/call 400（service 单测直调绕过 HTTP 层所以是盲区）；补装饰器 + DTO 单测

## [0.9.1] - 2026-08-15

Quality & governance release: full-codebase review with two independent audit tools, 281 findings fixed, all tests green. / 质量与治理版：两套独立审计全仓审查，281 条发现全部修复，测试全绿。

### Added / 新增

- **AI governance as policy (HS-9)**: tool switches / confirmation rules / role allow-list / audit granularity as runtime policy via `ai_governance_policy` setting, wired into gating, confirmation, inventory and audit
  **AI 治理策略化（HS-9）**：工具开关 / 确认规则 / 角色白名单 / 审计粒度由 `ai_governance_policy` 动态配置，接入门控、确认、清单与审计
- **Points / check-in / achievements (GROWTH-3)**: daily check-in with streak bonus, masked leaderboard, rule-driven achievements (backend + Flutter page)
  **积分 / 签到 / 成就（GROWTH-3）**：每日签到 + 连签加成，脱敏排行榜 + 规则成就（后端 + Flutter 页面）
- **Health dependency details (D.9)**: `GET /health?detail=true` reports db/redis/queue/storage status, rate-limited 60/min
  **健康检查依赖详情（D.9）**：`/health?detail=true` 返回依赖状态，限流 60/min
- **Org-level todos isolation (ORG-3 v2)**: member-visible org todos, consistent list/detail/update/delete permissions
  **待办组织级隔离（ORG-3 v2）**：组织成员可见同组待办，列表/详情/更新/删除权限一致
- **Web-Admin-React preview (MUI)**: React 19 + MUI preview console aligned page-by-page with the Vue admin (Vue remains primary)
  **Web-Admin-React 预览版（MUI）**：React 19 + MUI 预览控制台逐页对齐 Vue 管理台（Vue 保持主版本）

### Fixed / 修复

- Check-in race: `(user_id, checkin_date)` unique constraint prevents double points on concurrent check-ins
  **签到竞态**：`(user_id, checkin_date)` 唯一约束防止并发签到双倍积分
- AI daily quota decoupled from audit granularity (independent `ai_daily_usage` counter) — `off`/`write` audit no longer disables the quota
  **AI 每日限额与审计粒度解耦**（独立 `ai_daily_usage` 计数）——审计粒度 `off`/`write` 不再关闭限额
- 401 refresh hardened: single-flight, transport errors no longer log users out, retry propagates real error; SSE line buffering + leak-free cleanup
  **401 刷新加固**：single-flight、瞬断网络不再误登出、重试传播真实错误；SSE 行缓冲 + 连接无泄漏
- Provider race cleanup: in-flight guards / generation tokens / dispose guards across ai/events/books/announcements/push
  **Provider 竞态清理**：AI/事件/图书/公告/推送均加在途守卫 / 代际 token / dispose 守卫
- Admin console: React 401→login wiring, snackbar infinite-refetch loop, org first-load timing; localized audit detail fields
  **管理台**：React 401 跳登录接线、snackbar 无限重取循环、首组织加载时序；审计详情双语化
- i18n: 20+ hardcoded strings migrated; plural forms and zh_TW/zh_HK variants corrected
  **i18n**：20+ 硬编码文案接入 AppLocalizations；复数与 zh_TW/zh_HK 变体修正

### Quality / 质量

- Coverage gates raised (NestJS ≥65/55/60/65; Flutter CI ≥45% lines); 838 backend + 273 Flutter tests green; new SSE loopback, rate-limit and refresh boundary tests
  覆盖率门槛提升（NestJS ≥65/55/60/65；Flutter CI ≥45% 行）；838 后端 + 273 Flutter 用例全绿；新增 SSE 真连、限流、刷新边界测试

## [0.9.0] - 2026-08-13

First public release (milestone). / 首个公开版本（里程碑发布）。

### Milestones / 里程碑

- **Business-safe AI Agent harness**: AI tool calls scoped to the user's data, human confirmation for writes, reversible side effects, eval loop, CASL row-level permissions wired into AI tools
  **业务安全的 AI Agent harness**：AI 工具调用限定用户数据范围、写操作人工确认、副作用可撤销、评测闭环、CASL 行级权限与 AI 工具打通
- **Consistent across three ends**: Flutter App (iOS/Android/Web) + Taro mini-program/H5 + PC Web admin console (Vue3 + Vuetify3) — one backend, three ends
  **三端一致**：Flutter App（iOS/Android/Web）+ Taro 小程序/H5 + PC Web 管理台（Vue3 + Vuetify3），一套后端三端出
- **Production-grade engineering**: CASL permissions, full audit trails, static encryption of sensitive data, OTel/Prometheus/Loki observability, green CI, one-click deploy & single-container delivery
  **生产级工程化**：CASL 权限、全链路审计、敏感数据静态加密、OTel/Prometheus/Loki 可观测、CI 全绿、一键部署与单容器交付

### Added / 新增

**AI & Agent / AI 与 Agent**

- AI chat (non-streaming + SSE streaming), tool-call process visualization (tool_start/tool_end)
  AI 对话（非流式 + SSE 流式），工具调用过程可视化（tool_start/tool_end）
- Actionable tools + human-confirmation protocol (create_event/create_todo), side-effect preview + one-click revoke + confirmation decisions logged to audit
  可操作工具 + 人工确认协议（create_event/create_todo），副作用预览 + 一键撤销 + 确认决策落审计
- Long-term user memory, context compaction, sub-agent delegation + skills (SkillsRegistry)
  长程用户记忆、上下文压缩、子代理委托 + 技能（SkillsRegistry）
- RAG knowledge base: document upload/chunking/vector search (pgvector), retrieval debugging & chunk preview
  RAG 知识库：文档上传/切块/向量检索（pgvector），检索调试与切块预览
- web_search browsing, multimodal image understanding, image generation
  web_search 联网、多模态图片理解、图像生成
- Proactive AI services (daily digest), conversation-feedback loop, AI eval set, cost dashboard, headless API, admin AI assistant
  主动 AI 服务（每日摘要）、对话反馈闭环、AI 评测集、成本看板、headless API、管理端 AI 助手
- AI behavior replay: admin-console timeline view (tool calls / confirmation decisions / side effects / errors)
  AI 行为回放：管理台时间线视图（工具调用 / 确认决策 / 副作用 / 错误）

**Three Ends / 三端**

- Flutter main app: event calendar, todos, notification center, global search, upload, profile, Onboarding, offline cache, data visualization, first-run experience pack
  Flutter 主 App：事件日历、待办、通知中心、全局搜索、上传、个人中心、Onboarding、离线缓存、数据可视化、首次体验三件套
- Taro mini-program/H5: AI chat, todos, search, notification center, session management
  Taro 小程序/H5：AI 对话、待办、搜索、通知中心、会话管理
- PC Web admin console: users/events/knowledge/notifications/both audits/sessions/monitoring/trash/import/template market/AI eval/tool effects/platform stats
  PC Web 管理台：用户/事件/知识库/通知/两类审计/会话/监控/回收站/导入/模板市场/AI 评测/工具副作用/平台统计

**Security & Compliance / 安全与合规**

- CASL row-level permissions, JWT rotation + login lockout, email/phone verification, AES-256-GCM static encryption of sensitive fields
  CASL 行级权限、JWT 轮换 + 登录锁定、邮箱/手机号验证、敏感字段 AES-256-GCM 静态加密
- Operation audit + AI audit + confirmation-decision audit, admin-side data masking (privacy red line)
  操作审计 + AI 审计 + 确认决策审计，管理端数据脱敏（隐私红线）
- Enumeration/timing-attack protection, SSRF protection, OAuth signature verification, tightened production CORS, upload magic-byte validation
  防枚举/防时序、SSRF 防护、OAuth 验签、CORS 生产收紧、上传魔数校验

**Platform Capabilities / 平台能力**

- Low-code forms (JSON Schema dynamic rendering), plugin mechanism, template market, data import/migration
  低代码表单（JSON Schema 动态渲染）、插件机制、模板市场、数据导入迁移
- Notification center (SSE realtime + push abstraction), dynamic config center, soft-delete trash
  通知中心（SSE 实时 + 推送抽象层）、动态配置中心、软删除回收站
- Scheduled-task framework, feature flags, unified error codes + i18n
  定时任务框架、特性开关、统一错误码 + i18n

**Engineering & Ops / 工程化与运维**

- GitHub Actions CI: lint / unit / e2e / coverage thresholds / migration consistency / three-end builds
  GitHub Actions CI：lint / 单测 / e2e / 覆盖率门槛 / 迁移一致性 / 三端构建
- One-click deploy, single-container `docker run` full-stack delivery, offline/air-gapped deploy, on-prem AI (Ollama)
  一键部署、单容器 `docker run` 全栈交付、离线/内网部署、私有化 AI（Ollama）
- OTel tracing, Prometheus alerts, Loki logs, alert webhooks, ops health inspection
  OTel 链路追踪、Prometheus 告警、Loki 日志、告警 Webhook、运维健康巡检
- Data backup/restore, sqlite/postgres dual migration baselines, module manifest & dependency graph
  数据备份/恢复、sqlite/postgres 双迁移基线、模块清单与依赖图谱

### Fixed / 修复

- Initial release — no prior fix history; security/deployment hardening is tracked in git history and the DEP/CR series of the internal roadmap.
  初始版本，无历史修复记录；安全/部署硬伤治理见 git history 与项目内部 roadmap 的 DEP/CR 系列。
