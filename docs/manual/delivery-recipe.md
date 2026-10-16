# Delivery Recipe — one enterprise module, end to end / 交付 recipe：一个企业模块，从头到尾

> The whole point of this file is that a **non-author** can copy each line and get the same readings, without asking the person who wrote it. Every step gives the command and an **observable** criterion — never "it should work". The worked example is the `asset-loans` delivery (office equipment checkout): `Business Spec → generate → governance acceptance → deploy`.
> **⚠ Know which job you are here for.** The worked example's artifacts (spec, module, hand-written layer, migration) are **already committed** in this checkout — so §1–§8 **reproduce and verify that delivery**. To deliver a **new** module from scratch, read **§10 first**: three of those steps become real work there instead of verification.
> 本文件的全部意义在于：**非作者**能逐行照抄、拿到同样的读数，**不必问作者**。每一步都给命令与**可观测**判据 —— 绝不写「应该会成功」。范例是 `asset-loans`（办公资产借用）那次交付：`Business Spec → 生成 → 治理验收 → 部署`。
> **⚠ 先分清你来干哪件事。** 范例的那些产物（规格、模块、手写层、迁移）在本检出里**已经提交** —— 所以 §1–§8 是**复现并核验那次交付**。要**从零交付一个新模块**，请**先读 §10**：那三步在那里是**真活**，不是核验。

---

## English

### 0. Prerequisites

```bash
git clone --recurse-submodules https://github.com/rain6fish/KeelBase.git && cd KeelBase
cd Server-NestJS && cp .env.example .env && npm install
cd .. && git clone --depth 1 https://github.com/rain6fish/KeelBase4J.git ../KeelBase4J  # sibling repo — step 6's check:java-vectors reads it
cd Web-Admin-Vue && npm install                                                        # step 8 builds the admin bundle
cd ..                                                                                  # back to the repo root — every step below uses repo-root-relative paths
# leave the LLM API keys empty in .env → the runtime falls back to the deterministic demo provider
```

- **This block ends at the repo root on purpose.** §1's paths (`.keelbase/…`, `specs/…`, `scripts/…`) are relative to the
  clone's root; a shell that runs the block top-to-bottom otherwise finishes inside `Web-Admin-Vue` and §1 dies with
  `Cannot find module …/Web-Admin-Vue/scripts/generator/business-spec.mjs`.
- Node **>= 22** (`Server-NestJS/package.json` → `engines`); the versions below were read on node 24.
- `--recurse-submodules` is not optional: `Server-NestJS/specs/protocol` is a submodule.
- **The sibling `../KeelBase4J` clone is not optional either.** Step 6's `check:java-vectors` compares this repo's protocol vectors against the Java repo's read-only snapshot, and it resolves that repo at `../KeelBase4J` (or `$KEELBASE_JAVA_REPO`). Without the sibling, `check:all` reports **17/18** — and that red is the missing prerequisite, not your delivery.
- **Install `Web-Admin-Vue`'s dependencies here too**: step 8's `deploy/demo.sh` builds the admin bundle as its first step and fails there without them.
- No LLM key needed anywhere below; the demo provider drives the write tool from explicit `field=value` tokens.
- **Why step 5 exports secrets that steps 7–8 don't:** `.env.example` already carries usable `JWT_SECRET` / `JWT_REFRESH_SECRET` / `ENCRYPTION_KEY` values and leaves `ENCRYPTION_HMAC_KEY` empty **by design** (it falls back). Step 5 exports its own four so the migration run does not depend on whatever is in your `.env`; the runtime steps need nothing beyond the file.
- **Docker** (or a reachable PostgreSQL) is needed for one action only: `migration:consistency:pg` in step 5, which starts a throwaway `pgvector/pgvector:pg17` container.
- Never run the runtime/deploy steps against the shared `data/front.sqlite` — use a **copy** (`DB_PATH=...`).

### 1. Business Spec → module protocol

```bash
node scripts/generator/business-spec.mjs --in .keelbase/business-spec/asset-loans.json --check
node scripts/generator/business-spec.mjs --in .keelbase/business-spec/asset-loans.json --out specs/asset-loans.json
```

Criterion: both `exit 0`; the report lists **2 unmapped items** — the two business rules (`Rule 1` no double-loan of an asset still out; `Rule 2` due date within 30 days). `unmapped` is the **scope boundary**, not a failure.

