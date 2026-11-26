# R-2 / R-3 复核 §九 收尾（文档与注释层，2026-11-26）

- worktree `festive-poitras-c5620b` / 分支 `claude/festive-poitras-c5620b`，基于本地 `main` `f45d9655`。
- 范围：`handoff/r2r3-review-1124.md` §九 的 **2 / 3 / 4 / 5** 四条。**§九.1（count=0 措辞矛盾）不在本任务内**，由并发会话处理，本文未碰。
- 改动面：**3 个 Markdown 文件，+32 / −2 行**；**未改任何代码、schema、迁移或契约**。

---

## 逐条

### §九.2 · AI 规格的 AW-17 读面补覆盖声明 —— 已补

- **在哪**：`docs/ai-agent.spec.md:439`（EN 段）与 `:464`（中文段），正是复核指出的两行。
- **做了什么**：复核说「未提 `coverage`」；核实时该句已由 `ebb31a77`（R-2 遗留）补进两段，但只描述了「哪一段没观测」，
  没有点名 `basis` 的**两态**，也没有说清各字段从哪来。本次把同一句改写成：
  - `basis=until-first-lookup`：从 `claimedAt` 到本次首条读数那段完全没有观测，`unobservedSeconds` 是它的长度；
  - `basis=no-lookups-yet`：本次一条读数都没有，自 `claimedAt` 以来全部是未观测窗口；
  - 两种情形都**给出时长、绝不留空**；`observedFrom` 是观测起点（无读数时为 `null`），
    `readingsBeforeClaim` 计入早于本次占位的读数；
  - `expectedFirstAskAfterMinutes` 读自清扫所用的同一份 `CLAIM_RECONCILE_BACKOFF_MINUTES` 计划（默认 60），
    不是写死的字面量 —— 改节奏的部署，声明随之改。
- **为什么**：§11.2「文档伴随代码变更」。核对代码（`write-claim-query.service.ts:291-299`）逐一确认上述字段语义后照实写。
- **EN / ZH 各一处**，各自成段，未混排。

### §九.5 · 两只时钟的口径说明 —— 已写（单处，不重复）

- **在哪**：`docs/revoke-contract.spec.md` §6，EN 段新增一段（`The decision row keeps two clocks apart.`），中文段对应新增一段（`决定行把两只时钟分开。`）。
- **写的是什么**：目标驱动行的 `detail` 里 `origin: target answered … at <queriedAt>` 是查询**发出**的时刻（探针在请求离开前打点，
  `src/ai/proxy/target-status.ts:145`）；`releaseLookups` 每条拷贝的 `at` 是 `ai_target_status_lookups` 行的
  `@CreateDateColumn`，即答案被**记下**的时刻（往返之后）。目标慢时两者可差出数秒，故相减量到的是查询往返耗时，
  **不是**两次观测之间的间隔。要问答案何时记下读拷贝的 `at`；要问问题何时发出读 `detail` 的 `queriedAt`。
- **为什么选这处**：`detail` 与 `releaseLookups` 都是该决定行的字段，契约文档 §6 正是描述这行的地方；任务要求两处只选一处，故未在 AI 规格重复。

### §九.3 · 导出「Initiated by」列为空的边界 —— 已写说明，未改导出代码

- **在哪**：`docs/audit-object-search.spec.md` §2，EN 段新增 `Initiated by, when no request-level actor existed.`，
  中文段新增 `没有请求级发起人时的「发起人」列。`
- **写的是什么**：该列只读行上的 `username` 快照。系统自行做的事（整点清扫代系统再问目标）背后没有请求，
  故 `claim_release` 行带 `userId`（`system:sweep`）却不带 `username`，该列写 **`Not recorded`** —— 那正是行里实际有的东西。
  这不等于「没人发起」：行的 `userId` 与 `detail`（`initiated by: system:sweep (automatic sweep)`）仍点名了它，
  在审计轨迹里都读得到。要让该列自己说出来，需要结构化的发起方来源 —— 与释放种类一样在等契约变更。
- **核对**：`audit-export-vocabulary.ts:244-253` 的 `productInitiatorLabel` 在 `username` 为空时确返回 `Not recorded`；
  `write-claim-decision.service.ts:608-610` 的 `_targetDetail` 当 `automatic` 时写 `system:sweep (automatic sweep)`。
