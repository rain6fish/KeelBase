# R-4 · 陈旧视图的释放绑定（F-69 / F-103）— 2026-11-25

## 结论 / 一句话

释放端点现在**绑定审阅者当时看到的视图**：提交时账本若已变动，以 `stale_view` 拒绝，**且拒绝本身写成一条
`claim_release` 审计行**；控制台把屏幕冻结的读数随请求带上。**未新增审计动作、未改契约、未动 schema。**

worktree：`.claude/worktrees/epic-lewin-d45f7a`；分支：`claude/epic-lewin-d45f7a`；起点：`e8f07a0f`。

## 裁定：拒绝行落在哪条链、用哪个既有动作（实现前定，理由写在代码里）

- **链**：AI 审计链 —— 与它拒绝的那次释放**同一条链**。放操作审计链会把一次动作的两个结局分到两本账上；
  该端点本就标 `@SkipAudit()`，AI 链是这个动作的账。
- **动作**：闭集里已有的 `claim_release`。动作枚举是契约闭集，不得新增；而「一次动作、两种结局」与
  `tool_confirmation` / `effect_revoke` 的先例一致（动作名动作，结局写在别处）。
- **结局怎么表达**：`outcome` **不写** —— 冻结词表（`ai-audit-log-outcome-v3-vector.json`）对
  `claim_release` 只允许 `null`，写任何词都是替未知下判决，且会给该动作扩一个契约外取值。故结局写在
  `detail`，**开头即** `release refused (stale_view)`，并写明「屏幕说的 vs 账本现在说的」。
- **没有 `releaseLookups` 列**：契约说该列是**释放决定**背后的证据、非释放行为空 —— 这里没有释放决定。
- **代价（如实）**：只读审计行**不能靠结构字段**筛出拒绝；按 `action` 计数会把被拒尝试算作释放。
  这与 R-3 已裁的口径同源（F-97/F-100：detail 先解决人可读；结构化要触契约，等出现「只读审计行就行动」的
  消费者再翻）。消费者出现时的翻法 = 给该动作扩 outcome 取值（契约 MINOR）或独立动作（契约 MAJOR 级），
  两者都是契约变更，本条不做。

## 改了什么（文件 + 行）

后端
- `Server-NestJS/src/governance-shared/services/write-claim-decision.service.ts`
  - 类文档新增 R-4 段（英文块 + 中文块，含上面「落在哪条链/哪个动作」的裁定）：`:40-52` / `:72-78`。
  - `release()`（`:156`）：
    - 证据读提前到**任何写入之前**（`:175`），并顺带取**最近一次读数的 id**（比对键）。
    - 视图比对 `_movedSinceView`（`:181`，定义 `:418`）：`decisionState` 或 `lastLookupId` 任一不符 ⇒
      `stale_view`，先写拒绝行（`:183-189`）。
    - 条件更新从「接受 `open` + `awaiting_decision`」收窄为 **`decision_state = view.decisionState`**（`:214-224`）。
    - 更新落空（affected=0）时重读：处置已变 ⇒ 同样是 `stale_view` + 拒绝行（读数**重读**，`:228-242`）；
      否则维持 `already_closed` / `not_claimable`。
  - `_releaseEvidence`（`:316`）新增返回 `latestLookupId`。
  - `_writeReleaseRow`（`:364`）：`evidence` 参数改为可空 —— 拒绝行不写 `releaseLookups` 列；仍是
    `claim_release` 唯一写入点。
  - `_refusalDetail`（`:439`）：拒绝行散文（含 changed / view / ledger now / lookups on record / note）。
  - 类型：`ReleaseClaimView`（`:550`）、`ReleaseClaimInput.view`（必填）、`ReleaseClaimOutcome` 增
    `'stale_view'`、`ReleaseClaimResult.auditRowId` 注释（`:573` 起）。
- `Server-NestJS/src/ai/dto/release-claim.dto.ts`：新增 `ReleaseClaimViewDto`（`:36`：`decisionState`
  取闭集；`lastLookupId` **必须出现、可为 `null`** —— 缺席即 400，不让「不检查」成为静默默认）；
  `ReleaseClaimDto.view`（`:102`，`@IsDefined` + `@ValidateNested`）。
