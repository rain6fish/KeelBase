# Vertical Template — Purchase / Sales / Stock (Inventory Movements) / 垂直行业模板：进销存

> This is the first vertical template: **进销存** (purchase / sales / stock), cut down to the one
> object a warehouse keeper actually writes every day — a **stock movement**. It ships as one
> Business Spec, one generated module, one migration, and the governance defaults that come with
> them. It is deliberately **not** a template marketplace or a multi-template framework: adding
> another vertical means adding another file like this one, not another abstraction.
>
> 这是第一个垂直模板：**进销存**，收敛到仓管每天真正在写的那一个对象 —— **库存出入库流水**。
> 交付物 = 一份 Business Spec + 一个生成出来的模块 + 一条迁移 + 自带的治理默认值。它有意**不是**
> 模板市场或多模板框架：再加一个行业，就是再加一份这样的文件，而不是再加一层抽象。

---

## English

### 0. What the template contains

| Piece | Path | What it does |
|---|---|---|
| Business Spec | `.keelbase/business-spec/inventory-movements.json` | Business language: goal, actor, one object, 9 fields, 2 AI capabilities, 3 rules, decisions, out-of-scope |
| Interview evidence | `.keelbase/interview/inventory-movements.md` | The `evidenceRef` anchor — keeps every decision traceable |
| Module protocol | `specs/inventory-movements.json` | The thin protocol the generator consumes |
| Generated module | `Server-NestJS/src/inventory_movements/` + `Front-Flutter/lib/features/inventory_movements/` + `Web-Admin-Vue/src/views/inventory_movements/` + `Front-Taro/src/pages/inventory_movements/` | Backend CRUD + two AI tools + three front-end skeletons (23 files) |
| Migration | `Server-NestJS/src/migrations/1844000000000-AddInventoryMovements.ts` | Dual-dialect table creation, registered in `src/config/postgres-migrations.ts` |
| Governance defaults | generated, not stored in a new place | The write tool is R3 + confirmation; the read tool is automatic; both enter the audit chain |

The module is **pure generator output** — there is no hand-written service layer. That is why
`--force` is safe here: it rewrites the same bytes and the provenance hash does not move. It is also
why `check:generated-samples` (216 generated files) covers it.

### 1. Business Spec → module protocol

```bash
node scripts/generator/business-spec.mjs --in .keelbase/business-spec/inventory-movements.json --check
node scripts/generator/business-spec.mjs --in .keelbase/business-spec/inventory-movements.json --out specs/inventory-movements.json
```

Criterion: both `exit 0`; the report lists **3 unmapped items** — the three business rules
(`quantity > 0`, no over-issue, unique `documentNo`). `unmapped` is the scope boundary, not a
failure. The protocol itself carries **9 fields**.

> **A generator boundary worth knowing.** An `enum` field is required by the DTO's type default even
> when the spec does not say `"required": true` — but the generated AI tool's parameter schema reads
> only the explicit flag, so it would advertise the field as optional and then fail validation when
> the model omits it. This template therefore writes `"required": true` on `direction`. Keep that in
> mind for your own enum fields; the generator is not changed here.

### 2. Generate the module

```bash
node scripts/keelbase-init.mjs --spec specs/inventory-movements.json --dry-run   # preview: 23 files
node scripts/keelbase-init.mjs --spec specs/inventory-movements.json             # first generation
# Reproducing the committed template (the module is already in the tree):
node scripts/keelbase-init.mjs --spec specs/inventory-movements.json --force
```

Criterion: `已生成 23 个文件` plus the wiring list; after `--force` on this template,
`git status --porcelain` shows no new path beyond the template's own files, and the provenance file
keeps its hash:

```bash
sha1sum Server-NestJS/src/inventory_movements/.keelbase-provenance.json   # same before and after --force
```

The generator wires the module into `app.module`, `modules-manifest`, feature flags, CASL role
rules, `ai.module`, the page navigator, the admin routes/menu/i18n, the Flutter router/i18n, and the
Taro config/explore page. It also appends the module to `.keelbase/manifest.json` and to the
generated-module list in `CLAUDE.md`.

### 3. Migration

The generator writes the entity but not the migration. This template ships a dual-dialect one:

