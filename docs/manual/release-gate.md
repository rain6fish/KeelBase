# Release Gate（0.9.x 里程碑质量门禁 / 阶段 2 Phase 4）

> 依据 development-plan §7.1 Phase 4：**Code Complete ≠ Product Validated**。本文件把 Release Gate 落地为可执行检查单。
> **版本策略（2026-08-18 用户决定）**：先不发行 1.0，**继续 0.9.x 版本线**——本 Gate 作为 0.9.x 里程碑质量检查。
> **版本门重校（2026-08-20 用户确认，外部短期不可得）**：1.0 由 **Build / Run / Trust / Private 四维全绿 + 对抗性证明（越权矩阵 + Agent Security Eval 攻击测试集 + 合成陌生人验证）** 触发；**External 降级为「1.0 后增长里程碑」**，不阻塞发布。

---

## 门禁总览

| 维度 | 核心指标 | 当前状态 | 验证方法 |
|---|---|---|---|
| **Build** | 30min Create——陌生开发者从零生成带权限/AI 工具/确认/审计的模块 | 🔶 工程已通 | [dev-challenge.md](dev-challenge.md) + [30min-acceptance.md](30min-acceptance.md) |
| **Run** | 1hr 真实业务任务 + Agent Success Rate | ✅ 3/3 SUCCESS（DeepSeek 实测，ASR=100%）| 三旗舰业务任务（[flagship-task-card.md](flagship-task-card.md)）+ [verify-flagships.sh](../../scripts/verify-flagships.sh) |
| **Trust** | Safe Execution / Unauthorized Action / Human Intervention Rate | ✅ 无 LLM 部分全绿 | [verify-flagships.sh](../../scripts/verify-flagships.sh) + HS e2e |
| **Private** | Offline + Local AI（数据不出域）| ✅ 本地实测（Cloud OFF + Ollama 对话 + bge-m3 embedding + 审计链 valid）| [private-ai-report.md](private-ai-report.md) + [verify-private-ai.sh](../../scripts/verify-private-ai.sh) |
| **对抗性证明** | 越权矩阵 + Agent Security Eval 攻击测试集 + 合成陌生人验证 | 🔶 待 W3-W5 建立 | [agent-benchmark.mjs](../../scripts/benchmark/agent-benchmark.mjs) + 越权矩阵 + 合成陌生人 harness |
| **External（1.0 后增长里程碑）** | 5-10 人 + 至少一个真实项目 | ⬜ 需社区 | [dev-challenge.md](dev-challenge.md) 反馈表 |

**判定**：Build / Run / Trust / Private 四维全绿 + 对抗性证明通过 → 发 v1.0；任何一维不达标 → 记录差距，不发布。**External 为 1.0 后增长里程碑，不阻塞发布。**

---

## 1. Build：30min Create

**指标**：陌生开发者 30 分钟内生成一个业务模块（权限 + AI 工具 + 确认 + 审计）。

| 检查点 | 命令 / 证据 | 达标线 |
|---|---|---|
| 协议 → 模块 | `node scripts/keelbase-init.mjs --spec specs/<module>.json` | 输出「生成业务模块」+ 多端接线 |
| 编译 | `cd Server-NestJS && npm run build` | 0 error |
| 迁移 | `npm run migration:generate -- src/migrations/Add<Module>` | 生成迁移 + 一致性 No changes |
| 单测 | `npm test -- <plural>.service` | 通过 |
| API | `curl /api/v1/<plural>`（带 token）| 200 + 本人数据 |
| **生成模块 e2e** | `npx jest --config test/jest-e2e.json test/generated-modules.e2e-spec.ts` | 通过（CRUD + admin 403/200 + 401）|

**实测记录**：generated-modules e2e 3 通过；suppliers/contracts 模块已生成并接线。

## 2. Run：1hr 真实业务任务 + Agent Success Rate

**指标**：AI 在 1 小时内完成真实业务任务（如 CRM「找风险客户建跟进」）；Agent Success Rate（AI 独立完成/人工干预完成/失败）。

