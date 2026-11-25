# R-6b — 目标驱动释放的缺行措辞（2026-11-25）

Worktree `happy-feistel-269f3a` / 分支 `claude/happy-feistel-269f3a`，自 `main` `379c385f` 起。未推送、未打 tag。

## 改了什么

**`Server-NestJS/src/governance-shared/services/write-claim-decision.service.ts`**

- `recordTargetRelease()`（:312）调用 `_releaseEvidence(claim, { targetAnswered: true })` —— 目标已经答过。
- `_releaseEvidence()`（:348）接收可选 `targetAnswered`；仅当目标驱动且 `lookupCount === 0`（即
  `_recordLookup` 的插入被吞、读数行缺失）时，链外列写 `recorded: false`。计数大于零时不写这个标志：
  `recorded: true` 会替「被旧读数遮住的最新答案」背书。
- `ReleaseEvidence` 增加 `targetAnswered`（:622），只用于选措辞，不进散文、不单独落库。
- `_lookupPhrase()`（:588）新增第三分支：目标驱动且零读数时输出
  `lookup record missing — the target was asked, the lookup row was not recorded`，不再说 `never queried`。
  人工路径不变，零读数仍是 `lookups: none (never queried)`；`askable === false` 的「问不了」分支不变。

**测试**

- `write-claim-decision.service.spec.ts`（:609 起）：新增 `R-6b` 两例 —— 目标驱动、读数表为空
  （`count`/`find` 均为 0）⇒ `detail` 含缺失说明、不含 `never queried`，证据列 `{count:0, askable:true,
  recorded:false, items:[]}`；以及对照用例：人工释放零读数仍是 `never queried`、证据列无 `recorded`。
- `target-status-reconcile.spec.ts`（:80、:387 起）：`build()` 允许覆写查询存储；新增用例走真实
  `reconcileClaim`，令 `_recordLookup` 的 `save` 抛错（被吞）而 `count`/`find` 返回 0，断言决定行同样
  说「记录缺失」、证据列 `recorded: false`。

**文档**

- `CLAUDE.md` §9 释放端点行补 R-6b（中英各一句）；`docs/revoke-contract.spec.md` 目标驱动段补同义说明
  （EN + ZH）。`release_lookups` 内部 JSON 归产出方，未动契约。

## 为什么

`_recordLookup` 的插入失败只告警、不阻断（`ai-tool-effects.service.ts` 的设计：账的移动由目标回答
支撑，不由证据表）。因此目标驱动的决定行可能在 `count = 0` 时仍写着 `origin: target answered …`；
R-6 的三态措辞会把它读成「从未问过」，两句话自相矛盾，而这条决定行会活过占位行。人工释放的零读数是
真的「从未问过」，不能一起改掉。

## 判据如何满足

- 目标驱动 + 证据行缺失：`detail` 不再同时出现「目标答过」与「从未问过」，改用缺失说明；两例（直接
  调用与集成路径）钉住。变异检查：临时移除新分支后两例均转红（直接例的 `detail` 回落为
  `lookups: none (never queried)`）。
- 链外列带同义事实：目标驱动缺行时 `release_lookups` 含 `recorded: false`，与前两态（无 `recorded`、
  `count>0`）可区分；未改 schema。
- 人工路径不受影响：对照用例断言仍是 `never queried`，JSON 仍为 `{count, askable, items}`。
- 未新增审计动作；`claim_release` 闭集不变。

## 命令与读数

- 定向：`npx jest write-claim-decision.service.spec.ts target-status-reconcile.spec.ts` — **47/47**。
- 治理：`npx jest src/governance-shared src/governance-core --runInBand` — **43 套 / 597 例全绿**。
- `npm run build` — 通过；改动文件 `npx eslint` — 0 error。
- `npm run check:all`（带 `KEELBASE_JAVA_REPO=D:/Rain6fish/KeelBase4J`）— **36/36**。
- 契约子模块已在本 worktree 初始化（`Server-NestJS/specs/protocol` → `015f474`）；未初始化时 6 套
  契约向量用例会因缺 schema 文件报 ENOENT，属环境缺失，不是本改动。

## 未做 / 风险

- `count > 0` 但**最新**答案行缺失（旧读数遮住）的情形不在本项范围：此时列仍说「问过 N 次」，不会误报
  `recorded: true`，但也没有标出最新缺行。
- F-123（给 `releaseLookups.items` 每项补读数行 id）仍为遗留。
- 未跑全量 e2e（本项未要求）；未推送、未打 tag、未发版；私库与契约仓未改。
- 并行会话会在同一文件改「拷贝带读数 id + 单次快照」；合并时注意 `_releaseEvidence`、`_lookupPhrase`
  与两份 spec 的相邻改动。
