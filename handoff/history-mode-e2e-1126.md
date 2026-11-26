# AW-17 历史模式（historyPath）端到端用例（2026-11-26）

- worktree `loving-ptolemy-2ebe3a` / 分支 `claude/loving-ptolemy-2ebe3a`，基于 main `18a81546`。
- 新增文件：`Server-NestJS/test/target-status-history.e2e-spec.ts`（12 例）。
- 未改产品行为、schema、契约字段或动作；无迁移。
- 本地提交，未推送、未打 tag。

## 这条 e2e 走了什么真链路

`createTestApp()`（真 DI、真 sqlite）→ `SettingsService.set('ai_proxy_tools', …)` 触发
`ProxyToolRegistryService` 热更新 → 真 `ToolRegistry` 注册带 `historyPath` 的 B 路径写工具 →
种一条已过陈旧阈值、仍 `claimed` 的占位 → `POST /api/v1/ai/tool-effects/claims/:id/reconcile`
（管理员）→ 真 `ProxyTargetStatusProbe` → 真 `http.createServer` 受控目标（`GET /api/contracts/:key/history`，
按用例种下的回答应答）→ 证据行落库 → 读面。

目标按 key 种回答：`json`（200 响应体）或 `http`（裸状态码）。

## 覆盖的判据

1. **真判决收敛账**
   - `{"status":"executed"}` ⇒ `reconciled` / `settled`；证据行 `conclusion=executed`、`reason=null`、
     `basis=null`；占位行 `settled`。
   - `{"status":"not_executed"}` ⇒ `reconciled` / `released`；占位 `releaseReason=target_status_not_executed`；
     `claim_release` 决定行的 `detail` 含
     `origin: target answered not_executed (GET /contracts/<key>/history`；`releaseLookups` 计数 1、
     结论与种类可读。
2. **一次 GET、携带写入者委托身份**：目标侧请求计数恰为 1，方法 `GET`，路径为历史路径；
   解码 `Bearer` JWT 断言 `sub=local:<writerId>`、`aud=legacy-erp`（不是按下对账的管理员身份）。
   证据行 `asUserId` 为写入者、`lookedUpBy` 为管理员。
3. **沉默一律 `unknown`、账不动、绝不 `not_executed`**（7 例）：
   - `history.available:false` ⇒ `history-unavailable`
   - `history.coversActionKey:false` ⇒ `history-does-not-cover`
   - `history.complete:false` ⇒ `history-truncated`
   - `history.hasMore:true` ⇒ `history-truncated`
   - `history:{}` ⇒ `history-no-verdict`
   - `history:{events:[]}` ⇒ `history-no-verdict`
   - `{"ok":true}`（非历史形状）⇒ `unrecognized_answer`

   每例均断言：`outcome=unresolved`、`conclusion=unknown`、`claimStatus=claimed`；DB 证据行
   `reason` 与预期一致；占位仍 `claimed` 且 `decisionState=open`；**没有** `claim_release` 行；
   读面同值。
4. **401 / 403 ⇒ `not_permitted`**（F-122 在历史模式下同样成立）：`unknown`、账保持 `claimed`、
   无释放行、一次 GET。
5. **两通道同配 ⇒ `misconfigured`，零请求**：`statusPath` 与 `historyPath` 同时声明时，
   `reconcile` 返回 `unresolved` / `misconfigured`；目标请求数为 0；`probe.canAsk(tool)=false`；
   直接 `probe.lookup` 结论一致且仍零请求。

## 读数

- 新 e2e：`test/target-status-history.e2e-spec.ts` **12/12 通过**（5.9s）。
- 相关单测：`src/ai/proxy` + `src/governance-core` + `src/governance-shared/services`
  **46 套通过 / 649 例通过**（1 套 PG 跳过，与既有基线一致）。
- `npx tsc -p tsconfig.build.json --noEmit`：0 错。
- `npx eslint test/target-status-history.e2e-spec.ts`：0 error。
- 仓库根 `KEELBASE_JAVA_REPO=D:/Rain6fish/KeelBase4J npm run check:all`：**36/36**（63.8s）。

## 环境说明

- 本 worktree 原缺 `node_modules`；按派工会话指示，用目录联接共享主检出的
  `Server-NestJS/node_modules` 与根 `node_modules`（未被 git 跟踪，不入提交），未跑 `npm ci`。
- 已在本 worktree 初始化子模块 `specs/protocol`（`015f474e…`，与 main pin 一致）。

## 未做 / 注意

- 未改产品代码：本轮 e2e 未暴露真实缺陷；唯一一次失败是我把「释放证据拷贝」想多了 ——
  该拷贝按设计只装观测字段（F-125），`queryPath` 在决定行 `detail` 里，断言已按设计收敛。
- **未覆盖**：自动清扫（`system:sweep`）走历史模式、`historyPath` 配成非 GET / 无 `{key}` 的
  e2e（单测已覆盖发送前拒绝；e2e 里只覆盖了两通道同配这一种 `misconfigured`）。
  如果要补，建议另起一条用例，避免本文件继续膨胀。
- 未推送、未打 tag；未触碰私库 `KeelBase-Private`。
