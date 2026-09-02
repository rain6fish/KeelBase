# KeelBase Evidence System — 证据体系：每项能力「你怎么证明」

> Proof Mode（2026-09-02 专家团处置）：**Capability Complete / Proof Incomplete** 是当前阶段主缺口——
> 能力已声明（见 [enterprise-capabilities.md](../enterprise-capabilities.md)，对外企业级能力声明），
> 本目录回答另一半问题：**每一项能力，用什么可运行的验证来证明它真实有效、可被第三方复核**。
>
> 9 月主线 = Proof Mode + Feature Freeze（非 P0 Bug 不进 Core）。证据体系按此组织：
> 每条能力 = **声明（claim）** → **怎么证明（how to prove，可运行命令）** → **产物落在哪（artifact）** →
> **最近证据（last verified，含日期与结果）**。
>
> 状态图例：✅ 已证明 / 🔶 有证据待补跑 / ⬜ 证明方法待建。

---

## 1. 证据分层 / Evidence Layers

| 层 | 证明人 | 证明方式 | 对应资产 |
|---|---|---|---|
| L0 运行时可验证 | 任何带管理员 token 的人 | 调在线验证端点，现算现验 | `/audit/verify`、`/ai/eval/report` 等 |
| L1 离线独立复核 | 审计机构 / 第三方 | 证据包 + 独立实现脚本重算，不装系统 | `verify-evidence.mjs`（只依赖 Node 内置） |
| L2 静态留档 | 评估人 / 发布流程 | 可重复运行的评测/基准报告落仓 | `docs/benchmark/*.md`、`evidence-verify-*.md` |

原则：**能现算的用端点，能导出的离线复核，能留档的定期跑**。证据要「说得出、跑得动、拿得走」。

---

## 2. Runtime Governance（运行治理）能力证据

### 2.1 审计不可篡改（哈希链 HS-11）

- **声明**：每条 AI/操作审计入 HMAC 哈希链（`prev_hash|hash`），改任何业务字段、删行、换序都会断链；写路径 DB 级串行锁防分叉。
- **怎么证明（运行时）**：
  ```bash
  # AI 审计链完整性（admin）
  GET /api/v1/audit/verify
  # 操作审计链完整性（admin）
  GET /api/v1/audit/operations/verify
  # → { valid: true, checked: N }，逐行重算 hash
  ```
- **怎么证明（离线复核，审计机构用）**：导出证据包 → 独立脚本重算每条 payload：
  ```bash
  # Server-NestJS/
  npm run verify:evidence -- <证据包.json> --key <AUDIT_HMAC_KEY>
  # 无 --key：链结构验证（seq/prevHash/genesis，检删行换序断链）
  # 有 --key：全量重算 canonicalJSON + HMAC + 签名（检内容篡改）
  ```
- **产物**：`docs/benchmark/evidence-verify-<ts>.md`（脚本输出离线验证报告，随跑随留档）。
- **最近证据（2026-09-02）**：ECS demo 实测 `valid:true`——AI 审计链 83 行（曾断链 genesis：密钥轮换后旧密钥不可推导，已用当前密钥重签修复，改动前已备份）、操作审计链 284 行；哈希链恢复不依赖任何代码版本。

### 2.2 越权拒绝（CASL 行级）

- **声明**：用户/AI 只能触达本人数据；跨用户行级访问一律 403/拒绝，含 AI 工具调用。
- **怎么证明（确定性对抗，无 LLM）**：
  ```bash
  # 管理台「安全演示」（A2）：GET /api/v1/ai/security-showcase/scenarios 列出场景
  POST /api/v1/ai/security-showcase/run/:scenarioId   # 选「跨用户越权拒绝」
  # → outcome + 决策轨迹（业务语言），复用真实 CASL 防护逻辑
  ```
- **怎么证明（LLM 评测）**：`POST /api/v1/ai/eval/run`（越权用例）；e2e 越权 403 用例。
- **最近证据**：`docs/benchmark/adversarial-proof.md`；security-showcase 确定性场景（394e658）。

### 2.3 提示注入拒绝（HS-8）

- **声明**：注入指令（越权/改系统提示/要求泄露他人数据）不执行，返回策略拒绝。
- **怎么证明**：security-showcase 注入拒绝场景 + `POST /ai/eval/run` 注入用例 + HS-8 注入防线 e2e。
- **最近证据**：`docs/benchmark/adversarial-proof.md`。

### 2.4 AI 写操作安全（R3 确认 / R5 阻断 / HS-3 副作用可撤销）

- **声明**：AI 写工具需本人确认（R3）或双人审批（R4）；不可逆/高影响动作 R5 阻断；AI 创建的记录记副作用、管理台与本人均可撤销（软删入回收站，可恢复）。
- **怎么证明**：
  ```bash
  GET  /api/v1/ai/tool-effects            # 副作用证据列表（admin）
  DELETE /api/v1/ai/tool-effects/:id      # 撤销 AI 创建的记录（admin，回收站可恢复）
  DELETE /api/v1/ai/my/tool-effects/:id   # 本人撤销（所有权校验）
  # 确认门控：POST /api/v1/ai/confirmations/:token（approve/reject）
  # 对抗场景：security-showcase「不可逆动作 R5 阻断」「写操作 R3 确认门控」
  ```
- **最近证据（2026-09-02）**：ECS demo 已种 2 条副作用（create_event/create_todo 指向真实事件/待办），管理台可现场演示撤销闭环。

### 2.5 工具权限与治理策略（HS-2 / HS-9）

