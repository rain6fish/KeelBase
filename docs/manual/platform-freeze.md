# 平台冻结清单（阶段 2 Phase 1）

> 依据 development-plan §7.1「Capability Validation Cycle」：Code Complete ≠ Product Validated。进入 v1.0 决策前，冻结功能，聚焦验证与平台抽象。本文件记录 2026-08-18 全仓扫描的冻结项——**不是 backlog**，是「当前不做/已做/冻结」的显式记录。
> 扫描范围：Server-NestJS / Front-Flutter / scripts / docs（Web-Admin 由 Element Plus 迁移会话处理，不在本次范围）。

---

## 1. Remove（已评估，多数保留）

| 项 | 判定 |
|---|---|
| `Server-NestJS/scripts/mock-embeddings.mjs` | **保留**——被 [rag-vector-search.spec.md](../rag-vector-search.spec.md) 引用（本地 mock Embeddings 服务），仅未登记到 package.json；冻结，不删 |
| `docs/project-map.html` | **待评估**——无 .md 登记/入口，疑似一次性生成物；v1.0 前由作者确认后决定去留 |

## 2. Refactor（已处理 / 冻结）

| 项 | 判定 |
|---|---|
| `docs/project.spec.md` 5.9/5.10 节号重复 | ✅ **已修（2026-08-18）**——删除重复的「5.9 推送 + 5.10 其他」块 |
| `src/ai/ai.service.ts`（1577 行巨型 facade）| **冻结**——拆分是重构大项，v1.0 验证后再做；当前 ai.service.spec 覆盖良好 |
| push 模块三件套职责重叠（push.service/noop-push.service/push-token.controller）| **冻结**——行为正确，待真实厂商接入（P2）时一并重构 |
| Flutter 72 个手写 `fromJson`（可 codegen/freezed）| **冻结**——引入 codegen 是工具链决策，v1.0 后评估；当前约定统一 |

## 3. Document（缺口记录，v1.0 后补 spec）

以下模块有代码、无独立 spec（现有 project.spec.md 仅覆盖 auth/users/events/upload/ai/push/todo/search 等）：
approval / crm / contracts / data-import / feature-flags / flows / form-builder / marketing / plugins / queue / settings / sms / suppliers / tags / templates。
> **冻结决策**：不逐个补 spec（量大、且 v1.0 验证期以「能力验证」优先）；三旗舰的规格已在 `flagship-applications.md`（私有仓）覆盖。

冗余文档组：`enterprise-capabilities.md` / `enterprise-readiness.md` / `flagship-applications.md` 内容有重叠——各自定位不同（对外声明 / 内部差距 / 旗舰基准），**保留**，不合并。

## 4. Test（缺口记录）

无 .spec.ts：`admin/admin.service`、`push/push.service`、`storage/storage.service`、`contracts/contracts.controller`、`push/push-token.controller`、`suppliers/controllers.controller`。
> **部分已补**：suppliers/contracts 的 HTTP 层已由 `generated-modules.e2e-spec.ts` 覆盖（生成模块 e2e）；`admin.service`/`storage.service` 补 spec 记录为 v1.0 验证期可选项。

## 5. Benchmark（无需动作）

`scripts/benchmark/run-benchmark.mjs`（autocannon：常规 / AI 并发 / SSE 三场景）存活且正常，报告落 `docs/benchmark/benchmark-*.md`（4 份，最新 2026-08-16），`docs/benchmark/README.md` 有重跑说明。

---

## 冻结结论

- **本次已处理**：project.spec.md 节号重复。
- **显式冻结**（v1.0 验证期不做）：ai.service 拆分、push 重构、Flutter fromJson codegen、文档逐个补 spec。
- **待作者确认**：project-map.html 去留。
- **验证期可做**（低风险）：admin.service / storage.service 补单测。
