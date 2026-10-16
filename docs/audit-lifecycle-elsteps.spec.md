# Audit Lifecycle El-Steps — 生命周期完整历史流转（A-3 收尾）

> 规格文档。完整历史流转（el-steps 多节点：发起→授权→确认→执行→撤销→恢复）+ 恢复态。
> 状态：✅ 已完成（el-steps 六节点）。日期：2026-09-01；2026-09-16 补 **恢复态**与**级联条数**（见 [cascade-compensation.spec.md](cascade-compensation.spec.md) §7）；2026-10-17 修 **恢复态下撤销节点**的判据（详见 §2 撤销行）。

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
| 撤销 | `effect.targetSoftDeleted` **或** `effect.restored` + `effect.cascadeSize` | 撤销 → finish（仅写工具 + 已确认场景）；`cascadeSize > 1` 时写明「已撤销 N 条（同一次业务动作级联补偿）」。**2026-10-17 修**：判据由「当前是否软删」改为「**是否撤销过**」——`restored=true` 表示目标被恢复，**必先撤销过**，故撤销节点也须 finish；否则出现「撤销 wait / 恢复 finish」的自相矛盾时间线 |
| 恢复 | `effect.restored`（服务端单一权威） | 已恢复 → finish；否则 wait。判据 = `revoke_status='revoked'`（补偿发生过）**且** `targetSoftDeleted=false`（目标已回生效态）——回收站 restore 只清 `deletedAt`、不动 `revoke_status`，两者组合即「撤销后又恢复」这一历史事实 |

- 保留 `lifecycleState` 单态 tag 作「当前态」一眼概览；el-steps 作「完整生命周期」
- **当前态 tag 新增 `restored`（已恢复）**（2026-10-17）：`restored=true` 时不再回落成「已确认执行」——动作已不只是「已确认」，而是「撤销过又恢复」
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
