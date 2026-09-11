# Protocol × Trust Proof Card 规格 — Protocol-trust Proof Card Spec

> 关联：Proof Card 规格公开化；AI CRM = Reference Application；词表纪律 / revokeClass 语义。
> 目标：把「Protocol × Trust 路径是否已达到可公开证明的程度」变成一个**陌生开发者按公开文档可复现的测试规格**。它是测试规格，不是宣传材料——不回答「Protocol 强不强」，只回答「现在能不能对公众说『任何人都可在 X 分钟内复现』」。
> 状态：⬜ Spec 草稿；自动化编排 / CRM 实证 / 对外叙事未做。

---

## 0. 判定原则（本规格的可信基准）

卡的全部设计围绕四条纪律（与 KB-4 failure-path / KB-3 evidence-root 同源）：

1. **计时分两段**：`T_read`（阅读文档到能动手）与 `T_exec`（实际执行）。**禁止合并成一个数字**——文档摩擦与协议摩擦分开归因。
2. **红行是诊断，不是失败**：卡面只列逐行状态，**禁止用平均分 / 加权 / 汇总掩盖红行**。红行进诊断清单（§internal.6「应用暴露缺口反推基座 30%」）。
3. **有效执行者**：只有满足 §3 定义的陌生开发者跑出的卡才有信用；作者自跑 = 无效卡，只能作「内部预跑」标注。
4. **可复现基线**：卡必须钉在确定的 commit/tag 上跑，留档注明；同一基线必须能复现或如实记录漂移。

**出口（卡只回答这一个问题）**：

```
              Proof Card
                  │
          ┌───────┴───────┐
          ↓               ↓
        PASS             FAIL（红行）
          │               │
          ↓               ↓
    M1 / 企业试点    找到真实缺口 → 判断是否值得重开协议
   （§internal.6 分叉）        （P0-9 BLD 需求驱动才开）
```

> **附带纪律（比本卖点更重要）**：任何新的核心定位，必须先有可复现的 Proof Card、达到出口判据，才允许进入公开叙事。

---

## 1. 卡场景（被验证的纵贯链路）

```
陌生开发者 → NL 描述业务模块 → 生成模块 → 运行模块
  → AI 调用该模块 Tool → Permission → Risk/Policy → Confirmation
  → Business Side Effect → Audit → Evidence → Revoke/Compensation
```

