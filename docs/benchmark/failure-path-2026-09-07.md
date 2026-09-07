# 失败路径回归证据（KB-4）— Failure-path corpus

> 规格：`docs/failure-path-corpus.spec.md` · 证据页：`docs/evidence/README.md` §3.3
> 日期：2026-09-07 · 确定性（无 LLM）· 随 KB-4 落地

## 验证命令与结果

| 层 | 命令 | 结果 |
|---|---|---|
| A 语料（fault-injection） | `npm run test:failure-path` | ✅ 13/13 |
| B 真实链路 e2e | `npx jest --config test/jest-e2e.json test/failure-path.e2e-spec.ts` | ✅ 5/5 |
| F1 超时守卫单测 | `jest src/ai/proxy` | ✅ 20/20（proxy-http/tool/revoker） |
| F2 record 幂等单测 | `jest src/ai/tool-effects/ai-tool-effects.service.spec.ts` | ✅ 27/27 |

## 覆盖的失败形态（"仍可信"断言）

- **FP-1/FP-5 重复执行 / 幂等**：同会话同工具同参数重复 → 只 execute 一次；副作用唯一冲突（sqlite `SQLITE_CONSTRAINT` / postgres `23505`）→ 幂等 skip 返回既有行。
- **FP-2 确认重放**：approve 成功后同一 token 二次 resolve → false（不二次执行）；他人/未知 token → false。
- **FP-3 外部超时有界**：`ProxyTool.execute` / 撤销补偿端点目标挂死 → `PROXY_FETCH_TIMEOUT_MS`（默认 30000）内返回「超时」，不无限挂起。
- **FP-4 DB 故障不吞**：副作用 record 遇非唯一 DB 错误（连接失败等）→ 如实上抛，不伪装幂等命中。
- **FP-6 审计中断 fail-closed**：sqlite / postgres 审计写失败 → 错误传播给调用方（不悄悄丢证据）；sqlite 串行队列不断裂、下一笔可续。
- **FP-7 外部补偿失败如实**：补偿端点 5xx / 未配置 revokePath → `ok:false` + 状态，不谎报「已撤销」。
- **FP-8 未知结果如实**：目标 204 / 空体 → `success data:null`，不编造 data。
- **FP-9 迁移中断**：由既有 migration-consistency CI job（sqlite + postgres）覆盖（引用，不重复造）。

## 本语料反推的基座修复（随 KB-4 一并落）

- **F1**：`src/ai/proxy/proxy-http.ts`（新增）`proxyFetch` + `ProxyTimeoutError` + `PROXY_TIMEOUT_MS`；`ProxyTool`/`ProxyToolRevokerService` fetch 改走它（此前无超时，目标挂死即无限挂起）。
- **F2**：`AiToolEffectsService.record` catch 分支——仅唯一约束冲突走幂等 skip，其他 DB 错误 rethrow（此前任意错误当 skip，DB down 静默吞）。

## Known limits（如实记录，非本次修复）

- **execute→record 非原子窗口**：execute 落库后、副作用 INSERT 前进程崩溃 → 同会话重试可能真重复（完整修复 = 副作用原子落库/outbox，属 §internal.17 backlog，1.1 前仅文档化）。
- **FP-1/FP-2 真执行路径**：写副作用需经 LLM 确认流才端到端触发，e2e 不可达——由 A 层 + 既有 spec（ai.service HS-3 idempotency hit / confirmation.store）覆盖。
