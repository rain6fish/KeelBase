# 到期行结果格读作「未执行」· 已提交（2026-11-27）

- worktree `zealous-lehmann-1ce008` / 分支 `claude/zealous-lehmann-1ce008`，基于本地 `main` `e30aa3c1`
- 本地提交（未推送、未打 tag；契约仓 / 私库未动；零 schema / 列 / 迁移）
- 任务来源：R-8 报告「相邻发现 1」

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
   - **统计口径的边界（如实记下）**：`by-day.ts`、`getActionReport` 的 `errors` 与解释器
     `aggregateConversation` 的 `errors` 都是按 `isError` 计的数值计数，不输出状态词；本次
     未改，到期行仍计入这组「errors」。它们不会把该行说成 `Failed`，但若要让计数也排除
     到期行，那是另一项统计口径决定（改三处计数规则），不在本任务范围。
   - 既有断言无一处把到期行断言为 `Failed`，故无需同步改动；`audit-export-vocabulary.spec.ts`
     的 `timeout` 用例断言的是**授权格**（`Window expired without a decision`），未受影响。
4. **契约是否需要改**：不需要 ✓
   - `tool_confirmation` + `timeout` 在 `ai-audit-log-outcome-v2-vector.json` 的
     `legalByAction.tool_confirmation` 里本就合法；`not_executed` 的定义明说两者同一件事。
     本次只改读侧推导，不新增词、不改写入。

## 文档

- `docs/audit-object-search.spec.md`「六问」小节补中英各一段：到期行读 `Not executed`、
  真失败仍读 `Failed`，并说明 `timeout` 只出现在确认行上。
- `docs/audit-authz-snapshot.spec.md` §5.7 只描述写入侧（`outcome='timeout'` 的合法组合），
  不描述解释状态读法，未改。
- 控制台：词表/标签/颜色已含 `not_executed`，无改动。

## 读数

- 定向 2 套：`audit-explanation-state.spec.ts` + `audit-answers.service.spec.ts` → 26/26 通过
- `npx jest src/governance-shared src/maintenance-tasks`：40 套通过 / 1 跳过
  （pg-snapshot 需活 PG）；584 例通过 / 3 跳过
- 改动文件严格 eslint（`--max-warnings=0`，无 `--fix`）：0 error
- **变异检查**：把派生改回 `outcome === 'timeout' ⇒ 'failed'`，两条新用例转红
  （2 failed / 24 passed），已还原；还原后 26/26 复绿
- 根 `KEELBASE_JAVA_REPO=D:/Rain6fish/KeelBase4J npm run check:all`：**36/36**（60.8s）

## 环境

- `Server-NestJS/node_modules` 为指向主检出的目录联接（未入库），未跑 `npm ci`
- `Server-NestJS/specs/protocol` submodule 已 init 到 `015f474e`（v1.23.0）
- `Web-Admin-Vue` 未改、未装 node_modules，也不在 `check:all` 范围内

## 遗留 / 边界

- 早于 `outcome` 列的历史行不带 `outcome`，读侧仍按 `isError` 落到 `failed`；没有该列就
  分不出「超时」与「真失败」，故不回填。
- 统计计数口径见判据 3 的边界说明；本次未动。
- 契约仓未动；`outcome='timeout'` 的写入语义（清扫 + 对话内两处窗口）未动。
