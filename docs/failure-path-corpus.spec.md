# 失败路径回归语料（KB-4）规格 — Failure-path Corpus Spec

> 关联：跨入口一致性回归（本语料为其失败分支子集）。非 ai-eval（那是 LLM 安全评测）；本语料是**确定性、无 LLM** 的基础设施失败断言。
> 目标：把验证从「happy path 自证」推进到「**failure path 仍可信**」——系统在失败下**如实记录状态、不假装成功、不重复副作用、证据不丢**。

---

## 1. 背景与判定

企业生产关心的不是 Execute 成功后的样子，而是 Execute 之后的失败分支：`timeout / partial success / duplicate / unknown result / compensation failed / audit failed`。KB-4 断言这些分支下 Runtime 的行为仍可信。

**"可信"的判定**（每条断言对照）：
- **如实**：失败不被静默吞成成功，状态不谎报（如"已请求补偿"≠"已撤销"）。
- **不重复**：幂等键 / 确认 token 阻止重复副作用。
- **证据不丢**：审计 fail-closed（宁可报错也不悄悄丢审计）；双写上报失败不影响本地主链。
- **有界**：外部调用有超时上限，不无限挂起。

## 2. 失败形态 × 语料清单

| # | 形态 | seam / 注入 | 断言（"仍可信"的表现） | 现状 | 语料层 |
|---|---|---|---|---|---|
| FP-1 | 重复执行 / 幂等 | 同会话同工具同参数二次调用 | 只 execute 一次；二次返回既有 effect + `idempotent:true` | 已安全（idempotencyKey 唯一 + findExisting 守卫） | A + B |
| FP-2 | 确认重放（replay） | 同一 token 二次 resolve | 二次 resolve → false/404，不二次执行 | 已安全（token 一次性 + 条件更新） | A |
| FP-3 | 超时（外部写/补偿） | fetch 永不返回 + 短超时 | 在超时上限内以**带超时标记**的错误返回；不无限挂起；上层不落伪成功副作用 | **F1 修复**（现无超时守卫） | A + B |
| FP-4 | DB 错误被误判幂等 | effectsRepo.save 抛非唯一冲突（DB down） | 非唯一冲突 **rethrow**（不伪装幂等 skip）；仅唯一约束冲突走 skip+findOne | **F2 修复**（现任意错误当 skip） | A |
| FP-5 | DB 唯一冲突（真并发重复落库） | save 抛唯一约束 | 幂等 skip → 返回既有行，不重复 | 已安全（G-3 并发兜底） | A |
| FP-6 | 审计中断 | audit repo save / postgres runner 抛错 | fail-closed：错误传播给调用方（不悄悄丢审计）；治理双写失败隔离不阻断主链 | 已安全（postgres rollback+throw；sqlite 队列 `await job` 上抛；双写静默 `.catch`） | A |
| FP-7 | 外部补偿失败 | 补偿端点 5xx / 不可达 / 无 revokePath | 返回如实 `ok:false` + status/消息；副作用不显示 revoked | 已安全（ProxyToolRevokerService 如实语义 + spec） | A + B |
| FP-8 | 未知结果（调用成功响应丢失） | proxy 返回 200/204 空体 | 仍记 `proxy_call` 副作用锚（proxyResultId），不假装有 data | 已安全（ai.service.ts proxyResultId） | A |
| FP-9 | 迁移中断 | 迁移重复执行 / 中途失败 | 幂等可重跑 + 前滚一致性 | 由既有 migration-consistency CI job（sqlite+postgres）覆盖，本语料引用不重复造 | — |

> **FP-9 引用**：CI `.github/workflows/ci.yml` migration-consistency job + release-gate 迁移一致性段已覆盖"迁移可重复/无漂移"。

## 3. 本语料反推出的修复（受控，随 KB-4 一并落）

