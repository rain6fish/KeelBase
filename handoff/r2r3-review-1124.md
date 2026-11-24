# R-2 / R-3 非作者对抗复核（2026-11-24）

复核人：独立子会话（非 R-2 / R-3 作者）
复核对象：
- **R-2** `4b15b702` — `feat(audit): state the unobserved window on the lookup read surface`
- **R-3** `4920b943` — `feat(audit): give a target-driven release its own decision row`
- 共同基：`2ea7f597`（两提交互为兄弟，文件集不重叠）

判据出处：`KeelBase-Private/KeelBase4TS/roadmap.md` §2.1.34 的 R-2 / R-3 两行（行 1467、1468），
以及其后的两条约束（行 1474「别把 R-2 做成第二个字段」、行 1475「R-3 复用 `claim_release`、不新增闭集动作」）。

方法：在独立 worktree 内 `git checkout --detach <commit>` 跑测试；把实现临时改坏验证测试会红，
跑完 `git checkout -- <file>` 恢复；**未改动主检出、未合并、未提交、未 push**。工作树最终回到原分支
`claude/elegant-morse-ab9d45`（HEAD `892c722c`），只余会话开始时就有的 `M Server-NestJS/specs/protocol`。

---

## 结论速览

| 复核点 | 结论 |
|---|---|
| R-2 判据（3 个子项） | **全部成立** |
| R-3 判据（决定行 / 重占位仍在 / 措辞 / 次数与时间 / 复用动作） | **全部成立** |
| 测试真能红 | **成立**——6 处破坏均转红（见第四节） |
| 假绿 / 放宽 | **未发现**；负断言（`executed` 不写行）经实测为真 |
| 冻结边界 | **未越界**（无迁移、无加列、无排序契约变更、无新动作） |
| Code Economy | **良好**（R-3 真正复用人工释放的构造器；R-2 无过度抽象） |
| 双语与提交格式 | **基本合规**；3 处新增注释单语（轻微，见第八节） |

**总评：两条判据均成立，未发现假绿。下列问题均为低严重度或可选加固，不构成阻断。**

---

## 一、基线与测试结果（复现命令与读数）

均在对应提交的 detached 工作树上执行：

| 测试 | 结果 |
|---|---|
| `npx jest src/governance-shared/services/write-claim-query.service.spec.ts --runInBand`（R-2） | **25 passed** |
| `npx vitest run src/views/ai-tools/__tests__/AiToolsView.spec.ts`（R-2，`npm ci` 后） | **20 passed** |
| `npx jest src/governance-shared/services/target-status-reconcile.spec.ts --runInBand`（R-3） | **23 passed** |
| `npx jest src/app-wiring.spec.ts --runInBand`（R-3） | **3 passed** |
| `npx jest src/governance-shared --runInBand`（防回归，整目录） | **37 suites / 512 passed** |
| `node scripts/check-audit-write-points.mjs`（R-3） | **✓ 通过**：33 个写入点，7 经 `buildToolCallAudit`，15 按理由豁免 |

**未跑**：e2e 全量。按 grep，`Server-NestJS/test/` 无 `reconcile` e2e；唯一的 `claim_release` 断言在
`test/audit-reader-scope.e2e-spec.ts:459-465`，是对**人工释放种子行**的 `findOne`，不涉目标驱动路径，R-3 不影响它。

---

## 二、R-2 判据逐条

判据原文（roadmap §2.1.34，行 1467）：
> 构造「首问距 `claimedAt` 一小时」的占位：读面（或导出）必须**写明首问之前那一小时未观测**；只给一对读数而不给这句声明，判不通过。反向：把默认节奏改成十分钟后首问，声明里的未观测时长随之变短。**不动 schema、不改排序契约**。

### 2.1 首问距 `claimedAt` 一小时 ⇒ 读出那一小时未观测 —— **成立**

- 实现：`Server-NestJS/src/governance-shared/services/write-claim-query.service.ts:247-256` 在读时现算
  `coverage{basis, unobservedSeconds, observedFrom, expectedFirstAskAfterMinutes}`；
  接口定义 `:527-553`，挂到响应 `:572`。