### 2. Generate the module

```bash
# Reproducing this worked example: the module is ALREADY in the tree, so --force is not optional …
node scripts/keelbase-init.mjs --spec specs/asset-loans.json --force
# … and --force has just overwritten the hand-written layer from step 3. Put it back NOW — the next
# steps (4, 6, 7) check exactly those rules, so a tree left overwritten makes them fail.
git checkout -- Server-NestJS/src/asset_loans/
git status --porcelain        # → no output
```

Criterion: `已生成 23 个文件` plus the wiring list. Its `CLAUDE.md` line reads `接线：CLAUDE.md` on a first generation, and `已存在：CLAUDE.md（幂等跳过）` when the wiring is already in place — the generator wires it idempotently, and **both wordings pass**.

**⚠ Generation is one-way, and this is the one step where that bites.** `--force` rewrites every generated
file — **including the hand-written layer**. In this reproduction path the layer is committed, so the
`git checkout` line above brings it back and the tree returns to clean; **do not skip it**. For a **new**
module (§10) there is no `--force` and nothing to restore: generate **once**, hand-write after, never
regenerate — and if you ever must, `git checkout` only helps if you committed the hand-written layer first.

After a `--force` run, `git status --porcelain` lists **three** paths: `asset_loans.service.ts` / `asset_loans.service.spec.ts` **plus** `src/asset_loans/.keelbase-provenance.json`, whose only change is its `generatedAt` timestamp. So "which files went dirty" tells you the hand-written layer **plus that one timestamp-only file** — not the hand-written layer alone.

### 3. Layer the declared hand-written rules

The thin protocol carries **shape, not rules** — so the `unmapped[]` items are written by hand in
`Server-NestJS/src/asset_loans/asset_loans.service.ts` (`create()`): Rule 2 refuses a missing or
out-of-window due date; Rule 1 refuses a second loan of a still-out `assetTag`. Their tests live in
`asset_loans.service.spec.ts`.

Because the service is hand-extended after generation, the module is listed in
`scripts/check-generated-samples.mjs`'s EXEMPT map **with its reason** — the same declared boundary
`followup_plans` already uses. A hand-written layer is **declared**, not silently dropped.

