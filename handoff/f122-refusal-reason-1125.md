# F-122 拒绝成因落地（2026-11-25）

- worktree `wonderful-banach-252d61` / 分支 `claude/wonderful-banach-252d61`
- 基于 `main` `379c385f`，未推送
- **2026-11-26 并入线**：在 worktree `epic-lewin-d45f7a` / 分支 `claude/magical-franklin-5add31` 上从 `main`
  `f45d9655` cherry-pick 了 `8c280a5e`（→ `42d095cf`）与 `49a67954`（→ `e7ec6003`）。三条冲突按**两侧意图的并集**
  解：R-1 的 `basis` 与 R-6b / 单次快照 / `stale_view` 的改动原样保留（`!res.ok` 分支补 `basis: null`；控制台夹具
  保留两种种类并新增第三条 `not_permitted` 读数），F-122 只加自己的成因与文案。下文行号已按并线后的 `f45d9655`
  基线重新核对。
- 来源：2026-11-23 对外文章讨论（F-122，`whiteknightonhorse`）；私库台账与规划节已由派工会话登记，本次未改私库。

## 改了什么

**成因词表**
- `Server-NestJS/src/governance-core/target-status.ts:104-115`：`TargetStatusLookupReason` 新增
  `not_permitted`，并在 `non_2xx` 的注释上写明它现在只覆盖 401/403 以外的非 2xx。

**探针分支**
- `Server-NestJS/src/ai/proxy/target-status.ts:159-169`：`!res.ok` 分支按 `res.status` 分流 ——
  `401` / `403` ⇒ `not_permitted`，其余非 2xx ⇒ `non_2xx`。结论仍是 `unknown`，`release` / `reconcile`
  的行为一个字未动（成因只是「为什么没拿到答案」的分类，不是重试闸）。
- 同文件头部注释（EN:13、ZH:33）补上「401/403 自成一个成因」。

**读面**
- 读面本来就是原样透出 `reason`（`write-claim-query.service.ts` 的 `projectLookup` / `lookupsFor`
  与在途清单的 `lastLookup`；释放证据的 `releaseLookups` 亦然），本次不需要改代码，只补测试钉住。

**控制台**
- `Web-Admin-Vue/src/views/ai-tools/AiToolsView.vue:594-597`：`LOOKUP_REASON_KEYS` 加
  `not_permitted: 'lookupReasonNotPermitted'`。
- `Web-Admin-Vue/src/i18n/zh.ts:1246`：`目标拒绝展示（401/403）`；
  `Web-Admin-Vue/src/i18n/en.ts:1250`：`Target refused to show it (401/403)`。

**测试**
- `Server-NestJS/src/ai/proxy/target-status.spec.ts:242-268`：401 与 403 ⇒ `not_permitted`；
  404 与 500 ⇒ 仍是 `non_2xx`（不扩大细分）。
- `Server-NestJS/src/governance-shared/services/write-claim-query.service.spec.ts:429-447`：
  两条 `unknown` 读数在 `lookupsFor` 上给出 `non_2xx` 与 `not_permitted` 两个不同成因 ——
  读者按字段分流，不必解析散文。
- `Web-Admin-Vue/src/views/ai-tools/__tests__/AiToolsView.spec.ts:396,421-423`：历史对话框渲染
  中文案而非原样漏出 `not_permitted`，且不与非 2xx 共用一句（并线后夹具含第三条 `not_permitted` 读数，
  R-1 的「收据 / 当前状态」两种种类仍在）。

**文档（对外可读取值域变了，按 §11.2 / §9 同步）**
- `CLAUDE.md:858`（lookups 行，中英各一句）。
- `docs/ai-agent.spec.md:435`（EN）/ `:460`（ZH）。
- `docs/revoke-contract.spec.md:618`（EN）/ `:713`（ZH）。
- `docs/manual/ai-bridge-en.md:106` / `docs/manual/ai-bridge.md:106`。

## 为什么

`unknown` 的成因是「我们为什么没拿到答案」。把 401/403 与 5xx 都记作 `non_2xx`，等于把
「目标有意不让看」与「目标坏了」压成同一个值 —— 这正是审计系列一直在纠的那类塌缩。二者都仍是
`unknown`（都没有告诉我们写有没有执行），但成因必须可区分。

## 验收如何被满足

- 401/403 ⇒ 新成因：由 `target-status.spec.ts` 两条码逐一断言。
- 500 / 其他非 2xx ⇒ 仍是 `non_2xx`：同文件对 404/500 断言（原有 500 用例保留）。
- 两种读数在读面上无需解析散文即可区分：`write-claim-query.service.spec.ts` 的字段级断言；
  控制台另有文案级断言。
