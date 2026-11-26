# `claim_release` 行的导出/解释/控制台标签修正（2026-11-26）

- worktree `wonderful-banach-252d61` / 分支 `claude/wonderful-banach-252d61`（已把本地 `main` `4fc09ad1` 合入）
- 来源：R-4 机器可筛性决策稿 §1.7 发现的现有误读 —— 三类 `claim_release` 行在六问导出里都读成
  「Create event / Executed」，`stale_view` 拒绝行也一样。用户指示「修掉」。
- 范围：导出与解释面的**标签/派生状态**、控制台双语、测试；不改 schema、契约、wire 形状与状态词表。

## 改了什么

**Action 列** `Server-NestJS/src/governance-shared/services/audit-export-vocabulary.ts`
- 新增 `ACTION_FIRST = {claim_release, effect_revoke, audit_review}`：这几类行带 `tool` 是**为筛选**，
  动作列回答的是「发生了什么」，不再被工具标签盖住（释放不再显示 `Create event`，撤销不再显示被撤销的
  那个工具）。工具调用（`tool_call`）仍取工具业务标签，行为不变。

**Result 列 / 解释面** `Server-NestJS/src/governance-shared/services/audit-explanation-state.ts`
- 新增 `releaseRowState(row)`：`claim_release` 是**决定行**，冻结词表没有为它定义 `outcome`；
  拒绝行（`detail` 以 `release refused` 开头，出自同一服务）记 `rejected`，其余释放行停在
  `result_unknown`（释放只说明处理结束，不说明写发生过）。其他动作返回 `null`，继续走唯一的
  `explainState` 推导。
- 两个消费点接入：`audit-answers.service.ts` 的六问导出、`audit-evidence.service.ts` 的单事件解释面。

**控制台** `Web-Admin-Vue/src/i18n/{zh,en}.ts`
- `action` 容器补 `claim_release` / `effect_revoke` 两条（时间线此前把这两个动作渲染成原始令牌）。
  AI 审计列表原本就走 `ai.claimRelease` 标签，无需改。

**测试**
- `audit-export-vocabulary.spec.ts`：动作列不再被工具标签覆盖（释放/撤销/复核三类）。
- `audit-explanation-state.spec.ts`：`releaseRowState` 三态（拒绝 / 释放 / 非释放动作返回 `null`）。
- `audit-answers.service.spec.ts`：一条释放 + 一条拒绝行的六问结果列分别为
  `Write-hold release / Result unknown` 与 `Write-hold release / Rejected`。
- `audit-evidence.service.spec.ts`：解释面同样给出 `result_unknown` / `rejected`。

## 为什么

「行带 `tool` 是为筛选」不等于「这次动作就是那个工具」。把决定行读成一次成功的工具调用，会让被拒绝的
释放看起来像执行过的 `create_event` —— 正是审计面一直在纠的「把不同事实压成一个值」。

## 读数

- 定向：`audit-evidence` / `audit-answers` / `audit-explanation-state` / `audit-export-vocabulary`
  ⇒ **4 套 / 72 例全绿**。
- `npx tsc -p tsconfig.build.json --noEmit` ⇒ 0 错；`npx jest src/governance-shared` ⇒ 37 套 / 547 例。
- 控制台：`npm run typecheck` 0 错；`AiTimelineView` + `AiAuditView` ⇒ **26/26**。
- 门禁：因触及语义源实现 `audit-evidence.service.ts`，本批提交带 `[no-semantic-change]`（纯派生状态，
  无契约影响）；`check:all` 依赖该 trailer 转绿，提交后复跑记录在下。

## 未做 / 边界

- 未加结构化「种类」字段（R-4 决策稿建议**暂不翻契约**）；拒绝/释放的判定仍读 `detail` 的固定前缀，
  该前缀由同一服务写出。
- `Initiated by` 列为空（自动清扫无 `username`）未变 —— R-4 决策稿 §5.3 的第 3 条，属另一项。
- 未推送、未打 tag。