- **声明**：AI 工具清单带权限元数据；治理策略数据驱动、改即生效（工具开关/确认规则/角色白名单/审计粒度）。
- **怎么证明**：
  ```bash
  GET /api/v1/ai/tools                   # 工具清单 + 风险级/权限元数据
  GET /api/v1/ai/governance/policy       # 当前治理策略
  PUT /api/v1/ai/governance/policy       # 改策略 → 下一个调用即生效（无需发版）
  ```
- **最近证据（2026-09-02）**：ECS demo 已种治理策略单行（工具确认规则 + 审计粒度 all）。

### 2.6 授权链「为什么允许」（A-5）

- **声明**：任何审计动作可展开完整责任链 Human→Intent→Agent→Tool→Business Action + 授权依据；放行记录事件时点授权快照（`authorization.allowed`），导出不重算。
- **怎么证明**：
  ```bash
  GET /api/v1/audit/logs/:id/chain            # 身份链 + 授权依据（拒绝 checks / 放行快照）
  POST /api/v1/auth/permissions/explain       # 决策 + 依据（本人）
  POST /api/v1/auth/permissions/explain/target # 管理员排查任意用户（admin）
  GET  /api/v1/auth/permissions/chain          # 授权链图（授权者→角色→策略→资源→生效期）
  ```
- **文档**：`docs/audit-authz-snapshot.spec.md`（事件时点快照协议）。

### 2.7 合规证据包（A-6 / D4）

- **声明**：一键导出可提交审计机构的证据包（业务摘要 + 责任链 + 权限判断 + 审批 + 数据 diff + 技术 trace + 哈希链 + 签名），格式 `keelbase-audit-evidence/2`，第三方离线可验。
- **怎么证明**：
  ```bash
  GET /api/v1/audit/action-report/export       # 导出证据包（admin，可带 userId/since/limit）
  npm run verify:evidence -- 包.json --key ...  # 离线验证签名与哈希链（见 2.1）
  ```
- **文档**：§22.16 A-6（私库 roadmap 执行记录）。

---

## 3. Trust（信任）能力证据

### 3.1 Business-safe Agent 评测（Benchmark）

- **声明**：AI 工具行为在确定性安全用例集（越权/注入/写拒绝/PII/无头隔离）下不越界。
- **怎么证明**：
  ```bash
  POST /api/v1/ai/eval/run      # 跑评测批（admin，逐用例调 LLM）
  GET  /api/v1/ai/eval/report   # 最近评测报告
  POST /api/v1/ai/eval/seed     # 补齐内置安全评测用例（幂等）
  ```
- **产物**：`docs/benchmark/agent-benchmark-*.md`、`adversarial-proof.md`、`stranger-challenge-report-*.md`。

### 3.2 私有 AI / 数据主权（POV-1）

- **声明**：可全本地部署（Ollama），数据不出域。
- **怎么证明**：私有 AI 验证脚本 + 留档 `docs/benchmark/private-ai.json`；`docker compose --profile private-ai up -d ollama` 后配 `AI_PROVIDER=ollama`。

---

## 4. Build / 质量能力证据

### 4.1 性能与并发

- **声明**：公开/认证/DB/AI 场景吞吐与延迟基线可对比（含 AI 并发、SSE 首字节）。
- **怎么证明**：
  ```bash
  # Server-NestJS/，docs/benchmark/README.md 有完整前置
  node scripts/benchmark/run-benchmark.mjs     # 默认 8s × 8 并发
  # BENCH_SECONDS=20 BENCH_CONNECTIONS=50 ... 自定义
  ```
- **产物**：`docs/benchmark/benchmark-*.md`（p99 延迟基线，如 2026-08-29：/app/version 789 req/s p99 45ms）。

### 4.2 回归防线（测试 / 覆盖率 / 安全门禁）

- **声明**：改动带回归防线；覆盖率门槛 + 安全模块分档门禁；e2e + Release Gate 确定性。
- **怎么证明**：
  ```bash
  npm test                        # 后端单测
  npm run test:cov                # 覆盖率门槛（statements≥85 + check-security-coverage 分档）
  npm run test:e2e                # 端到端
  npm run lint
  # CI：lint + 单测/e2e + 构建 + 前端 typecheck/build + Flutter analyze/test（.github/workflows/ci.yml）
  ```

---

## 5. 使用说明 / How to Use

- **现场演示**（带管理员账号，在线环境）：2.1 链 verify → 2.2/2.3 安全演示 → 2.4 撤销闭环 → 2.7 证据包导出 + 离线验证。demo 环境已含 2.1/2.4/2.5 的种子证据（ECS `reset-test-data.js` 每日重种，见 CLAUDE.md）。
- **写新证据**：新增能力按本目录格式补一行「声明 → 怎么证明 → 产物」；能用既有端点/脚本的组织，不另造证明体系。
- **对外语言红线**：本目录只用能力语言（证明/证据/可信/可复核），不使用竞争性措辞或内部规划代号（对外语言决策见私库）。

## 相关文档 / Related Docs

- [enterprise-capabilities.md](../enterprise-capabilities.md) —— 能力「声明」侧（对外企业级能力声明）
- [docs/benchmark/](../benchmark/README.md) —— 评测/压测/对抗性证明报告库
- HS 系规格：`docs/hs11-audit-chain.spec.md`、`docs/hs9-governance-policy.spec.md`、`docs/hs10-mcp-adapter.spec.md`
- 审计取证规格：`docs/audit-authz-snapshot.spec.md`、`docs/audit-unauthorized-view.spec.md`、`docs/audit-lifecycle-elsteps.spec.md`
- [keelbase-dna.md](../keelbase-dna.md) —— 四核心原则（Runtime over Prompt / Capability≠Authority / Trust Verifiable / Design for Recovery）
