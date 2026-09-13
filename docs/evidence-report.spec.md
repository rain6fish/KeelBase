# Evidence Report Export（自包含证据报告导出）— 功能规格 (Spec) / Evidence Report Export — Functional Specification

> 版本 / Version: v1.0（定稿 / Finalized）
> 日期 / Date: 2026-09-12
> 状态 / Status: **定稿（设计先行）** —— 落地在 1.1 后（对齐 roadmap §22.18 D-2）；三项开口问题已决议（见 §10）
> 归属 / Home: 审计交付物层（**不新增证据事实**，只做呈现/打包）

> 基于 / Based on：证据根 v3（`keelbase-audit-evidence/3`）— docs/evidence-root.spec.md；离线验证器 `Server-NestJS/scripts/verify-evidence.mjs`（结构 / `--key` 全量两模式）。
> Related: docs/evidence-root.spec.md §3/§5/§11 ｜ docs/evidence/README.md ｜ docs/ai-action-center.spec.md ｜ docs/manual/compliance-mapping.md ｜ 不承诺清单（N-x tamper-evident 边界）｜ roadmap §22.18 D-2

---

## 1. 概述 / 1. Overview

### 1.1 问题 / 1.1 Problem

证据根 v3 是**机器可验**的（JSON + 离线验签脚本），但**审计员（合规/等保/密评现场，非工程师）读不了**：他们要打开一个文件就看到「结论 + 凭什么 + 逐条可核 + 自己能照做」，而不是跑 Node、读 64 位 hex。「独立于 KeelBase 也能验」目前只在**工程师路径**上成立。

### 1.2 目标 / 1.2 Goal

给 `verify-evidence.mjs` 加**自包含报告导出**：由**证据包 JSON** 生成**单个 HTML 文件**（内联全部样式/脚本，无外链、无网络），审计员**双击离线打开即见结论 + 逐条证据 + 验证步骤**；JSON/CLI 路径不变。报告由**审计员侧从被验物**产出（不依赖服务端信任）。

### 1.3 非目标 / 1.3 Non-goals

- ❌ 不改证据链/哈希语义、不新增表或列、不新增证据来源（**纯呈现层**；见 §2）。
- ❌ 不新增导出端点（复用既有 `GET /ai/governance/evidence-root/:resultType/:resultId` 产物）。
- ❌ 不引重型 PDF 引擎（PDF 走浏览器「打印为 PDF」+ 打印样式表；不依赖 puppeteer/wkhtmltopdf）。
- ❌ 不做 SM2/时间锚（= roadmap §22.18 D-4 / evidence-root.spec §11，另线）；若包内已有 `signature.sm2`，本报告**只显示结构 + 可复制验签命令**，不代验。
- ❌ 不承诺「不可篡改」（对齐 N-x）：报告只如实陈述「结构自洽 / 全量重算 PASS / 断链位置」。

---

## 2. 范围 / 2. Scope

- `verify-evidence.mjs` 增 `--format=json|html`（默认 `json`，**向后兼容**）；`--format=html [--out <file>]` 由证据包 JSON 生成自包含 HTML 报告。
- 支持 `keelbase-audit-evidence/1|2|3`（v1/v2 全链报告、v3 逐动作证据根报告；沿用既有两模式：无 `--key` 结构验证 / `--key` 全量重算）。
- 报告**内嵌验证结果**（同一次运行的判定），故审阅者无需再跑脚本即可看到结论与依据。
- **不新增端点、不改集合装配、不改协议**。

---

## 3. 报告内容 / 3. Report Content

单页 HTML，自上而下（缺失段自动省略并标注「本包无此段」）：

