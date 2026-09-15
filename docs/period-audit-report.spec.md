# Period Audit Report（期间审计报告）— 功能规格 (Spec) / Period Audit Report — Functional Specification

> 版本 / Version: v1.0（定稿 / Finalized）
> 日期 / Date: 2026-09-12
> 状态 / Status: **已实现（2026-09-15）** —— `scripts/render-period-report.mjs` + `scripts/lib/period-report-html.mjs`（复用 D-2 渲染件，见 §8/§10-3）
> 归属 / Home: 审计交付物层（**不新增证据事实**，只做聚合/呈现/打包）

> 基于 / Based on：既有 `GET /audit/action-report/export`（admin）产物 `ActionReportExport` —— `keelbase-audit-evidence/2`（report.summary/period/byAction/byDay/hashChain + compliance[] + chain[] + signature）。
> 关联 / Related：D-2 单动作报告 `docs/evidence-report.spec.md`（本报告**逐条链接**到它，不复用其渲染之外的逻辑）｜ evidence-root.spec.md §3/§5/§11 ｜ docs/manual/compliance-mapping.md ｜ 不承诺清单（N-x tamper-evident 边界）｜ roadmap §22.18 D-1

---

## 1. 概述 / 1. Overview

### 1.1 问题 / 1.1 Problem

合规/等保/密评现场要的不是"一条动作的证据"（= D-2），而是**一段期间的审计报告**：审计员问七个问题——**谁 / 何时 / 做了什么 / 为什么 / 凭什么被允许 / 结果如何 / 我能否自己核验**。原料已齐（`/audit/action-report/export` 已产 period/summary/逐样本业务摘要+身份链+授权依据/全量链行/签名），但它是**JSON**，非工程审计员读不了、也无法直接归档签字。

### 1.2 目标 / 1.2 Goal

在**既有导出 JSON** 之上生成**单个自包含 HTML 期间报告**：封面 + 七问摘要 + 趋势 + **逐条动作索引（每条链到该动作的 D-2 单动作报告）** + 链行哈希清单 + 可复现验证步骤。审计员**双击离线打开**即读、可打印/归档、可签字。**不新增端点、不新增账本、不改证据语义。**

### 1.3 非目标 / 1.3 Non-goals

- ❌ 不新增服务端端点（复用 `GET /audit/action-report/export` 产物；报告在**审阅侧**渲染，见 §6 与 D-2 同原则）。
- ❌ 不新增表/列/链/证据来源（**纯聚合呈现**）。
- ❌ 不重复单动作渲染逻辑（复用 D-2 `renderHtml`；本报告只做**索引/摘要/链接**）。
- ❌ 不引 PDF 引擎（PDF 走浏览器打印，见 §10-1）；不做 SM2/时间锚（= D-4/§22.17 ②，另线；若包内有 `signature.sm2` 只显示结构 + 可复制验签命令）。
- ❌ 不承诺「不可篡改」/「不可抵赖」（对齐 N-x）：只如实陈述「链自洽 / 全量重算 PASS / 断链位置 / 明细为样本」。

---

## 2. 范围 / 2. Scope

- 输入 = `ActionReportExport` JSON（`keelbase-audit-evidence/2`）。输出 = 单个自包含 HTML。
- 生成入口（待实现）：`render-period-report`（落在 `verify-evidence.mjs` 的**兄弟脚本**或复用同渲染库；见 §8）。
- **逐条动作**：报告中每个样本动作生成一条索引项，**链接到该动作的 D-2 单动作报告**（由 evidence-root 导出 + D-2 渲染产出；本报告不内联渲染，避免重复逻辑）。
- 兼容 `/2`（本 spec 基线）；未来 `/3` 增字段时报告随字段扩展（缺失段标注"本包无此段"）。

---

## 3. 报告内容 / 3. Report Content（七问 → 段）

单页 HTML，自上而下：

