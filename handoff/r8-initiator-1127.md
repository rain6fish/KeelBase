# R-8：到期行的发起人读作「自动」，行仍留在操作人本人范围内（2026-11-27）

- worktree `distracted-hypatia-d46369` / 分支 `claude/distracted-hypatia-d46369`，基于本地 `main` `17b23296`。
- 未推送、未打 tag、未动私库 `KeelBase-Private`、未改契约仓（子模块仍 pin `015f474`）、**零 schema / 列 / 迁移**。

## 缺口

`expireStaleConfirmations` 在离线窗口到期时为每条未裁决的确认写一行
`action='tool_confirmation'`、`outcome='timeout'`，归属 `userId = row.operatorId` 并带操作人用户名快照。
导出词表的 `productInitiatorLabel` 只按「有姓名 + 动作不在 HUMAN_ONLY_ACTIONS」判断，于是这一行被印成
`姓名（经 AI 助手）` —— 而这件事没有人在场做过。

写 `system:sweep` 的 `userId` 是错的解法：`userId` 同时是审计读侧的行谓词
（`audit-reader-scope.ts`），系统账号会让这一行从操作人本人的轨迹里消失。

## 修法（最小、零 schema）

1. **写入侧**：`_recordExpiries` 在原有的 `userId`/`username` 之外写 `source: AUTOMATION_SOURCE`
   （`'automation'`）。契约里 `source` 是 `["string", "null"]` 自由文本（`schemas/v1..v8/ai-audit-log-row`），
   故不需要迁移；语义正是 AU-6 的「入口来源」—— 这一行没有请求，来自自动化。
2. **词表**：`AUTOMATION_SOURCE` 由写入方 import（单源，两侧不会在拼写上漂开）；
   `productInitiatorLabel` **先看频道**，命中即答 `Automated`，再不读姓名。
   裁决只认声明：`source` 缺席或为 `web` 等请求频道时，仍按原来的读法（姓名即发起人）。
3. **调用点**：`AuditAnswersService._answer` 把 `row.source` 传给词表（该字段本就在
   `AiAuditLogWithUser` 与 `AUDIT_READER_ROW_FIELDS` 白名单里）。
4. **文档**：`docs/audit-object-search.spec.md` 的「发起人」列说明与表格（中英各一处）改为现行口径 ——
   顺带修掉一段**早已过期**的旧文（原文写系统行答 `Not recorded`，而代码早已答 `Automated`）。

请求频道进来的 `tool_confirmation` / `timeout`（对话内 60s 等待超时，`ai.service.ts` 写入）**不受影响**：
它们带 `source: web|admin|sandbox`，仍读作「姓名（经 AI 助手）」。

## 验收对照（路线图 R-8 的三条）

1. **发起人读作自动 + 行仍在本人范围**
   - 渲染：`audit-export-vocabulary.spec.ts` 新增用例（姓名 + 操作人 id + `source: automation` ⇒ `Automated`，
     不含姓名；同一行换 `source: 'web'` ⇒ 仍读姓名；无 `source` ⇒ 不推断）。
   - 范围：`test/audit-reader-scope.e2e-spec.ts` 新增用例（真库 + 真 DI）—— 到期形状的行（`tool_confirmation` /
     `timeout` / `source: automation`，`userId` 为那个审计读者本人）**出现在该读者自己的范围读里**，
     另一个组织的读者**读不到**；线上行仍带 `source: automation`。
   - 写入侧：`maintenance-tasks.service.spec.ts` 新增用例钉住 `userId` 仍是操作人、`source` 是自动化、
     无 `agentId`。
2. **同一次清扫的两行渲染一致**：`audit-answers.service.spec.ts` 新增用例把同一轮清扫的到期行
   （`userId='7'` + 姓名 + `source: automation`）与释放行（`userId='system:sweep'`）放同一页，
   两格都必须是 `Automated`，且不含姓名、零内部名。
3. **不留「自动 vs 这个人做了什么」的歧义**：发起人格只答 `Automated`，不提姓名；不写
   `Automated (alice)` 这类合成。这一行「关乎谁」仍可经行的 `userId`/`username`（审计轨迹）读到；
   导出里没有把它塞进发起人格。

## 读数

- 定向：`audit-export-vocabulary` / `audit-answers.service` / `maintenance-tasks.service` 三套 31 例全绿。
- `npx jest src/governance-shared src/maintenance-tasks`：40 套通过 / 1 套跳过（pg-snapshot 需活 PG），
  574 例通过 / 3 例跳过。
- `test/audit-reader-scope.e2e-spec.ts`：20/20；`test/audit-six-answers.e2e-spec.ts`：8/8。
- 改动文件 `eslint --max-warnings 0`（不加 `--fix`）：0 error。
- `npm run build`：通过。
- 根 `KEELBASE_JAVA_REPO=D:/Rain6fish/KeelBase4J npm run check:all`：**36/36**（55.6s）。
- 变异检查（两处，均已还原）：
  1. 删掉词表里的 `if (row.source && AUTOMATION_SOURCES.has(row.source)) return 'Automated';`
     ⇒ 词表与 answers 两套各红一例。
  2. 删掉写入侧的 `source: AUTOMATION_SOURCE,` ⇒ maintenance 的 R-8 用例转红。

## 未做 / 遗留（需用户裁的相邻项，未擅自扩大）

1. **到期行的「结果」格读作 `Failed`**（实测：`explainState({outcome:'timeout', isError:true})` 落到
   `isError` 兜底）。而 `not_executed` 正是 2026-10-28 为「确认窗口到期、无人裁决」加的词。
   这条与 R-8 是同一行的两个格，但属共享推导（`explainState` 供导出、单事件解释、统计多处用），
   改动面与验收都不是这一项，故**未动**。
2. **到期行的「授权」格**：导出只能经「占位行 → `authorizationRef`」到达确认行，而确认到期时还没有
   占位行（占位在执行时才有）。故这一行在导出里通常**到不了**确认行，授权格读的是签发时停在行上的
   放行快照 ⇒ `Not required (trusted scope)`；快照缺席时是 `Not recorded`。
   原任务描述里的「授权格是对的（窗口到期、无裁决）」在只有测试夹具塞了 claim 时成立，
   真实到期行不是那样。要让这一格自己说出「窗口到期」，得让到期行带上指向确认行的结构化引用
   （行为改动，未做）。
3. **存量行**：本次之前写下的到期行没有 `source`，仍按旧读法印成「姓名（经 AI 助手）」；**不做回填**
   （需要改历史数据，且 `source` 已入 v2 链 payload，改列会破链）。
4. 「到期行的动作格读作工具名（如 `Create event`）而非「审批决定」」—— 与 R-4 曾修过的
   `claim_release` 同类，但 `tool_confirmation` 行目前整体如此（含对话内的批准/拒绝行），
   属既有设计，未在本项内改。