**⚠ This step is the one part a recipe cannot hand over.** The two rules are named above, but for
your own module *you* write them — they come from the business, not from the spec. The step is done
when every `unmapped[]` item from step 1 has a rule in `create()` and a test that fails without it
(the worked example's pair is in `asset_loans.service.spec.ts`).

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
#     (typeorm exits 1 on that path — judge by the printed line, not by the exit code,
#      otherwise a `set -e` / `&&` chain stops on a success)
npm run migration:consistency:pg   # ⇒ [consistency:pg] PASS   (needs Docker or a reachable PostgreSQL)
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
The instrument prints its own jest line — that count is **its own selection**, so it need not equal §4's number;
green is the criterion here, and a smaller count is not a missing test.

**⚠ Ordering.** `verify-consulting-to-build.sh` **refuses a dirty tree** (it writes files). So the
module and its hand-written layer must already be **committed** when you run it. In a brand-new
delivery, commit steps 1–5 first — configure `user.name` / `user.email`, and commit **locally**: this
checkout's `origin` is the public upstream and nothing in this recipe needs a push. In a clean
`git worktree` of this repo the module is already committed.

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

**The port is a parameter here too** (exactly as in step 8): `3111` is a default, not part of any criterion —
check it first (`netstat -ano | grep :3111`) and if it is taken pick any free port, changing `PORT` **and** `BASE_URL`
together. On a busy machine the literal line shows up as `health` never turning green, which reads like a broken
delivery and is not one.

Stop the server once this step is done — started as `npm run start:dev &` it can leave the port
listening, and a leftover listener makes the *next* run fail for a reason unrelated to your delivery
(`netstat -ano | grep :3111`, then kill that PID). **Under `--watch` the listener is not the only
process**: `nest start --watch` keeps a parent watchdog that can respawn the child, so kill the tree,
not just the PID (`taskkill //PID <pid> //T //F`, or match the command lines against your own clone
path) — otherwise the port reappears a minute later.

Then hit the hand-written rules over HTTP (login as `alex`, then four POSTs to `/api/v1/asset_loans`):

```bash
BASE=http://localhost:3111/api/v1
BODY='{"assetName":"投影仪","assetTag":"TAG-RL-001","dueDate":"2026-11-10","status":"active"}'
TOKEN=$(curl -s -X POST $BASE/auth/login -H 'Content-Type: application/json' \
  -d '{"username":"alex","password":"Alex@2026$Demo"}' \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).data.accessToken))')
post() { curl -s -o /dev/null -w '%{http_code}\n' -X POST $BASE/asset_loans \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d "$1"; }

post "$BODY"                                            # → 201  baseline create
post "$BODY"                                            # → 409  Rule 1: same assetTag still out
post "${BODY/2026-11-10/2027-06-10}"                    # → 400  Rule 2: due date ~8 months out
post '{"assetName":"投影仪","assetTag":"TAG-RL-002","status":"active"}'   # → 400  Rule 2: no due date
```

Every body carries `status` on purpose: `status` is an `enum` and the spec gives it **no** explicit
`required` — but `string` / `enum` are required **by the type default** in the generated DTO, so a
body without it is rejected with `400` **before** any hand-written rule runs, *including* the case
that should be `201`. The default table (`docs/module-protocol.md`):

| field type | default |
|---|---|
| `string` / `enum` | **required** (column `NOT NULL`, DTO `@IsNotEmpty`) |
| `text` / `int` / `bool` / `date` | optional (nullable, DTO `@IsOptional`) |

An explicit `"required": true` / `false` in the spec overrides it — that is why `assetName` and
`assetTag` are required although they are `string`, and why `purpose` (`text`) and `dueDate` (`date`)
are optional here.

| case | expected |
|---|---|
| baseline create | `201` |
| same `assetTag` again (Rule 1) | `409` |
| due date ~8 months out (Rule 2) | `400` |
| no due date (Rule 2) | `400` |

The verifier here also writes a report to `docs/benchmark/generated-module-<timestamp>.md` — it is
gitignored, so it does not dirty the tree.

### 8. Deploy (single machine)

```bash
DB_PATH=./data/_deploy.sqlite PORT=3222 SKIP_MOBILE=1 ./deploy/demo.sh &   # workbench + admin + API on one port
curl -s http://localhost:3222/api/v1/health        # {"status":"ok"}
#   log in as alex, then:
#   GET /api/v1/asset_loans → 200 ;  the admin bundle under /admin mentions the module's label
```

Criterion: health `ok`; the delivered module answers on its API; the deployed admin bundle contains
the module. Containerised equivalent: `./scripts/docker-single.sh` (all-in-one image).

**The port is a parameter, not part of the criterion.** Check it before you start
(`netstat -ano | grep :3222`) — on a machine that already runs something else, following the line
literally leaves the backend unable to bind and `health` never turns green. Any free port works; only
the two URLs above change.

### 9. What this recipe does **not** claim

- It carries **shape, not rules** — the two rules are **declared** hand-written (see step 3).
- `overdue` is a status value; there is **no** scheduler that flips it (out of scope in the spec).
- A **cold-read run** has since been done — a reader with **no prior context**, in an isolated clone,
  following only this file. It reproduced the main chain (23 files / 4·29 / 386·3433 / 12/12 / S4+S5 /
  deploy serves the module), and **it is what found the two defects now fixed here**: step 6's `18/18`
  was unreachable from step 0 alone (the sibling Java repo was never mentioned), and the four HTTP
  cases had neither commands nor the DTO's required `status`.
- **It is still not an independent second deliverer** — same machine, same author's tooling, and an
  AI reader rather than another person. That half of the done criterion (a *different* deliverer
  reproducing this without asking the author) is **not met** and is not claimed here.

### 10. Delivering a **new** module (from scratch)

Sections 1–8 reproduce the worked example. A new delivery runs the same chain, but with **your**
business behind it — three of those steps stop being verification and become the real work:

1. **Write the Business Spec** (`.keelbase/business-spec/<module>.json`, see `docs/business-spec.md`),
   then map it to a module protocol:
   `node scripts/generator/business-spec.mjs --in .keelbase/business-spec/<module>.json --out specs/<module>.json`
   Everything the protocol cannot express lands in `unmapped[]` — that list is your hand-written work
   list, not a failure (step 1 above). Two documents this section does not inline, because they are
   the shapes you will be editing: **`docs/business-spec.md`** (the spec JSON) and
   **`docs/module-protocol.md`** (the protocol it maps to — fields, `enum`, `label`, `scope`); the
   required-by-type default table is in step 7 above.
2. **Pick a module name that is not taken, and preview before writing.**
   `node scripts/keelbase-init.mjs --dry-run --spec specs/<module>.json` prints the plan without
   touching the tree. Generating into a directory that already holds hand-written code is refused,
   and the directory is named with the generator's **own pluralisation** — which is also the key the
   sample gate and its EXEMPT map use, so take the name the dry run prints. If the module is **not**
   ownership-scoped, the generator emits only the default single-role CASL rule and says so; anything
   wider is a hand-written policy, and that belongs to step 3.
3. **Generate, then hand-write the `unmapped[]` rules and their tests, then author the dual-dialect
   migration and register it** — steps 2, 3 and 5 above, with your content in place of this example's.
   (Step 2's `--force` + `git checkout` pair belongs to the **reproduction** path only: here you
   generate once and never force.)
4. **Declare the hand-written layer.** Add the module to `scripts/check-generated-samples.mjs`'s
   `EXEMPT` map, **keyed by the generator's plural form**, with the reason — the five entries already
   there are the shape to copy. A hand-written layer is declared, not silently dropped.
5. **From step 4 on, the recipe applies unchanged**: build and tests, both migration dialects, the
   static instrument (commit first — it refuses a dirty tree), runtime acceptance, deploy.

**What this recipe cannot hand you: the rules themselves.** They come from the business you are
delivering for — step 1 is where they get written down, step 3 is where they get implemented. If your
delivery has no `unmapped[]` items, say so explicitly rather than inventing rules to look thorough.

**⚠ The numbers in steps 4–8 belong to this example** (23 files, 4·29, 386·3433, 12/12, `18/18`). Your
module will have its own; what has to match is the **shape** of the criterion — build clean, suites
green, `PASS`, `18/18`, `12/12` — never the counts.

---

## 中文

### 0. 前置

```bash
git clone --recurse-submodules https://github.com/rain6fish/KeelBase.git && cd KeelBase
cd Server-NestJS && cp .env.example .env && npm install
cd .. && git clone --depth 1 https://github.com/rain6fish/KeelBase4J.git ../KeelBase4J  # 兄弟仓 —— 第 6 步的 check:java-vectors 要读它
cd Web-Admin-Vue && npm install                                                        # 第 8 步要构建管理台产物
cd ..                                                                                  # 回到仓库根 —— 下面每一步用的都是相对仓库根的路径
# .env 里 LLM 的 API key 留空 → 运行时会回落到确定性演示 Provider
```

- **这个代码块刻意停在仓库根。** §1 的路径（`.keelbase/…`、`specs/…`、`scripts/…`）都相对克隆出来的根目录；
  一个从上到下顺序执行的 shell 否则会停在 `Web-Admin-Vue`，§1 随即以
  `Cannot find module …/Web-Admin-Vue/scripts/generator/business-spec.mjs` 挂掉。
- Node **>= 22**（`Server-NestJS/package.json` 的 `engines`）；下面那些版本号是在 node 24 上读的。
- `--recurse-submodules` 不是可选项：`Server-NestJS/specs/protocol` 是一个 submodule。
- **兄弟仓 `../KeelBase4J` 也不是可选项。** 第 6 步的 `check:java-vectors` 拿本仓的协议向量与该 Java 仓的只读快照比对，
  而它按 `../KeelBase4J`（或 `$KEELBASE_JAVA_REPO`）找那个仓。缺了兄弟仓，`check:all` 会报 **17/18** ——
  那道红是**前置没备齐**，不是你的交付有问题。
- **`Web-Admin-Vue` 的依赖也在这里装**：第 8 步的 `deploy/demo.sh` 第一步就是构建管理台产物，缺依赖会卡在第一步。
- 下面全程**不需要** LLM key；演示 Provider 靠显式 `field=value` 令牌驱动写工具。
- **为什么第 5 步 export 密钥、第 7–8 步不 export：** `.env.example` 里 `JWT_SECRET` / `JWT_REFRESH_SECRET` /
  `ENCRYPTION_KEY` 本就带着可用值，而 `ENCRYPTION_HMAC_KEY` **按设计留空**（它有回退）。第 5 步 export 自己那四个，
  是为了让迁移运行**不依赖**你 `.env` 里此刻是什么；运行那两步除了这个文件什么都不需要。
- 只有一处需要 **Docker**（或一个可达的 PostgreSQL）：第 5 步的 `migration:consistency:pg`，它会起一个一次性的
  `pgvector/pgvector:pg17` 容器。
- 运行与部署那几步**绝不能**打在共享的 `data/front.sqlite` 上 —— 用**副本**（`DB_PATH=...`）。

### 1. 业务规格 → 模块协议

```bash
node scripts/generator/business-spec.mjs --in .keelbase/business-spec/asset-loans.json --check
node scripts/generator/business-spec.mjs --in .keelbase/business-spec/asset-loans.json --out specs/asset-loans.json
```

判据：两条都 `exit 0`；报告列出 **2 项不可映射** —— 两条业务规则（`Rule 1` 同一资产编号未归还期间不得再登记；`Rule 2` 计划归还日须在未来 30 天内）。`unmapped` 是**范围边界**，不是失败。

### 2. 生成模块

```bash
# 复现这个范例：模块**已经在树里**，故 --force 不是可选项……
node scripts/keelbase-init.mjs --spec specs/asset-loans.json --force
# ……而 --force 刚刚把第 3 步那层手写规则覆盖掉了。**现在**就放回去 ——
# 后面第 4、6、7 步核的正是那几条规则，树停在「被覆盖」状态会让它们全都不通过。
git checkout -- Server-NestJS/src/asset_loans/
git status --porcelain        # → 无输出
```

判据：`已生成 23 个文件` 加接线清单。其中 `CLAUDE.md` 那条在**首次**生成时打印 `接线：CLAUDE.md`，在**已经接好**时打印
`已存在：CLAUDE.md（幂等跳过）` —— 生成器是幂等接线的，**两种措辞都算过**。

**⚠ 生成是单向的，而这一步正是它咬人的地方。** `--force` 会重写每一个生成文件 —— **包括那层手写规则**。
在**复现**这条路上那一层是已提交的，所以上面那行 `git checkout` 能把它放回来、树回到干净；**这一行别跳过**。
**新模块**（§10）没有 `--force`、也没有要还原的东西：**只生成一次**，随后再手写，**不要重生成** ——
万一确需重生成，`git checkout` 也只在你**先提交过**那层手写之后才管用。

跑完一次 `--force`，`git status --porcelain` 会列出**三**条路径：`asset_loans.service.ts` /
`asset_loans.service.spec.ts`，**外加** `src/asset_loans/.keelbase-provenance.json`，它唯一的变化是 `generatedAt`
时间戳。故「哪些文件变脏」告诉你的，是手写层**加上那一个只改时间戳的文件** —— 不是手写层本身。

### 3. 叠加**声明为手写**的规则

薄协议**承载形状、不承载规则** —— 故 `unmapped[]` 那两条在 `Server-NestJS/src/asset_loans/asset_loans.service.ts`
的 `create()` 里手写：规则 2 拒绝缺失或超窗的归还日；规则 1 拒绝为一台仍未归还的 `assetTag` 再登记第二条。
它们的测试在同目录的 `asset_loans.service.spec.ts`。

因为服务是生成后手工扩展的，模块连同理由登记进 `scripts/check-generated-samples.mjs` 的 EXEMPT 表 ——
与 `followup_plans` 已经使用的那条声明边界一致。手写层是**被声明的**，不是悄悄丢掉的。

**⚠ 这一步正是 recipe 交不出去的那部分。** 上面点出了那两条规则，但**你自己的模块要你自己写** ——
它们来自业务，不来自规格。这一步算完成，当且仅当第 1 步 `unmapped[]` 里每一条都在 `create()` 里有对应规则、
且有一条**没有它就会红**的测试（范例那一对在 `asset_loans.service.spec.ts`）。

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
#     （这条路 typeorm 会 exit 1 —— 按打印的这句话判定，别按退出码；
#       否则 `set -e` / `&&` 串起来的命令会停在一个成功上）
npm run migration:consistency:pg   # ⇒ [consistency:pg] PASS   （需要 Docker 或一个可达的 PostgreSQL）
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
该仪器会打印**它自己那次** jest 的用例数 —— 那是**它自己的选取范围**，**不必**等于 §4 那个数；这一步的判据是**绿**，
数更小不等于少了测试。

**⚠ 次序。** `verify-consulting-to-build.sh` **拒绝脏工作树**（它会写文件）。故跑它时，模块与其手写层必须**已经提交**。
全新交付里先提交第 1–5 步 —— 先把 `user.name` / `user.email` 配好，并且**只本地提交**：这个检出的 `origin`
是公开上游，本 recipe 全程不需要推送。在本仓的一个干净 `git worktree` 里，模块本就已提交。

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

**端口在这里同样是参数**（与第 8 步一模一样）：`3111` 只是默认值，不属于任何判据 —— 动手前先看它空不空
（`netstat -ano | grep :3111`），被占就换任意空闲端口，`PORT` **和** `BASE_URL` **一起改**。在一台忙的机器上照字面跑，
症状是 `health` 永远不绿 —— 那读起来像「交付坏了」，而它不是。

这一步做完就把服务停掉 —— 用 `npm run start:dev &` 起的那种可能把端口留着监听，残留的监听会让**下一次**运行
因为与你的交付毫不相干的原因失败（`netstat -ano | grep :3111`，然后杀掉那个 PID）。**`--watch` 下监听者不是唯一
的进程**：`nest start --watch` 还留着一个父看门进程，它会把子进程再拉起来 ⇒ **要杀的是那棵树，不是那个 PID**
（`taskkill //PID <pid> //T //F`，或按命令行匹配你自己的克隆路径）；只杀 PID 的话，端口过一分钟又会冒出来。

再在 HTTP 边界上打那两条手写规则（以 `alex` 登录，然后对 `/api/v1/asset_loans` 发四个 POST）：

```bash
BASE=http://localhost:3111/api/v1
BODY='{"assetName":"投影仪","assetTag":"TAG-RL-001","dueDate":"2026-11-10","status":"active"}'
TOKEN=$(curl -s -X POST $BASE/auth/login -H 'Content-Type: application/json' \
  -d '{"username":"alex","password":"Alex@2026$Demo"}' \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).data.accessToken))')
post() { curl -s -o /dev/null -w '%{http_code}\n' -X POST $BASE/asset_loans \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d "$1"; }

post "$BODY"                                            # → 201  基线创建
post "$BODY"                                            # → 409  规则 1：同一 assetTag 仍未归还
post "${BODY/2026-11-10/2027-06-10}"                    # → 400  规则 2：归还日约 8 个月之后
post '{"assetName":"投影仪","assetTag":"TAG-RL-002","status":"active"}'   # → 400  规则 2：不给归还日
```

每个请求体都带 `status` 是**故意的**：`status` 是 `enum`，而规格**没有**给它显式 `required` ——
但生成的 DTO 里 `string` / `enum` **按类型默认必填**，所以缺它的请求体会在任何手写规则跑起来**之前**就被 `400`
拒掉，**连本该 201 的那一例也一样**。那张默认表（`docs/module-protocol.md`）：

| 字段类型 | 默认 |
|---|---|
| `string` / `enum` | **必填**（列 `NOT NULL`、DTO `@IsNotEmpty`） |
| `text` / `int` / `bool` / `date` | 可选（列可空、DTO `@IsOptional`） |

规格里显式写 `"required": true` / `false` 可以覆盖它 —— 这正是本例里 `assetName` / `assetTag` 虽是 `string`
却必填、而 `purpose`（`text`）与 `dueDate`（`date`）可选的原因。

| 用例 | 期望 |
|---|---|
| 基线创建 | `201` |
| 同一 `assetTag` 再来一条（规则 1） | `409` |
| 归还日约 8 个月之后（规则 2） | `400` |
| 不给归还日（规则 2） | `400` |

这一步的验收器还会往 `docs/benchmark/generated-module-<时间戳>.md` 落一份报告 —— 它被 gitignore，不会弄脏工作树。

### 8. 部署（单机）

```bash
DB_PATH=./data/_deploy.sqlite PORT=3222 SKIP_MOBILE=1 ./deploy/demo.sh &   # 工作台 + 管理台 + API 同一端口
curl -s http://localhost:3222/api/v1/health        # {"status":"ok"}
#   以 alex 登录后：
#   GET /api/v1/asset_loans → 200 ；/admin 下的打包产物里含该模块的名字
```

判据：健康 `ok`；交付模块的 API 作答；部署出的管理台产物含该模块。容器等价路径：`./scripts/docker-single.sh`（all-in-one 镜像）。

**端口是参数，不是判据的一部分。** 动手前先看它空不空（`netstat -ano | grep :3222`）—— 在一台已经跑着别的东西的机器上，
照字面走会让后端**绑不上端口**、`health` 永远不绿。**任何空闲端口都行**，变的只有上面那两条 URL。

### 9. 本 recipe **不**声称什么

- 它承载**形状、不承载规则** —— 那两条规则是**被声明的手写**（见第 3 步）。
- `overdue` 是一个状态值；**没有**任何调度器去翻它（规格里超出范围）。
- 此后另做过一次**冷读者复现** —— 读者**没有任何背景上下文**、在一个**隔离的克隆**里、**只照本文件**走。
  它复现了主链（23 文件 / 4·29 / 386·3433 / 12/12 / S4+S5 / 部署把模块服务出来），**本文件里刚修掉的两处缺陷正是它发现的**：
  第 6 步的 `18/18` **根本无法**只照第 0 步达到（兄弟 Java 仓只字未提），而第 7 步那四条 HTTP 用例既没给命令、
  也没给 DTO 必填的 `status`。
- **但它仍不是一名独立的交付者** —— 同一台机器、同一套作者的工装，且是一个 AI 读者，不是另一个人。
  done 判据的那一半（**另一名**交付者不问作者就能复现）**未达成**，本文件也**不声称**它达成了。

### 10. 从零交付一个**新**模块

§1–§8 是复现范例。一次新交付走同一条链，但背后是**你的**业务 —— 其中三步不再是核验，而是**真活**：

1. **写业务规格**（`.keelbase/business-spec/<模块>.json`，见 `docs/business-spec.md`），再映射成模块协议：
   `node scripts/generator/business-spec.mjs --in .keelbase/business-spec/<模块>.json --out specs/<模块>.json`
   协议表达不了的都落进 `unmapped[]` —— 那张单子是你的**手写工作清单**，不是失败（对应上面第 1 步）。
   本节**不内联**的两份文档，正是你要动手编辑的形状：**`docs/business-spec.md`**（规格 JSON）与
   **`docs/module-protocol.md`**（它映射成的模块协议 —— 字段、`enum`、`label`、`scope`）；按类型默认那张表在上面第 7 步里。
2. **取一个没被占用的模块名，并先预览再落盘。**
   `node scripts/keelbase-init.mjs --dry-run --spec specs/<模块>.json` 只打印计划、不碰树。往**已有手写代码**的目录里生成
   会被拒；而目录名用的是**生成器自己的复数规则** —— 那也正是样本门禁与它的 EXEMPT 表所用的键，所以**用 dry-run 打出来的那个名字**。
   若该模块**不是**按本人所有权限定的，生成器只会给出默认的单一角色 CASL 规则并如实说明；更宽的范围要手写策略，
   那属于第 3 步。
3. **生成 → 手写 `unmapped[]` 的规则与其测试 → 写双方言迁移并登记** —— 就是上面的第 2、3、5 步，只是内容换成你的，
   而不是这个范例的。（第 2 步那对 `--force` + `git checkout` **只属于复现那条路** —— 在这里你只生成一次、不 `--force`。）
4. **声明手写层。** 把模块加进 `scripts/check-generated-samples.mjs` 的 `EXEMPT` 表，**键用生成器的复数形**，并写上理由 ——
   表里已有的五条就是照抄的形状。手写层是**被声明的**，不是悄悄丢掉的。
5. **从第 4 步起，本 recipe 原样适用**：构建与测试、两个方言的迁移、静态仪器（**先提交** —— 它拒绝脏工作树）、
   运行时验收、部署。

**本 recipe 交不出去的，是规则本身。** 它们来自你要交付的那门业务 —— 第 1 步把它们**写下来**，第 3 步把它们**实现**。
若你这次交付**没有** `unmapped[]` 项，就**明说没有**，别为了显得周全去编规则。

**⚠ 第 4–8 步里的数字属于这个范例**（23 文件、4·29、386·3433、12/12、`18/18`）。你的模块有它自己的数；
要对得上的是判据的**形状** —— 构建干净、套件全绿、`PASS`、`18/18`、`12/12` —— **不是那些数**。