| 段 | 七问 | 来源字段（ActionReportExport） |
|---|---|---|
| **结论 / Verdict** | 可否独立验证 | 报告顶部：`hashChain.valid` + `signature` 验签结果 → `PASS（链完整 + 签名有效）` / `FAIL（断链 @ 行 N）`；`format` 徽标 |
| **封面 / Cover** | 何时 | `period.since/to`、`exportedAt`、`format`、`generator`、包指纹（`chain` 行数 + 末行 hash 摘要） |
| **期间摘要 / Period Summary** | 何时·结果 | `report.summary{executed,approved,rejected,blocked,errors,effects}` 计数卡 + `byDay` 趋势（UTC 日）|
| **动作构成 / By Action** | 做了什么 | `byAction[{action,count}]` 表 |
| **逐条动作索引 / Action Index** | 谁·做了什么·为什么 | `compliance[]`（+ `samples[]`）逐条：`id / action / toolName / businessEvent / summary.sentence / identityChain（谁）/ isError` + **链接 → D-2 单动作报告**（含该动作的授权依据/凭何允许/离线验证）|
| **链行清单 / Chain Manifest** | 可否独立验证 | `chain[]`：逐行 `seq/id/prevHash/hash`；`hashChain{checked,brokenIndex}` 结果；`signature` 覆盖范围声明 |
| **验证步骤 / How to verify yourself** | 可否独立验证 | 常量模板：`node verify-evidence.mjs <export.json> --key …`（整包重算）+ 逐条动作的 D-2 报告离线验；预期输出 |
| **诚实边界 / Honest Limits** | — | 固定声明块（§4，**含"明细为样本"**）|

> **七问落点**：谁=`identityChain`；何时=`period`/`byDay`；做了什么=`samples/businessEvent/toolName`；为什么=`summary.sentence` + D-2 的 Decision Evidence；**凭什么被允许**=链接的 D-2 报告（授权快照/policy revision）；结果=`summary` 计数 + 逐条 `isError`；能否独立验证=`hashChain` + `signature` + `chain` 清单 + D-2 离线验。

---

## 4. 诚实边界（报告内固定声明）/ 4. Honest Limits (fixed notice in report)

- **明细为样本**：`samples/compliance` 受 `limit`（默认 10，最大 50）约束——报告**必须显式标注「明细样本 N（上限 L）/ 期间动作总数 M（来自 summary 计数）」**，不得让样本被误读为全量。需要某动作全量时，用其 D-2 单动作报告。
- **期间完整性**：`period.since` 为空 = 自始至今；报告须如实打印实际期间与导出时刻；`hashChain` 只覆盖**该库当前链**（跨库/跨系统不在内）。
- **哈希链固有**：中段删行/篡改可检；**尾行截断不可检**（需外部锚 = D-4，本报告不含）。
- **签名范围**：`signature` 为 HMAC，覆盖 `summary + hashChain + effectDiffs + compliance + chain + exportedAt`（见导出实现）；报告如实声明"覆盖范围"与"未配密钥时 `signature=null`（无法验签）"。
- **无 `--key` 结构模式**：仅证「包内结构自洽」，**未重算** ≠ 内容未被改。
- 「tamper-evident（应用边界内）」而非「物理不可改」；非「不可抵赖存储」。

---

## 5. 自包含与确定性 / 5. Self-Containment & Determinism

- **零外链**：CSS/JS 全内联；**无** `<link>`/`<script src>`/远程字体/图片外链/`fetch`——离线可开、可 email/U 盘交付、可归档。（**唯一例外**：动作索引到 D-2 报告的**相对链接**——指向同目录 `.html` 文件；缺失时降级为"未附"提示，不影响本报告自身可读。）
- **打开即结论**：无需点击、无需本地服务。
- **i18n（§10-2）**：报告**默认中英并列**（同段中英同框）；`--lang zh|en` 可选覆盖。
- **确定性**：同输入 JSON + 同选项 → 语义一致报告；HTML 顶部注释写 `period` + 末行 hash + 验证模式，便于比对。
- **体积**：单文件；大 `chain` 分页渲染仍单文件。

