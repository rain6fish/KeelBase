# KeelBase 通用数据范围（Data Scope）/ Generic Data Scope

> **定位**：`docs/authorization-architecture.md` §9 交付档位的**优先序第 2 步**（ERP/OA 类客户的实际验收点）。本文件记录**机制**；范围级别的**可配置来源**（按角色配置）属后续步骤。
> **性质**：项目交付能力，非产品定位变更（ADR-0002 不变）。

---

## 1. 分层：CASL 管粗门，数据范围管细门

**CASL 仍答"某 action × subject 能不能"；数据范围答"具体哪些行"。** 两者分离，不把行级集合塞进 CASL 条件——否则能力会依赖数据，且会把新范围值渗进**已冻结**的 `permission-capability-list.scope` 枚举（`all|own`）。

```
请求 → CASL（action × subject 粗门，含 admin manage all）
     → Data Scope（行级细门：own / own_dept / own_dept_and_below / org / custom_dept）
     → 查询
```

**CASL answers "may this action on this subject happen at all"; Data Scope answers "which rows".** They stay separate: inlining row sets into CASL conditions would make the ability data-dependent and leak new scope values into the frozen `permission-capability-list.scope` enum.

## 2. 结构化 where，不拼 SQL

范围以**内部描述子**表达，由纯函数翻译成 TypeORM where 对象——**不产 SQL 串**（避免注入面、保住可解释性）。对照：同类企业脚手架用 AOP 注入 + 查询侧拼串；本实现取思路、弃实现。

Scope is expressed as an **internal descriptor** translated by a pure function into a TypeORM where object — **never a SQL string** (no injection surface, explainability preserved).

| 级别 / Level | where |
|---|---|
| `own` | `[{<owner>}]` |
| `org` | `[{<owner>}, {orgId}]` |
| `own_dept` | `[{<owner>}, {orgId, deptId}]` |
| `own_dept_and_below` | `[{<owner>}, {orgId, deptId: In(子树)}]` |
| `custom_dept` | `[{deptId: In(集合)}]` |
| `all` | 不施加行级条件（由 CASL 粗门承担） |

**降级规则**：缺组织/部门信息时一律**退回本人**（收紧而非放宽）。未登记在 `SCOPE_COLUMNS` 的实体**不可被范围过滤**，调用方保持自身 owner 条件——**绝不静默放宽**。

**Degradation**: missing org/dept information falls back to **owner-only** (tighten, never widen). An entity absent from `SCOPE_COLUMNS` is not scope-filterable; callers keep their own owner condition — **never silently widen**.

## 3. 实现落点

| 件 | 位置 | 职责 |
|---|---|---|
| 描述子类型 | `src/common/scope/scope.types.ts` | `ScopeDescriptor` / `ScopeLevel`（**内部对象，不出线缆**） |
| where 构造 | `src/common/scope/scope-where.ts` | `SCOPE_COLUMNS` 登记表 + `buildScopeWhere`（列表）+ `rowInScope`（对象级，与列表同源） |
| 级别来源 | `src/common/scope/scope-policy.ts` | `defaultScopeDescriptor`——**policy seam**，后续按角色配置替换 |
| 部门物化路径 | `src/org/department.entity.ts` `ancestors` + `OrgService._rebuildAncestorsForOrg` / `listDeptSubtreeIds` | 「本部门及以下」下钻（`ancestors LIKE '%/<id>/%'`） |
| 写入盖章 | CRM / PM / Approval 创建路径 | 落 `org_id`/`dept_id`（`null` = 仅 owner 可见） |

**应用点（本步）**：`TodosService` / `EventsService` 的列表与对象级判定——取代原先手写的「本人 OR 同组织」。CRM / PM / Approval 今天即等价于 `own` 级，改走构造器无行为收益，随级别可配置时接入。

**Applied here**: `TodosService` / `EventsService` list + object-level checks (replacing hand-written "own OR same-org"). CRM / PM / Approval are already equivalent to level `own`; they adopt the builder when levels become configurable.

## 4. 非目标（本步）

- 范围级别的**按角色配置**（`roles.data_scope` 表与管理面）· 字段级权限 · `custom_dept` 的配置界面。
- 不新增策略 DSL / AOP / SQL 拼接 / JWT scope claim。

Out of scope now: per-role configuration of the level, field-level permission, a UI for custom dept sets. No new policy DSL, AOP, SQL concatenation, or JWT scope claims.

## 5. 验证

- 单元：`src/common/scope/scope-where.spec.ts`（每级别 + 降级 + `rowInScope`）、`scope-policy.spec.ts`。
- 服务：`todos.service.spec.ts` / `events.service.spec.ts`（where 形状与 ORG-3 逐字一致）；`org.service.spec.ts`（ancestors 维护与下钻）。
- 端到端：`test/data-scope.e2e-spec.ts`（真实 DI + DB：写入盖章、同组织可见、非组织不可见）。
- 手工：把某角色的级别改为 `own_dept_and_below`，父部门用户建行、孙部门用户可见；改回 `own` 即不可见——**证明配置驱动查询、无需改代码**（随级别可配置落地后生效）。

---

*相关：* [权限架构](authorization-architecture.md) · [前端渲染层](web-front.spec.md)