```bash
cd Server-NestJS
export JWT_SECRET=$(openssl rand -hex 32) JWT_REFRESH_SECRET=$(openssl rand -hex 32) \
       ENCRYPTION_KEY=$(openssl rand -hex 32) ENCRYPTION_HMAC_KEY=$(openssl rand -hex 32)
DB_PATH=./data/_inventory.sqlite npx typeorm-ts-node-commonjs migration:run -d src/config/typeorm-data-source.ts
DB_PATH=./data/_inventory.sqlite npx typeorm-ts-node-commonjs migration:generate src/migrations/_inventory_recheck -d src/config/typeorm-data-source.ts
#   → must print: "No changes in database schema were found"
#     (typeorm exits 1 on that path — judge by the printed line, not by the exit code)
rm -f src/migrations/*_inventory_recheck*
cd ..
```

Criterion: the new migration executes (`AddInventoryMovements1844000000000`), and the regeneration
prints **No changes**. The postgres branch uses the repository's sha1-derived `PK_` / `IDX_` names
and the migration is listed in `POSTGRES_MIGRATION_GLOBS`; `postgres-migrations.spec.ts` guards that
registration.

### 4. Build and tests

```bash
cd Server-NestJS
npm run build
npm test -- inventory_movements
cd ..
npm run check:all
```

Criterion: build `0 error`; the module's own **4 suites / 27 tests** are green; `check:all` is
**23/23**. Counts grow with the repository — judge by the green run and read the counts off your own
run.

### 5. Governance defaults (why the write is gated)

Nothing new is configured or stored. The generated write tool already carries the gate:

```bash
# start a server first (see §6), then read the tool registry as admin
curl -s -H "Authorization: Bearer $ATOKEN" $BASE/ai/tools
```

Reading for `create_inventory_movement` on this template:

```
enabled: true · requiresConfirmation: true · gateMode: "confirm" · requiresApproval: false
riskLevel: "R3" · riskStrategy: "confirmation" · permissions.requireVerifiedEmail: true
revokeClass: "local_compensate"
```

That is the recommended default: **every write needs a human confirmation, and it can be revoked**.
If you want a stricter organisational posture, apply the existing governance presets — do not create
a new policy store:

```bash
BASE=http://localhost:3217/api/v1
ATOKEN=$(curl -s -X POST $BASE/auth/login -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"Admin@2026$KeelBase"}' \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).data.accessToken))')

curl -s -H "Authorization: Bearer $ATOKEN" $BASE/ai/governance/policy            # current policy
curl -s -H "Authorization: Bearer $ATOKEN" $BASE/ai/governance/policy/presets    # finance / government / general
curl -s -X POST $BASE/ai/governance/policy/apply-preset \
  -H "Authorization: Bearer $ATOKEN" -H 'Content-Type: application/json' \
  -d '{"presetId":"general"}'
curl -s -X POST $BASE/settings/preset \
  -H "Authorization: Bearer $ATOKEN" -H 'Content-Type: application/json' \
  -d '{"preset":"small"}'
curl -s -H "Authorization: Bearer $ATOKEN" $BASE/settings
```

Observed criteria: `apply-preset` returns `201`, the policy keeps `audit.granularity = "all"`, and
`feature_inventory_movements` is `"true"` after the `small` preset. `small` / `full` / `lite` all
keep `inventory_movements` enabled; the generated write's own R3 confirmation is independent of the
policy preset's tool list, so it stays on even when a preset does not name the generated tool.

### 6. Runtime acceptance — one read, one write (the write requires confirmation)

Start the backend against the migrated database (a **copy**, never the shared `data/front.sqlite`).
`3217` is an example, not part of the criterion — check it first and change `PORT` and every `BASE`
below together.

```bash
cd Server-NestJS
DB_PATH=./data/_inventory.sqlite PORT=3217 CACHE_ENABLED=false QUEUE_ENABLED=false \
  node dist/main > /tmp/_inventory.log 2>&1 &
for i in $(seq 1 90); do
  curl -sf http://localhost:3217/api/v1/health >/dev/null && break
  sleep 1
done
curl -sf http://localhost:3217/api/v1/health >/dev/null \
  && echo "health 200 — ready" \
  || { echo "not ready — last log lines:"; tail -n 20 /tmp/_inventory.log; }
cd ..
MODULE=inventory_movements MARKER_FIELD=documentNo TITLE_MARKER=AI-verify-INV-001 \
  TRIGGER_MSG='创建一笔库存出入库 documentNo=AI-verify-INV-001 sku=SKU-001 itemName=测试商品 direction=in quantity=10' \
  BASE_URL=http://localhost:3217/api/v1 node scripts/verify-generated-module.mjs
```

Criterion: **12/12** — confirmation request (R3) → approve → side effect
`resultType=inventory_movement` → row persisted → decision trace → both audit hash chains valid →
revoke → the row disappears from the owner's list (soft delete).

