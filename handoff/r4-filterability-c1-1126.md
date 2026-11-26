# R-4 遗留 · 零契约部分已实施（2026-11-26）

- worktree `heuristic-bun-3bc67c` / 分支 `claude/heuristic-bun-3bc67c`
- 上游：决策稿 `handoff/r4-filterability-proposal-1126.md`；用户裁定 **D1 = 先做零契约**（D2/D3 未裁）
- 范围：**未改契约、未改 schema、未加迁移、未推送、未打 tag**。契约子模块 pin 未动
  （`015f474ebf0cf5f45c855614b18020857665c700`）。

## 做了什么

### 1. 读规则（提案 §5.2）

`docs/revoke-contract.spec.md` §6 增一段（EN + ZH）：

- `releaseLookups` 有值 ⇒ 这是一次释放（契约 v8 描述「非释放行上缺席」的逆否）；
- 没有值 ⇒ 拒绝，**仅对**该列存在之后写下的行；v1.23.0 之前的释放行同样没有这一列，不得算成拒绝；
- 自动清扫的释放另有 `userId = 'system:sweep'`，日志列表可精确选出；
- 人工释放 vs 人工对账仍只有散文可分 —— 那是 `releaseKind` 要补的缺口（D2/D3 未裁）。

### 2. 标签（提案 §5.3）

后端：

- `audit-explanation-state.ts`：词表新增 `release_recorded` / `release_refused`，按行的 `action` 进入，
  由结构化 `releaseLookups` 列决定；`outcome === null` 不再落到 `executed`。
  六问导出（`_answer`）与单事件解释（`getInterpretation`）都喂同一组输入。
- `audit-export-vocabulary.ts`：
  - `productActionLabel`：`claim_release` 行不再取工具标签（此前一条关于 `create_event` 的释放行显示为
    「Create event」），显示动作「Write-hold release」；
  - `RESULT_LABELS`：新增「Release recorded」/「Release refused」；
  - `productInitiatorLabel`：新增 `userId` 入参；无 `username` 且 id 属 `system:` 命名空间时答
    「Automated」，不再把已知的自动主体说成「Not recorded」；不打印 id（内部名）。
- `recordTargetRelease` 现在接收 `byUsername`：`reconcileClaim(claimId, byUserId, byUsername?)` →
  `TargetReleaseTrigger.byUsername` → 行的 `username` 快照。控制器传 `user.username`；
  自动清扫仍无名字（不编造），导出按 id 判为 Automated。

控制台：

- `types/audit.ts` / `AiAuditView.vue`：状态联合与标签/颜色表同步；顺带补上此前缺失的
  `not_executed`（后端 2026-10-28 起就有，控制台会回落显示原始令牌 —— 同一张表、同一类缺陷）。
- 颜色：`release_recorded` = info（释放不等于成功，写的结局仍未知，故不用绿色）；`release_refused` = warning。
- i18n zh/en 各 3 个键。

## 已知边界（如实）

1. **`releaseLookups` 缺席的旧行**：早于 v1.23.0 的释放行在这个标签下读作「Release refused」。
   标签走结构化列（六问导出的既有性质），不回退解析散文；该时间分界已写进 `docs/revoke-contract.spec.md`
   与 `audit-explanation-state.ts` 文件头，行内 `detail` 是可核之处。
2. **六问导出的 Object 列**仍为 `Not recorded`（释放行不挂 effect）—— 不在本次范围。
3. ~~**AI 时间线**仍把 `claim_release` 显示为原始动作令牌~~ —— **已补**（见下「补记」）。
4. 控制台的 AI 审计**列表**用户列仍只读 `username`；自动清扫行仍空白（导出已能说 Automated）。
5. D2/D3（是否加 `releaseKind` 链外列、取值词表）未做，触发条件见提案 §2。

## 读数

| 命令 | 读数 |
|---|---|
| `npx jest`（6 个受影响单测：解释状态/导出词表/六问/解释面/决策服务/对账） | **125/125 通过，6 套** |
| `npx jest src/governance-shared src/ai/ai.controller.spec.ts` | **584 通过 / 3 跳过（PG 套件），38 套 + 1 跳过** |
| `NODE_ENV=test npx jest --config test/jest-e2e.json test/stale-view-release.e2e-spec.ts test/audit-reader-scope.e2e-spec.ts` | **23/23 通过，2 套** |
| `npx tsc -p tsconfig.build.json --noEmit` | 0 错误 |
| `npx eslint`（7 个改动源码文件） | 0 findings |
| `cd Web-Admin-Vue && npm run typecheck` | 0 错误 |
| `npx vitest run src/views/audit/__tests__/AiAuditView.spec.ts` | **19/19 通过** |

未跑：全量 `npm test` / `npm run check:all`（本次改动面窄且均已定向覆盖）；若合并前要跑，按仓库惯例带
`KEELBASE_JAVA_REPO=D:/Rain6fish/KeelBase4J`（本 worktree 无同级 Java 检出）。

## 新增/改动的测试

- `audit-explanation-state.spec.ts`：释放行两种结局各产生一个状态；其它动作带 `releaseLookups` 也到不了；
  可达性 witness 覆盖新值。
- `audit-export-vocabulary.spec.ts`：`claim_release` 不取工具标签；`system:` 主体答 Automated。
- `audit-answers.service.spec.ts`：三类释放行各一格（Write-hold release / Release recorded /
  Release refused）+ 自动清扫行 Automated，且「0 内部名」仍成立。
- `audit-evidence.service.spec.ts`：解释面同样给 `release_recorded` / `release_refused`（端到端，不只纯函数）。
- `write-claim-decision.service.spec.ts`：人发起的目标驱动释放带 `username` 快照；自动清扫为 null。

## 补记：时间线文案键（同一张 `action.*` 表）

AI 时间线的动作名取自 `t('action.' + log.action)`，表里没有的键会回落到**原始动作令牌**。`action` 块此前只有
`chat / plan / analyze / knowledge / delegate / login`，于是 `claim_release`、`effect_revoke`、`audit_review`、
`content_blocked`、`flow_node` 五种行都显示原始令牌。按「同类缺陷就近一并修」，五个键一次补齐：

- `claim_release`：释放写占位 / Write-hold release（与六问导出的动作词一致）；
- `effect_revoke`：撤销 AI 写入 / Undo of an AI write；
- `audit_review`：复核回执 / Review receipt（复用审计页已有的同一措辞）；
- `content_blocked`：内容已拦截 / Content blocked；
- `flow_node`：工作流步骤 / Workflow step。

`Web-Admin-Vue/src/i18n/zh.ts` / `en.ts` 各五条；`vue-tsc` 0 错（`en.ts` 按 `ZhDict` 收窄，缺键即编译不过）；
时间线用例 7/7。未在浏览器里跑起来看（需要后端 + 有这些动作的种子数据），展示层未改。
