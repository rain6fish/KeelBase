# F-130 / F-132：真 Postgres 下证明决定行的计数与条目出自同一快照（2026-11-26）

- worktree `.claude/worktrees/musing-bouman-3fadad` / 分支 `claude/musing-bouman-3fadad`，自 `main` `f45d9655`。
- 功能提交 **`12a987da`**（用例 + CI 接线）；本报告单独一条提交。**均未推送**（工作时间规则）。
- 改动面只有两处，**不动产品行为、不动 schema、不改契约**：
  1. 新文件 `Server-NestJS/src/governance-shared/services/write-claim-decision.pg-snapshot.spec.ts`
     （真 Postgres 集成用例，SQLite / 其它环境整套干净跳过）。
  2. `.github/workflows/ci.yml` 的 `migration-consistency-postgres` job 追加一步，在该 job 自己的
     Postgres 17 service 上跑这条用例。工作流改动**只留本地**。

## 用例怎么构造

- 用例**自建一个库**（默认 `keelbase_snapshot_test`，可用 `PG_SNAPSHOT_DB_NAME` 覆盖），经管理员库
  （`PG_SNAPSHOT_ADMIN_DB`，默认 `postgres`）`CREATE DATABASE`；跑完 `DROP DATABASE ... WITH (FORCE)`，
  删除失败只告警、不判红（留下的库是噪音，不是失败的保证）。
- 两条连接指向同一个库：`reader`（服务 + 断言）与 `writer`（另一条会话，只插读数行）。同一会话会把语句
  串起来，竞争就不存在，所以必须是两条连接。
- 实体：`AiWriteClaim` / `AiAuditLog` / `TargetStatusLookupRow` / `AuditChainLock`，`synchronize: true`
  （`AuditService.log` 在 postgres 上要锁 `audit_chain_lock` 行，故锁实体也在内）。
- 服务按生产形态装配（真仓储 + 真 `AuditService` + `REVOKE_STALE_MINUTES=60`），执行路径用**自动路径**
  `recordTargetRelease`：可重复、写的是与人工释放**同一个** `claim_release` 行，正是询问在途时会跑的那条读。

## 并发怎么控

- 写入循环在 `writer` 连接上每轮插入一条读数行、各自是一条已提交语句，然后 `setTimeout(delayMs)` 让出。
  用例**同步起停**（`startWriter` 返回 `stop()`，`try/finally` 里停），不靠 sleep 猜。
- 用例一（快照锤）：1 条占位 + 4 条种子读数，写方紧循环（0ms），顺序触发 40 次证据读取。断言写方确实插入了
  （`inserted > 0`）且读到的**总数不止一种**（`totals.size > 1`）—— 写方若没插进来，这一例就是假绿。
- 用例二（真实释放）：写方 5ms 节奏。人工释放绑定「审阅者冻结的视图」（`decisionState` + `lastLookupId`），
  询问落在读屏幕与释放之间时账本会以 `stale_view` 正确拒绝；故用新视图重试（上限 100 次），直到**成功**一次，
  再检查那一行。失败时抛出的错误带尝试次数、插入行数、拒绝分类与隔离级别读数。紧循环下 100 次全被判陈旧
  （账本没错，是用例拿不到行），故给写方一个可控节奏。
- 用例三（检查器有牙）：伪造「计数取插入前、条目取插入后」的证据（5 条读数、`count=4`），要求检查器拒绝；
  同一份证据计数改成 5 则通过 —— 证明牙不是「永远判红」。

## 断言为什么是精确的（不依赖「知道快照是什么时候取的」）

id 只增，写方一条语句提交一行 ⇒ 单写者下 id 顺序 = 提交顺序。于是：

- 被拷贝的最新 id 就是那条语句见到的最大 id（**水位**）；
- 水位及以下的每一行在那条语句运行时都已提交 ⇒ 都被它看见。

所以 `count` 必须等于「该键 id ≤ 水位」的行数；条目必须等于该集合按服务的排序（`at DESC, id DESC`）取的
最新三条。拆成两次读（先数、后取）恰好呈现为「计数说 4、条目点名了 5 条」，被这条检查直接抓住。

