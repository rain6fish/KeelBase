# 1.0 Candidate（Gate 4）：冻结清单 + Exit Criteria 状态

> development-plan §7.3 Gate 4：**冻结核心架构（Protocol / Generator / Runtime / Governance）→ RC → Full Acceptance → v1.0.0**。
> Gate 1（Golden Application = AI CRM 一次跑通）已于 2026-08-21 完成（确定性 9/9 + LLM 8/8），本文件解锁。
> 依据 §7.4 内部评估 #1「1.0 边界瘦身」+ §7.3「1.0 Candidate Exit Criteria」——**本文件是 Gate 4 的执行清单与状态跟踪**。

---

## 1. 1.0 边界瘦身（§7.4 内部评估 #1）

**1.0 只证明「三件套」**：

| 件 | 内容 | 证明载体 |
|---|---|---|
| **AI CRM（Golden Application）** | Customer → Risk Analysis → Create Follow-up Task → 确认 → 写 → 审计 → 撤销 | `verify-golden-application.sh`（9/9）+ `golden-application.e2e-spec.ts`（7 步）+ agent-benchmark（15/15）|
| **Protocol 生成器** | 协议化配置 → 生成带权限/AI 工具/确认/审计的业务模块 | `keelbase init`（30min 验收 + stranger-smoke CI）|
| **Runtime 治理** | CASL + 写操作确认 + 审计哈希链 + 副作用撤销 + Explainable Authz | verify-flagships（7/7）+ 越权矩阵（39）+ 安全评测（12/12）|

**其余能力标「具备，1.0 后按需激活」**（不阻塞、不证明、不作为 1.0 卖点）：

> FLOW 工作流引擎 / 插件（keelbase-plugin）/ MCP 出入口 / Headless API / 模板市场 / 推送（Push）/ 站内通知 / 积分（Points）/ 组织（Org）/ 表单（Form Builder）/ 数据导入 / 营销邮件 / 回收站 等——均已实现并有测试，**1.0 后按需激活**，不进 1.0 Candidate 证明范围。

---

## 2. 核心架构冻结（1.0 前不做结构性变更）

| 架构面 | 冻结范围 | 例外 |
|---|---|---|
| **Protocol** | `docs/module-protocol.md` 的 Application 协议形态（entity/DTO/API/权限/AI 工具映射） | 仅修 bug，不做协议演进 |
| **Generator** | `keelbase init` 生成链路（wire 六处锚点 + AI 工具注册 + 迁移） | 仅修 bug；`--import-*` 多输入通道保持现状 |
| **Runtime** | `ai.service`（1577 行 facade）+ 工具注册 + 确认流 + 副作用幂等 | 拆分重构冻结（platform-freeze §2 同款）；仅安全修复 |
| **Governance** | CASL + HS-9 治理策略 + HS-11 审计链 + P0-15 撤销 + Explainable Authz | 仅修 bug |

> 与 `platform-freeze.md`（08-18 旧周期）一致并收敛：ai.service 拆分、push 重构、Flutter fromJson codegen、文档逐个补 spec 均**冻结**。

---

## 3. 1.0 Candidate Exit Criteria 状态（§7.3 P1 逐项）

| # | 标准 | 状态 | 证据 |
|---|---|---|---|
| 1 | Golden Application（AI CRM）一次完整跑通 | ✅ | `verify-golden-application.sh` 9/9（确定性 7 步闭环 + Build）；LLM 视角 `de78294` 8/8 |
| 2 | Build Gate PASS | ✅ | release-gate Build（编译 + `keelbase init` dry-run）+ 30min 验收 |
| 3 | Run Gate PASS | ✅ | agent-benchmark 15/15（DeepSeek deepseek-v4-flash，Run/Trust/Safety 100%）|
| 4 | Trust Gate PASS | ✅ | verify-flagships 7/7 + 越权矩阵 39 + 安全评测 12/12 + 审计链 valid |
| 5 | Private Gate PASS | ✅ | private-ai-report（Cloud OFF → Ollama 8/8）+ verify-private-ai.sh |
| 6 | Adversarial Gate PASS | ✅ | 越权矩阵 + 攻击测试集 + 合成陌生人（§4 证据链）|
| 7 | release-gate.sh PASS | ✅ | 确定性模式 **10/10**（Gate 1 + Build + Trust + Private）|
| 8 | CI PASS | 🔶 在途 | release-gate CI job（并发会话接线，`ci.yml`）；现有 CI 其余 job 全绿 |
| 9 | CHANGELOG / Release Notes 完成 | 🔶 | Unreleased 已归并（v0.9.2 后 94+ 提交）；1.0 RC 时定稿 |
| 10 | v1.0 compatibility / migration policy 明确 | ✅ | operations.md §3.1——版本契约（v1.x additive-only）+ 双驱动迁移 + v0.9.x→v1.0 升级路径 + 兼容性声明 + 诚实声明 |

**门槛**：10 项全勾选才进入 1.0 Candidate——「何时可发 1.0」由客观清单决定。

---

## 4. 对抗性证明证据链汇总（Gate 2 统一汇总）

| 证据 | 覆盖 | 结果 |
|---|---|---|
| 越权测试矩阵（`authorization.e2e-spec.ts`）| REST CRUD × 7 实体 + AI 工具读/写隔离 + Headless + 撤销 | **39 用例**，跨用户一律 403/404 拒绝 |
| Agent Security Eval 攻击测试集（`verify-security-eval.sh`）| Prompt Injection / 越权 / Confirmation Bypass / Revoke Bypass / Cross-org | **12/12 全挡**（DeepSeek 实测）|
| Agent Benchmark（`agent-benchmark.mjs`）| Normal/Unauthorized/Ambiguous/High-risk/Injection × 三旗舰 | **15/15**，Run/Trust/Safety 100% |
| 合成陌生人（stranger-smoke + stranger-challenge-report）| 无上下文 AI 干净 clone 30min Build + 60min Business | 30min Build 全通 + 写确认门控实证 + Would use again ✅ |
| 审计哈希链完整性 | `/audit/verify` + `/audit/operations/verify` | valid:true；并发写链分叉已修复（1bf529b）|

---

## 5. 遗留（Gate 4 收口前）

- **CI PASS**：release-gate job 落 CI（并发在途）。
- **CHANGELOG / Release Notes**：v0.9.2 之后的 94+ 提交归并已入 Unreleased；1.0 RC 时定稿。
- **诚实声明**（§7.4 #5）：发布区分「技术 1.0」vs「市场验证后置」（External 为 1.0 后增长里程碑）——已写入 operations.md §3.1。

---

## 相关

- [release-gate.md](release-gate.md) — Release Gate 五维 + Gate 1-4
- [release-precheck.md](release-precheck.md) — 发布前标准程序（三步）
- [platform-freeze.md](platform-freeze.md) — 旧周期平台冻结清单（已收敛）
- [30min-acceptance.md](30min-acceptance.md) — 30 分钟验收