The same server answers the read side explicitly:

```bash
BASE=http://localhost:3217/api/v1
TOKEN=$(curl -s -X POST $BASE/auth/login -H 'Content-Type: application/json' \
  -d '{"username":"alex","password":"Alex@2026$Demo"}' \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).data.accessToken))')

curl -s -o /dev/null -w '%{http_code}\n' -X POST $BASE/inventory_movements \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"documentNo":"READ-001","sku":"SKU-READ","itemName":"读取样例","direction":"out","quantity":3}'   # → 201

curl -s -H "Authorization: Bearer $TOKEN" "$BASE/inventory_movements"   # → the row with READ-001

curl -s -X POST $BASE/mcp -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"query_inventory_movements","arguments":{}}}'   # → contains READ-001
```

Stop the server when done. `node dist/main` has no watchdog, so killing the listener is enough; if
you started it under `--watch`, kill the whole process tree instead.

### 7. What this template does **not** do

The thin protocol carries shape, not rules. The three rules from the Business Spec are declared in
`unmapped[]` and are **not implemented** by this template:

1. `quantity` must be positive.
2. An outbound movement may not exceed the current stock for that `sku`.
3. `documentNo` must be unique.

A real inventory ledger needs them. Implement them in
`Server-NestJS/src/inventory_movements/inventory_movements.service.ts`, add tests, then declare the
hand-written layer in `scripts/check-generated-samples.mjs`'s `EXEMPT` map (the same declared
boundary `asset_loans` uses). Once you hand-edit the service, stop using `--force` on this module.

Also out of scope: a stock balance table (sum the movements instead), product/supplier/customer
master data (`partner` is free text), unit price and cost accounting, batches/expiry, multi-warehouse
transfers, and an approval workflow.

### 8. Making it yours

1. Copy `.keelbase/business-spec/inventory-movements.json` to your own `<feature>.json` and change
   the goal, object, fields, capabilities, rules and decisions.
2. Point `evidenceRef` at a real `.keelbase/interview/<feature>.md` (missing evidence fails
   `spec:check`).
3. Map it, preview it, generate **once** — do not `--force` after you hand-write the rules.
4. Write the `unmapped[]` rules and their tests.
5. Author the migration and register it, then run build, tests, `check:all`, and the runtime
   acceptance above.

The generic end-to-end reference remains [delivery-recipe.md](delivery-recipe.md); this file only
adds the vertical shape and the governance readings that belong to it.

---

## 中文

### 0. 模板里有什么

| 组成 | 路径 | 作用 |
|---|---|---|
| 业务规格 | `.keelbase/business-spec/inventory-movements.json` | 业务语言：目标、角色、一个对象、9 个字段、2 个 AI 能力、3 条规则、决策、范围外 |
| 访谈证据 | `.keelbase/interview/inventory-movements.md` | `evidenceRef` 的锚点 —— 每个决策都可追溯 |
| 模块协议 | `specs/inventory-movements.json` | 生成器消费的薄协议 |
| 生成的模块 | `Server-NestJS/src/inventory_movements/` + `Front-Flutter/lib/features/inventory_movements/` + `Web-Admin-Vue/src/views/inventory_movements/` + `Front-Taro/src/pages/inventory_movements/` | 后端 CRUD + 两个 AI 工具 + 三端骨架（23 个文件） |
| 迁移 | `Server-NestJS/src/migrations/1844000000000-AddInventoryMovements.ts` | 双方言建表，已登记到 `src/config/postgres-migrations.ts` |
| 治理默认值 | 生成物自带，不另存配置 | 写工具 R3 + 确认；读工具自动放行；两者都进审计链 |

这个模块是**纯生成物** —— 没有手写服务层。因此这里的 `--force` 是安全的：它重写同样的字节，
来源清单的哈希不变；`check:generated-samples`（216 个生成文件）也覆盖它。

### 1. 业务规格 → 模块协议

```bash
node scripts/generator/business-spec.mjs --in .keelbase/business-spec/inventory-movements.json --check
node scripts/generator/business-spec.mjs --in .keelbase/business-spec/inventory-movements.json --out specs/inventory-movements.json
```

判据：两条都 `exit 0`；报告列出 **3 项不可映射** —— 三条业务规则（`quantity > 0`、出库不得超过余额、
`documentNo` 唯一）。`unmapped` 是范围边界，不是失败。协议本身携带 **9 个字段**。

