# R-2 四处遗留修复（2026-11-25）

- 分支：`claude/gallant-roentgen-bf66d8`（worktree `gallant-roentgen-bf66d8`），基于本地 `main` `379c385f`。
- **未 push、未打 tag、未合 main**；未触碰 R-1 分支、契约子模块指针（只就地初始化到既有 pin `015f474`，无提交）。
- 认领行：私库 `fix-r2-residual-1125`（本会话无权写私库，结论在此，由父会话收口）。

---

## 1. re-claim 后的假覆盖（最重要）

**改了什么** — `Server-NestJS/src/governance-shared/services/write-claim-query.service.ts:263-295`

- 覆盖窗口改为**以本次 `claimedAt` 为下界**：`inThisAttempt = chrono.filter((l) => l.at.getTime() >= claim.claimedAt.getTime())`；
  `first` / `firstLookupAfterWriteSeconds` / `observedFrom` / `unobservedSeconds` 全部改读本次尝试的第一条读数。
- `coverage` 新增加性字段 **`readingsBeforeClaim`**（`write-claim-query.service.ts:660`）：早于本次占位的读数条数。
  这些行**仍留在 `items` 里**（是同一幂等键的证据），但不再被读作本次的首个采样。
- 去掉了原先掩盖缺陷的 `Math.max(0, …)` 夹取（那段夹取正是把负值伪装成「0 秒未观测」的地方）；
  `no-lookups-yet` 分支的「占位至今」仍保留 `Math.max(0, …)`（时钟偏斜时仍可能略负）。
- 控制台：`lookupCoverageText`（`Web-Admin-Vue/src/views/ai-tools/AiToolsView.vue:845-862`）在
  `readingsBeforeClaim > 0` 时追加一句，i18n 新键 `lookupCoverageEarlier`（zh/en 各一条）——
  否则「声明说本次还没读过」与「下面是全部读数的表」看起来自相矛盾。
- 文档：`docs/ai-agent.spec.md` AW-17 读面（英/中两段各加一句）、`CLAUDE.md` 端点行（字段清单 + 窗口口径）。

**行为**：旧读数 → re-claim → 新读数 的序列，声明给的是「从**本次** `claimedAt` 到新读数」的盲区，
`readingsBeforeClaim=1`；若 re-claim 后还没有新读数，则 `basis=no-lookups-yet`、给「占位至今」的整段时长。
不再出现 `firstLookupAfterWriteSeconds` 为负、`unobservedSeconds` 被夹到 0 的「假已观测」。

**测试**：`write-claim-query.service.spec.ts:495` 与 `:524` 两条
（`R-2 **反向（重占位）**：早于本次占位的旧读数不得把「未观测」说成「已观测」`、
`R-2 **反向（重占位）**：读数全部早于本次占位 ⇒ 本次至今未观测，不是 0`）。

---

## 2. 控制台历史竞态

**改了什么** — `Web-Admin-Vue/src/views/ai-tools/AiToolsView.vue:914-941`

- `loadLookupHistory` 记录发起时的**单调递增令牌**，`await` 返回后（成功与失败两支都）比对；
  不是最新一次请求就丢弃，不写 `lookupHistory` / `lookupCoverage` / `lookupClaimedAt` / `lookupFirstGap`。
- 选令牌而非只比 claim id：后者拦不住「关掉又重开同一条」的 ABA（旧响应会盖回同一对话框）。

**测试**：`AiToolsView.spec.ts` 的
`AW-17 **反向（竞态）**：慢响应的历史不得落到另一条占位的对话框里`（claim 7 慢、claim 9 快，慢响应后到）。

---

## 3. 类型过声明

**改了什么** — `Web-Admin-Vue/src/types/admin.ts`

- 拆成两个形状：`TargetStatusLookup`（两个读面共同的基础投影，`admin.ts:538`）与
  `TargetStatusLookupPositioned extends TargetStatusLookup`（历史项，带 `seq` / `intervalSeconds`，`admin.ts:564`）。