| 段 | 来源字段（v3） | 呈现 |
|---|---|---|
| **结论 / Verdict** | 本次验证结果 | 顶部大字：`PASS（结构自洽）` / `PASS（全量重算 + 验签）` / `FAIL（断链 @ 行 N）`；模式徽标（结构 vs `--key`） |
| **封面 / Cover** | `action.id`（AUDIT-ID `resultType:resultId`）、`exportedAt`、`format` | 标题 + 元数据表（业务对象、导出时间、包格式、生成器） |
| **摘要 / Summary** | `summary.sentence` / `summary.stats` | 一段业务人读摘要 + 关键计数 |
| **授权依据 / Authorization** | `authorization.allowed{checks,riskLevel,policy{revision,updatedAt}}`；`denied` | 「凭什么允许」：角色/行级范围/策略版本（revision + updatedAt）；denied 则显示拒绝依据 |
| **决策 / Decision** | `decision.businessEvent`、`decision.evidence` | 业务事件 + 决策说明（人读） |
| **副作用 / Effect** | `effect{toolName,before,after}` | 改了什么（before→after 摘要）；`revoked` 由 B4/Action Center 承担（本包不重复，如实标注） |
| **链行清单 / Chain rows** | `chains.aiAudit[]`、`chains.operationAudit[]` | 逐行表：`seq / id / prevHash / hash / 校验结果`；`segmentGap` 段显式标注「未含上一行→未做连续性校验」 |
| **根锚 / Root** | `root.anchors[]`、`root.digest` | 锚表（kind/rowId/hash）+ digest 复算结果（PASS/FAIL） |
| **签名 / Signature** | `signature`（HMAC 字符串 / SM2 对象） | HMAC 验签结果；若 `signature.sm2` 存在：显示 alg/encoding/publicKey 结构 + **可复制**的 `--sm2-pubkey` 验签命令（不代验） |
| **验证步骤 / How to verify yourself** | 常量模板（随模式） | 照做清单：`node verify-evidence.mjs <pkg.json> [--key …]` + 预期输出；SM2 存在时附验签命令 |
| **诚实边界 / Honest limits** | 常量（见 §4） | 固定声明块（模式相关） |

---

## 4. 诚实边界（报告内固定声明）/ 4. Honest Limits (fixed notice in report)

随验证模式输出，措辞对齐不承诺清单 N-x：

- **无 `--key`（结构模式）**：仅证「包内结构自洽（哈希 64hex / 锚齐 / digest 可复算）」；**未做重算，不等于内容未被改**。
- **有 `--key`（全量模式）**：逐行重算 + 根锚 + 整包 HMAC 验证；任一链行/锚/digest 被改 → FAIL 并定位到行。
- **哈希链固有**：中段删行/篡改可检；**尾行截断不可检**（需外部锚 = §22.18 D-4，本报告不含）。
- **副作用锚**：side-effect 无链，靠「自洽摘要 + 整包签名」（evidence-root.spec §5.4）；防删除/防插入由 AI 审计链 + 包签名共同覆盖。
- 「tamper-evident（应用边界内）」而非「物理不可改」。

---

## 5. 自包含与确定性 / 5. Self-Containment & Determinism

- **零外链**：CSS/JS 全内联；**无** `<link>`/`<script src>`/远程字体/图片外链/`fetch`/`XMLHttpRequest`——离线可开、可 email/U 盘/U 盘交付、可归档。
- **打开即结论**：无需点击、无需本地服务；结论与逐行结果直接渲染。
- **i18n（已决议 §10-2）**：报告**默认中英并列**（同段中英同框，审计现场一次交付两版，避免语言切换）；`--lang zh|en` 为**可选**覆盖（仅出单语）。措辞对齐 docs/manual/product-language.md。
- **确定性**：同一输入 JSON + 同选项 → 生成**语义一致**的报告（用于归档/可比对）；HTML 顶部注释写入 `pkg.root.digest` 与验证模式，便于比对。
- **体积**：单文件；大包（多链行）分页渲染，仍单文件。

---

## 6. 端点 / 交互与文件 / 6. Endpoint, Interaction & Files

