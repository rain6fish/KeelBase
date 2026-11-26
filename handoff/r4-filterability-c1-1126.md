# R-4 遗留 · 零契约部分已实施（2026-11-26）

- worktree `heuristic-bun-3bc67c` / 分支 `claude/heuristic-bun-3bc67c`
- 上游：决策稿 `handoff/r4-filterability-proposal-1126.md`；用户裁定 **D1 = 先做零契约**（D2/D3 未裁）
- 范围：**未改契约、未改 schema、未加迁移、未推送、未打 tag**。契约子模块 pin 未动
  （`015f474ebf0cf5f45c855614b18020857665c700`）。

## 与主检出上另一会话的同一修正合并（取并集）

主检出上已有另一会话的 `f24092b7`（报告 `handoff/claim-release-labels-1126.md`）修了同一处误读，
模型不同：`releaseRowState()` 复用既有状态（拒绝前缀 ⇒ `rejected`；其余释放 ⇒ `result_unknown`），
`ACTION_FIRST` 让释放/撤销/复核三类行不取工具标签，**不扩状态词表**。

合并**以 main 的模型为准**（它复用冻结词表、不依赖「该列存在之后」的时间分界、且已评审并入），
本分支原拟的 `release_recorded` / `release_refused` 两个新状态**已放弃**。本分支保留的是 main 没有的部分。

## 做了什么

### 1. 读规则（提案 §5.2）

`docs/revoke-contract.spec.md` §6 增一段（EN + ZH）：

- `releaseLookups` 有值 ⇒ 这是一次释放（契约 v8 描述「非释放行上缺席」的逆否）；
- 没有值 ⇒ 拒绝，**仅对**该列存在之后写下的行；v1.23.0 之前的释放行同样没有这一列，不得算成拒绝；
- 自动清扫的释放另有 `userId = 'system:sweep'`，日志列表可精确选出；
- 人工释放 vs 人工对账仍只有散文可分 —— 那是 `releaseKind` 要补的缺口（D2/D3 未裁）。

### 2. 标签：main 的模型 + 本分支独有的补足

采用 main（`f24092b7`）：`releaseRowState` 的 `rejected` / `result_unknown`、`ACTION_FIRST` 三类动作、
六问导出与单事件解释面两个消费点。

本分支保留的独有部分：

- **发起人身份**：`recordTargetRelease` 接收 `byUsername` —— `reconcileClaim(claimId, byUserId, byUsername?)`
  → `TargetReleaseTrigger.byUsername` → 行的 `username` 快照；控制器传 `user.username`。自动清扫仍无名字
  （不编造）。这正是并行报告列为「属另一项」的第 3 条。
- **`productInitiatorLabel` 新增 `userId`**：无用户名且 id 属 `system:` 命名空间时答 `Automated`，
  不再把已知的自动主体说成「Not recorded」；不打印 id（内部名）。
- **时间线文案键**：main 补了 `action.claim_release` / `action.effect_revoke`；本分支补齐
  `action.audit_review` / `action.content_blocked` / `action.flow_node`（这张表缺键就显示原始动作令牌）。
- **控制台状态文案**：补 `not_executed`（后端 2026-10-28 起就有，控制台此前会回落到原始令牌 ——
  同一张表、同一类缺陷）。

### 3. 测试（合并后）

- `audit-explanation-state.spec.ts`：保留 main 的 `releaseRowState` 三态用例。
- `audit-answers.service.spec.ts`：三类 `claim_release` 行（释放 / 拒绝 / 自动清扫）—— 前两类按 main 的
  `Result unknown` / `Rejected`，第三类断言发起人列为 `Automated`；「0 内部名」仍成立。
- `audit-evidence.service.spec.ts`：保留 main 的解释面用例（`result_unknown` / `rejected`）。
- `audit-export-vocabulary.spec.ts`：保留 main 的 `ACTION_FIRST` 用例；新增 `system:` 主体答 `Automated`。
- `write-claim-decision.service.spec.ts`：人发起的目标驱动释放带 `username` 快照；自动清扫为 null。

## 已知边界（如实）

1. 拒绝/释放的判定按 main 的模型读 `detail` 固定前缀（`release refused`，由同一服务写出），
   不是结构化列；结构化种类是 D2/D3，未做。
2. 六问导出的 Object 列仍为 `Not recorded`（释放行不挂 effect）—— 不在本次范围。
3. 控制台的 AI 审计**列表**用户列仍只读 `username`；自动清扫行仍空白（导出已能说 Automated）。
4. D2/D3（是否加 `releaseKind` 链外列、取值词表）未做，触发条件见提案 §2。

## 读数（合并后）

| 命令 | 读数 |
|---|---|
| `npx tsc -p tsconfig.build.json --noEmit` | 0 错误 |
| `npx jest src/governance-shared src/ai/ai.controller.spec.ts` | **585 通过 / 3 跳过（PG 套件），38 套 + 1 跳过** |
| `cd Web-Admin-Vue && npm run typecheck` | 0 错误 |
| `npx vitest run src/views/audit/__tests__/AiAuditView.spec.ts src/views/ai-timeline/__tests__/AiTimelineView.spec.ts` | **26/26 通过** |

合并前本分支的单分支读数（全量单测 445 套 / 4213 例、目标 e2e 23/23）针对的是后来被放弃的
`release_recorded` 模型；合并后以本表为准。未跑 `npm run check:all`；合并提交触及语义源
`audit-evidence.service.ts`，提交信息带 `[no-semantic-change]`（纯派生状态，无契约影响）。