> **一个值得知道的生成器边界。** `enum` 字段即使 spec 没写 `"required": true`，DTO 也会按类型默认
> 要求必填；但生成的 AI 工具参数表只读显式标记，于是它会把这个字段标成可选，模型一旦省略就会被校验
> 拒绝。本模板因此在 `direction` 上显式写了 `"required": true`。你自己的 enum 字段也请照此处理；
> 本轮**没有改生成器**。

### 2. 生成模块

```bash
node scripts/keelbase-init.mjs --spec specs/inventory-movements.json --dry-run   # 预演：23 个文件
node scripts/keelbase-init.mjs --spec specs/inventory-movements.json             # 首次生成
# 复现本仓已提交的模板（模块已在树里）：
node scripts/keelbase-init.mjs --spec specs/inventory-movements.json --force
```

判据：打印 `已生成 23 个文件` 与接线清单；在本模板上跑完 `--force` 后，`git status --porcelain`
不会多出模板自身文件以外的路径，来源清单哈希不变：

```bash
sha1sum Server-NestJS/src/inventory_movements/.keelbase-provenance.json   # --force 前后相同
```

生成器会把这个模块接进 `app.module`、`modules-manifest`、特性开关、CASL 角色规则、`ai.module`、
页面导航、管理台路由/菜单/i18n、Flutter 路由/i18n、Taro 配置/发现页；同时把它追加进
`.keelbase/manifest.json` 与 `CLAUDE.md` 的生成模块清单。

### 3. 迁移

生成器写实体、不写迁移。本模板自带一条双方言迁移：

```bash
cd Server-NestJS
export JWT_SECRET=$(openssl rand -hex 32) JWT_REFRESH_SECRET=$(openssl rand -hex 32) \
       ENCRYPTION_KEY=$(openssl rand -hex 32) ENCRYPTION_HMAC_KEY=$(openssl rand -hex 32)
DB_PATH=./data/_inventory.sqlite npx typeorm-ts-node-commonjs migration:run -d src/config/typeorm-data-source.ts
DB_PATH=./data/_inventory.sqlite npx typeorm-ts-node-commonjs migration:generate src/migrations/_inventory_recheck -d src/config/typeorm-data-source.ts
#   → 必须打印："No changes in database schema were found"
#     （typeorm 在这条路径上会以 1 退出 —— 看打印的那一行，不要看退出码）
rm -f src/migrations/*_inventory_recheck*
cd ..
```

判据：新迁移被执行（`AddInventoryMovements1844000000000`），复生成打印 **No changes**。postgres 分支
使用本仓由 sha1 推导的 `PK_` / `IDX_` 名，迁移已列入 `POSTGRES_MIGRATION_GLOBS`；该登记由
`postgres-migrations.spec.ts` 守着。

### 4. 编译与测试

```bash
cd Server-NestJS
npm run build
npm test -- inventory_movements
cd ..
npm run check:all
```

判据：编译 `0 error`；模块自身 **4 套 / 27 例**全绿；`check:all` **23/23**。计数会随仓库增长 ——
以「跑绿」为准，读你自己那一跑的读数。

### 5. 治理默认值（为什么写操作会先问一声）

不新增任何配置、也不新增存储位置。生成的写工具自带门控：

```bash
# 先起服务（见 §6），再以管理员读工具注册表
curl -s -H "Authorization: Bearer $ATOKEN" $BASE/ai/tools
```

本模板 `create_inventory_movement` 的读数：

```
enabled: true · requiresConfirmation: true · gateMode: "confirm" · requiresApproval: false
riskLevel: "R3" · riskStrategy: "confirmation" · permissions.requireVerifiedEmail: true
revokeClass: "local_compensate"
```

这就是建议的默认值：**每次写都要人工确认，并且可撤销**。如果要更严格的组织姿态，应用**既有**的治理
预设 —— 不要另造策略存储：

```bash
BASE=http://localhost:3217/api/v1
ATOKEN=$(curl -s -X POST $BASE/auth/login -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"Admin@2026$KeelBase"}' \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).data.accessToken))')

curl -s -H "Authorization: Bearer $ATOKEN" $BASE/ai/governance/policy            # 当前策略
curl -s -H "Authorization: Bearer $ATOKEN" $BASE/ai/governance/policy/presets    # finance / government / general
curl -s -X POST $BASE/ai/governance/policy/apply-preset \
  -H "Authorization: Bearer $ATOKEN" -H 'Content-Type: application/json' \
  -d '{"presetId":"general"}'
curl -s -X POST $BASE/settings/preset \
  -H "Authorization: Bearer $ATOKEN" -H 'Content-Type: application/json' \
  -d '{"preset":"small"}'
curl -s -H "Authorization: Bearer $ATOKEN" $BASE/settings
```