- 用例：`write-claim-query.service.spec.ts:422` 造 `claimedAt=2026-11-01T00:00:00Z`、首问 `01:00:00Z`，
  断言整块 `coverage` 等于
  `{basis:'until-first-lookup', unobservedSeconds:3600, observedFrom:'2026-11-01T01:00:00.000Z', expectedFirstAskAfterMinutes:60}`。
- 控制台把同一事实写成中英双语整句：`Web-Admin-Vue/src/views/ai-tools/AiToolsView.vue:349-351`（渲染）、
  `:762-768`（`lookupCoverageText`）；文案 `src/i18n/en.ts:1212-1216`、`src/i18n/zh.ts:1210-1214`。
- 该句不是「只有一对读数」：既有 `firstLookupAfterWriteSeconds`，又有 `basis` + `unobservedSeconds` 明说
  「首问之前无观测」。**符合判据**。

### 2.2 反向：节奏改十分钟 ⇒ 未观测时长变短 —— **成立（含一处口径说明）**

- 用例：`write-claim-query.service.spec.ts:441`，配置 `CLAIM_RECONCILE_BACKOFF_MINUTES='10,60,600,3600'`、
  首问落在 `+10min`，断言 `unobservedSeconds=600` 且 `expectedFirstAskAfterMinutes=10`。
- 口径说明（非缺陷）：`unobservedSeconds` 由**实际首问记录**算出，配置只影响
  `expectedFirstAskAfterMinutes`。用例同时改配置与首问时刻，正是真实 10 分钟部署会产生的数据形态；
  这比「只改配置就改时长」更诚实——时长描述的是观测事实，不是计划承诺。
- 「不是写死 60」由实测证真：见第四节破坏 A。

### 2.3 零读数时给整段时长 —— **成立**

- `write-claim-query.service.spec.ts:457`：无任何读数 ⇒ `basis='no-lookups-yet'`、`observedFrom=null`、
  `unobservedSeconds` 落在 `[300,310)`（读取时刻参与计算）；`firstLookupAfterWriteSeconds` 仍为 `null`。
- 控制台用例 `AiToolsView.spec.ts:366`：无读数时仍出现「占位以来的 1h 30m 全部未观测」。
- 实测可红：见第四节破坏 B / E。

### 2.4 边界 —— **未越界**

R-2 diff 无实体/迁移文件；未改排序契约；未新增列。新增的是**响应字段** `coverage`（不是 schema/migration）。
`expectedFirstAskAfterMinutes` 取 `claimReconcilePlan(...).backoffMinutes[0]`，与每小时清扫同源
（`write-claim-query.service.ts:255`；共享解析 `governance-core/claim-reconcile-schedule.ts:177-188`，
空表回落默认 `[60,360,1440,4320]`，不会出现 `undefined`）。

---

## 三、R-3 判据逐条

判据原文（roadmap §2.1.34，行 1468）：
> 一次目标驱动的释放后，链上有行读出「谁问、目标答了什么、占位被释放」，且重占位后仍在；行内明确写「已释放可重占位、效果未知」并带询问次数与各读数时间（**不写成「从未发生」**）；**复用 `claim_release` 动作**（不新增闭集动作），`detail` 注明由目标回答触发。

### 3.1 链上有行，读出谁问 / 答了什么 / 被释放 —— **成立**

- 写入点：`ai-tool-effects.service.ts:512-521`，仅在条件更新 `landed` 成功之后、且 `conclusion === NOT_EXECUTED` 时调用。
- 构造器：`write-claim-decision.service.ts:244` `recordTargetRelease` → `:298` `_writeReleaseRow`（唯一写入点）。
- `_targetDetail`（`:366`）产出的 `detail` 实测样例（破坏 D 时的 Received 串）：
  `release write claim #1 (...) → released; origin: target answered not_executed (GET ... at ...);
  initiated by: admin-7 (automatic sweep); lookups: 1 asked (see releaseLookups);
  released for re-claim, effect unknown — the write was attempted; this is a release of the hold, not a finding that nothing happened`
- 用例 `target-status-reconcile.spec.ts:288` 逐项断言：`→ released`、`origin: target answered not_executed`、
  目标答的时刻、`initiated by: system:sweep (automatic sweep)`、`lookups: 1 asked (see releaseLookups)`、
  `released for re-claim, effect unknown`、`the write was attempted`；并断言行 `userId=system:sweep`、
  `tool`、`source='claim_release'`、`outcome` 为 `null`。