- `Server-NestJS/src/ai/ai.controller.ts`（`:1028-1070`）：透传 `dto.view`，注释与 Swagger 摘要更新。

控制台（`Web-Admin-Vue`）
- `src/views/ai-tools/AiToolsView.vue`：释放对话框写明冻结读数（模板 `:326-333`；`releaseViewDisposition`
  / `releaseViewLookup` `:737`）；`onRelease` 带上 `view`（取自打开对话框时那一行，**不在提交时重读**）
  并对 `stale_view` 单独提示（`:748-770`）。
- `src/api/aiTools.ts`（`:56-74`）：`releaseClaim` body 增必填 `view`。
- `src/types/admin.ts`：`ReleaseClaimResult.outcome` 增 `'stale_view'`；新增 `ReleaseClaimView`。
- `src/i18n/zh.ts`（`:1195-1201`）/ `src/i18n/en.ts`（`:1197-1203`）：`inFlightReleaseViewHint` /
  `inFlightReleaseViewNoLookup` / `inFlightReleaseStaleView`，中英各一份。

文档
- `CLAUDE.md` §9 该端点行：body、`stale_view`、拒绝成行、口径指针（中文表格行；双语全文在规格文档）。
- `docs/revoke-contract.spec.md` §6：新增一段（英文段 + 中文段），写清绑定、拒绝行、同链同动作与「暂无结构化
  筛选」的边界。

测试
- `Server-NestJS/src/governance-shared/services/write-claim-decision.service.spec.ts`：既有 12 处 `release()`
  调用补上视图；新增 5 例（清扫移行 ⇒ stale_view + 拒绝行 + 账本不动；新读数 ⇒
  `changed: lastLookup`；反证：视图一致 ⇒ 正常释放且无拒绝行；拒绝后按刷新视图重交 ⇒ 一行拒绝 + 一行释放；
  他人先释放 ⇒ stale_view 而非通用理由）。
- `Server-NestJS/test/stale-view-release.e2e-spec.ts`（**新**，可执行用例，见下）。
- `Server-NestJS/test/audit-reader-scope.e2e-spec.ts`：既有 release 调用补 `view`（否则现在会 400）。
- `Web-Admin-Vue/src/views/ai-tools/__tests__/AiToolsView.spec.ts`：新增 1 例（对话框写明冻结读数 +
  请求带 `view` + `stale_view` 提示；反证：没有 success 提示）。

## 验收如何被满足

- **冻结**：`view` = 屏幕那一行的 `decisionState` + `lastLookup.id`（读面 `GET /ai/tool-effects/claims`
  已有，无需新端点；控制台从所点的那一项取，提交时不重读）。
- **不一致即拒绝**：`decisionState` 或 `lastLookupId` 任一与账本不符 ⇒ `outcome: 'stale_view'`；
  条件更新本身也收窄到「审阅者看到的处置」，把清扫在检查与写入之间的那一步也挡住。
- **拒绝写成一行**：同链同动作 `claim_release`，`outcome` 空，`detail` 开头 `release refused (stale_view)`，
  结果里的 `auditRowId` 指向它。
- **单人可复跑**：清扫是服务调用（正是每小时维护任务那一处），不需第二个人；用例见
  `Server-NestJS/test/stale-view-release.e2e-spec.ts`（取视图 → 清扫移行 → 重交 → 断言 `stale_view`
  与那一行；反向：刷新后释放成功，链上恰好一行拒绝 + 一行释放；另两例钉住「视图必填、`null` 必须显式给」）。

## 跑过的命令与读数

