# R-6b 残留收口：旧读数不得冒充「本次答案」的证据（2026-11-27）

- worktree `heuristic-bun-3bc67c` / 分支 `claude/wizardly-elgamal-d46325`，基于本地 `main` `e18233d9`。
- 未推送、未打 tag、未动契约仓（子模块仍 pin `015f474`）、未改 schema / 列 / 迁移、未动私库。

## 缺口（R-6b 的残留）

目标驱动的释放路径上，`_recordLookup` 一直**吞掉**读数行的插入失败（设计如此：账的移动由目标的回答支撑，
不由证据表）。R-6b 只处理了「读数表为空（count=0）」这一种可辨形态：缺行 ⇒ `recorded: false` +
`lookup record missing …`。但当表里**已有旧读数**（count>0）而本次插入同样失败时：

- `detail` 写 `lookups: N asked (see releaseLookups)`，`N` 只数旧读数；
- `releaseLookups` 不写 `recorded`，`items` 全是旧读数；
- 读起来就像这次询问的证据已在案 —— 而它是缺的。

## 修法（最小、诚实）

1. `_recordLookup` 返回 `boolean`（落库成功与否），不再把事实只留在日志里。
2. `reconcileClaim` 把该事实作为**必填**第三参传给 `recordTargetRelease` —— 这一事实只有写方知道，
   故签名上不给「不知道」留口子（唯一生产调用点）。
3. `_releaseEvidence` 用 `thisAskRecorded: boolean | null` 取代原来的 `targetAnswered` 布尔：
   - `false` = 本次询位的读数行没记下（不论 count）；
   - `true` = 记下了；
   - `null` = 这一行背后没有询问（人工释放）。
   `targetAnswered` 与它在本服务内完全冗余（`null` 即「非目标驱动」），故删除，避免两处说法漂移。
4. 链外列：`recorded: false` 只在 `thisAskRecorded === false` 时写 —— 与 count 无关。
   仍**不写** `recorded: true`（不为旧读数可能遮住的答案背书；不写 = 什么都没断言）。
5. 散文：count>0 且本次缺行时，次数照写（那是表里的事实），加一句
   `lookups: N asked (see releaseLookups; this ask was not recorded)`。
   **零读数的三态措辞一字未动**（`never queried` / `not askable …` / R-6b 的 `lookup record missing …`），
   既有断言全部保留。

## 文档

- `docs/revoke-contract.spec.md` §6：EN / ZH 各改两处 —— ①「不论几次都是这句话」加一个限定（目标驱动缺行时多一句）；
  ②R-6b 段补「`recorded: false` 说的是**这一次**询问：旧读数在案时次数照实报它们、散文多一句、
  拷贝条目读作更早的问次」。
- `CLAUDE.md` §9 释放行：补 **R-6b residual** 中英各一段。

## 用例

- `target-status-reconcile.spec.ts`（真实 sqlite，走真 `reconcileClaim`）：先种一条旧读数，`save` 抛错被吞，
  目标答 `not_executed` ⇒ 断言 `detail` 含 `lookups: 1 asked (see releaseLookups; this ask was not recorded)`、
  链外列 `count=1` 且 `recorded=false`、`items` 仍只有那一条旧读数。
  **写测试时先跑红**：现状给的是 `lookups: 1 asked (see releaseLookups)`（无任何「本次未记录」标记），
  正是缺口的直接证据。
- 对照例（不误报）：旧读数存在、本次行也落库 ⇒ `lookups: 2 asked (see releaseLookups)`、
  列里 `count=2` 且**不带** `recorded`。
- `write-claim-decision.service.spec.ts` 的三处直调补第三参（`false` / `false` / `false`，与表状态一致）；
  `write-claim-decision.pg-snapshot.spec.ts` 的直调补 `true`（模拟落库成功之后的对账路径）。
- 变异检查：把 `_releaseEvidence` 改回旧行为（`options && lookupCount === 0 ? false : null`）⇒ 新用例转红；
  已还原并复跑全绿。

## 读数（本 worktree）

- 定向：`target-status-reconcile.spec.ts` 28/28；`write-claim-decision.service.spec.ts` 28/28。
- `npx jest src/governance-shared`：37 套通过 / 1 套跳过（pg-snapshot 需活 PG）/ **551 例通过**、3 例跳过。
- 改动文件 `eslint --max-warnings 0`：0 error。
- `npm run build`：通过。
- `npx tsc --noEmit`：本仓在该模式下有 **178 条存量错误**（全在未被本项碰过的 spec / e2e 文件），
  本项涉及的文件**零命中**；以 `npm run build` 为准。
- 根目录 `KEELBASE_JAVA_REPO=D:/Rain6fish/KeelBase4J npm run check:all`：**36/36**。

## 合并与全量 e2e（2026-11-27 同日）

- `b7640d14` 已由并发会话以合并 `3b89aa82` 并入 main；本会话把 worktree 追平到 main 同一棵树后跑全量 e2e。
- **全量 e2e：4 分片、49 套件 / 475 例全绿**（分片 13/12/12/12 套，128/74/210/63 例；无崩溃重试，退出码 0）。

## 遗留 / 未做

- 无（全量 e2e 已补跑）。
- 自动清扫的 `recorded` 事实经 `reconcileClaim` 一条路径传入；若将来新增第二条调用 `recordTargetRelease`
  的写方，必须同样说清「这一次」的落库事实（签名已设为必填，编译期会拦住遗漏）。
- 契约仓的样例 / 向量都是人工释放形态（`closed_unknown`、count=2、无 `recorded`），本项不改也不影响它们；
  若日后要为「目标驱动 + 缺行」出一份线上样例，须在契约仓单独提。
