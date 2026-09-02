# Audit Lifecycle El-Steps — 生命周期完整历史流转（A-3 收尾）

> 规格文档。对应 roadmap A-3 剩余：「完整历史流转（el-steps 多节点：发起→授权→确认→执行→撤销→恢复）+ 恢复态」。
> 状态：⬜ 待实现 → 🔶 实现中 → ✅ 完成。日期：2026-09-01。

## 1. 现状

治理抽屉 A-3 生命周期段为**单态 el-tag**：`lifecycleState` computed 从决策轨迹推导单一当前态（revoked/declined/blocked/confirmed/executed）。缺少完整历史流转。

## 2. 方案

在单态 tag 之下新增 **el-steps 多节点时间线**（direction=vertical），从决策轨迹推导各节点状态：

| 节点 | 数据源（TraceStep / effect） | 状态推导 |
|------|------------------------------|---------|
| 发起 | `input` 步骤（businessIntent） | 有 input → finish |
| 授权 | `tool_call.checks` | 有 checks → finish（授权检查通过） |
| 确认 | `confirmation.outcome / trusted` | approve/trusted → finish；decline/timeout → error；读工具无确认节点 |
| 执行 | `tool_call.success` | success → finish；被拒（success=false）→ error |
| 撤销 | `effect.targetSoftDeleted` | 撤销 → finish（仅写工具 + 已确认场景） |
| 恢复 | 无恢复节点数据 | wait（未发生，标注可恢复） |

- 保留 `lifecycleState` 单态 tag 作「当前态」一眼概览；el-steps 作「完整生命周期」
- 节点动态生成：读工具无确认/撤销；写工具含确认→撤销→恢复；被拒停在执行（error）

## 3. 文件改动

| 文件 | 改动 |
|------|------|
| `src/components/GovernanceActionDrawer.vue` | 生命周期段加 el-steps + `lifecycleSteps` computed |
| `src/i18n/{zh,en}.ts` | 新键 stepInitiate/stepAuthorize/stepConfirm/stepExecute/stepRevoke/stepRestore |

## 4. 测试

- 前端 vitest（如有 GovernanceActionDrawer 测试）：生命周期段渲染 el-steps 节点数随数据变化（读工具 3 节点 / 写工具确认 6 节点 / 被拒 error 态）
- typecheck / build

## 5. 相关

- [audit-unauthorized-view.spec.md](audit-unauthorized-view.spec.md) — A-8 越权视图
- [audit-authz-snapshot.spec.md](audit-authz-snapshot.spec.md) — 放行快照（A-5）
- [keelbase-dna.md](keelbase-dna.md) — Design for Recovery（可撤销/可补偿）