---

## 6. 端点与交互 / 6. Endpoint, Interaction

- **主路径（审阅侧，推荐）**：管理员 `GET /audit/action-report/export?since=…&limit=…` → 得 JSON → 审阅侧渲染为 HTML（+ 逐条动作的 D-2 报告同目录）→ 交付审计员。报告由**被验物**产出，服务端不进可信链。
- **无新端点**：`/audit/action-report[/export]` 已存在即用；本 spec **不增服务端面**。
- **可选后续（本期不做）**：管理台"导出审计报告"按钮 = 服务端只产 JSON + 前端离线渲染（记后续）。

---

## 7. 验收与测试 / 7. Acceptance & Testing

- **离线渲染**：对样例 `ActionReportExport` JSON → 单文件 HTML；`grep` 断言无 `http(s)://` 外链、无 `<script src`、无 `@import url(`（相对 `.html` 链接除外）；离线打开显示结论。
- **结论正确**：链完整 + 签名有效 → `PASS`；篡改任一 `chain` 行 → 报告 `FAIL` 并**定位行**；`signature=null` → 如实标注"未配密钥，未验签"。
- **样本诚实**：`samples` 数 < summary 计数时，报告显式打印「明细样本 N / 总数 M」；断言该行存在。
- **逐条链接**：每条动作索引含指向 D-2 报告的链接；缺文件时降级提示、本报告仍可读。
- **i18n**：默认中英并列——关键段（结论/期间摘要/边界）中英均齐全。
- **向后兼容 / 确定性**：同输入两次生成关键段一致；`/3` 字段出现时缺失段标注而非崩。
- **无新依赖**：仅 Node 内置（`crypto/fs/path`）。

---

## 8. 文件改动清单 / 8. File Change List

| 文件 | 改动 |
|------|------|
| 报告渲染器（复用 D-2） | 复用 `renderHtml(pkg, verdict, opts)` 的内联 CSS/模板；期间报告 = 其上的**聚合外壳**（索引 + 七问段 + 链接）——避免第二套渲染 |
| 生成入口 | `Server-NestJS/scripts/render-period-report.mjs`（读 `ActionReportExport` JSON → 写单文件 HTML）**或** 并入 D-2 同脚本子命令（实现期定；先复用后抽） |
| 测试 | `node --test`：样例 JSON 渲染断言（无外链 / 结论 / 篡改定位 / 样本标注 / i18n / 逐条链接） |
| 文档 | `docs/evidence/README.md` 加「期间审计报告」一行；本 spec 状态更新 |
| **不改** | 无新端点、无迁移、无新表 |

---

## 9. 关联 / 9. Related

本规格即其设计先行 ｜ **D-2** `docs/evidence-report.spec.md`（单动作报告——本报告逐条链接其产物，并复用其渲染器）｜ evidence-root.spec.md §3/§5/§11 ｜ `GET /audit/action-report[/export]`（原料，admin）｜ roadmap §22.18（D-1；D-3 人读决策说明 可复用于本报告"动作索引"列）｜ docs/manual/compliance-mapping.md ｜ 不承诺清单

---

## 10. 决议（已锁定，2026-09-12）/ 10. Decisions (locked)

1. **导出格式 = 仅 HTML + 打印样式**（PDF 走浏览器「打印为 PDF」）——不引 PDF 引擎、无新依赖。
2. **双语 = 报告内中英并列**（默认，无需 flag）；`--lang zh|en` 为可选单语覆盖。
3. **与 D-2 的边界 = 索引 + 逐条链接**：期间报告做**索引/摘要/链接**；单动作渲染仍由 D-2 **唯一实现**（不内联、不复制），对齐 Code Economy。