- **主路径（审计员侧，推荐）**：审计员持有证据包 JSON → `node scripts/verify-evidence.mjs <pkg.json> [--key …] --format=html --out report.html` → 双击 `report.html`。报告由**被验物**产出，不引入服务端信任。
- **可选（便捷，非必须）**：管理台/证据面「导出证据根」旁加「导出报告」按钮——**服务端仍只产 v3 JSON**，报告生成仍在客户端/审阅侧（避免服务端成为报告可信链的一环）。本期**不做**该按钮（记为后续可选项）。
- CLI 兼容：不加 `--format` 时行为与现状完全一致（stdout 文本报告 + `docs/benchmark/evidence-verify-<ts>.json/.md`）。

---

## 7. 验收与测试 / 7. Acceptance & Testing

- **离线渲染**：对 v3 样例包 `--format=html` → 生成单文件；`grep` 断言无 `http(s)://` 外链、无 `<script src`、无 `@import url(`；浏览器离线打开显示结论。
- **结论正确**：`--key` 正确键 → 报告结论 `PASS（全量）`；错误键 → `FAIL`；篡改任一链行 payload → 报告**定位到该行** `FAIL`；撬 `root.anchors` 之一 → `digest` FAIL。
- **诚实标注**：无 `--key` 时报告含「未重算」声明；`segmentGap` 行显式标注；尾截断边界声明在案。
- **向后兼容**：`/1` `/2` 包同样可出 HTML；不加 `--format` 时旧行为不变（快照断言 stdout 同）。
- **i18n**：默认报告中英**并列**——断言关键段落（结论/授权/边界）**中英均齐全**；`--lang zh|en` 覆盖时只出该语。
- **确定性**：同输入两次生成，关键段（结论/行结果/digest）一致。
- **无新依赖**：仅用 Node 内置（`crypto/fs/path`）——不引模板/PDF 库（HTML 用字符串模板 + 内联 CSS）。

---

## 8. 文件改动清单 / 8. File Change List

| 文件 | 改动 |
|------|------|
| `Server-NestJS/scripts/verify-evidence.mjs` | 加 `--format=html` / `--lang` / `--out`；抽 `renderHtml(pkg, verdict, opts)`（内联 CSS + 字符串模板）；默认 `json` 行为不变 |
| （可选）`Server-NestJS/scripts/lib/evidence-report-html.mjs` | 报告渲染器（若 verify-evidence.mjs 过长再抽）——**先内联，超 ~300 行再拆** |
| 测试 | `node --test` 样例包：渲染断言（无外链 / 结论 / 篡改定位 / i18n） |
| 文档 | `docs/evidence/README.md` 加「HTML 报告」一行；本 spec 状态更新 |

---

## 9. 关联 / 9. Related

本规格即其设计先行 ｜ evidence-root.spec.md §3（v3 Schema）/§5（离线验证语义）/§11（SM2·时间锚 = D-4）｜ roadmap §22.18（D-1 期间审计报告 消费本报告的逐动作产物；D-3 人读决策说明 可复用于本报告「授权/决策」段）｜ docs/manual/compliance-mapping.md（证据 → 等保/密评控制项）｜ 不承诺清单（诚实边界措辞）

---

## 10. 决议（已锁定，2026-09-12）/ 10. Decisions (locked)

1. **导出格式 = 仅 HTML + 打印样式**（PDF 走浏览器「打印为 PDF」）——不引 PDF 引擎、无新依赖、跨平台。硬要原生 PDF 时再单评（依赖成本 ↑）。
2. **双语 = 报告内中英并列**（默认，无需 flag）；`--lang zh|en` 为**可选单语覆盖**。
3. **D-1 复用 = 索引 + 逐条链接**：D-1（期间报告）生成**索引 + 链接**指向各单动作报告；单动作渲染仍由本报告**唯一实现**，避免重复渲染逻辑（对齐 Code Economy）。
