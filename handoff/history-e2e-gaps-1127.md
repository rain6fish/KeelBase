# AW-17 历史模式剩下的两类端到端（2026-11-27）

- worktree `wonderful-banach-252d61` / 分支 `claude/zen-haslett-c6bb33`，基于 main `e18233d9`。
- 新增文件：`Server-NestJS/test/target-status-history-sweep.e2e-spec.ts`（4 例）。
- 未改产品代码、契约字段、动作或 schema；无迁移。
- 本地提交，未推送、未打 tag；未触碰私库 `KeelBase-Private`。

## 前一份报告留下的两类缺口

`handoff/history-mode-e2e-1126.md` 写明未覆盖：

1. 自动清扫（`system:sweep`）走历史模式 —— 此前只有人工对账的 e2e；
2. `historyPath` 配成非 GET / 缺 `{key}` —— 单测只覆盖「发送前拒绝」本身，
   e2e 只覆盖了两通道同配这一种 `misconfigured`。

本文件只补这两类，用新文件承载，避免 `target-status-history.e2e-spec.ts` 继续膨胀。

## 这条 e2e 走的真链路

`createTestApp()`（真 DI、真 sqlite）→ `SettingsService.set('ai_proxy_tools', …)` 触发
`ProxyToolRegistryService` 热更新 → 真 `ToolRegistry` 注册三个带 `historyPath` 的 B 路径写工具 →
种一条已过陈旧阈值、仍 `claimed` 的占位 → **清扫自己的入口**
`MaintenanceTasksService.expireInFlightClaimWindows()`（每小时 cron，非手工抄内部 pass）→
`WriteClaimDecisionService.sweepOverdue()` 入队 → `AiToolEffectsService.reconcileDueClaims()` →
`reconcileClaim(…, 'system:sweep')` → 真 `ProxyTargetStatusProbe` → 真 `http.createServer` 受控目标
（`GET /api/contracts/:key/history`）→ 证据行落库 → 决定行上链 → 读面。

## 覆盖的判据与断言位置

### 1. 自动清扫经历史端点拿到判决（`自动清扫经历史端点拿到 not_executed…`）

- `not_executed` ⇒ 占位 `status=released`、`releaseReason=target_status_not_executed`。
- 目标侧：**恰好一次**请求，方法 `GET`，路径 `/api/contracts/<key>/history`；
  解码 `Bearer` 委托断言 `sub=local:<writerId>`、`aud=legacy-erp`（不是清扫自己，也不是管理员）。
- 证据行：`lookedUpBy='system:sweep'`（谁问的）、`asUserId=<writerId>`（以谁的身份问的）、
  `conclusion=not_executed`、`queryPath` 为历史路径。
- 决定行（`ai_audit_logs.action='claim_release'`）：`userId='system:sweep'`，`detail` 同时含
  `origin: target answered not_executed`、`(GET /contracts/<key>/history ` 与
  `initiated by: system:sweep (automatic sweep)`。
- 链外证据列 `release_lookups`：`count=1`、`askable=true`、`items[0]` 的结论与
  `lookedUpBy='system:sweep'`。
- **第二趟零请求**：已释放的占位不再是候选，再次调用 cron 入口目标请求数仍为 1。

### 2/3. 发不出去的 `historyPath`（参数化两例）

| 声明 | 断言 |
|------|------|
| `POST /contracts/state/{key}` | `misconfigured`、`queryMethod=POST`、`queryPath` 为原声明 |
| `GET /contracts/history`（缺 `{key}`） | `misconfigured`、`queryMethod=GET`、`queryPath` 为原声明 |

每例均断言：

- `POST /ai/tool-effects/claims/:id/reconcile` 返回 `outcome=unresolved` / `conclusion=unknown` /
  `claimStatus=claimed`，`evidence.reason='misconfigured'`；
- **目标零请求**（拒绝在构造请求之前，断言落在线上）；
- 证据行落库：`reason=misconfigured`、`queryMethod`/`queryPath` 为被拒的那条声明、
  `asUserId=<writerId>`、`lookedUpBy=<adminId>`；
- 占位 `status=claimed`、`decisionState=open`，**没有** `claim_release` 行；
- `ProxyTargetStatusProbe.canAsk(tool) === false`；
- 读面 `GET /ai/tool-effects/claims?toolName=…` 该行 `reconcilable=false`、`status=claimed`
  （控制台的查询按钮与探针读同一件事）。

### 4. 清扫遇到问不了的通道（`自动清扫遇到问不了的通道只跳过…`）

两个上述工具各一条 `awaiting_decision` 占位 → 直接调用 `reconcileDueClaims(now)`：
`candidates=2`、`skippedUnaskable=2`、`asked=0`；**零请求**、**不写证据行**（两个 key 都查不到读数行）、
账保持 `claimed`/`awaiting_decision`、无决定行。这条钉的是「每小时一条关于我们自己配置的记录是噪声」
这一既有设计，而不是把它改成写证据。

## 读数

- 新 e2e：`test/target-status-history-sweep.e2e-spec.ts` **4/4 通过**（9.8s）。
- 既有 e2e：`test/target-status-history.e2e-spec.ts` **12/12 通过**（6.4s），未受影响。
- `npx eslint test/target-status-history-sweep.e2e-spec.ts`：0 error（严格模式，未加 `--fix`）。
- 仓库根 `KEELBASE_JAVA_REPO=D:/Rain6fish/KeelBase4J npm run check:all`：**36/36**（61.1s）。

## 环境说明

- 本 worktree 的 `Server-NestJS/node_modules` 已是指向主检出的目录联接（未被 git 跟踪，不入提交），
  未跑 `npm ci`。
- 已在本 worktree 初始化子模块 `specs/protocol`（`015f474`，与 main pin 一致）。

## 未做 / 注意

- 未改产品代码：本轮 4 例首跑即绿，未暴露真实缺陷。
- 未覆盖、也不在本轮范围内：`statusPath`（当前状态模式）一侧的同类清扫用例 —— 与本轮同构，
  若日后清扫按通道分支出现差异，应补一条对称用例。
- 未推送、未打 tag；未触碰私库 `KeelBase-Private`。