- `InFlightClaim.lastLookup` 用基础形状（服务端 `projectLookup` 不投影 `seq` / `intervalSeconds`）；
  `ClaimLookupsResponse.items` 用历史项形状。`AiToolsView` 的 `lookupHistory` 随之改为历史项类型。

**判据**：`AiToolsView.spec.ts` 的 `类型：在途 lastLookup 不声明历史项的位置读数（编译期判据）` ——
一条赋给 `InFlightClaim['lastLookup']` 的字面量，缺少 `seq` / `intervalSeconds` 必须**编译通过**；
把形状合回去则 `vue-tsc --noEmit` 直接报 `missing the following properties from type 'TargetStatusLookupPositioned': seq, intervalSeconds`。

---

## 4. 注释与 i18n 小项

- **硬编码全角冒号**：`AiToolsView.vue:397` 的 `{{ t('lookupWriteGap') }}：` 改为模板不带冒号，
  分隔符并入 i18n（zh `'写 → 首问：'`、en `'Write → first ask: '`）。判据：F-85 用例新增断言
  `toContain('写 → 首问：')`（见反向判据表第 5 行）；`grep '：' AiToolsView.vue` 已无模板里硬编码的冒号。
- **中文在前的 5 处注释**：其中 **3 处在 main 上、已改**：
  - `audit-query.service.ts:29`（单行 JSDoc，英文在前）
  - `audit-query.service.ts:256-257`（两行块，英文行在前）
  - `audit.service.ts:72`（单行 JSDoc，英文在前）
- ⚠ **另 2 处不在此分支**：任务点名的 `postgres-migrations.ts:143-146` 与
  `AddTargetStatusLookupBasis.spec.ts` 头，只存在于**未合入的 R-1 分支**（`save/r1-basis-1124` = `712e91e4`）；
  main 的 `postgres-migrations.ts` 近一周只有一行新增（`'*AddAiAuditReleaseLookups*'`，无注释）。
  本会话不应改另一会话的分支，故**未改**；R-1 落地时（或由 R-1 会话）需把
  `postgres-migrations.ts` 里 `*AddTargetStatusLookupBasis*` 之上那四行注释、以及 `AddTargetStatusLookupBasis.spec.ts`
  文件头改为英文块在前。若 v1.5.0 不带 R-1，则这两处随 R-1 一起处理即可。

---

## 5. 读数（全部在本 worktree 真跑）

| 项 | 结果 |
|---|---|
| `jest src/governance-shared/services/write-claim-query.service.spec.ts` | **33/33**（原 31 + 新 2） |
| `jest src/governance-shared`（整目录，防回归） | **37 suites / 532 passed** |
| `vitest run src/views/ai-tools/__tests__/AiToolsView.spec.ts` | **25/25**（新 4：重占位声明、竞态、类型判据 + 既有用例补断言） |
| `npx tsc -p tsconfig.build.json --noEmit`（后端） | **0 error** |
| `npm run typecheck`（`vue-tsc --noEmit`，控制台） | **干净** |
| `npm run build`（控制台，Vite 产物） | **built in 9.63s** |
| `NODE_ENV=test jest --config test/jest-e2e.json test/audit-reader-scope.e2e-spec.ts` | **19/19** |
| `npx eslint`（4 个改动的后端文件，严格形态） | **0** |
| `npm run check:all`（`KEELBASE_JAVA_REPO=D:/Rain6fish/KeelBase4J`） | 提交后 **36/36 全过**（44.3s）。过程读数：提交前 35/36，唯一红 `check:semantic-single-source`（改动未提交 ⇒ 无提交可承载 trailer，不是代码问题）；首次提交后它转绿，但 `check:commit-order` 因 trailer 单独成行判红 —— 把 trailer 并入英文段末尾后 **36/36**（见 §7 的提醒） |

环境说明：本 worktree 的契约子模块原本未初始化；用 `git -c protocol.file.allow=always submodule update --init`
从主检出的子模块本地取到既有 pin `015f474`（无网络、无 push、无指针改动）。`prettier --check` 对本仓 Vue 文件
不做门禁（存量长行本就不过），故未运行 `--write`，避免搅动未触及的格式。

---

