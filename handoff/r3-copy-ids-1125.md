# R-3 follow-up — resolvable copy, one snapshot (2026-11-25) / R-3 后续 · 拷贝可解析、单快照（2026-11-25）

Worktree `quizzical-almeida-1e4dd4`, branch `claude/quizzical-almeida-1e4dd4`, based on `379c385f` (main,
R-2…R-6 already in). Not pushed / 未推送。

## What changed / 改了什么

**`Server-NestJS/src/governance-shared/services/write-claim-decision.service.ts`**

- `_releaseEvidence`（约 340–420 行）：
  - `items[]` 每项**新增 `id`**（`ai_target_status_lookups.id`），与 `at / conclusion / reason /
    lookedUpBy` 并列 —— 决定行由此解析回它引用的读数行（F-123 / F-124）。
  - `count` 与最近三条改为**一条语句**：`createQueryBuilder(...).addSelect('COUNT(*) OVER ()', 'total')
    ... .limit(3).getRawAndEntities()`。窗口计数在 `LIMIT` 之前求值 ⇒ `total` 覆盖全集、行是最新尾部，
    两者出自同一结果集（F-127）。不再 `count()` + `find({take})` 两次读。
  - 计数跨方言：SQLite 返回数字、Postgres 返回 bigint 字符串，统一 `Number(...)`；零行时为 0。
  - `latestLookupId` 语义补充：它就是拷贝条目里的**水位**（最新一条的 id；更大的 id = 决定之后写入）。
- 注释块（英文在前、中文在后）：写明拷贝是**边界而非历史**、只装观测字段、一致性依赖读数表**仅追加**
  （若日后加保留期，被引用的行须保留，否则 id 悬空）—— F-125 / F-126 / F-127 的书面约定。

**`.../write-claim-decision.service.spec.ts`** —— 新增 `R-3 后续（F-123–F-127）` 三条用例；DataSource 加
`logging` + 记录型 logger 以便对 SQL 本身断言；「证据读取失败」用例的假仓储从 `count` 改为
`createQueryBuilder` 抛错。

**`.../target-status-reconcile.spec.ts`** —— 目标驱动释放的既有断言补一条：`items[0].id` 等于源行 id。

**`.../entities/ai-audit-log.entity.ts`** —— `releaseLookups` 的 JSDoc 形状更新为
`{count, askable, items:[{id, at, conclusion, reason, lookedUpBy}]}`（中英）。

**文档** —— `docs/revoke-contract.spec.md` §6 新增一段（EN + ZH，英文在前）说明 id / 单快照 / 水位 /
仅追加；同节两处字段列表补 `id`。`CLAUDE.md` §9 释放端点行：JSON 形状补 `id`，并追加
`R-3 follow-up (F-123–F-127)` 的英文段 + 中文段。

**契约** —— 未改。`releaseLookups` 在 `ai-audit-log-row` v8 里是不透明 JSON 文本，其内部结构由
`ai-audit-log-release-evidence-v1-vector.json` 明确留给产出方；加 `id` 属产出方加性字段。
`check:contract-release-gate` 与 `generate-protocol-vectors --check` 均绿。未新增审计动作。

## 判据怎么满足的 / How each F is met

- **F-123 / F-124（可解析）**：`items[]` 每项带源行 `id`；用例逐条按 id 回表，断言拷贝与源行逐字段相等，
  顺序仍是最近在前。目标驱动的释放路径另有断言（两条路径共用同一 `_releaseEvidence`）。
- **F-125（拷贝不得含派生字段）**：用例对每条拷贝断言键集恰为
  `[at, conclusion, id, lookedUpBy, reason]`，顶层恰为 `[askable, count, items]` —— 多一个字段即红。
- **F-126（仅追加依赖）**：无法用运行时断言（这是「不存在 update/delete/保留期」的负向事实），
  按要求写进代码注释与 spec：若日后加保留期，被引用的行须保留，否则 id 悬空。
- **F-127（单快照 + 水位）**：用例在记录型 logger 上断言释放期间只有**一条** SELECT 命中
  `ai_target_status_lookups`，且该语句含 `COUNT(*) OVER ()`；另断言 5 条读数时 `count=5`、`items` 为
  最新 3 条（同一集合的尾部）；水位用例：决定之后写入的读数 id 更大、决定行一字不改。
- **不重试凑**：实现里没有重读/重试分支。

## 读数 / Readings

- 定向 `write-claim-decision.service.spec.ts`：**24/24**。
- `target-status-reconcile.spec.ts`：**23/23**。
- `src/governance-shared src/governance-core`：**43 套 / 597 例全绿**。
- `stale-view-release` e2e（`test/jest-e2e.json`）：**4/4**；`src/app-wiring.spec.ts`：**3/3**。
- `tsc -p tsconfig.build.json --noEmit`：0 错；改动文件 eslint：0 error。
- `check:contract-release-gate`：PASS（C1–C5）；`generate-protocol-vectors --check`：全一致。
- `npm run check:all`：`KEELBASE_JAVA_REPO=D:/Rain6fish/KeelBase4J` ⇒ **36/36 全过（59.5s）**。
  不带该变量时两条 Java 门禁红（`check:coverage-gaps`、`check:java-vectors`，本 worktree 旁无同级
  Java 检出），指到真实仓后两条均绿。
- 首轮 `check:all` 曾有一条真红：`check:terminology` 拦下英文段里的 `append-only`（该词在本仓是对
  审计链的过度承诺表述）。已把英文改为「the lookup table only ever gains rows」；改后该门绿。

## 未做 / 风险

- **契约向量未新增 `id` 示例**：向量刻意不规定该 JSON 的内部结构，本次未改契约仓（也未动 submodule pin）。
- **`docs/revoke-contract.spec.md` 里 `lookups: N asked, newest first (k of N)` 与实现的
  `lookups: N asked (see releaseLookups)` 不一致**：属既有漂移，不在本项范围、未改（另一会话在同文件
  改零读数措辞，保持改动最小）。
- **水位只在「读数表 id 单调、不重号」时成立**：SQLite AUTOINCREMENT 与 Postgres sequence 都满足；
  若日后重建表/导入历史行需保持这一点。
- 与并行会话的重叠：同改 `write-claim-decision.service.ts`（对方改「目标驱动 count=0 的措辞」），
  合并时注意该文件与其 spec。

## 并入 main / Merged into main（2026-11-25）

- 合并提交 **`e8640dbe`**（`Merge R-3 copy ids`），基于 main `77fb432c`；分支上另有 `75907b39`
  （把 main 合入本分支的合并）与 `861429ba`（basis select 修复）。**未推送**。
- 与 R-1 的冲突全按并集解：`items` 现为 `{id, at, conclusion, reason, basis, lookedUpBy}`；
  `_releaseEvidence` 的窗口查询同时 `addSelect('lookup.basis')`。合并暴露出一处漏选列的缺陷 ——
  选择性 QueryBuilder 只填被选中的列，漏 `basis` 会把每条拷贝静默写成 `unknown` —— 已修，并用一条
  `basis: 'receipt'` 的种子读数把它钉住。
- 合并后 **main 上**复跑：`write-claim-decision` + `target-status-reconcile` **49/49**；
  `tsc -p tsconfig.build.json --noEmit` 0 错；
  `KEELBASE_JAVA_REPO=D:/Rain6fish/KeelBase4J npm run check:all` ⇒ **36/36 全过（47.4s）**。