### 3.2 重占位后仍在 —— **成立**

- 用例 `target-status-reconcile.spec.ts:331`：目标答 `not_executed` 释放后，用 `WriteClaimStore.claimWrite`
  重占位；断言占位行回到 `claimed`、`releaseReason` 清空、`attempts=2`，而 `claim_release` 行仍为 1 条且
  `detail` 仍含 `origin: target answered not_executed`。这正是「决定不能只存在占位行」的反证。

### 3.3 措辞「已释放可重占位、效果未知」，不读成「从未发生」 —— **成立**

- `_targetDetail` 明写 `released for re-claim, effect unknown` 与
  `the write was attempted; ... not a finding that nothing happened`；用例 `:288` 有对应断言。

### 3.4 带询问次数与各读数时间 —— **成立（附一处口径观察，见 5.3）**

- 次数：散文 `lookups: N asked (see releaseLookups)`（`_lookupPhrase`，`write-claim-decision.service.ts:390`）。
- 各读数时间：链外列 `releaseLookups`（`_releaseEvidence`，`:263`）的 `items[].at`；用例 `:288` 解析该列，
  断言 `count=1`、`items[0].conclusion='not_executed'`、`items[0].lookedUpBy='system:sweep'`、`at` 可解析。
- 注意：用例对 `at` 只验「可解析」，未与 `queriedAt` 对齐——这是**正确**的，因为两者本是两只时钟（见 5.3）。

### 3.5 复用 `claim_release`、不新增动作 —— **成立**

- 全仓新动作串扫描：两提交新增的动作串只有 `'claim_release'`；`grep claim_reconcile|claim_released` 为 0。
- `claim_release` 在闭集 `audit.service.ts:28`，且 `write-claim-decision.service.ts:298` 的 `_writeReleaseRow`
  是人工与目标驱动**同一个**写入点（`source: 'claim_release'` 保留）。人工路径 `release()` 的「先取证据、
  后条件更新、再写审计」顺序未被改坏（`:167` 证据在更新前；`:198` 审计在更新后）。

### 3.6 `executed` 不写行、人工与自动措辞区分 —— **成立**

- 负断言 `target-status-reconcile.spec.ts:359`（executed ⇒ 0 行）实测为真：见第四节破坏 G。
- 措辞 `:369`（人工 ⇒ `user admin-7 (manual reconcile)` 且不含 `automatic sweep`）实测为真：见破坏 D。
- 装配断言 `app-wiring.spec.ts:100`（应用进程注入的是 `WriteClaimDecisionService` 同一实例）与 `:132-134`
  （治理进程按设计缺席）。`@Optional()` 的理由与探针一致，治理进程无探针 ⇒ 永不落目标驱动释放。

---

## 四、测试真能红（破坏实测）

每次只改实现、不动测试；跑完即 `git checkout -- <file>` 恢复。

| 编号 | 改了什么 | 红在哪个用例 | 关键输出 |
|---|---|---|---|
| **A** | R-2 `write-claim-query.service.ts:255` 把 `expectedFirstAskAfterMinutes` 写死为 `60` | `R-2 **反向**：计划改成十分钟后首问…` | `Tests: 1 failed, 24 passed` |
| **B** | R-2 `:248` `basis` 恒为 `'until-first-lookup'`、`unobservedSeconds` 无读数回落 0 | `R-2：一条读数都没有…` | `Expected: "no-lookups-yet" / Received: "until-first-lookup"` |
| **C** | R-3 `ai-tool-effects.service.ts:512` 条件加 `&& false`（不写行） | 3 条：`not_executed ⇒ 链上一行`、`重占位…仍在`、`人工发起…detail` | `Expected length: 1 / Received length: 0` |
| **D** | R-3 `:515` `automatic: true`（发起方写死） | `人工发起的对账 ⇒ detail 区分…` | `Received: "initiated by: admin-7 (automatic sweep)"` |
| **E** | R-2 前端 `AiToolsView.vue:765` 忽略 `basis`，恒用 `lookupCoverageGap` | `R-2：无读数时声明「占位以来全部未观测」` | `expected '…' to contain '还没有任何读数'` |
| **G** | R-3 `:512` 让 `EXECUTED` 也进入写行分支（`|| EXECUTED`，带类型断言） | `目标答 executed ⇒ 走 settle，不写释放行` | `Expected length: 0 / Received length: 1` |

