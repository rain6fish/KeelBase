# F-128 — 让「收据」路径真正跑过一次（2026-11-26）

Worktree `compassionate-elion-430c7a` / 分支 `claude/compassionate-elion-430c7a`，自 `main` 起。未推送、未打 tag。

## 改了什么

### `Server-NestJS/test/proxy-bridge.e2e-spec.ts`（唯一代码改动）

- 模拟目标（本仓控制的本地 HTTP server）新增状态查询应答：`GET /contracts/status/{key}` 按用例种下的
  账本回 `{status, basis?}`（:81–91）。没种过的键回 `{status:'unknown'}` —— 不带种类，故接线错了会表现
  为「目标没有回答」，而不是伪造一张收据。
- 用例账本 `targetStatus: Map<key, {status, basis?}>`（:50），每个用例前清空（:143）。
- 管理员账号（对账端的 `manage all` 要求）在 `beforeAll` 里注册并提权（:124–139）。
- 新增 `describe('F-128 收据（receipt）路径…')`（:383 起），三例：
  1. **executed + receipt** → 账落定；落库的查询证据行 `basis='receipt'`，`GET …/claims/:id/lookups`
     的 `items[0].basis` 同为 `receipt`；
  2. **not_executed + receipt** → 释放；`claim_release` 行链外列 `releaseLookups.items[0].basis='receipt'`；
     经生产路径（`WriteClaimStore.claimWrite`）重占位后，在途清单该行 `lastLookup.basis='receipt'`；
  3. **同一占位的两次读数** → 第一次 `receipt`、重占位并把 `claimedAt` 拨回陈旧区间后再问一次
     `current_state`；查询历史 `items` 与最新释放证据的 `items` 都按值给出
     `['current_state','receipt']`，再重占位后 `lastLookup.basis='current_state'`。
- 占位走生产路径取得，只把 `claimedAt` 拨回 90 分钟（陈旧占位正是每小时清扫会留下的那种）；对账走
  真实端点 `POST /api/v1/ai/tool-effects/claims/:id/reconcile`，探针、委托 token、真实 HTTP 目标、
  证据落库全在链上。

### 文档

- `docs/ai-agent.spec.md`（EN + ZH）：在读历史段补一句 —— 两种种类都在本仓控制的模拟目标上端到端跑过，
  `receipt` 落库后由查询历史、在途 `lastLookup`、释放证据三处报出同一值，`current_state` 在三处保持
  另一个取值。
- `docs/revoke-contract.spec.md` §6（EN + ZH）：在 `basis` 说明后补同义一句（F-128）。
- `CLAUDE.md` §9 未改：对外 wire 形状未变（没有新增字段/端点/动作）。

## 为什么

R-1（D69 解冻）给 `ai_target_status_lookups` 加了可空 `basis`，探针也会解析目标应答里的可选 `basis`。
但仓内没有任何目标真的答过 `receipt`：这一列在每个读面上都被读到，而它的第二个取值只从夹具里写过 ——
F-128 的落点就是「我们控制的目标必须提供收据应答」，否则收据只是一条纸面承诺。

## 判据如何满足

- 收据真的从线上来：目标应答 `{"status":"not_executed","basis":"receipt"}` 经探针解析、`_recordLookup`
  落库，用例断言行 `basis='receipt'` —— 不是直接往证据表写夹具值。
- 三个读面都区分得开：查询历史 `items`、在途清单 `lastLookup`、释放证据 `releaseLookups` 均按字段
  给出两种种类；第 3 例在同一条占位上并列两种，证明是字段而非散文在区分。
- `current_state` 仍可读：第 3 例的 `current_state` 读数在三处都正常返回。
- 变异检查：临时让 `declaredBasis()` 恒返回 `null`（探针丢弃 basis）后重跑 F-128 三例 —— **3 failed**；
  还原后全绿（`grep -c MUTATION` = 0）。
- 未改 schema、未新增契约字段/动作/端点；`releaseLookups` 仍是不透明 JSON（v8），内部结构归产出方。

## 命令与读数

- 定向 e2e：`NODE_ENV=test npx jest --config ./test/jest-e2e.json test/proxy-bridge.e2e-spec.ts --runInBand`
  — **10/10**（含 3 条新增）。
- 相关 e2e：`stale-view-release` + `audit-reader-scope` — **23/23**。
- 单元：`npx jest src/governance-shared src/governance-core src/ai/proxy` — **49 套 / 660 例全绿**；
  其中 target-status / write-claim-query / write-claim-decision / target-status-reconcile 定向 **101/101**。
- `npx tsc -p tsconfig.build.json --noEmit` — 0 错；改动文件 `npx eslint` — 0 error。
- `npm run check:test-types` — 179/178 一度报红，原因是新增的 `settings.set(…, 'json')` 多了一条既有形态
  的 TS2345；去掉第三个实参后**回到基线**（该形式与既有各处运行时等价：值的类型回退成 `string`，
  代理注册服务自己 `JSON.parse`）。
- `KEELBASE_JAVA_REPO=D:/Rain6fish/KeelBase4J npm run check:all` — **36/36（53.6s）**。
- 契约子模块已在本 worktree 初始化（`Server-NestJS/specs/protocol` → `015f474`）；`node_modules` 由本
  worktree 自行 `npm ci` 安装（未动主检出）。

## 未做 / 风险

- 本项只让仓内受控目标答了一次收据，**没有**给任何生产目标加收据端点；真实 Java 系统的收据通道仍由
  接入方实现（`docs/manual/ai-bridge.md` 已描述该约定）。
- 未跑全量 e2e（本项未要求）；未推送、未打 tag、未发版；私库与契约仓未改。
- 合并提示：本改动只落 `test/proxy-bridge.e2e-spec.ts` 与两份文档的相邻段落；并行会话若改
  `docs/revoke-contract.spec.md` §6 的 `basis` 段或 `docs/ai-agent.spec.md` 读历史段，按并集解。