| 命令 | 读数 |
|---|---|
| `npx jest src/governance-shared/services/write-claim-decision.service.spec.ts` | **17/17 通过** |
| `npx jest src/governance-shared` | **520/520 通过，37/37 套** |
| `NODE_ENV=test npx jest --config test/jest-e2e.json test/stale-view-release.e2e-spec.ts` | **4/4 通过** |
| `NODE_ENV=test npx jest --config test/jest-e2e.json test/audit-reader-scope.e2e-spec.ts` | **19/19 通过** |
| `npx jest src/ai/ai.controller.spec.ts` | **36/36 通过** |
| `npm test`（后端全量单测） | **4160/4160 通过，443/443 套** |
| `npx tsc -p tsconfig.build.json --noEmit` | 0 错误 |
| `npx eslint`（3 个改动的后端源码文件） | 0 findings |
| `npm run check:all` | **34/36**；两红均为**本 worktree 缺同级 Java 检出**（`check:coverage-gaps` / `check:java-vectors` 报 `…\worktrees\KeelBase4J` 不存在）。指向真实 Java 仓复跑：`KEELBASE_JAVA_REPO=D:/Rain6fish/KeelBase4J` ⇒ 两门均绿（向量 13↔13、schema 225↔225；缺口表 14 条一致）。**与本次改动无关**，门禁未放宽。 |
| `cd Web-Admin-Vue && npm run typecheck` | 0 错误 |
| `cd Web-Admin-Vue && npx vitest run src/views/ai-tools/__tests__/AiToolsView.spec.ts` | **21/21 通过** |

环境备注：该 worktree 起初未安装依赖、契约子模块 `Server-NestJS/specs/protocol` 未初始化（初跑
governance-shared 有 8 例失败，全因缺 `specs/protocol/schemas/...`）。已 `npm ci` 两处并用
`git -c protocol.file.allow=always submodule update --init Server-NestJS/specs/protocol` 初始化到 pin
`015f474`；之后 520/520 全绿。这两步只作用于本 worktree。

## 未做 / 风险

1. **只读审计行的机器可筛性**：按 `action` 计数把被拒尝试算作释放；按结局筛选须解析 `detail`。这是
   契约闭集 + 冻结词表的直接后果，按 F-97/F-100 的口径推迟（触发点：出现只读审计行就要行动的消费者）。
   要翻 = 契约变更。
2. **`lastLookupId` 绑定存在微秒级窗口**：处置比对在条件更新的 WHERE 里（无窗口）；「最近一次读数未变」
   跨表，只能在写入前检查 —— 一条读数恰好落在检查与写入之间时不会被这次拒绝看见（它仍被记录，账也未
   被静默改写）。已在代码注释里写明，不做事务化（多余复杂度）。
3. **请求形状是破坏性变更**：`view` 必填 —— 不带视图的旧客户端会 400。这是有意的（缺席视图 = 静默不检查）。
   已同步 `CLAUDE.md` §9 与规格文档；仓内唯一其它调用方（`audit-reader-scope` e2e）已改。
4. **控制台标签**：拒绝行在 AI 审计列表里仍用该动作的标签（「释放写占位」），一眼看去像释放；`detail`
   首句已说明拒绝。要改标签需要一个「按行种类取标签」的机制（属第 1 条的结构化改动）。
5. **R-6 的零读数措辞**：拒绝行用「`lookups on record: N`」，与释放行的
   `lookups: none (never queried)` 是两句话；R-6 改释放行的零/不可问措辞时，**拒绝行是否也该分「问不了」**
   留给 R-6 一并裁（本行不复制它的措辞，故不会与它冲突）。
6. 未推送、未打 tag（工作时段）；`check:contract-release-gate` 本次为绿（v1.23.0 tag 已在）。

## 脚本怎么跑（单人、一条命令）

```powershell
cd Server-NestJS
$env:NODE_ENV = "test"; npx jest --config test/jest-e2e.json test/stale-view-release.e2e-spec.ts
```

用例内部：`createTestApp()` 起真 DI + 真库 → 建管理员 → 直接写一条 90 分钟前的 `open` 占位 →
`GET /ai/tool-effects/claims` 取视图 → `app.get(WriteClaimDecisionService).sweepOverdue(60)` 把行移走 →
`POST .../release` 带冻结视图 → 断言 200 / `outcome=stale_view` / `auditRowId>0` / 账本三列未动 /
审计行 `detail` 含 `release refused (stale_view)` 且无 `releaseLookups`。