观测判据：`apply-preset` 返回 `201`，策略保持 `audit.granularity = "all"`；应用 `small` 后
`feature_inventory_movements` 为 `"true"`。`small` / `full` / `lite` 三档都不会关闭
`inventory_movements`；生成写工具的 R3 确认独立于策略预设的工具清单 —— 即使预设没有点名这个生成工具，
确认门控仍然开着。

### 6. 运行时验收 —— 一条读、一条写（写需确认）

用**副本**库起后端（绝不用共享的 `data/front.sqlite`）。`3217` 是示例、不是判据的一部分 ——
先查端口，若被占用就把 `PORT` 与下面每个 `BASE` 一起改。

```bash
cd Server-NestJS
DB_PATH=./data/_inventory.sqlite PORT=3217 CACHE_ENABLED=false QUEUE_ENABLED=false \
  node dist/main > /tmp/_inventory.log 2>&1 &
for i in $(seq 1 90); do
  curl -sf http://localhost:3217/api/v1/health >/dev/null && break
  sleep 1
done
curl -sf http://localhost:3217/api/v1/health >/dev/null \
  && echo "health 200 — ready" \
  || { echo "未就绪 —— 日志末尾："; tail -n 20 /tmp/_inventory.log; }
cd ..
MODULE=inventory_movements MARKER_FIELD=documentNo TITLE_MARKER=AI-verify-INV-001 \
  TRIGGER_MSG='创建一笔库存出入库 documentNo=AI-verify-INV-001 sku=SKU-001 itemName=测试商品 direction=in quantity=10' \
  BASE_URL=http://localhost:3217/api/v1 node scripts/verify-generated-module.mjs
```

判据：**12/12** —— 确认请求（R3）→ 批准 → 副作用 `resultType=inventory_movement` → 记录落库 →
决策轨迹 → 两条审计哈希链有效 → 撤销 → 该行从本人列表消失（软删）。

同一个服务也能显式回答读侧：

```bash
BASE=http://localhost:3217/api/v1
TOKEN=$(curl -s -X POST $BASE/auth/login -H 'Content-Type: application/json' \
  -d '{"username":"alex","password":"Alex@2026$Demo"}' \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).data.accessToken))')

curl -s -o /dev/null -w '%{http_code}\n' -X POST $BASE/inventory_movements \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"documentNo":"READ-001","sku":"SKU-READ","itemName":"读取样例","direction":"out","quantity":3}'   # → 201

curl -s -H "Authorization: Bearer $TOKEN" "$BASE/inventory_movements"   # → 含 READ-001 的那一行

curl -s -X POST $BASE/mcp -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"query_inventory_movements","arguments":{}}}'   # → 含 READ-001
```

完成后停掉服务。`node dist/main` 没有看门狗，杀掉监听进程即可；若你用 `--watch` 起的，要杀整棵进程树。

### 7. 本模板**不**做什么

薄协议带的是形状，不是规则。Business Spec 里的三条规则落在 `unmapped[]`，本模板**没有实现**：

1. `quantity` 必须为正数。
2. 出库数量不得超过该 `sku` 的当前库存。
3. `documentNo` 必须唯一。

真正的库存账需要它们。请在
`Server-NestJS/src/inventory_movements/inventory_movements.service.ts` 里实现、补测试，再把这一手写层
登记进 `scripts/check-generated-samples.mjs` 的 `EXEMPT` 映射（与 `asset_loans` 同一种「声明式边界」）。
一旦手改了服务，就不要再对这个模块用 `--force`。

同样不在范围内：库存余额表（改为按流水汇总）、商品/供应商/客户主数据（`partner` 是自由文本）、
单价与成本核算、批次/效期、多仓调拨、审批流。

### 8. 改成你自己的

1. 把 `.keelbase/business-spec/inventory-movements.json` 复制成你的 `<feature>.json`，改目标、对象、
   字段、AI 能力、规则与决策。
2. 让 `evidenceRef` 指向真实的 `.keelbase/interview/<feature>.md`（证据缺失会让 `spec:check` 判红）。
3. 映射、预演、**只生成一次** —— 手写规则之后不要再 `--force`。
4. 实现 `unmapped[]` 里的规则并补测试。
5. 写迁移并登记，然后跑编译、测试、`check:all` 与上面的运行时验收。

通用端到端参考仍是 [delivery-recipe.md](delivery-recipe.md)；本文件只补这个行业自己的形状与治理读数。