- **为什么不改代码**：任务明确「不改导出代码」；结构化触发来源属契约变更，不在本项。

### §九.4 · 三处单语注释 —— 已补（3 处均改为英文在前、中文在后的双语块）

用户随后要求「现在补改」，三处均已改（行号为改前 HEAD `b1e79039`）：

| # | 文件:行 | 改前 | 改后 |
|---|---|---|---|
| 1 | `Web-Admin-Vue/src/views/ai-tools/AiToolsView.vue:394` | 模板注释仅中文 | 英文块在前、中文块在后（同一注释内两段） |
| 2 | `Web-Admin-Vue/src/views/ai-tools/AiToolsView.vue:862` | 文档注释仅中文 | 同上，JSDoc 内两段，空行分隔 |
| 3 | `Server-NestJS/src/governance-shared/services/write-claim-decision.service.ts:652` | 文档注释仅英文 | 补中文块在后，JSDoc 内两段 |

改后文本：

```
①
      <!-- R-2: the server's coverage statement, computed when the response is built — the stretch before
           the first reading was not observed, and an empty history has observed nothing.
           R-2：覆盖声明（服务端读时现算）—— 首问之前那段没有观测，空历史则全部未观测 -->

②
/**
 * R-2: the server's coverage statement, computed when the response is built; an empty history still
 * has something to say (nothing was observed), so it is stored apart from `items`.
 *
 * R-2：服务端读时现算的覆盖声明；空历史也有话可说（全部未观测），故与 items 分开存。
 */

③
/**
 * The hold fields a release row names. Every release path already holds a full `AiWriteClaim`.
 *
 * 释放行会点名的占位字段。每条释放路径手上本来就有一整条 `AiWriteClaim`。
 */
```

改前先记录过一次并发状态（`epic-lewin-d45f7a`、`happy-feistel-269f3a`、`modest-allen-6396ae`、`quizzical-almeida-1e4dd4`
当时正在这些文件或其紧邻文件上工作）；用户在知悉这一点后要求直接补改，故按最小 hunk（3 处、纯注释）完成，未动任何行为。

---

## 验证读数

| 项 | 结果 |
|---|---|
| `npx tsc -p tsconfig.build.json --noEmit`（Server-NestJS，文档提交后） | **0 错** |
| `npx tsc -p tsconfig.build.json --noEmit`（注释提交后） | **0 错**（`TSC_EXIT=0`） |
| `npx jest src/governance-shared --runInBand`（注释提交后） | **37 套 / 542 例全过**（15.0s） |
| `KEELBASE_JAVA_REPO=D:/Rain6fish/KeelBase4J npm run check:all` | **36/36 全过**（71.9s） |
| `npm run check:terminology`（单跑） | 通过：术语单一真源无违规 |

> `Web-Admin-Vue` 的 `vue-tsc` 未跑：本 worktree 未装该子项目依赖；改动为注释，且已目视确认模板注释
> 闭合（`-->`）与 JSDoc 闭合，不可影响编译。

> 首次 `check:all` 为 34/36，两红是 `check:test-types` / `check:app-wiring`，原因均为本 worktree 未装后端依赖
> （`Server-NestJS/node_modules` 不存在），与本改动无关；`npm ci` 后复跑 36/36。
> 契约子模块已初始化到 `015f474`（`git -c protocol.file.allow=always submodule update --init Server-NestJS/specs/protocol`）。

## 与并发会话的关系

- `modest-allen-6396ae`（F-122 并入主线）同期在 `docs/ai-agent.spec.md:434/459` 与 `docs/revoke-contract.spec.md:616/711`
  加 F-122 的 `not_permitted` 段落；本改动落在 `:439/:464` 与 `:631-638/:728-734`，**段不同**，合并时应可自动合。
- 本会话**未推送、未打 tag、未改私库**；未触碰其它 worktree。

## 未做 / 遗留

1. §九.1（count=0 措辞矛盾）不在本任务内，未碰。
2. 未跑 e2e：本项不涉及行为；治理单测与 `check:all` 已跑。
3. 若并发会话在本分支合入前又改了同一批注释行，按并集保留（三处均为纯注释，语义无第二解）。