| 检查点 | 方法 |
|---|---|
| 三旗舰业务任务 | 用 `alex` 账号各跑一次：CRM 找风险客户建任务 / PM 判断延期建任务 / Approval 预审+复核 |
| Agent Success Rate | 记录每次任务：AI 全程独立完成（SUCCESS）/ 需人工介入（HUMAN_INTERVENTION）/ 失败（FAIL）|
| 时间 | 每任务目标 <20min（三任务 1hr 内）|

**实测记录（2026-08-18，DeepSeek deepseek-v4-flash）：3/3 SUCCESS，Agent Success Rate = 100%**
- **CRM**：正确识别临海制造（280 万逾期 / 11 分）、蓝湾地产（2 笔逾期 / 13 分）、华润（45 万逾期）为风险客户；
- **PM**：正确分析数据仓库迁移项目（9/10 分）、电商平台重构项目延期风险；
- **Approval**：报销 800≤1000 → AI 预审自动通过；12000>5000 → 转人工复核，且提示写操作需确认；
- **Trust 佐证**：Decision Trace 工具调用全 success + 审计哈希链 `valid:true`（17 条）+ Approval 写操作确认门控生效（请求保持 pending 未静默执行）。

**Agent Benchmark（2026-08-20 云端，DeepSeek deepseek-v4-flash）**：五类任务 × 三旗舰 = 15 用例，**Run 100% / Trust 100% / Safety 100%**（normal 调对工具 / unauthorized 拒绝 / ambiguous 澄清 / high-risk 确认门控 / injection 拒绝；报告 `docs/benchmark/agent-benchmark-2026-08-20-05-59-21.md`）。7B CPU 曾测 33/17/33，证实系环境限制。

**前置**：LLM 环境（DeepSeek key 或 Ollama）。任务卡与记录表见 `flagship-task-card.md`。

## 3. Trust：Safe Execution / Unauthorized Action / Human Intervention Rate

**指标**：AI 只在授权范围内操作；写操作必确认；可审计可撤销。

| 检查点 | 命令 | 达标线 |
|---|---|---|
| 三旗舰 + 生成模块 e2e | `./scripts/verify-flagships.sh` | 7/7 通过 |
| 越权 | e2e（他人数据 403 / admin 端点 403 / user 访问 admin 403）| 全部 403 |
| 写操作确认 | e2e（approval decide / create 需确认）| 写操作无绕过 |
| 审计哈希链 | `/audit/verify` + `/audit/operations/verify` | valid: true |
| 撤销 | 本人撤销 AI 副作用（P0-15）+ admin 撤销 | 软删可恢复 |

**状态**：✅ 无 LLM 部分全绿（HS e2e + verify-flagships 7/7）。

## 4. Private：Offline + Local AI

**实测记录（2026-08-19，本机 Ollama 原生 + CPU）**：Cloud OFF（进程无 DEEPSEEK_API_KEY）→ Ollama `qwen2.5:7b` 本地对话（`/ai/chat/stream` 返回「您好！请问…」）→ bge-m3 本地 embedding（4.7s/条）→ 审计 `provider:ollama` 记录 + 哈希链 `valid:true (20条)`。完整证据见 [private-ai-report.md](private-ai-report.md) + `benchmarks/private-ai.json`。**工具调用**：7B 模型 CPU 上对 30+ 工具集可靠性低（模型能力限制，非代码缺陷）；旗舰 e2e 7/7 证明工具/确认/审计链路。

**指标**：数据不出域——本地 LLM / 本地 embedding / 本地审计全链路。

| 检查点 | 命令 |
|---|---|
| 一键验证 | `./scripts/verify-private-ai.sh`（Cloud OFF + Ollama + 本地 embedding + AI 冒烟）|
| CRM Golden Path | verify-private-ai.sh 第 5 步 + [private-ai-verification.md](private-ai-verification.md) §8 |
| 离线部署 | [offline-deploy.md](offline-deploy.md) |

**状态**：✅ 已实测（2026-08-19 本机 Ollama 原生 + CPU，Cloud OFF 全链路 8/8）。

## 5. 对抗性证明（Adversarial Proof，2026-08-20 新增）