## 6. 反向判据（实测改坏 ⇒ 红）

| # | 改坏了什么 | 红在哪 | 读数 |
|---|---|---|---|
| 1 | 覆盖窗口退回 `chrono[0]`（原缺陷） | 两条重占位用例 | `Expected 1800 / Received -82800`；第二条 `Expected null / Received -3600` ⇒ **2 红 / 31 绿** |
| 2 | `readingsBeforeClaim` 写死 0 | 同两条重占位用例 | `Expected 1 / Received 0` ⇒ **2 红 / 31 绿** |
| 3 | 删掉 `if (token !== lookupRequestToken) return` | 竞态用例 | 对话框被慢响应覆盖，`to contain '/status/nine'` 失败 ⇒ **1 红 / 24 绿** |
| 4 | `lastLookup` 改回 `TargetStatusLookupPositioned`（过声明） | `vue-tsc` 在类型判据用例处 | `TS2739 … missing … seq, intervalSeconds` ⇒ **类型检查红** |
| 5 | 去掉 zh `lookupWriteGap` 的冒号 | F-85 用例的分隔符断言 | `toContain('写 → 首问：')` 失败 ⇒ **1 红 / 24 绿** |

全部反证已还原；`git status --porcelain` 只余本任务的 11 个已跟踪改动文件（另加本报告）。

第 5 条只证明「分隔符渲染仍在」；它**不能**区分「来自 i18n」与「硬编码」。后者由 grep 保证
（模板里已无全角冒号字面量）。注释顺序两项属文本规范，无可执行判据，此处如实说明：判据是 grep 与人工核对。

---

## 7. 是否建议并入 v1.5.0

**建议并入。** 理由：

1. **第 1 条是发布面风险**：它让覆盖声明在最需要它的场景（重占位后的外部写）说出「已观测」——
   与 R-2 的立项理由同类，属「声明不实」，release 前修好成本最低。
2. **全部为加性、无迁移、无契约变更**：`readingsBeforeClaim` 是 `/claims/:id/lookups` 的响应字段
   （该读面不在契约仓，与 R-2 原结论一致）；没有 schema 改动、没有新动作、没有排序契约改动。
3. **第 2–4 条为低风险收口**：竞态与类型过声明都只在前端；注释/i18n 无行为影响。
4. **反向判据齐备**（§6），且回归面小（1 个后端 spec、1 个控制台 spec、1 个 e2e）。

**并入时的注意**：

- 提交信息须带 **`[no-semantic-change]`** trailer —— 本批触及 `audit.service.ts`（仅注释重排），
  语义单源门禁在无契约变更时按此豁免（见 `Server-NestJS/scripts/check-semantic-single-source.mjs`）。
  ⚠ 该 trailer 要放在**英文段末尾**、中文段之前：`check:commit-order` 会把单独成行的 trailer 当作
  「中文段之后又来了一段英文」并判红（本会话实测踩到过一次）。
- **不要**把 R-1 分支的两处注释顺序修复算进本批（它们的文件不在 main 上）；R-1 若同时进 v1.5.0，
  请在同一批次里改掉（§4 末）。
- 若并入顺序是「R-2 遗留 → 再合 R-1」，两处改动**不冲突**（已对 `save/r1-basis-1124` 的 diff 核过）：
  R-1 改的是 `projectLookup` 与 `TargetStatusLookupView`（加 `basis`），本批改的是 `lookupsFor` 的窗口计算与
  `ClaimLookupCoverage.readingsBeforeClaim`；两批加的字段在不同接口、不同 hunk，合并时两边都保留即可。
  R-1 的 `basis` 与本批的 coverage `basis` 是两套词表（R-1 注释里已写明不可互换），别合并。

---

## 8. 遗留 / 未做

- §4 末的两处 R-1 分支注释（本会话不可达）。
- 复核报告 §9.2 记的「R-2 未把 `coverage` 写进 `docs/ai-agent.spec.md`」——本批已顺手补齐（英/中两段），
  属该条的收口。
- 私库认领行与 roadmap 状态由父会话收口（本会话无权写私库）。
