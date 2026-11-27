# 到期行结果格读作「未执行」· 已提交（2026-11-27）

- worktree `zealous-lehmann-1ce008` / 分支 `claude/zealous-lehmann-1ce008`，基于本地 `main` `e30aa3c1`
- 本地提交 **`1d256430`**（结果格读法）+ **本次提交**（统计计数同口径）；未推送、未打 tag；
  契约仓 / 私库未动；零 schema / 列 / 迁移
- 任务来源：R-8 报告「相邻发现 1」；统计计数由用户 2026-11-27 裁「一并排除」

## 改了什么

- `explainState()` 在原有的 `outcome === 'not_executed'` 之外，增加一条
  `outcome === 'timeout'` ⇒ `not_executed`。
  依据是契约 v2 自己的定义：`not_executed` 写的是「确认窗口到期、没有人裁决」，并明说
  `tool_confirmation` 行上的 `timeout`「说的是同一件事，只是那一行记的是裁决本身的结局」；
  `timeout` 条也说它「既不是拒绝，也不是执行失败」。
- **入参不增加 `action`**：`timeout` 只写在 `tool_confirmation` 行上 —— 整点清扫
  （`_recordExpiries`）与 `ai.service.ts` 的 run 级、逐工具两处对话内窗口。确认超时的
  `tool_call` 行早已由 `tool-call-audit.ts` 写成 `not_executed`，跑过、坏了的动作写
  `failed`，故这条分支不会把真正发生过的尝试改写成「没发生」。词本身无歧义，无需按
  action 再判一次。
- 未动清扫写入的 `isError: true`（判据 2 要求；`isError` 说的是「这一动作没有完成」，
  仍为真）。

## 判据对照

1. **到期行结果格读作「未执行 / Not executed」** ✓
   - 六问导出：`productResultCell` → `productResultLabel('not_executed')` = `Not executed`；
     新增导出层用例断言 `Not executed`。
   - 单事件解释面：`audit-evidence.service.ts` 的 `state` 走同一 `explainState` = `not_executed`；
     管理台 `ExplanationState` 联合类型、标签（`explanationStateNotExecuted`：未执行 /
     Not executed）与颜色早已存在，无需改动。
2. **其它 `isError` 为真的失败行不被顺带改写** ✓
   - 新增反证：`explainState({ outcome: 'failed', isError: true })` = `failed`；
     `explainState({ isError: true })` = `failed`。
   - 导出层反证：同一份结果里，`tool_call` + `failed` 仍读 `Failed`。
3. **同一推导的各消费面给出同一答案** ✓
   - `grep -rn "explainState(" Server-NestJS/src Web-Admin-Vue/src` 只有两处服务端调用：
     `audit-answers.service.ts`（六问导出）与 `audit-evidence.service.ts`（单事件解释面），
     两者传入同一组字段、调用同一函数，不存在第二份推导。
   - **统计计数同口径（用户裁「一并排除」）**：新增单源 `NOT_EXECUTED_OUTCOMES =
     {'not_executed','timeout'}`（`audit-outcome.ts`）与 `countsAsError(row)`；`explainState`
     也改用同一词集。四个计数面全部改用它：
     `by-day.ts`（报表与统计共用的 `byDay`）、`getActionReport` 的 `summary.errors`、
     `AuditStatsService` 的 `totalErrors`（`getStats` / `getAllStats` 两处）、解释器
     `aggregateConversation.errors`。于是导出结果格的 «未执行» 与统计的 «不计错误» 是同一件事；
     真失败（`failed`、推不出的历史失败行）仍计入。
   - 既有断言无一处把到期行断言为 `Failed`，故无需同步改动；`audit-export-vocabulary.spec.ts`
     的 `timeout` 用例断言的是**授权格**（`Window expired without a decision`），未受影响。
4. **契约是否需要改**：不需要 ✓
   - `tool_confirmation` + `timeout` 在 `ai-audit-log-outcome-v2-vector.json` 的
     `legalByAction.tool_confirmation` 里本就合法；`not_executed` 的定义明说两者同一件事。
     本次只改读侧推导，不新增词、不改写入。

## 文档

- `docs/audit-object-search.spec.md`「六问」小节补中英各一段：到期行读 `Not executed`、
  真失败仍读 `Failed`，并说明 `timeout` 只出现在确认行上。
- `docs/period-audit-report.spec.md` 的期间摘要口径补一句：`errors` / `byDay.errors` 不计
  确认窗口到期、无人裁决的行。
- `docs/audit-authz-snapshot.spec.md` §5.7 只描述写入侧（`outcome='timeout'` 的合法组合），
  不描述解释状态读法，未改。
- 控制台：词表/标签/颜色已含 `not_executed`，无改动。

## 读数

- 定向 5 套（解释状态 / 六问导出 / 统计 / 解释器 / 报表）→ 102/102 通过
- `npx jest src/governance-shared src/maintenance-tasks`：40 套通过 / 1 跳过
  （pg-snapshot 需活 PG）；587 例通过 / 3 跳过
- 改动文件严格 eslint（无 `--fix`）：**0 error**；唯一 1 条 warning 在
  `audit-evidence.service.spec.ts:220`（`governancePolicy` 未使用），为**改动前既有**、
  不在本次 diff 内，未顺手删除
- **变异检查**（每次已还原并复绿）：
  1. `explainState` 的 `timeout` 映射改回 `failed` → 2 条新用例转红
  2. `countsAsError` 改回 `return !!row.isError` → 3 条计数用例转红
  3. 词集删去 `timeout` → 4 条转红（解释状态 + 三个计数面）
  4. 词集删去 `not_executed` → 5 条转红（含可达性用例）
- 根 `KEELBASE_JAVA_REPO=D:/Rain6fish/KeelBase4J npm run check:all`：**36/36**（56.1s）

## 环境

- `Server-NestJS/node_modules` 为指向主检出的目录联接（未入库），未跑 `npm ci`
- `Server-NestJS/specs/protocol` submodule 已 init 到 `015f474e`（v1.23.0）
- `Web-Admin-Vue` 未改、未装 node_modules，也不在 `check:all` 范围内

## 遗留 / 边界

- 到期审计行自 2026-11-06（P0-19 ⑧）起才写，其时已有 `outcome` 列，故不存在「早于该列的
  到期行」。更早的**对话内**超时确认行若在统计里被 `deriveOutcome` 推导为 `timeout`，也一并
  不计入 errors；而结果格只读 `outcome` 列，这类无列的历史行仍按 `isError` 显示 `Failed` ——
  两处都不回溯改写历史。
- `errors` 仍是混合人群（含 `chat`、含 `blocked`/`refused` 等 `isError` 行）；本次只把
  「窗口到期、无人裁决」这一形状排除，其余口径未动。
- 契约仓未动；`outcome='timeout'` 的写入语义（清扫 + 对话内两处窗口）未动。
