# R-1 后续 · 读历史模式落地（2026-11-26）

- worktree `jolly-cartwright-0ff27b` / 分支 `claude/jolly-cartwright-0ff27b`
- 基于本地 `main` `f45d9655`；决策稿见 `handoff/r1-history-mode-proposal-1126.md`（同分支）
- 契约子模块 pin：`015f474ebf0cf5f45c855614b18020857665c700`（未改）
- **未推送、未打 tag、未改私库、未改 schema、未改契约**

## 改了什么

**词表** `Server-NestJS/src/governance-core/target-status.ts`
- `TargetStatusLookupReason` 新增 `history-unavailable` / `history-does-not-cover` /
  `history-truncated` / `history-no-verdict`，注释逐一写明「目标没有告诉我们」，没有一种是「它没跑」。

**声明** `Server-NestJS/src/ai/proxy/proxy-tool.ts`
- `ProxyToolConfig.historyPath?` + 只读字段；能力派生改为 `statusPath || historyPath ? 'yes' : 'unknown'`。

**探针** `Server-NestJS/src/ai/proxy/target-status.ts`
- 模式选择：`historyPath` 优先于 `statusPath`；**两条同时声明 ⇒ `misconfigured`，发送前拒绝**。
- 历史模式复用同一组构造性守卫（只 GET、相对路径、`{key}` 必填且代入干净）、同一身份（原写入者）、
  同一次 `proxyFetch`、不重试。
- 解析：仍只认目标显式 `{status, basis}`；没有判决时由披露定成因，顺序为
  `available:false` → `history-unavailable`，`coversActionKey:false` → `history-does-not-cover`，
  `complete:false`/`hasMore:true` → `history-truncated`，有历史对象但以上都没披露 → `history-no-verdict`，
  连历史对象都不是 → `unrecognized_answer`。
- `canAsk` 接受 `historyPath`；两条同配返回 `false`。

**覆盖事实** `Server-NestJS/src/ai/proxy/outbound-target-facts.ts`
- 写工具「两条通道都没有」才算缺口；只配历史端点的目标不再被误报。

**导入器** `scripts/generator/import-openapi-proxy.mjs`
- `x-keelbase-history-path` → `historyPath`，描述串带「历史查询」。

**控制台** `Web-Admin-Vue`
- `LOOKUP_REASON_KEYS` 与 `zh.ts`/`en.ts` 各加 4 个成因文案。

**文档** `docs/ai-agent.spec.md`（AW-17 第二种模式 EN+ZH；AW-19 派生句；「问不到的目标」）、
`docs/revoke-contract.spec.md` §6（EN+ZH 各一段）、`docs/manual/ai-bridge{,-en}.md`、`CLAUDE.md` §9 两行。

**测试**
- `target-status.spec.ts` +7 例：判决优先、**空历史无披露 ⇒ `history-no-verdict`（不是 `not_executed`）**、
  三种披露的成因与优先级、非历史形状 ⇒ `unrecognized_answer`、两条同配 ⇒ `misconfigured` 且零请求、`canAsk`。
- `outbound-target-facts.spec.ts` +1 例：只配 `historyPath` 不算缺口。
- `scripts/keelbase-init.test.mjs` +1 例：扩展映射。
- `Web-Admin-Vue` 视图 +1 例：历史成因本地化渲染、不把词表原样漏出。

## 与决策稿的差异

- 决策稿 §3.1 原写「两条同配时 `canAsk()` 仍返回 `true`」。实现改为 **`false`**：`canAsk` 一直镜像
  `lookup` 发送前那组门（`POST` 状态路径即 `false`），同配是同一类拒绝。稿子已同步改。
- 文档不点名 `not_permitted`（F-122 尚未并入 main），只写「401/403 = 不给看，不是不可达」；
  等 F-122 落地后由该分支的文档补上词表。

## 读数

- `npx jest src/ai/proxy src/governance-core src/governance-shared/services` ⇒ **46 套 / 645 例全绿**
- `npx tsc -p tsconfig.build.json --noEmit` ⇒ 0 错
- 改动文件 `npx eslint` ⇒ 0 error
- `node --test scripts/keelbase-init.test.mjs` ⇒ **80/80**
- `Web-Admin-Vue`：`npm run typecheck` ⇒ 0 错；`npx vitest run src/views/ai-tools/__tests__/AiToolsView.spec.ts`
  ⇒ **26/26**
- `KEELBASE_JAVA_REPO=D:/Rain6fish/KeelBase4J npm run check:all` ⇒ **36/36（44.0s）**

## 未做 / 风险

- `not_permitted` 未在本分支实现（属 F-122 分支的工作）；本分支历史模式遇到 401/403 仍记 `non_2xx`，
  并入 main 时若 F-122 先落，两者自然合流。
- 未跑全量 e2e；未在浏览器里点过控制台（视图测试覆盖渲染，后端行为由单测覆盖）。
- worktree 为跑测试对三处 `node_modules` 建了指向主检出的目录联接（未跟踪，不入提交）。
