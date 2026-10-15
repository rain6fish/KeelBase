# Delivery Recipe — one enterprise module, end to end / 交付 recipe：一个企业模块，从头到尾

> The whole point of this file is that a **non-author** can copy each line and get the same readings, without asking the person who wrote it. Every step gives the command and an **observable** criterion — never "it should work". The worked example is the `asset-loans` delivery (office equipment checkout): `Business Spec → generate → governance acceptance → deploy`.
> 本文件的全部意义在于：**非作者**能逐行照抄、拿到同样的读数，**不必问作者**。每一步都给命令与**可观测**判据 —— 绝不写「应该会成功」。范例是 `asset-loans`（办公资产借用）那次交付：`Business Spec → 生成 → 治理验收 → 部署`。

---

## English

### 0. Prerequisites

```bash
git clone --recurse-submodules https://github.com/rain6fish/KeelBase.git && cd KeelBase
cd Server-NestJS && cp .env.example .env && npm install
# leave the LLM API keys empty in .env → the runtime falls back to the deterministic demo provider
```

- `--recurse-submodules` is not optional: `Server-NestJS/specs/protocol` is a submodule.
- No LLM key needed anywhere below; the demo provider drives the write tool from explicit `field=value` tokens.
- Never run the runtime/deploy steps against the shared `data/front.sqlite` — use a **copy** (`DB_PATH=...`).

### 1. Business Spec → module protocol

```bash
node scripts/generator/business-spec.mjs --in .keelbase/business-spec/asset-loans.json --check
node scripts/generator/business-spec.mjs --in .keelbase/business-spec/asset-loans.json --out specs/asset-loans.json
```

Criterion: both `exit 0`; the report lists **2 unmapped items** — the two business rules (`Rule 1` no double-loan of an asset still out; `Rule 2` due date within 30 days). `unmapped` is the **scope boundary**, not a failure.

### 2. Generate the module

```bash
node scripts/keelbase-init.mjs --spec specs/asset-loans.json
# if the module already exists in the tree (as it does here): add --force
```

Criterion: `已生成 23 个文件` plus the wiring list, including `接线：CLAUDE.md` (the §13 module list is wired by the generator, idempotently).

**⚠ Generation is one-way.** `--force` overwrites every generated file — **including the hand-written layer from step 3**. So generate **once**, hand-write after, and **do not regenerate**. If you must regenerate (say a template fix landed), restore the hand-written layer right after. A cold-read run confirmed this: the `--force` regeneration left the tree dirty in **exactly two** files (`asset_loans.service.ts` / `asset_loans.service.spec.ts`) and nothing else — which is also how you can tell what is hand-written.

### 3. Layer the declared hand-written rules

The thin protocol carries **shape, not rules** — so the `unmapped[]` items are written by hand in
`Server-NestJS/src/asset_loans/asset_loans.service.ts` (`create()`): Rule 2 refuses a missing or
out-of-window due date; Rule 1 refuses a second loan of a still-out `assetTag`. Their tests live in
`asset_loans.service.spec.ts`.

Because the service is hand-extended after generation, the module is listed in
`scripts/check-generated-samples.mjs`'s EXEMPT map **with its reason** — the same declared boundary
`followup_plans` already uses. A hand-written layer is **declared**, not silently dropped.

### 4. Build and test

```bash
cd Server-NestJS && npm run build
npm test -- asset_loans     # module:   4 suites / 29 tests
npm test                    # whole:  386 suites / 3433 tests
```

Criterion: build `0 error`; the module's own tests and the full suite are all green.

### 5. Migration for the new table

The generator does **not** emit a migration (a known boundary). Author a dual-dialect one
(`src/migrations/1842000000000-AddAssetLoans.ts`) and add `*AddAssetLoans*` to
`src/config/postgres-migrations.ts`. Then prove it on **both** dialects:

