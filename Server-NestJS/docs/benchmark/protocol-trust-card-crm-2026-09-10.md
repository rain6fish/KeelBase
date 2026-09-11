# Protocol × Trust Proof Card — CRM Reference Application 留档（2026-09-10，修复后复跑）

> 关联：规格 `docs/protocol-trust-proof-card.spec.md`。AI CRM = Reference Application 证明器（证明 Business Execution Trust，**非 CRM 产品**）。
> 本轮基线：**`623ab44d`（master）**，含生成器接线幂等修复的合并 `7efcf624`（`feat/proof-card-fix`）。执行者：作者自跑（**内部预跑**；正式对外 PASS 仍待真实 stranger，`EXECUTOR=github_id`）。
> 复现：**干净 clone** → `cd Server-NestJS && npm ci && npm run verify:protocol-trust:crm`（确定性 demo provider，无 LLM）——本版即按此方式在独立 clone 复跑。
> 上一版留档 [`protocol-trust-card-crm-2026-09-08.md`](protocol-trust-card-crm-2026-09-08.md) 的「R10 重跑幂等」经 2026-09-10 陌生模拟**证伪**后修复——**本版为修复后复跑**。

## 结论速览

| 轨 | 对象 | 结果 |
|---|---|---|
| G 生成轨 | **leads**（`specs/leads.json`，CRM 级双 enum 生成模块：status / priority） | **红行 0**：R4-R10 全绿，R2 = 作者自跑（黄） |
| F 旗舰轨 | **AI CRM**（手写旗舰深度治理） | **exit 0**（trust-proof S1-S7 全 ✓） |

记分卡：`protocol-trust-card-2026-09-10T13-43-16-UTC.md`（T_exec = 110s）· 旗舰轨留档：`trust-proof-2026-09-10T13-45-20-285Z.json`。

## 本版关键差异：修复「R10 重跑幂等」的假绿

- **证伪过程（2026-09-10 陌生 clean-clone 模拟）**：严格按公开文档字面命令、不读 src 的陌生模拟中，§3a invoices 卡 PASS，但 **§3b CRM 卡 FAIL**——同一 clone 先跑 §3a 后，其 R10「重跑幂等」触发生成器**重复注入** inject service → 位置式 DI 错位 → `toolRegistry.register is not a function`。
- **根因**：`scripts/generator/wire.mjs` step5 幂等 marker 与实际插入 token 不同形（marker 永不命中）→ 每次重跑再插一条；且 R10 原**只 grep 关键词、不检重复 = 假绿**——文档承诺的「重跑幂等」此前并不成立。
- **修复**：① `wire.mjs` marker 改与插入 token 同形；② `keelbase-init.test.mjs` fixture 改真实 inject 顺序，使既有幂等测试成为真守卫（反向验证：旧 marker 下该测试失败）；③ R10 显式计 inject 内 service 须 =1；④ `${var^}` 兼容 macOS bash 3.2（改 node）；⑤ 卡计时拆含 build + UTC 时间 + CRM wrapper 失败不回退旧卡。
- **修复后复跑（本留档）**：干净 clone（基线 `623ab44d`）端到端 **生成轨红 0 / 旗舰轨 exit 0**；R10 现为**真绿**（生成文件覆盖重写、`ai.module` 接线未破坏、inject 无重复）。

## G 生成轨：leads（生成产物完整治理链）

| 行 | 状态 | 要点 |
|---|---|---|
| R4 | green | `specs/leads.json` → keelbase-init → 实体/DTO/API/迁移/CASL/审计/AI 工具 |
| R5 | green | REST 建 leads #1 → 201 + 列表可见 |
| R6·R6b·R6c | green | `create_lead` 自动 **R3 + requiresConfirmation**；`query_leads` 自动 **R1**（治理语义随生成获得） |
| R7·R7b·R7c | green | AI create_lead → confirmation_request ×1 → approve → lead#2，副作用 effect #1，B4 trace 贯通 |
| R7d | green | 确认后 decline → 未执行 |
| R7e·R7e2 | green | 跨用户隔离 / 行级隔离 |
| R8·R8b | green | evidence-root v3 导出 + 离线验证 PASS；篡改根锚 → FAIL（tamper-evident） |
| R9·R9b | green | 撤销 effect #1 → targetSoftDeleted=true（revoked 真实生效） |
| R10 | green | 同 spec 重跑（`--force`）**幂等**——覆盖重写、`ai.module` 接线未破坏（inject 无重复；规格 §7） |

## F 旗舰轨：AI CRM 深度治理（trust-proof S1-S7）

- **S1** ✓ 客户 → 逾期订单 → AI 风险分析（critical）
- **S2** ✓ 越权拒绝（bob 跨用户 → 403 ×2；admin / 本人 → 200 对照）
- **S3** ✓ AI 删除客户 → **R5 BLOCKED**，客户数据未被删除（不可逆策略阻断生效）
- **S4** ✓ 写确认 confirmation_request → approve → 落库 task（R3 确认门控）
- **S5** ✓ 治理视图反查副作用（B4 贯通）→ 撤销后任务软删不可见（可经回收站恢复）
- **S6** ✓ Java 存量接入（引导标注：主仓脚本不跨仓调用，详见 java-starter 参考项目验证）
- **S7** ✓ evidence-root v3 离线验证 PASS（`--key` 全量子链重算/副作用锚/签名）；篡改锚 → FAIL

## 三证明显式化（裁决 §7 验收）

| 证据 | 主张 | 本留档支撑 |
|---|---|---|
| **E1 ①协议降成本** | 一条 spec（~20 行 JSON）→ 跨后端/前端/AI 工具的完整模块普通源码 | R4 生成成功 + `specs/leads.json`（CRM 级实体 5 字段 2 enum，无需手写 CRUD） |
| **E2 ②生成应用天然进 Trust** | 生成物不是代码脚手架——从生成即带治理：R3 确认 / R1 读 + 副作用 + 审计 + 证据 + 撤销 | G 轨 R6-R9 全绿（leads 为**生成产物**，非手写） |
| **E3 ③同一语义体系** | Build 与 Run 共享同一 Application Semantics：证据/审计/治理视图都以**业务对象**（lead / crm_task / customer）表达，跨生成与旗舰一致 | G 轨 evidence-root（leads）+ F 轨 evidence-root（crm_task）同一 `keelbase-audit-evidence/3` 格式；B4 trace 在两种对象上均贯通 |

**旗舰级深度边界（诚实）**：analyze 风险分析、R5 不可逆阻断、R4 双人审批档为**手写旗舰**能力（协议红线：只自动化高频 CRUD 工具 query R1 + create R3）；协议覆盖高频 20% 子集——不表述为「协议生成承诺」（规格 §8）。

## 说明

- **红行=诊断非失败**（裁决 §0）：本版无红行；上一版暴露的生成器接线缺陷即由该机制跑出并已修复。
- **正式对外引用本卡仍需**：真实 stranger（`EXECUTOR=github_id`）重跑 + 带基线/执行者档位；转对外文案前过 KB-1 词表闸。
- 关联失败路径证据（A2 失败路径场景化）：`test/crm-trust-failure-path.e2e-spec.ts`（越权写 404 / 越权改删 403 / R5 零变更 / 风险边界 / KB-4 duplicate·partial·撤销诚实）。
