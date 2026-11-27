# R-9 收口：弱读数不再释放占位（2026-11-27）

- 起点：本地 `main` `17b23296`；本会话 worktree `busy-mendeleev-9327d3` / 分支 `claude/busy-mendeleev-9327d3`。
- 本地提交，未推送、未打 tag；契约仓与私库未动，schema / 列 / 迁移未动。

## 判据怎么落

1. **非幂等 / 不保证去重的效果上的弱读数不释放。**
   `AiToolEffectsService.reconcileClaim` 在 `not_executed` 之后、移动账之前先问
   `notExecutedReleasesHold(basis, dedup)`（单源在 `governance-core/target-status.ts`）。不成立时：
   - 占位**不动**（`status` 仍是 `claimed`，键仍被占住，`claimWrite` 继续拒绝同键；不留下
     `not_executed` 却不占位的窗口）；
   - 结果种类 `not_released`，`conclusion` 仍是 `not_executed`；
   - **记录裁决**：`WriteClaimDecisionService.recordWeakReadingRefusal` 写一条 `claim_release` 行 ——
     与释放同链、同动作、`outcome` 不写，`detail` 以 `release refused (weak_reading)` 开头，点名
     本次读数（谁问的 / 方法 + 路径 / 何时 / 结论 / 种类）与在案历史；**不带** `releaseLookups`
     （该列是释放证据，这里没有做出释放）。
   - `basis=null`（未声明）按弱读数处理：沉默不是收据。

2. **收据对任何效果自动释放。**
   `basis=receipt` 直接放行，不查 `dedup`。既有释放行（R-3/R-6b）措辞与断言未改。

3. **第二次尝试的记录带上前一次读数。**
   拒绝行的 `detail` 以 `readings (newest first): #id by <lookedUpBy> at <at> (<method> <path>) →
   <conclusion>, basis=<basis>` 列出最近三次（与释放证据同一 `RELEASE_DETAIL_LOOKUPS = 3`，同一条
   `COUNT(*) OVER ()` 单语句读）。第二次被拒时，前一次读数的发起人、查询、结论与种类都在同一条行里。

## `dedup` 的消费口径

`dedup` 说的是**目标是否遵守出站写携带的 `Idempotency-Key`**（重复键会被目标丢掉），**不是**效果
是否幂等；本仓没有任何声明说效果幂等，故不推断。

| 取值 | 读法 | 弱读数能否释放 |
|------|------|----------------|
| `yes` | 目标遵守幂等键，重发同一逻辑调用安全 | **能** |
| `no` | 目标不遵守 | 不能（占位留滞 + 记录拒绝） |
| `unknown` / 未声明 | 没人告诉过我们 | 不能（按 `no`，沉默不能授权重试） |

解析单源：`governance-core/tool-dedup.ts` 的 `declaredDedup`（缺席 ⇒ `unknown`），
`ai/interfaces/tool.interface.ts` 的 `resolveCapabilities` 也改用它，避免两处规则漂移。
`governance-shared` 只在运行时 import `governance-core`；`check:governance-imports` 的强口径仍为 0。

## 未翻契约

「记录裁决」用既有 `claim_release` 动作 + `detail` 前缀（与 R-4 的 `release refused (stale_view)`
同形），没有新动作 / 新列 / schema 变更；`releaseLookups` 仍在非释放行上缺席。结果种类
`not_released` 是服务返回值与 `ReconcileClaimResponse` 的内部枚举扩展，已同步 Web-Admin-Vue 的
类型、i18n 与提示映射（React 预览版没有对账入口，未跟随）。

## 改动面

- 后端：`governance-core/target-status.ts`（判据）、新增 `governance-core/tool-dedup.ts` +
  `.spec.ts`、`ai/interfaces/tool.interface.ts`（复用解析）、`ai-tool-effects.service.ts`
  （闸 + `_dedupDeclaration` + 清扫 `held` 桶）、`tool-effects.types.ts`（`not_released` / `held`）、
  `write-claim-decision.service.ts`（拒绝行 + 读数散文）、`write-claim.store.ts`（注释）。
- Web：`types/admin.ts`、`i18n/{en,zh}.ts`、`views/ai-tools/AiToolsView.vue`（提示 + 注释）。
- 文档：`docs/revoke-contract.spec.md` §6（EN/ZH 各一段 + 两处既有句子加限定）、`CLAUDE.md` §9
  对账行、`docs/ai-agent.spec.md`（EN/ZH）、`docs/manual/ai-bridge{,-en}.md`。
- 测试：`target-status-reconcile.spec.ts`（三类判据 + 清扫 held + 重写 R-1 反向）、
  `write-claim-decision.service.spec.ts`（拒绝行直测）、`tool-dedup.spec.ts`（三值口径）、
  `test/target-status-receipt.e2e-spec.ts`（receipt 释放 / current_state 留滞 / 未声明留滞）、
  `test/target-status-history{,-sweep}.e2e-spec.ts` 与 `test/proxy-bridge.e2e-spec.ts`
  （释放路径改用 receipt；proxy-bridge 的「两次读数」改为弱读数留滞 + 同键被拒）。

## 读数

- 定向：`target-status-reconcile.spec.ts` + `write-claim-decision.service.spec.ts` 62/62；
  `npx jest src/governance-shared src/ai`：203 套通过 / 1 套跳过（pg-snapshot 需活 PG）/ 2061 例。
- `npx jest src/governance-core`：11 套、157 例通过（含 `purity.spec.ts`）。
- e2e：`target-status-receipt` / `history` / `history-sweep` 19/19；`proxy-bridge` 10/10。
- 全量 e2e（`npm run test:e2e`，4 分片，在并入 main 后的树 `e30aa3c1` 上跑）：**49 套全部通过**
  （13 / 12 / 12 / 12 套），运行器判定「✓ e2e 全部通过（4 片）」，退出码 0；末片 12 套 / 63 例。
- 改动文件严格 eslint 0 error；`Web-Admin-Vue` `vue-tsc --noEmit` 通过、eslint 0 error。
- 根 `KEELBASE_JAVA_REPO=D:/Rain6fish/KeelBase4J npm run check:all`：**36/36 全过**（41.2s）。
- 变异：把闸改成 `if (false && ...)` ⇒ 判据①用例转红（1 failed），已还原。

## 未做 / 遗留

- 未给 `ProxyToolConfig` 增加 `dedup` 声明字段：目前 B 路径代理工具一律 `unknown`，故弱读数一律
  留滞，收据是生产上唯一自动释放的路。要让某个目标声明 `dedup: yes`，需要新增配置面（以及 OpenAPI
  扩展 `x-keelbase-dedup`）—— 本轮不做，避免在消费口径落地时同时扩配置契约。
- 自动清扫的 `held` 只进日志与内部汇总，未加到管理台在途读面（读面已有 `lastLookup` / `decisionState`）。
- 拒绝行没有结构化「拒绝种类」列：沿用 R-4 的既有裁量（`detail` 前缀 + 无 `releaseLookups`），
  只读审计行按结局筛选仍是推迟项。