```bash
cd Server-NestJS
export JWT_SECRET=$(openssl rand -hex 32) JWT_REFRESH_SECRET=$(openssl rand -hex 32) \
       ENCRYPTION_KEY=$(openssl rand -hex 32) ENCRYPTION_HMAC_KEY=$(openssl rand -hex 32)
DB_PATH=./data/_recipe.sqlite npx typeorm-ts-node-commonjs migration:run      -d src/config/typeorm-data-source.ts
DB_PATH=./data/_recipe.sqlite npx typeorm-ts-node-commonjs migration:generate src/migrations/_recipe_check -d src/config/typeorm-data-source.ts
#   → must print: "No changes in database schema were found"
npm run migration:consistency:pg   # ⇒ [consistency:pg] PASS
rm -f src/migrations/*_recipe_check*
```

Criterion: sqlite regenerate = **No changes**; postgres = **PASS**. (The pg `PK_`/`IDX_` names are not
guessed — they are `"PK_" + sha1("<table>_id")[0:27]` and `"IDX_" + sha1("<table>_<col>")[0:26]`, the
algorithm `migration:consistency:pg` verifies.)

### 6. Static governance acceptance + cross-cutting gates

```bash
cd ..                                     # repo root
bash scripts/verify-consulting-to-build.sh .keelbase/business-spec/asset-loans.json   # needs a clean tree
npm run check:all
```

Criterion: the instrument prints `═══ S4+S5 全链路验收：PASS ═══` (23 files; the write tool carries
`requiresConfirmation=true` + `requireVerifiedEmail` and its unit test asserts the gate; the read tool
has no gate; the module is wired into `ai.module`); `check:all` is **18/18**.

**⚠ Ordering.** `verify-consulting-to-build.sh` **refuses a dirty tree** (it writes files). So the
module and its hand-written layer must already be **committed** when you run it. In a brand-new
delivery, commit steps 1–5 first; in a clean `git worktree` of this repo they are already committed.

### 7. Runtime governance acceptance (deterministic demo provider)

```bash
cd Server-NestJS
DB_PATH=./data/_rt.sqlite PORT=3111 CACHE_ENABLED=false QUEUE_ENABLED=false npm run start:dev &   # wait for /api/v1/health
cd ..
MODULE=asset_loans MARKER_FIELD=assetTag TITLE_MARKER=AI-verify-001 \
  TRIGGER_MSG='创建一笔资产借用 assetName=投影仪 assetTag=AI-verify-001 dueDate=2026-11-10' \
  BASE_URL=http://localhost:3111/api/v1 node scripts/verify-generated-module.mjs
```

Criterion: **12/12** — confirmation gate (R3) → approve → side effect `resultType=asset_loan` →
row persisted → decision trace → both audit hash chains `valid=true` → revoke → soft-deleted.

Then hit the hand-written rules over HTTP (login as `alex`, then four POSTs to `/api/v1/asset_loans`):

| case | expected |
|---|---|
| baseline create | `201` |
| same `assetTag` again (Rule 1) | `409` |
| due date ~8 months out (Rule 2) | `400` |
| no due date (Rule 2) | `400` |

### 8. Deploy (single machine)

```bash
DB_PATH=./data/_deploy.sqlite PORT=3222 SKIP_MOBILE=1 ./deploy/demo.sh &   # workbench + admin + API on one port
curl -s http://localhost:3222/api/v1/health        # {"status":"ok"}
#   log in as alex, then:
#   GET /api/v1/asset_loans → 200 ;  the admin bundle under /admin mentions the module's label
```

Criterion: health `ok`; the delivered module answers on its API; the deployed admin bundle contains
the module. Containerised equivalent: `./scripts/docker-single.sh` (all-in-one image).

### 9. What this recipe does **not** claim

- It carries **shape, not rules** — the two rules are **declared** hand-written (see step 3).
- `overdue` is a status value; there is **no** scheduler that flips it (out of scope in the spec).
- This was a **self-run** following the recipe as a cold reader would (from a clean `git worktree` at
  the delivery commit) — **not** an independent second deliverer. That half of the done criterion is
  untouched. The self-run reproduced the same readings (12/12 runtime, deploy serves the module) and
  caught the two hazards flagged in steps 2 and 6 (regeneration wipes the hand-written layer; the
  instrument needs a clean tree).