### F1：外部代理调用无超时守卫（FP-3）
- 现状：`ProxyTool.execute`（`src/ai/proxy/proxy-tool.ts`）与 `ProxyToolRevokerService.revoke`（`proxy-revoker.service.ts`）的 `fetch` **无 AbortController/超时**——目标系统挂死即无限挂起，超时失败路径不存在。
- 修复：新增 `src/ai/proxy/proxy-http.ts`：`ProxyTimeoutError`（name 标记）+ `PROXY_TIMEOUT_MS`（env `PROXY_FETCH_TIMEOUT_MS`，默认 30000ms）+ `proxyFetch(url, init, timeoutMs?)`（AbortController，超时 abort → 抛 ProxyTimeoutError）。两处调用改走它；超时时工具/撤销返回错误消息标注「超时」，与一般"不可达"可辨识。
- 测试：`proxy-http.spec.ts`（helper 超时） + `proxy-tool.spec.ts` / `proxy-revoker.service.spec.ts` 各加超时用例。

### F2：副作用 record 把任意 DB 错误当幂等吞（FP-4）
- 现状：`AiToolEffectsService.record`（`src/ai/tool-effects/ai-tool-effects.service.ts`）`catch` 任意错误都按「幂等冲突 skip」处理 → DB down 时静默吞错（且 findOne 抛时语义错乱）。
- 修复：仅**唯一约束冲突**（postgres code `23505` / sqlite `SQLITE_CONSTRAINT`）走 skip + findOne + report；其他错误 **rethrow** 且不 `_reportEffect`。
- 测试：`ai-tool-effects.service.spec.ts` 加"非唯一 DB 错误 rethrow / 唯一冲突 skip"用例。

## 4. Known limits（如实记录，非本次修复）

- **FP-3 边界**：超时只保证"有界"与"如实报失败"，不保证外部系统未实际执行（timeout + unknown-result 是分布式固有边界）——由 revokeClass（KB-6）与不承诺清单（N-4/N-5）表达。
- **FP-10（execute→record 非原子窗口）**：`AiService._executeWriteTool` 在 execute 落库后、副作用 record INSERT 前若进程崩溃 → 无副作用行 → 同会话重试**会真重复执行**。非原子窗口为架构级 gap（完整修复 = 副作用原子落库/outbox，属 §internal.17 backlog，1.1 前**只文档化不修**）。缓解：业务幂等键依赖副作用行已提交 + 外部补偿（revokeClass governed_external）。本窗口不锁死为断言（避免 CI 固化坏行为），记录于 evidence 已知缺口。

## 5. 语料实现与验收

**两层语料**：
- A 层：`src/ai/failure-path/failure-path-corpus.spec.ts`——确定性 fault-injection（TestingModule 真调 service + mock seam 注入故障），集中断言 FP-1..FP-8。
- B 层：`test/failure-path.e2e-spec.ts`——真实 app + fresh sqlite + supertest，端到端断言 FP-1（重复写幂等）/ FP-3（补偿超时如实）/ FP-7（补偿 5xx 如实）/ FP-2（token 二次）。

**命令**：
```bash
cd Server-NestJS
npm run test:failure-path          # A 层（jest --testPathPatterns failure-path）
npm run test:e2e -- failure-path   # B 层
```

**验收**：
- A/B 全绿（CI 常绿：A 层随 `npm test`，B 层随 `test:e2e`，并加入 release-gate.sh Trust e2e 列表）。
- 证据页：`docs/evidence/README.md` §3.3 + 留档 `docs/benchmark/failure-path-<ts>.md`。
- 跨入口一致性回归 → ✅。

**文件改动**：
- 新：`src/ai/proxy/proxy-http.ts`(+spec)、`src/ai/failure-path/failure-path-corpus.spec.ts`、`test/failure-path.e2e-spec.ts`、`docs/failure-path-corpus.spec.md`、`docs/benchmark/failure-path-*.md`
- 改：`src/ai/proxy/proxy-tool.ts`(+spec)、`src/ai/proxy/proxy-revoker.service.ts`(+spec)、`src/ai/tool-effects/ai-tool-effects.service.ts`(+spec)、`docs/evidence/README.md`、`Server-NestJS/package.json`、`scripts/release-gate.sh`
- 复用：`AiToolEffectsService.buildKey/findExisting`、`writeEffectTypeFor`、`proxyResultId`、`test/helpers.ts`（registerUser/loginAs/createTestApp）；**不改动** `src/ai/ai.service.ts`（并发会话有未提交改动）。

*KeelBase · docs · 2026-09-07*