另记一条**方法论旁注**：最初尝试的破坏 F（把 `=== NOT_EXECUTED` 改成 `!== EXECUTED`）**没有转红**，
因为 `UNKNOWN` 在更早的分支已 return，TS 又把 `conclusion` 收窄为 `'not_executed'`——该改写与原文**语义等价**，
不是测试空转。真正让 `executed` 写行的是破坏 G。

结论：**关键断言不是空转**；正断言（A/B/C/E）、负断言（G）、区分性断言（D）均能被真实回归触发。

---

## 五、假绿 / 放宽检查

### 5.1 未发现「存在即可」式的弱断言

R-3 对 `detail` 是逐短语 `toContain`（谁发起、目标答案、释放措辞、可重占位、效果未知、非「从未发生」），
对 `releaseLookups` 是解析后逐字段断言；对 `claim_release` 行数用**精确长度**（0 / 1），不是「有就行」。
R-2 对整块 `coverage` 用 `toEqual`，不是逐字段抽查。

### 5.2 未发现用固定值绕开时区/时钟

- R-2 用固定 `claimedAt`/首问时刻得到 `3600` / `600`，是**构造输入**的正常做法。
- 零读数用例用 `Date.now()-300_000` 并断言 `[300,310)` 窄窗，确实让读取时刻参与计算；未写死一个常数。
- R-3 的 `queriedAt` 由探针桩给出，断言其 ISO 串原样出现在 `detail`；未用「现在」蒙混。

### 5.3 未发现把 `unknown` 当 `not_executed` 读

代码结构上 `UNKNOWN` 在 `ai-tool-effects.service.ts:440-447` 提前 `return unresolved`，到不了写行分支；
只有 `NOT_EXECUTED` 会写。`executed` 不写的负断言已实测为真（破坏 G）。**判定：无此假绿。**

### 5.4 一处口径观察（非缺陷）

`detail` 里的 `queriedAt` 是**探针报的查询时刻**；`releaseLookups.items[].at` 是
`target-status-lookup.entity.ts` 的 `@CreateDateColumn`（**入库时刻**）。两者通常只差毫秒，
但严格说是两只时钟，行内未标注哪个是哪个。用例没有强行把二者对齐，这一点是诚实的。
若日后有人拿 `detail` 的 `at` 与 `releaseLookups` 的 `at` 做算术，可能读出一段并不存在的偏差——
与 F-85c「别把间隔读成覆盖」同族的风险。建议（可选）：`detail` 写 `recorded at` 或说明两处时钟口径。

---

## 六、冻结边界

| 检查项 | 结果 |
|---|---|
| 新增迁移文件 | **无**（两提交均无 `migrations/` 变更） |
| 新增列 | **无**（未触及实体） |
| 改排序契约 | **无**（`coverage` 是加性响应字段，未动 `ordering`） |
| 新增审计动作 | **无**（只复用 `claim_release`；`audit.service.ts:28` 闭集未扩） |
| 审计写入点门禁 | `check-audit-write-points.mjs` ✓（33 点 / 7 `buildToolCallAudit` / 15 豁免；豁免理由已改为「人工或目标驱动共用此写入点」） |

R-2 的 `coverage` 是**响应字段**而非表列，符合 roadmap 行 1474「别把 R-2 做成第二个字段」的本意（不加列）。

---

## 七、Code Economy

- **R-3 真正复用人工释放的构造器**：`_writeReleaseRow`（`write-claim-decision.service.ts:298`）是
  `claim_release` 行的**唯一**写入点，人工 `release()` 与目标驱动 `recordTargetRelease()` 都走它；
  证据读取 `_releaseEvidence`（`:263`）与次数措辞 `_lookupPhrase`（`:390`）也各只一份。
  没有复制第二份 `auditService.log(...)` 调用。`check-audit-write-points` 点数未增，佐证未长第二写入点。
- **R-2 无过度抽象**：只加一个 `ClaimLookupCoverage` 接口 + 一处读时现算对象 + 一个渲染函数；
  未为单一用例造 Factory/Strategy/Adapter。控制台把「措辞」与「时长」分开（时长来自服务端，措辞在前端本地化），
  边界清楚。

---

## 八、双语与提交格式

