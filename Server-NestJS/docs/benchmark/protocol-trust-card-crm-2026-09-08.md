# Protocol × Trust Proof Card — CRM Reference Application 留档（2026-09-08）

> 关联：internal-roadmap §internal.7 T3；裁决 §5-§7（内部）；规格 docs/protocol-trust-proof-card.spec.md。AI CRM = Enterprise Proof Reference Application 证明器（§internal.6，范围护栏：证明 Business Execution Trust，非 CRM 产品）。
> 本轮基线：`53a8fecf`（feat/proof-card-t3）。执行者：作者自跑（**内部预跑**，正式 PASS 需真实 stranger 重跑，`EXECUTOR=github_id`）。
> 复现：`cd Server-NestJS && npm run verify:protocol-trust:crm`（确定性 demo provider，无 LLM）。

## 结论速览

| 轨 | 对象 | 结果 |
|---|---|---|
| G 生成轨 | **leads**（specs/leads.json，CRM 级双 enum 生成模块：status/priority） | **红行 0**：R4-R10 全绿（含 R5/R6/R7/R8/R9/R10），R2=作者自跑（黄） |
| F 旗舰轨 | **AI CRM**（手写旗舰深度治理） | **17/17 全过**（trust-proof S1-S7，exit 0） |

两者合起来回答裁决命题：**AI CRM 不只是手写旗舰，其同级语义可由 Protocol 生成并天然进入同一 Trust Runtime；旗舰级深度（R5 阻断/风险分析/双人审批档）为手写，协议覆盖高频 20% 子集——诚实边界。**

## G 生成轨：leads（生成产物完整治理链）

记分卡：`protocol-trust-card-2026-09-08T12-23-01-UTC.md`（T_exec=59s）

| 行 | 状态 | 要点 |
|---|---|---|
| R4 | green | specs/leads.json → keelbase-init → 实体/DTO/API/迁移/CASL/审计/AI 工具 |
| R5 | green | REST 建 leads #1 201 + 列表可见 |
| R6·R6b·R6c | green | `create_lead` 自动 R3 + requiresConfirmation；`query_leads` 自动 R1（治理语义随生成获得） |
| R7·R7b·R7c | green | AI create_lead → confirmation ×1 → approve → lead#2，副作用 effect#1，B4 trace 贯通 |
| R7d | green | 确认后 reject → 未执行 |
| R7e·R7e2 | green | 跨用户隔离 / 行级隔离 |
| R8·R8b | green | evidence-root v3 导出 + 离线验 PASS；篡改根锚 → FAIL（tamper-evident） |
| R9·R9b | green | 撤销 effect#1 → targetSoftDeleted=true（revoked 真实生效） |
| R10 | green | 同 spec 重跑（--force）幂等，接线不破坏 |

## F 旗舰轨：AI CRM 深度治理（trust-proof S1-S7）

留档：`trust-proof-2026-09-08T04-24-18-521Z.json` + `evidence-root-2026-09-08T04-24-18-185Z.json` + `evidence-verify-2026-09-08T04-24-18-{308,445}Z.*`

- S1 ✓ 客户 → 逾期订单 → AI 风险分析（critical）
- S2 ✓ 越权拒绝（bob 跨用户 403 ×2；admin 200；本人 200）
- S3 ✓ AI 删除客户 → R5 BLOCKED，数据未删（不可逆策略阻断）
- S4 ✓ 写确认 confirmation → approve → 落库 task#10
- S5 ✓ 撤销 → 任务软删、回收站可恢复
- S6 ✓ Java 存量接入（java-starter 独立验证引导标注）
- S7 ✓ evidence-root v3 离线验 PASS；篡改锚 → FAIL

## 三证明显式化（裁决 §7 验收）

| 证据 | 主张 | 本留档支撑 |
|---|---|---|
| **E1 ①协议降成本** | 一条 spec（~20 行 JSON）→ 跨后端/前端/AI 工具的完整模块普通源码 | R4 生成成功 + specs/leads.json（CRM 级实体 5 字段 2 enum，无需手写 CRUD） |
| **E2 ②生成应用天然进 Trust** | 生成物不是代码脚手架——从生成即带治理：R3 确认/R1 读 + 副作用 + 审计 + 证据 + 撤销 | G 轨 R6-R9 全绿（leads 为**生成产物**，非手写） |
| **E3 ③同一语义体系** | Build 与 Run 共享同一 Application Semantics：证据/审计/治理视图都以**业务对象**（lead / crm_task / customer）表达，跨生成与旗舰一致 | G 轨 evidence-root（leads）+ F 轨 evidence-root（crm_task）同一 keelbase-audit-evidence/3 格式；B4 trace 在两种对象上均贯通 |

**旗舰级深度边界（诚实）**：analyze 风险分析、R5 不可逆阻断、R4 双人审批档为**手写旗舰**能力（协议红线：只自动化高频 CRUD 工具 query R1 + create R3）；协议覆盖高频 20% 子集——本留档不把它们表述为「协议生成承诺」（规格 §8）。

## 说明
- 编排与 driver 本轮暴露并修复 3 处工具 bug（非产品缺口）：①MUT 解析 cygpath（POSIX 路径 Windows Node 读不了）；②driver 按 spec 全字段构建 + reject 语义；③wrapper GEN_REDS/退出码。见分支 commit `53a8fecf`/`76ee34af`/`aa53e5a6`。
- 正式对外引用本卡需：真实 stranger（`EXECUTOR`）重跑 + 带基线/执行者档位；转对外文案前过 KB-1 词表闸。