---

## 中文

### 0. 前置

```bash
git clone --recurse-submodules https://github.com/rain6fish/KeelBase.git && cd KeelBase
cd Server-NestJS && cp .env.example .env && npm install
# .env 里 LLM 的 API key 留空 → 运行时会回落到确定性演示 Provider
```

- `--recurse-submodules` 不是可选项：`Server-NestJS/specs/protocol` 是一个 submodule。
- 下面全程**不需要** LLM key；演示 Provider 靠显式 `field=value` 令牌驱动写工具。
- 运行与部署那几步**绝不能**打在共享的 `data/front.sqlite` 上 —— 用**副本**（`DB_PATH=...`）。

### 1. 业务规格 → 模块协议

```bash
node scripts/generator/business-spec.mjs --in .keelbase/business-spec/asset-loans.json --check
node scripts/generator/business-spec.mjs --in .keelbase/business-spec/asset-loans.json --out specs/asset-loans.json
```

判据：两条都 `exit 0`；报告列出 **2 项不可映射** —— 两条业务规则（`Rule 1` 同一资产编号未归还期间不得再登记；`Rule 2` 计划归还日须在未来 30 天内）。`unmapped` 是**范围边界**，不是失败。

### 2. 生成模块

```bash
node scripts/keelbase-init.mjs --spec specs/asset-loans.json
# 模块已在树里（本仓即是）：加 --force
```

判据：`已生成 23 个文件` 加接线清单，含 `接线：CLAUDE.md`（§13 模块清单由生成器接线，且幂等）。

**⚠ 生成是单向的。** `--force` 会重写每一个生成文件 —— **包括第 3 步那层手写规则**。故**只生成一次**，随后再手写，
**不要重生成**。若确需重生成（比如模板修好了），之后立刻把手写层放回去。一次冷读者自跑证实了这点：`--force`
重生成让工作树**恰好在这两个文件**上变脏（`asset_loans.service.ts` / `asset_loans.service.spec.ts`），别无其它 ——
这也正是**判断哪些是手写**的办法。

### 3. 叠加**声明为手写**的规则

薄协议**承载形状、不承载规则** —— 故 `unmapped[]` 那两条在 `Server-NestJS/src/asset_loans/asset_loans.service.ts`
的 `create()` 里手写：规则 2 拒绝缺失或超窗的归还日；规则 1 拒绝为一台仍未归还的 `assetTag` 再登记第二条。
它们的测试在同目录的 `asset_loans.service.spec.ts`。

因为服务是生成后手工扩展的，模块连同理由登记进 `scripts/check-generated-samples.mjs` 的 EXEMPT 表 ——
与 `followup_plans` 已经使用的那条声明边界一致。手写层是**被声明的**，不是悄悄丢掉的。

### 4. 构建与测试

```bash
cd Server-NestJS && npm run build
npm test -- asset_loans     # 模块： 4 套 / 29 例
npm test                    # 全量：386 套 / 3433 例
```

判据：构建 `0 error`；模块自身测试与全量测试全绿。

### 5. 为新表补迁移

生成器**不产出**迁移（一条已知边界）。手写一条双方言迁移
（`src/migrations/1842000000000-AddAssetLoans.ts`），并把 `*AddAssetLoans*` 加进
`src/config/postgres-migrations.ts`。随后在**两个方言**上都证一遍：

```bash
cd Server-NestJS
export JWT_SECRET=$(openssl rand -hex 32) JWT_REFRESH_SECRET=$(openssl rand -hex 32) \
       ENCRYPTION_KEY=$(openssl rand -hex 32) ENCRYPTION_HMAC_KEY=$(openssl rand -hex 32)
DB_PATH=./data/_recipe.sqlite npx typeorm-ts-node-commonjs migration:run      -d src/config/typeorm-data-source.ts
DB_PATH=./data/_recipe.sqlite npx typeorm-ts-node-commonjs migration:generate src/migrations/_recipe_check -d src/config/typeorm-data-source.ts
#   → 必须打印："No changes in database schema were found"
npm run migration:consistency:pg   # ⇒ [consistency:pg] PASS
rm -f src/migrations/*_recipe_check*
```

