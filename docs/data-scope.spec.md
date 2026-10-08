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
| where 构造 | `src/common/scope/scope-where.ts` | `SCOPE_COLUMNS` 登记表 + `buildScopeWhere`（列表）+ `rowInScope`（对象级，与列表同源）+ `registerScopeColumns`（**自登记的那一半**，见下） |
| 级别来源 | `src/authz/`（`RoleRuleRegistry` + `DataScopeService`） | **按角色配置**：`roles.data_scope`，可被 `role_permissions.data_scope` **按主体覆盖**；未配置 → 回退 `src/common/scope/scope-policy.ts` 的内置默认（+ `registerOrgLevelSubject`，同上的自登记那一半） |
| 解析助手 | `src/common/scope/scope-resolution.ts` | `orgContextOf` + `resolveScopeDescriptor` —— 「级别从哪来」与「没有组织意味着什么」只此一处（此前 `TodosService` / `EventsService` 各一份私有副本，生成模块会带来第三、第四份） |
| 角色/能力数据 | `roles` · `permissions` · `role_permissions` · `user_roles` | 权限-2 Step 2 四表；`UserRole` 枚举仍是代码侧事实来源，`user_roles` 是它的表侧镜像 |
| 部门物化路径 | `src/org/department.entity.ts` `ancestors` + `OrgService._rebuildAncestorsForOrg` / `listDeptSubtreeIds` | 「本部门及以下」下钻（`ancestors LIKE '%/<id>/%'`） |
| 写入盖章 | CRM / PM / Approval 创建路径；**生成模块**（协议 `scope` 声明时） | 落 `org_id`/`dept_id`（`null` = 仅 owner 可见） |

**登记表的两半**：`SCOPE_COLUMNS` 是**手工**那一半（五个主体，有人审、有断言钉住 —— 登记不会覆盖它们）；`registerScopeColumns` 是**生成代码**那一半：生成模块在自己的服务文件里登记自己的列，于是参与范围**无需谁去改登记文件**，也不必每次查询读一遍模块清单。级别那侧同款（`registerOrgLevelSubject`）。**自登记没跑时**（模块没被 import、或那段被删），`buildScopeWhere` / `rowInScope` 回退到**仅本人** —— 最紧的那个答案，不是放开。

**Two halves of the registry**: `SCOPE_COLUMNS` is the hand-written half (five subjects, reviewed by a human and pinned by a spec — a registration never shadows them); `registerScopeColumns` is the generated half: a generated module registers its own columns in its own service file, so taking part needs no edit to the registry file and no per-query read of a module list. The level side works the same way (`registerOrgLevelSubject`). When a self-registration did not run, `buildScopeWhere` / `rowInScope` fall back to **owner-only** — the tightest answer, never a wider one.

**应用点（本步）**：`TodosService` / `EventsService` 的**列表**，与 `TodosService` / `ReportsService` 的**对象级判定**——取代原先手写的「本人 OR 同组织」。⚠ **更正（2026-10-08）**：`EventsService` 的对象级判定（`findOne(id, ability)`）**未接** `rowInScope`，走的是 CASL——这正是**强制点矩阵 ① 行**指出的缺口（[权限架构 §10](authorization-architecture.md#10-强制点矩阵--enforcement-point-matrix)）。**生成模块**（协议 `scope` 声明时）走同一批构件：创建盖章、列表 `buildScopeWhere`、明细 `rowInScope`，并自登记。CRM / PM / Approval 今天即等价于 `own` 级，改走构造器无行为收益，随级别可配置时接入。

**Applied here**: the **list** path of `TodosService` / `EventsService`, plus the **object-level** checks of `TodosService` / `ReportsService` (replacing the hand-written "own OR same-org"), and **generated modules** whose spec declares `scope` — same builder, same helpers, with a self-registration. ⚠ **Correction (2026-10-08)**: the object-level check of `EventsService` (`findOne(id, ability)`) does **not** route through `rowInScope`; it uses CASL — the very gap flagged by the enforcement-point matrix, row ① (see [Authorization Architecture §10](authorization-architecture.md#10-强制点矩阵--enforcement-point-matrix)). CRM / PM / Approval are already equivalent to level `own`; they adopt the builder when levels become configurable.

## 4. 非目标

- 字段级权限（权限-3）· **权限管理面**（角色/授权的在线配置 UI，权限-4）· JWT scope claim。
- 不新增策略 DSL / AOP / SQL 拼接。
- 配置入口：本步只有**数据层 + 迁移种子**，没有管理界面——改变范围级别目前靠直接改库并触发 `RoleRuleRegistry.reload()`。

Out of scope now: per-role configuration of the level, field-level permission, a UI for custom dept sets. No new policy DSL, AOP, SQL concatenation, or JWT scope claims.

## 5. 验证

- 单元：`src/common/scope/scope-where.spec.ts`（每级别 + 降级 + `rowInScope` + 自登记与未登记的回退）、`scope-policy.spec.ts`、`scope-resolution.spec.ts`（降级：无组织服务 / 查询抛错 → 无组织，而不是报错或放宽）。
- 生成侧：`keelbase-init.test.mjs` 断言「声明 `scope` ⇒ 实体多出范围列、服务走范围构造、模块引入 OrgModule、服务自登记」，并断言**未声明时一条都不出现**（缺省仍是仅本人）；另有一条独立验证：**把生成模块产出放进真实 `src` 跑 `tsc` 并跑它自己的 spec** —— 前者曾在「登记写在模块文件」时全绿，而后者立刻变红（组织分支不触发），故这条不可省。
- 服务：`todos.service.spec.ts` / `events.service.spec.ts`（where 形状与 ORG-3 逐字一致）；`org.service.spec.ts`（ancestors 维护与下钻）。
- 端到端：`test/data-scope.e2e-spec.ts`（真实 DI + DB：写入盖章、同组织可见、非组织不可见；**含一条生成模块的用例** —— `reports` 声明了 `scope: ["org"]`，同组织成员可见、非成员不可见，即「生成代码真的接上了范围体系、且自登记真的发生了」）；`test/role-config.e2e-spec.ts`（**验收**：改 `roles.data_scope` 即改查询——`own` → 看不到下级，`own_dept_and_below` → 看得到，改回即收紧）。
- 手工：把某角色的级别改为 `own_dept_and_below`，父部门用户建行、孙部门用户可见；改回 `own` 即不可见——**证明配置驱动查询、无需改代码**（随级别可配置落地后生效）。

---

*相关：* [权限架构](authorization-architecture.md) · [前端渲染层](web-front.spec.md)
