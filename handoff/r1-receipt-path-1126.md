# F-128 — the receipt path, run end to end (2026-11-26)

**Summary.** A target we control now answers the status query with `basis: "receipt"`, and one
end-to-end case (`test/target-status-receipt.e2e-spec.ts`) proves the kind travels from the probe's
single read-only `GET` to the reconcile result, the evidence row, the lookup read face and the release
decision's off-chain evidence column. No production behaviour changed: the basis stays justificatory,
and a target that declares no basis is still released.

# F-128 —— 收据路径真正跑了一遍（2026-11-26）

**摘要。** 我们控制的目标现在用 `basis: "receipt"` 回答状态查询，一条端到端用例
（`test/target-status-receipt.e2e-spec.ts`）证明种类从探针那一次只读 `GET` 一路走到对账结果、证据行、
查询读面与释放决定的链外证据列。生产行为未变：种类仍只供论证，不声明种类的目标照样被释放。

## 1. 受控目标是哪一个

仓库里没有可部署的「自有目标」服务。逐个核对：

- **sidecar（`src/governance-sidecar/`）**：入站 LLM 网关（OpenAI 兼容 chat/completions），不是出站写目标，
  没有写的状态通道，不能代表收据应答。
- **演示外部 CRM（`specs/external-crm.openapi.json` + `scripts/demo-external-crm.sh`）**：只有 OpenAPI 描述与
  配置生成脚本，没有可运行的 CRM 服务；其中的 `statusPath` 也没有样例。
- **e2e 假目标（`test/proxy-bridge.e2e-spec.ts`、`test/failure-path.e2e-spec.ts`）**：真实 HTTP、真实 fetch，
  是仓库里唯一能代表「我们的 B 路径目标」的载体。

因此按任务约定，用真实 HTTP 测试替身作为受控目标：它在用例内保留自己的**受理记录**，并从那份记录回答
`receipt`；同时提供一条 `current_state` 路由（读活对象存储）与一条不声明种类的路由，用于对照与反向判据。

## 2. 端到端怎么走

`test/target-status-receipt.e2e-spec.ts`：

1. 起一个真实 `http.createServer` 的受控目标（受理记录 / 活对象存储两份记录，三种状态路由）。
2. `createTestApp()` 起真实应用；通过 `SettingsService.set('ai_proxy_tools', …)` 注册三个 B 路径写工具，
   各自的 `statusPath` 指向不同路由；等待应用内 `ToolRegistry` 热更新完成。
3. 直接种一条已过陈旧阈值、仍 `claimed` 的写占位（与 `stale-view-release.e2e-spec.ts` 同法）。
4. 管理员调 `POST /api/v1/ai/tool-effects/claims/:id/reconcile`；真实 `ProxyTargetStatusProbe` 向受控目标
   发一次只读 `GET`（携带写入者的委托身份），真实 `AiToolEffectsService` 写证据行、收敛账、并由
   `WriteClaimDecisionService` 写 `claim_release` 决定行。
5. 从四个面读回 `basis`：对账响应 `evidence.basis` → `ai_target_status_lookups.basis` →
   `GET /claims/:id/lookups` → 审计行 `releaseLookups.items[*].basis`。

## 3. 断言了什么

- **正向**：`not_executed` + `receipt` 时，四个面全为 `receipt`；释放行 `detail` 写明
  `origin: target answered not_executed`；对目标只有**一次** `GET`，且带 `Bearer` 委托身份；
  同一个端点在目标受理过的 key 上仍答 `executed`（结论读自记录，不是写死）。
- **R-1 原判据**：两条同为 `not_executed` 的读数（`receipt` vs `current_state`）在读面与释放证据上
  仅凭结构化 `basis` 字段即可区分，断言不读任何散文。
- **反向（不改行为）**：目标不声明种类时，`not_executed` 照样被采信、占位照样释放；证据行存 `null`，
  读面与释放证据显示 `unknown`。种类不是重试闸。

## 4. 命令与读数（均在本 worktree 真跑）

| 命令 | 读数 |
|------|------|
| `NODE_ENV=test npx jest --config test/jest-e2e.json test/target-status-receipt.e2e-spec.ts --runInBand` | **3/3 通过** |
| `npx jest --runInBand src/ai/proxy/target-status.spec.ts src/governance-shared/services/target-status-reconcile.spec.ts src/governance-shared/services/write-claim-decision.service.spec.ts src/governance-shared/services/write-claim-query.service.spec.ts` | **101/101 通过** |
| `npm run check:test-types` | 178，未超基线（先修掉本次新增的 1 条 `'json'` 实参类型错误） |
| `npm run build`（Server-NestJS） | 通过 |
| `npx eslint test/target-status-receipt.e2e-spec.ts` | 0 error |
| `KEELBASE_JAVA_REPO=D:/Rain6fish/KeelBase4J npm run check:all` | **36/36 全过（40.5s）** |

**变异检查（改坏即红，均已还原，`git status` 干净）**：

1. `declaredBasis()` 恒返回 `null` ⇒ 正向两例红、反例绿。
2. `_releaseEvidence` 移除 `.addSelect('lookup.basis')` ⇒ 正向两例红、反例绿（漏选列会静默写成 `unknown`）。
3. 在 `reconcileClaim` 里把 `basis === 'receipt'` 做成闸 ⇒ `current_state` 与不声明种类两例红 ——
   证明「种类不是闸」被钉住。

**环境说明**：本 worktree 依赖用目录联接复用主检出 `node_modules`；契约 submodule 从主检出本地克隆到 pin
`015f474`（未联网、未推送）；`check:all` 首跑 5 红全部是 submodule 未检出，初始化后转绿。

## 5. 未做 / 风险

- **生产代码零改动**：探针、读数行、读面、释放证据本已支持 `basis`；本项是把「受控目标回 receipt」这条
  路真正跑通，不改任何收敛/释放/重试行为。
- 未改数据库 schema、未改契约（`releaseLookups` 仍是不透明字符串）、未新增审计动作、未推送、未打 tag。
- 未跑全量 `npm run test:e2e`（分片跑耗时较高）；已验证的是定向 e2e 与相关单元/治理套件，CI 会跑全量。
- 演示 CRM 目标仍无可运行服务；若日后补上真实演示目标，它应按本次写入的规格断言带 `receipt` 应答。
- 与并行会话 F-122（同一探针文件）无冲突：本项未改 `target-status.ts`。