- **提交消息**：两笔均为「标题（可混排）+ 英文整段 + 空行 + 中文整段」；`grep -i co-authored|signed-off` 为**空**。
  符合 §14.5 与用户级规范。
- **新增文档**：`docs/revoke-contract.spec.md` 的英文段在前、中文段在后，两整块；R-3 已同步该契约文档。
- **新增代码注释**：主体均为英文块 → 中文块。但发现 **3 处单语注释**（轻微，建议后续补另一语言即可）：

  | 文件:行 | 问题 |
  |---|---|
  | `Web-Admin-Vue/src/views/ai-tools/AiToolsView.vue:349`（R-2） | 模板注释仅中文 |
  | `Web-Admin-Vue/src/views/ai-tools/AiToolsView.vue:752`（R-2） | 文档注释仅中文 |
  | `Server-NestJS/src/governance-shared/services/write-claim-decision.service.ts:397`（R-3） | 文档注释仅英文（`ReleaseClaimRef`） |

  注：`AiToolsView.vue` 存量模板注释本就以中文为主，这两处沿袭了本地风格，但按「新写注释须双语」的规则仍属不合规。

---

## 九、发现的问题（按严重度排序，均为低，且不阻断）

1. **【低｜潜在自相矛盾】** 目标驱动释放行在 `lookupCount=0` 时会同时说「目标答了」与「从未查询」。
   `_targetDetail` 无条件写 `origin: target answered not_executed …`，而次数走 `_lookupPhrase(0)` 会输出
   `lookups: none (never queried)`。正常装配下 `_recordLookup` 先插一行，count≥1；但若**有探针、无 lookupsRepo**
   的手工装配，或 `_recordLookup` 的插入因 DB 瞬时错误被其 `catch` 吞掉（`ai-tool-effects.service.ts:724-751`
   只 `logger.warn`），行内就会自相矛盾。建议：目标驱动分支不要使用「never queried」措辞，或在 count=0 时
   改用「not recorded」并点明与 `origin` 的关系。

2. **【低｜文档漂移】** R-2 只更新了 `CLAUDE.md` 的端点行，未同步 `docs/ai-agent.spec.md:439/464`
   对 `/claims/:id/lookups` 读面的散文描述（该处描述了返回的结论/成因/时刻/发起人等，但未提 `coverage`）。
   R-3 则正确地同步了 `docs/revoke-contract.spec.md`。建议按 §11.2 给 AI 规格补一句覆盖声明。

3. **【低｜导出标签降级】** 自动清扫写下的 `claim_release` 行 `username` 为空（cron 无请求级 actor 上下文，
   `_writeReleaseRow` 传 `username: undefined`，`AuditService.log` 回落 `actorContext` 也为空）。
   `audit-export-vocabulary.ts:244-253` 的「Initiated by」列只读 `username` ⇒ 该列显示 `Not recorded`，
   而 `detail` 与行 `userId` 写明 `system:sweep`。这不是错误陈述（它说「未记录」而非错标成人），
   属 F-97/F-100 已登记「detail 可读但非机器可筛」的已知边界；若要导出也能读出，需结构化触发来源（触契约）。

4. **【轻微｜注释单语】** 第八节列出的 3 处新增注释未按双语块书写。

5. **【轻微｜可读性】** `detail` 的 `queriedAt` 与 `releaseLookups[].at` 是两只时钟（探针报时 vs 入库时刻），
   行内未区分口径（见 5.4）。不影响判据。

---

## 十、复核结论

- **R-2 判据：成立。** 首问距占位一小时能从读面读出「那一小时未观测」；节奏改十分钟后声明随之变短；
  零读数给整段时长而非留空；未加列/迁移/改排序。
- **R-3 判据：成立。** 目标驱动释放落一条 `claim_release` 决定行，读出谁发起、目标答了什么、
  已释放可重占位、效果仍未知、询问次数与各读数时间；重占位抹不掉它；复用既有动作与同一构造器；
  `executed` 不写、人工/自动措辞可区分。
- **无假绿。** 6 处实现破坏均在预期用例转红（含一处负断言）；断言不是「存在即可」。
- **建议合并。** 第九节 1–5 属低severity/可选加固，其中第 1 条（`never queried` 措辞）最值得顺手收口，
  其余可留作后续。