判据：sqlite 复生成 = **No changes**；postgres = **PASS**。（pg 的 `PK_` / `IDX_` 名**不是猜的** —— 它们等于
`"PK_" + sha1("<表>_id")[0:27]` 与 `"IDX_" + sha1("<表>_<列>")[0:26]`，这个算法由 `migration:consistency:pg` 验证。）

### 6. 静态治理验收 + 横切门禁

```bash
cd ..                                     # 仓库根
bash scripts/verify-consulting-to-build.sh .keelbase/business-spec/asset-loans.json   # 需干净工作树
npm run check:all
```

判据：仪器打印 `═══ S4+S5 全链路验收：PASS ═══`（23 个文件；写工具带 `requiresConfirmation=true` +
`requireVerifiedEmail` 且其单测断言了该门控；读工具无门控；模块已接线 `ai.module`）；`check:all` **18/18**。

**⚠ 次序。** `verify-consulting-to-build.sh` **拒绝脏工作树**（它会写文件）。故跑它时，模块与其手写层必须**已经提交**。
全新交付里先提交第 1–5 步；在本仓的一个干净 `git worktree` 里它们本就已提交。

### 7. 运行时治理验收（确定性演示 Provider）

```bash
cd Server-NestJS
DB_PATH=./data/_rt.sqlite PORT=3111 CACHE_ENABLED=false QUEUE_ENABLED=false npm run start:dev &   # 等 /api/v1/health 就绪
cd ..
MODULE=asset_loans MARKER_FIELD=assetTag TITLE_MARKER=AI-verify-001 \
  TRIGGER_MSG='创建一笔资产借用 assetName=投影仪 assetTag=AI-verify-001 dueDate=2026-11-10' \
  BASE_URL=http://localhost:3111/api/v1 node scripts/verify-generated-module.mjs
```

判据：**12/12** —— 确认闸（R3）→ 批准 → 副作用 `resultType=asset_loan` → 记录落库 → 决策轨迹 →
两条审计哈希链 `valid=true` → 撤销 → 软删生效。

再在 HTTP 边界上打那两条手写规则（以 `alex` 登录，然后对 `/api/v1/asset_loans` 发四个 POST）：

| 用例 | 期望 |
|---|---|
| 基线创建 | `201` |
| 同一 `assetTag` 再来一条（规则 1） | `409` |
| 归还日约 8 个月之后（规则 2） | `400` |
| 不给归还日（规则 2） | `400` |

### 8. 部署（单机）

```bash
DB_PATH=./data/_deploy.sqlite PORT=3222 SKIP_MOBILE=1 ./deploy/demo.sh &   # 工作台 + 管理台 + API 同一端口
curl -s http://localhost:3222/api/v1/health        # {"status":"ok"}
#   以 alex 登录后：
#   GET /api/v1/asset_loans → 200 ；/admin 下的打包产物里含该模块的名字
```

判据：健康 `ok`；交付模块的 API 作答；部署出的管理台产物含该模块。容器等价路径：`./scripts/docker-single.sh`（all-in-one 镜像）。

### 9. 本 recipe **不**声称什么

- 它承载**形状、不承载规则** —— 那两条规则是**被声明的手写**（见第 3 步）。
- `overdue` 是一个状态值；**没有**任何调度器去翻它（规格里超出范围）。
- 这是**按 recipe 自跑**一遍（冷读者视角，从交付提交处的一个干净 `git worktree` 里）—— **不是**另一名交付者的
  独立复现。done 判据的那一半**未动**。这次自跑复现了同样的读数（运行时 12/12、部署把模块服务出来），并逮到
  第 2 步与第 6 步标出的两处陷阱（重生成会毁掉手写层；仪器需要干净工作树）。
