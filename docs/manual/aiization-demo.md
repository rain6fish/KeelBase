# Existing System AIization 演示（P0-12 商业价值样板）

> 目标：演示 KeelBase 不只适合「从零创建」，也能成为**已有系统的 AI 化入口**——企业不用重写老系统，把已有 DB Schema / OpenAPI 喂进来，即可让老数据获得「AI 能安全调用」的能力。
> 演示素材：`specs/examples/legacy-crm.sql`（模拟一个运行多年的老客户管理系统）。
> 核心链路：`已有 Schema → keelbase import → Protocol → 生成模块 → AI 工具 → 治理 → Agent`。

---

## 一句话价值

> **老系统 + 一份建表 SQL = 新 AI 能力。** 不用重写业务，KeelBase 把既有数据模型变成「Runtime Agent 能安全操作」的应用。

## 演示步骤（约 10 分钟）

### 1. 准备「已有系统 schema」

企业提供老系统的一份建表 SQL（或 OpenAPI）：

```bash
# specs/examples/legacy-crm.sql —— 含 CHECK 枚举 / VARCHAR / DATE / DECIMAL
CREATE TABLE legacy_customers (
  customer_name VARCHAR(120) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'lead'
    CHECK (status IN ('lead', 'active', 'churn_risk', 'inactive')),
  risk_level VARCHAR(10) NOT NULL DEFAULT 'low'
    CHECK (risk_level IN ('low', 'medium', 'high')),
  ...
);
```

### 2. 导入 → 提取 Protocol

```bash
node scripts/keelbase-init.mjs --import-schema specs/examples/legacy-crm.sql --out specs/legacy-customer.json
```

**预期输出**（已实测验证）：

```json
{
  "module": "legacy_customers",
  "fields": [
    { "name": "customer_name", "type": "string" },
    { "name": "status", "type": "enum", "enum": ["lead", "active", "churn_risk", "inactive"] },
    { "name": "risk_level", "type": "enum", "enum": ["low", "medium", "high"] },
    { "name": "annual_value", "type": "int" }
  ]
}
```

- `CHECK (status IN (...))` → **enum**（自动识别）
- `VARCHAR(120)` → string；`DECIMAL` → int
- `id / created_at / updated_at` → 跳过（基座自带）

> OpenAPI 同理：`node scripts/keelbase-init.mjs --import-openapi swagger.json --out specs/xxx.json`

### 3. 协议 → 生成业务模块

```bash
node scripts/keelbase-init.mjs --spec specs/legacy-customer.json --label 老客户
```

生成普通源代码（后端 CRUD + Flutter + 管理台 + Taro + 7 处接线 + **自动附 AI 工具** `query_legacy_customers`（读）+ `create_legacy_customer`（写需确认））。

### 4. 补迁移 + 验证

```bash
cd Server-NestJS && npm run migration:generate -- src/migrations/AddLegacyCustomers
npm test -- legacy-customers.service
```

### 5. Runtime Agent 安全调用老数据

用户问 AI「帮我查一下 inactive 的老客户」→ Agent 调 `query_legacy_customers`（读，CASL 本人数据）→ 确认 → 审计落哈希链 → 副作用可撤销。**老数据立刻拥有新 AI 能力，且不越权。**

---

## 为什么这是「商业价值样板」

| 传统路径 | KeelBase 路径 |
|---|---|
| 重写老系统（迁移成本高、风险大） | 保留老库，Schema 反推 Protocol → 生成模块 |
| 老系统无 AI 能力 | 老数据立即被 Runtime Agent 安全操作（确认/审计/撤销）|
| 一个系统一套技术栈 | Protocol 生成物是普通源代码，可继续修改，不被锁死 |

## Existing code → Protocol（反推：从既有代码读出协议）

> 2026-10-12 · P0-12 的判据：「**≥1 个非旗舰真实模块经反推产出协议并生成可用代码**」。此前只有三旗舰是**手工**示范。

**English**

The other direction of the same idea: instead of feeding a schema in, read an existing module's code
and write the protocol it implies. The subject is a real module of this repository and not one of the
three flagships — `points/points-entry.entity.ts` (the check-in / points ledger). Its four columns, and
the vocabulary its own comment states (`checkin / achievement / bonus / admin_adjust`), became
`specs/point-records.json`; `keelbase init --spec` then generated a module from it — 23 files across the
back end, the console, both mobile front ends, and two AI tools.