- 未改 schema / 契约 / 重试行为：`reason` 是 `varchar(32)` 字符串列（`1847000000000-AddTargetStatusLookups.ts`），
  代码里类型窄、库里只是字符串，无需迁移；契约行 `ai-audit-log-row` 不含该表。

## 命令与读数

（以下读数取于原基线 `379c385f`。）

- `npx jest src/ai/proxy/target-status.spec.ts src/governance-shared/services/write-claim-query.service.spec.ts`
  ⇒ 2 套 / 48 例全绿。
- `npx jest src/governance-shared src/governance-core src/ai/proxy`
  ⇒ 49 套 / 650 例全绿（首次 6 套红是 worktree 未初始化 `specs/protocol` 子模块；
  `git -c protocol.file.allow=always submodule update --init Server-NestJS/specs/protocol` 后复跑全绿）。
- `npx tsc -p tsconfig.build.json --noEmit` ⇒ 0 错。
- `Web-Admin-Vue`：`npm run typecheck` ⇒ 0 错；`npx vitest run src/views/ai-tools/__tests__/AiToolsView.spec.ts`
  ⇒ 22/22。
- `KEELBASE_JAVA_REPO=D:/Rain6fish/KeelBase4J npm run check:all` ⇒ **36/36 全过（71.3s）**。
- `NODE_ENV=test npx jest --config ./test/jest-e2e.json test/audit-reader-scope.e2e-spec.ts --runInBand`
  ⇒ 1 套 / 19 例全绿（含 AW-17 读面：普通用户 403、审计读者见成因、范围外 404）。
- `npx eslint`（后端四个改动文件 / 控制台四个改动文件）⇒ 0 error（控制台 14 条 warning 均为文件内既有）。

> 环境说明：本 worktree 原本没有 `node_modules`，为跑测试对三个位置建了指向主检出依赖的目录联接
> （根 / `Server-NestJS` / `Web-Admin-Vue`）。联接是未跟踪的本地产物，提交不含它。

## 并线后复跑（2026-11-26，基线 `f45d9655`）

cherry-pick 后的读数（worktree `epic-lewin-d45f7a`，提交 `42d095cf` + `e7ec6003`）：

- 定向：`npx jest src/ai/proxy/target-status.spec.ts src/governance-shared/services/write-claim-query.service.spec.ts`
  ⇒ **2 套 / 52 例全绿**（旧基线是 48 例，多出的来自并线进来的 R-1 / R-2 用例）。
- 治理面：`npx jest src/governance-shared src/governance-core src/ai/proxy`
  ⇒ **49 套 / 663 例全绿**（旧基线 650）。
- e2e：`NODE_ENV=test npx jest --config ./test/jest-e2e.json test/audit-reader-scope.e2e-spec.ts --runInBand`
  ⇒ **1 套 / 19 例全绿**（含 AW-17 读面：普通用户 403、审计读者见成因、范围外 404）。
- 后端类型：`npx tsc -p tsconfig.build.json --noEmit` ⇒ **0 错**。
- 控制台：`npm run typecheck` ⇒ **0 错**；`npx vitest run src/views/ai-tools/__tests__/AiToolsView.spec.ts`
  ⇒ **25/25**（旧基线 22）。
- lint：后端四个改动文件、控制台四个改动文件 ⇒ **0 error**（控制台 14 条 warning 均为文件内既有）。
- **反向判据**：把 `!res.ok` 分支临时改回恒 `'non_2xx'`，`target-status.spec.ts` **1 例转红**
  （正是 `F-122：401 / 403 ⇒ unknown（not_permitted）`），逐字还原后 **17/17** 复绿。
- `KEELBASE_JAVA_REPO=D:/Rain6fish/KeelBase4J npm run check:all` ⇒ **36/36 全过（67.3s）**。

## 未做 / 风险

- **既有读数不变**：历史行里已有的 `non_2xx` 原样保留，不回填、不改写 —— 它们是当时的事实，
  只是不再产生新的同类值。导出/控制台对旧值仍有映射（`lookupReasonNon2xx`），无迁移问题。
- **401 的语义**：401 也可能是委托 token 过期/不被接受，而非目标主动「不让看」；两者都仍是
  「目标拒绝展示」这一上层事实（目标活着、有意地回答了拒绝），故归入同一成因。若日后需要区分
  401 与 403，可在同一词表上再拆，当前 F-122 不要求。
- **未动** `release` / `reconcile` 门槛、审计动作、schema、契约版本。
- 控制台 React 预览版没有该读面，无需同步。