卡上被测对象（module-under-test, **MUT**）：由生成器产出的**一个业务模块**（首卡默认 `invoices`——specs/invoices.json 已有 G2 端到端先例；后续可换 specs/*.json 或 CRM 子实体）。MUT 须为**生成产物**，非旗舰手写模块——因为卡验证的是「生成物天生进入治理」这一命题。

## 2. 起点环境（R1 明细）

| 项 | 规格 |
|---|---|
| OS | 任一主流桌面 OS（macOS / Ubuntu 22.04+ / Windows 10+） |
| 运行时 | Node.js ≥ 20 + npm；Git |
| 数据库 | SQLite（默认，零外部依赖）；PostgreSQL 为可选扩展档（T2/T3 视需要） |
| 服务依赖 | 无 Redis / 无队列必启（QUEUE_ENABLED=false 可跑）；需真实 LLM 仅档位 B |
| 代码基线 | **钉死版本**：默认 = 最新 v1.0.x release tag 或本 spec 记录的 pin SHA；留档必须写明 |
| 获取 | 从公开源 clone（GitHub），或下载该 tag 的源码包 |

> **场景 A（主卡，默认）**：依赖已预装、库可直连——测 Protocol→Trust 链本身，环境摩擦不计入判据。
> **场景 B（完整旅程，可选）**：从零 clone + 装依赖——T_read/T_exec 都记录，但**单独标注**，不进场景 A 及格判据（环境摩擦与协议摩擦分开归因）。

## 3. 有效陌生开发者（R2 明细，陌生人定义）

同时满足才算有效（缺任一 → 结果标「作者自跑 / 无效卡」，不数进正式结论）：

| # | 条件 | 检查方式 |
|---|---|---|
| S-1 | **非项目作者 / 从未向本项目提交代码** | 自报 + GitHub 无贡献记录（留档记 github id） |
| S-2 | **只按公开文档执行**：README + 本卡 + 关联 spec（docs/*.spec.md + Swagger），不读 `src/` 实现 | 执行者声明 + 观察 |
| S-3 | **熟练 NestJS/TS**（排除"不会写代码"的无效卡），对 KeelBase 零经验 | 自报技术背景 |
| S-4 | 执行期间**不询问作者 / 不查内部资料** | 自报 |

> 结论档位：真实 stranger 跑出全绿 = **PASS（对外可声明）**；作者自跑全绿 = **内部预跑（待外部验证）**，不能对外说"已验证"。

## 4. 时间线与计时口径（R3 明细，计时起点 / 计时终点）

两个计时段，**输出两个数字，不合并**：

- **T_read（起点 = 开始阅读公开文档；终点 = 输入第一个命令前）**。软指标，由执行者自报，注「自报不可审计」。
- **T_exec（起点 = 干净 shell 中输入第一个命令；终点 = 卡最后一行验证返回、记分卡输出）**。硬指标，机器可复核。

每段明确排除/包含项：
- 场景 A：`npm install`、迁移、启动 server 计入 T_exec；文档寻找/重读不计入（已并入 T_read）。
- 场景 B：场景 A 全部 + 环境安装单独记 `T_env`（不计 T_exec）。
- 卡留档记录：`T_read` / `T_env`(仅 B) / `T_exec`，以及 T_exec 内生成耗时、验证耗时两个子段（供 Protocol 归因，非及格判据）。

## 5. 十行测量明细（R1-R10）

> 每行状态：**绿**（期望达成）/ **红**（未达成 → 诊断）/ **黄**（记录基线，不判定；首跑为锚定值，规则见 §6）。**行间不允许平均。**

| 行 | 名称 | 输入 / 步骤 | 绿（期望结果） | 红行 → 处置 |
|---|---|---|---|---|
| **R1** | 起点环境 | 按 §2 准备 | 环境就绪，server 可起，`/health` 200 | 环境问题 → 记 T_env/场景标注，不进协议归因 |
| **R2** | 陌生开发者 | §3 检查表 | S-1..S-4 全满足 | 任一不满足 → 整卡无效标注 |
| **R3** | 计时记录 | 按 §4 全程记录 | 输出 T_read/T_exec（分场景），不合并 | 缺分段 → 卡不可判，重跑 |
| **R4** | Protocol 生成 | 档位 A：`specs/invoices.json → keelbase init --spec`；档位 B（需真 LLM key）：`--desc "发票管理…" → 协议 → 生成` | 生成物文件清单齐全（entity/DTO/service/controller/迁移/CASL/审计/AI tool）；`keelbase-init.test.mjs` 一致性可过 | 生成失败 → 生成器缺陷（诊断） |
| **R5** | 运行模块 | migration → 启动 → REST CRUD 冒烟 | MUT REST 最小建一条 201；列表可查 | 运行失败 → 生成物/迁移缺陷（诊断） |
| **R6** | 治理语义自动获得 | `GET /ai/tools`（admin）查 MUT 工具 | 生成 `query`（R1 自动）与 `create`（R3 + requiresConfirmation）注册进治理管线 | 缺治理元数据 → 生成器治理接线缺陷（诊断） |
| **R7** | 未授权拒绝 + 高风险 Gate | ① 无所有权/越权用户调 MUT 写端点或工具；② 本人调 `create` | ① 被拒（403 / 工具内权限拒绝）；② `confirmation_request` 出现，approve 才执行、decline 不执行 | 越权放行或确认缺失 → **治理缺口（诊断，优先）** |
| **R8** | Audit / Evidence | 对已执行动作：① AI 审计哈希链 verify；② evidence-root v3 导出 → 离线验；③ 篡改锚重验 | ① valid；② PASS；③ 篡改后 FAIL（KB-3 同款） | 证据链断 → 证据缺口（诊断） |
| **R9** | Revoke / Compensation 语义 | 对生成模块 AI 写副作用执行撤销；若含外部补偿路径，测失败分支 | 撤销 → 副作用 `revoked`（自身软删，recycle 可恢复）；外部档如实 `governed_external`（"已请求补偿/结果未知"，**禁显示 revoked**，KB-6 同语义）；补偿端点不可达 → `ok:false` 如实（FP-7） | 谎报撤销态 / 补偿吞错 → **口径缺陷（诊断）** |
| **R10** | 重复生成不破坏（重跑边界） | ① 同 spec 重跑；② 手改某生成文件后重跑 | ① 幂等跳过已存在文件、接线不破坏、新文件落位；② 如实输出产品契约（§7），手写文件不受影响 | 破坏声明边界外文件 → 生成器缺陷（诊断） |

## 6. 通过 / 失败判据与出口（最终 PASS/FAIL 判据）

**逐行状态 → 整体判定（无总分）**：

| 卡面 | 结论 | 出口 |
|---|---|---|
| R1-R10 无红（黄仅 R6/边界锚定），且执行者 = 有效 stranger（R2） | **PASS（对外可声明）** | → §internal.6 M1 / 企业试点分叉；或需求驱动重开协议 |
| 任一红行 | **FAIL** | 红行进诊断清单 → §internal.6「基座补强 30%」反推 → 修复后重跑卡 |
| 无红但执行者 = 作者 / R2 不满足 | **内部预跑（待外部验证）** | 不对外声明；正式 PASS 等真实 stranger 卡 |

**及格边界**：场景 A 全绿即 PASS；场景 B 的 T_env 不改变 PASS/FAIL，仅作完整旅程参考。

## 7. 生成代码修改 / 重跑的边界（产品契约，非 merge 承诺）

- 重跑语义 = **幂等跳过 + `--force` 覆盖**：目标文件已存在默认跳过（保留既有实现，含手改），`--force` 覆盖生成文件；接线幂等。
- **手改生成文件后重跑**：不加 `--force` → 该文件跳过（手改保留但不随新 spec 同步）；加 `--force` → 被覆盖（手改丢失）。**这是产品契约，如实记录，不承诺三方合并。**
- **手写文件（非生成清单内）不受重跑影响**——手写复杂逻辑与生成脚手架按文件边界隔离。
- 关联：当前「不建 Diff/Merge Engine」即本边界的可测表述；未来真实需求证明需要合并时重开评估。

## 8. 诚实边界（不承诺清单，进卡即防营销）

- **生成模块治理 = 子集**：生成器缺省只产 query(R1) + create(R3 confirm)；**R2 策略 / R4 双人审批 / analyze 等复杂工具为旗舰级手写**，不在生成承诺内。卡不把这些验为生成产物。
- 「governed by design」作用域 = **生成模块**（且为上述子集），不是"任意应用 / 全套治理"。
- 卡不验证：跨系统 saga / 分布式事务回滚（transactional 仅当目标暴露可回滚接口）、DBA 级信任、不可抵赖存储（与不承诺清单 N-1..N-13 同口径）。

## 9. 现成验证资产映射（T2 编排复用，不重复造）

| 资产 | 位置 | 卡上归属 |
|---|---|---|
| `keelbase-init.mjs` + `.test.mjs` | 仓库根 `scripts/` | R4（生成 + 一致性锁） |
| `verify-golden-crm.mjs` / `verify-golden-application.sh` | 仓库根 `scripts/` | R5（CRM Reference 侧复用） |
| `verify-protocol-conformance.mjs` | `Server-NestJS/scripts/`（node 直跑） | R4 协议合规（既有 22/22 留档） |
| `verify:evidence` / `verify:evidence-root` | `Server-NestJS/package.json` → `verify-evidence.mjs` / `verify-evidence-root.sh` | R8 |
| `verify:trust-proof` | `Server-NestJS/package.json` → `verify-trust-proof.mjs`（含 S7） | R8/R9 |
| agent-benchmark + failure-path corpus / e2e | `scripts/benchmark/` + `src/ai/failure-path/` | R7 补强 / R9 失败路径 |
| `test/evidence-root.e2e-spec.ts` / tool-effects spec | `Server-NestJS/test/` | R8/R9 契约 |

> T2 职责：把这些串成一条陌生可跑命令（`scripts/proof-protocol-trust.*`）输出十行记分卡——T2 起于主仓干净窗口，本规格只定契约不定命令。

## 10. 记录与留档

- 每次跑卡产出记分卡，留档 `Server-NestJS/docs/benchmark/protocol-trust-card-<UTC-ts>.md`（与 protocol-conformance / trust-proof / evidence-root 留档同级）。
- 记分卡含：基线 commit/tag、执行者身份与 R2 有效性、T_read/T_exec（含子段）、R1-R10 逐行状态、红行诊断、资产/命令引用、环境场景（A/B）。
- 卡全绿后由 §6 结论触发出口；任何对外引用该卡时必须带基线 + 执行者档位（防"内部预跑冒充已验证"）。

## 11. 词表闸（转对外叙事前必过，KB-1 纪律）

- 本规格是技术文档，不受市场定位限制；但**据此生成的对外文案**过 KB-1 词表：`可撤销`分档表述（自身软删 / 外部补偿端点如实）；`governed by design` 带作用域（生成模块）；内部 `Trust` → 对外 `Business-safe AI Runtime`；不用「全自动 / 任意应用全套治理 / 100%」类绝对词。市场分段话术不落公开文档。

## 12. 状态 / 变更记录

| 日期 | 变更 | commit |
|---|---|---|
| 2026-09-07 | 规格首版（T1，worktree `feat/protocol-proof-card`） | `652800f6`（并入 master） |