> 外部验证短期不可得的替代验证层：不依赖外部开发者，以「自己当最严苛攻击者 + 合成陌生人」证明安全与可用性。W3-W5 建立，作为 v1.0 触发条件之一。

| 检查点 | 方法 | 达标线 |
|---|---|---|
| 越权测试矩阵 | 敏感实体（Customer/Project/Contract/Approval/Notification/Knowledge/Headless）× 操作（GET/PATCH/DELETE/AI 读/AI 写/批处理/撤销）系统化 | A 访问 B 数据 → 全部拒绝 |
| | **✅ 首增量（2026-08-20，`test/authorization.e2e-spec.ts` 33 用例）**：REST CRUD 矩阵——events/todos/crm/pm/approval/suppliers/contracts × GET/PUT·PATCH/DELETE + 列表隔离 + admin 端点，跨用户 403/404 拒绝 | 后续增量：Headless / SubAgent scope / 批处理 / 撤销 |
| | **✅ AI 工具隔离（2026-08-20，35 用例）**：AI Tool Read（A 查客户不含 B 数据）/ AI Tool Write（A 对 B 客户建任务被拒）| 确定性验证，无 LLM |
| | **✅ Headless 越权（2026-08-20，37 用例）**：缺 key / 伪造 key → 401 | 守卫层 HTTP 拒绝 |
| | **✅ 撤销越权（2026-08-20，39 用例）**：B 撤销 A 的 AI 副作用 → 404，A 撤销自己 → 200 | Revoke 所有权 |
| Agent Security Eval 攻击测试集 | Prompt Injection / 越权 / Confirmation Bypass / Revoke Bypass / Cross-org 进评测集 | **✅ 攻击用例补齐 + 脚本化 + 实测 12/12（2026-08-20）**：securityCases 6→12（injection-write / confirmation-bypass / revoke-bypass / cross-org-read / cross-org-approve / unauthorized-read）；`scripts/verify-security-eval.sh`（登录→seed→评测批→断言门槛，可接 CI）；reject 断言增强措辞 + seed 支持断言演进；**DeepSeek 实测 12/12 全挡**（越权/注入/确认绕过/撤销绕过/跨组织全拒，正常用例通过）→ 安全回归门槛 90% 达成；spec 23 全绿 |
| 合成陌生人验证 | 无本仓上下文 AI Agent 从干净 clone 跑 30min Build + 60min Business，记录卡点（[dev-challenge.md](dev-challenge.md)）| 脚本化 + 进 CI，持续烧掉 onboarding 卡点 |

## 6. External：1.0 后增长里程碑（非发布门禁）

> **2026-08-20 重排**：外部开发者 / 真实项目 / 社区短期不可得，External 从发布门禁降级为「1.0 后增长里程碑」。1.0 前的替代验证由「对抗性证明」承担（§5）。

**指标**：不认识作者的外部开发者完成挑战，至少一个放进真实项目。

| 检查点 | 方法 |
|---|---|
| 招募 5-10 人 | Dev Challenge 发布（[dev-challenge.md](dev-challenge.md)）|
| 反馈采集 | 反馈表：Where stuck / Why stuck / Missing abstraction |
| 真实项目 | 至少一个 PoC 进入外部开发者真实项目 |

**状态**：⬜ 待社区（不阻塞 v1.0）。

---

## 结论模板

```text
v1.0 Release Gate 结论：
- Build: ✅/❌（证据）
- Run:   ✅/❌（Agent Success Rate = ?）
- Trust: ✅/❌
- Private: ✅/❌
- 对抗性证明: ✅/❌（越权矩阵 / 攻击测试集 / 合成陌生人）
→ 四维 + 对抗性证明达标 → 发 v1.0
- External（1.0 后里程碑）: N 人 / 真实项目数（不阻塞）
```

## 相关

- [dev-challenge.md](dev-challenge.md) — 外部开发者验收包
- [verify-flagships.sh](../../scripts/verify-flagships.sh) — 三旗舰严格验收
- [verify-private-ai.sh](../../scripts/verify-private-ai.sh) — 数据不出域验证
- [30min-acceptance.md](30min-acceptance.md) — 30 分钟验收内部版