The generated module is named `point_records` rather than `points`: generating under the source module's
own name is refused, because that directory already exists and is not generator output. The name
describes the same shape, and the provenance file beside the module names the spec it came from.

**What the protocol carried, and what it could not.** It carried the fields and their kinds, the enum
with its four values, and ownership (the runtime's own-scope, as for every module). It could not carry
the composite unique constraint `(user_id, checkin_date)`, the index, the column that stores a date as
`varchar(10)` (a protocol says `string`), or — most of all — **the rules**: one check-in a day, the streak
arithmetic, the achievement thresholds. **A protocol carries shape, not rules**, and the reverse is
honest about where it stops — the same boundary `business-spec.mjs` draws when it puts what it cannot
express into `unmapped[]`.

**Verified**: the back end builds; the generated module's own tests pass (4 suites / 25 tests);
`check:generated-samples` reads 161 generated files consistent with their specs; `check:all` is 16/16.

**A defect this exercise found.** `normalizeSpecFields` — the whitelist every spec passes through on the
`--spec` path — kept `required` but **dropped `label`**, and `label` is consumed by exactly one template
(the AI tools' parameter descriptions). So any module generated from a spec quietly lost those
descriptions and fell back to field names, while the modules already committed carry labels — which
means **the generator could not reproduce its own samples**. `check:generated-samples` is what caught it,
on this module. Fixed by keeping `label`; the regenerated module matches.

**中文**

同一个想法的另一个方向：不是把 schema 喂进来，而是**读既有模块的代码、写出它蕴含的协议**。对象是本仓一个
**真实**模块、且**不是**三旗舰 —— `points/points-entry.entity.ts`（签到/积分流水）。它的四个列、以及它自己
注释里写明的词表（`checkin / achievement / bonus / admin_adjust`），落成 `specs/point-records.json`；再由
`keelbase init --spec` 从它生成一个模块：23 个文件，覆盖后端、控制台、两端移动前端与两个 AI 工具。

生成出来的模块叫 `point_records` 而不是 `points`：**在源模块自己的名字下生成会被拒**（那个目录已存在，且不是
生成物）。这个名字描述的是**同一个形状**，模块旁边的来源身份文件写明了它出自哪份 spec。

**协议带走了什么、带不走什么。** 它带走了字段与类型、那个四值枚举、以及所有权（运行时的本人数据范围，与每个
模块一样）。它带不走**复合唯一约束** `(user_id, checkin_date)`、索引、把日期存成 `varchar(10)` 的那个列（协议
只会说 `string`），而最要紧的是**规则**：一天只能签到一次、连签怎么算、成就阈值是多少。**协议承载形状，不承载
规则**；这次反推如实写明它停在哪里 —— 与 `business-spec.mjs` 把表达不了的放进 `unmapped[]` 是同一条边界。

**已验证**：后端构建通过；生成模块自己的测试通过（4 套件 / 25 例）；`check:generated-samples` 读作 161 个生成
文件与各自 spec 一致；`check:all` 16/16。

**这次顺手逮到的一处缺陷。** `normalizeSpecFields` —— `--spec` 路径上每份 spec 都要过的白名单 —— 保留了
`required`，却**丢掉了 `label`**；而 `label` 全仓只被**一个**模板消费（AI 工具的参数描述）。于是任何从 spec 生成
出来的模块都会**悄悄**失去那几段描述、回落到字段名，而仓里**已提交**的模块**带着标签** —— 也就是说**生成器复现
不了自己的样本**。抓到它的是 `check:generated-samples`，就在这个模块上。修法是让 `label` 活过归一化；重生成后
两份产出相等。

## 复制一个模块 / Clone a module

**English**

There is no separate "clone" tool to learn, because both halves already exist — compose them:

1. Read the source module and write down the protocol it implies (the direction just above).
2. Feed that protocol back in under a new name: `keelbase init --spec <new>.json`. The name may be
   singular or plural (`points_ledgers` matches the directory the generator writes; see the first finding
   below for why that used to matter). A module name that already exists in the repository is refused
   unless `--force` is passed, and the assistant's own `create_module_apply` never passes it — so a clone
   cannot land on top of a handwritten module.

**Verified (2026-10-13).** `point_records` was copied to `points_ledgers` exactly this way: 23 files plus
the wiring across seven places; the back end builds; the generated module's own tests pass (2 suites / 16
tests); `check:generated-samples` went from 161 to **184** files; `check:all` is **17/17**; the back-end
suite is 382 suites / 3403 tests; `vue-tsc` is clean. The guard was exercised, not assumed: generating
again under the existing name `point_records` is refused — `✗ 目录已存在 … 如确认覆盖请加 --force`,
exit 1.

**Two things the run taught — both fixed, not merely noted.**

1. **The name and the directory are now resolved the same way.** The generator names the directory
   `buildContext(name).plural` (`points_ledger` → `points_ledgers`), while `check-generated-samples` used to
   look for `src/<spec.module>` — so a spec whose name was not its own plural **matched no directory and was
   silently skipped**: the gate stayed green while never looking at the module (the first attempt landed on
   `points_ledger` and the gate still read 161). The gate now resolves the directory the way the generator
   does, so that whole class of miss is gone.
2. **The generator now wires `CLAUDE.md` §13's module list.** It did not, so `check:admin-pages` failed
   right after generating until someone edited that line — and `create_module_apply` only runs the CLI, so
   it could not: **a module the assistant created left a red gate behind**. Wiring that line is one of the
   generator's steps now (and it is idempotent).

**What this platform does *not* do per module.** Deploying a *module* has no meaning here: `keelbase deploy`
and `deploy/deploy-offline.sh` deploy the **whole application**, and running migrations or restarting the
process is a decision for whoever operates the deployment — not an action the assistant takes on. The line
is the one the project draws everywhere else: **the AI writes the repository; a human decides to run it.**

**中文**

没有另一个叫「克隆」的工具要学 —— 因为两半都已经在，把它们串起来即可：

1. 读源模块，写下它蕴含的协议（即上一节那个方向）。
2. 把这份协议换个名字喂回去：`keelbase init --spec <新>.json`。名字**单数、复数都行**（`points_ledgers`
   与生成器写出的目录同名；那个差别以前为什么会咬人，见下面第一处发现）。**仓里已存在同名的模块会被拒**，
   除非传 `--force`；而助手自己的 `create_module_apply` **从不传它** ⇒ 克隆**不可能盖在手写模块上**。

**已验证（2026-10-13）。** `point_records` 就是照这样复制成 `points_ledgers` 的：23 个文件 + 七处接线；
后端构建通过；生成模块自测通过（2 套件 / 16 例）；`check:generated-samples` 由 161 变 **184**；
`check:all` **17/17**；后端全量 382 套 / 3403 例；`vue-tsc` 干净。**守卫是跑出来的、不是假设的**：再用
既有名 `point_records` 生成一次会被拒 —— `✗ 目录已存在 … 如确认覆盖请加 --force`，退出码 1。

**这一跑教会的两件事 —— 两处都已修，不只是记下。**

1. **名字与目录现在按同一个口径解析。** 生成器给目录命名用的是 `buildContext(name).plural`
   （`points_ledger` → `points_ledgers`），而 `check-generated-samples` 过去找 `src/<spec.module>` —— 于是
   **名字不是它自己复数的协议匹配不到目录、被静默跳过**：门绿着，却从没看这件东西（第一版落在
   `points_ledger` 上，样本门仍是 161）。那道门现在**按生成器的口径解析目录**，这一整类漏看就此消失。
2. **生成器现在会补 `CLAUDE.md` §13 的模块清单。** 它过去不碰，于是生成后 `check:admin-pages` 立刻红，
   直到有人手工改那一行 —— 而 `create_module_apply` 只跑 CLI、改不了：**助手造出来的模块会留下一道红门**。
   现在补那一行是生成器的步骤之一（且幂等）。

## 相关

- P0-12 多输入通道：[module-protocol.md](../module-protocol.md) §4.1
- 生成器：[30min-acceptance.md](30min-acceptance.md)
- 私有 AI：[private-ai-verification.md](private-ai-verification.md)