**覆盖的是哪种隔离**：部署实际使用的 Postgres 默认 `read committed`（语句级快照），用例把
`current_setting('transaction_isolation')` 读出来（本次读数 `read committed`）并写进失败信息，但**不检查**
隔离级别本身 —— 契约 §6 是这件事的单源，未在此复述第二份。若部署换了隔离级别或库，补法是让这条用例在
那里跑，而不是改声明。

## 接了哪个 lane

- 复用 `.github/workflows/ci.yml` 的 `migration-consistency-postgres` job（同一个 Postgres 17 service，
  `pgvector/pgvector:pg17`）：在该 job 末尾追加一步，`DB_TYPE=postgres` + `PG_SNAPSHOT_REQUIRED=1`，
  `npx jest src/governance-shared/services/write-claim-decision.pg-snapshot.spec.ts`。
- `PG_SNAPSHOT_REQUIRED=1` 是防「配错了就跳过、拿跳过的绿交差」：置位而 `DB_TYPE≠postgres` 时用例在加载
  阶段直接报错（已本地验证该反例）。
- 不改 job id / 名字，避免动分支保护的必需检查。

## 读数

- 真 Postgres（本机 `pgvector/pgvector:pg17` 容器）：**3/3 通过**，整套 2.7–8.5s；隔离读数 `read committed`。
  用例一观察到多个不同总数（写方在 40 次决定期间持续插入），每条决定行 `count` 与 `items` 自洽。
- SQLite（默认环境）：**3 skipped / 0 passed**，`Test Suites: 1 skipped` —— 干净跳过，不伪绿。
- 反向守卫：`DB_TYPE=sqlite PG_SNAPSHOT_REQUIRED=1` → 加载即失败，报
  `PG_SNAPSHOT_REQUIRED=1 but DB_TYPE is not postgres — refusing to skip`。
- 变异验证（**已恢复**，`git status` 里无产品改动）：把 `_releaseEvidence` 临时改回 `count` + `find(take)`
  两次读，连跑 3 次，用例一**每次**都在第 1 条决定行变红：
  `count disagrees with the rows at or below the watermark #5: statement says 4, table says 5 — decision 1/40:
  count=4, items=[5,4,3], isolation=read committed`。恢复实现后复跑 3/3 绿。
- 相关套件：`write-claim-decision.service.spec.ts` + `target-status-reconcile.spec.ts` +
  `write-claim-query.service.spec.ts` → 3 套 / **86 例**全绿。
- `node scripts/check-test-types.mjs` → 本文件未进错误榜，`✓ 未超基线`。
- `npx eslint` 新文件 → 0 error。
- 治理两套件（`src/governance-shared` + `src/governance-core`）：43 套 / **606 例**通过，另 1 套跳过
  （就是本文件），3 例跳过 —— 与基线一致。
- `npm run check:all`（带 `KEELBASE_JAVA_REPO=D:/Rain6fish/KeelBase4J`）：**36/36 全过**（82.9s）。

## 未做 / 风险

- **CI 没有真的在 GitHub 上跑过**：工作流改动按要求只留本地、未推送。静态核对了 job 配置（同一 service、
  `localhost:5432`、postgres/postgres，与本 job 既有步骤一致），但「到 GitHub 上真的会跑到」未经验证。
- **flaky 风险**：用例一自带两条「写方真的插进来了」的守卫（`inserted > 0`、不同总数 > 1），若哪天写方
  没插进来会**红**而不是假绿；用例二的重试预算 100 次、写方 5ms 节奏，本机与 GitHub runner 的延迟差异
  远小于这个预算。未见过失败，但没有在慢 runner 上实测。
- 用例自建/自删数据库需要连接用户有 `CREATEDB` 权限（CI 的 `postgres` 超级用户满足）；若换成受限账号，
  需预建库并授予权限。
- 未跑全量 `npm test` / 全量 e2e（本项未改产品代码，定向 + 治理两套件 + 门禁为准）。
- 契约、`CLAUDE.md` §9、schema 均未改（本项不加行为、不加审计动作）。
