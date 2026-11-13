# Release Cadence / 发版节奏

## English

This page states the release cadence for the KeelBase family: when a version is opened, which release lines
exist, what must pass before a tag, the order of publication, when to stop, and who decides. It is a rule
page — it publishes nothing and changes no code. Every rule cites the file and line it comes from; the
short names used in citations are listed under "Sources" at the end. Values marked as current are a
snapshot, verified on 2026-11-08.

### 1. A version is opened by a consumer need, not by a calendar

- The 4–6 week plan's single objective is a **released artifact a consumer can verify**, not a date on a
  calendar (`plan`:24).
- Its "Must not" list carries the operative cadence constraint: **no more than one release train per
  consumer need** (`plan`:28). The same revision states the same constraint in Chinese at `plan`:42. Read
  together: a need that already has a train waits for that train; a second train for the same need is not
  opened in parallel.
- Consumers adopt a version deliberately; the contract does not reach into them
  (`contract/CONTRIBUTING.md`:53-55). A release therefore exists to serve a consumer's next pin, not to
  fill a schedule.
- The same revision treats a pending version as a decision, not as an automatic consequence of the work
  being finished: item ④ is "decide `1.3.1`", not "publish `1.3.1`" (`plan`:26, :40).

### 2. The three release lines

| Repository | Line | Version space | Tag | Current value (2026-11-08) |
|---|---|---|---|---|
| `KeelBase` (this repository) | `1.3.x`, current and actively maintained (`docs/versioning.md`:44-49) | `MAJOR.MINOR.PATCH`; the product version is the root `package.json` and the single source of truth (`release-precheck.md`:61-77) | annotated `vX.Y.Z` (`v1.3.1` is a tag object) | `1.3.1` (`package.json`:3); tag `v1.3.1` is on both remotes; GitHub Release published 2026-11-07 20:45 +08 |
| `keelbase-contract` | `v1.x.y` | MAJOR = removal, rename, or a change to promised meaning; MINOR = additive files; PATCH = non-normative correction only; documents and tools are outside the version line (`contract/README.md`:133-155) | annotated `vX.Y.Z` (`contract/CONTRIBUTING.md`:50) | latest tag `v1.22.0` (commit `1eb05d3`) is on the GitHub remote; the Gitee remote still ends at `v1.21.0` (both observed 2026-11-08) |
| `KeelBase4J` | `0.1.x` | `0.1.x` | annotated `v0.1.x` (`v0.1.17` is a tag object) | `0.1.17` (`pom.xml`:16); tag `v0.1.17` is on both remotes; all four artifacts resolve on Maven Central (`handoff`:13-17) |

A contract release is cut from the **previous release tag**, not from `main`'s tip; the same rule is
recorded for `v1.21.0` (`contract/CHANGELOG.md`:39-40) and for `v1.18.0` (`contract/CHANGELOG.md`:194-195).

### 3. What must pass before a tag

#### 3.1 Common to every line

- A tag is cut only on a commit that is already pushed and whose CI is green; a published tag cannot be
  re-cut (`4J/CLAUDE.md`:56-58).
- Release notes describe what the tag **actually contains**: compare `git log --oneline <previous
  tag>..HEAD` with the tag body and the CHANGELOG entry before cutting the tag (`4J/CLAUDE.md`:60-67).

#### 3.2 Main repository (`KeelBase`)

`docs/manual/release-precheck.md` is the standing pre-release procedure, executed in order:

1. **Four-layer code review**, fixed at four layers and not extended (`release-precheck.md`:7, :26):
   OpenCodeReview on the release diff; Claude's own multi-axis review; the code-review skill's Standards
   and Spec axes; AI Code Economy Review. Blocking findings are fixed before release (`release-precheck.md`:24).
2. **Full test table** (`release-precheck.md`:39-51): backend unit tests with coverage thresholds, backend
   e2e, Web-Admin-Vue vitest, Flutter tests, generator/CLI tests, the golden-application script,
   endpoint-document consistency, the contract release gate, and `./scripts/release-gate.sh`.
3. **Coverage** must meet the thresholds and must not fall below the previous release
   (`release-precheck.md`:53-57).
4. **Version bump and parity** — the product version is the root `package.json`; the gate is
   `node scripts/check-version-parity.mjs` (`release-precheck.md`:59-84), also run by CI in the
   `version-parity` job (`.github/workflows/ci.yml`:299-308).
5. **Documentation sync** (`release-precheck.md`:86-109).

The executable gate is `scripts/release-gate.sh`. It checks, in order:

- Gate 1, the golden application (AI CRM end to end) (`scripts/release-gate.sh`:33-57).
- Build: backend compile, generator dry run, generator/CLI tests (`:59-64`).
- Endpoints: `CLAUDE.md` §9 against the actual controllers (`:66-72`).
- Delivery: the acceptance form carries a coverage statement (`:74-81`).
- Trust: fourteen e2e suites in four batches, retried only when jest produced no summary line
  (`:83-144`); revoke idempotency (`:146-148`); audit writes awaited (`:150-154`); audit chain load
  (`:156-158`); CE-1 contract corpus, wire schema, language, evidence canonical, scenario packs
  (`:160-166`).
- Private: AIization and migration consistency (`:168-183`).
- Run/Adversarial: executed only when `LLM_ENV=1` (`:185-195`).
- Exit 0 only when the failure count is zero (`:197-199`).

`docs/manual/release-gate.md` records the five-dimension judgment (Build / Run / Trust / Private plus
adversarial proof) and states that External was demoted to a post-1.0 growth milestone and does not block a
release (`release-gate.md`:22, :127-129). The document records the criterion; `scripts/release-gate.sh` is
its executable form today.

#### 3.3 Contract (`keelbase-contract`)

- In the contract repository, `npm run check` chains five checks: schema (offline), protocol conformance,
  registry v2, registry paths (strict), and the family block (`contract/package.json`:12).
- In this repository, `npm run check:contract-release-gate` is the membership gate with five falsifiable
  criteria (`scripts/check-contract-release-gate.mjs`:16-28):
  - C1 — the pin commit is reachable on the contract remote; unreadable remote = unverified = red.
  - C2 — both READMEs name the same contract version on the `main` row, and that version is a tag on the
    remote.
  - C3 — the pin sits on that tag or descends from it, and added commits carry no parked capability.
  - C4 — the claimed version descends from the previous release tag.
  - C5 — every schema capability present in the claimed or pinned tree has an implementer.
- The contract release line is merged into `main` and CI must run (`weekly` C1).
- **Release tags are cut on `main`'s first-parent line, and committer dates stay monotonic along the
  topology.** `git describe` ranks tags with a traversal heuristic ordered on committer dates, so a child
  dated earlier than its parent can make it name an older tag. In the contract repository the v1.19.0
  release commit (`8cfd423`) and its merge (`a161596`) were both dated earlier than their parents; on a
  pin that actually held v1.22.0, `git describe` returned v1.18.0. The gates therefore read the newest
  tag that is an ancestor (`git tag --merged HEAD --list 'v[0-9]*' --sort=-v:refname`), and the pin was
  advanced on that reading (`95ce9269`). Keeping tags on the first-parent line and dates monotonic is what
  keeps that reading — and any future `git describe` call — honest.

#### 3.4 `KeelBase4J`

- `bash scripts/release-gate.sh` is the deterministic gate: one PASS/FAIL per dimension and a single
  summary line; exit 0 only when nothing failed (`4J/scripts/release-gate.sh`:4-14, :44-45). The clean
  `v0.1.17` run reported 13 pass / 0 fail in 805 s (`handoff`:40-42).
- Four checks are deliberately outside the default run: the golden path (needs the main repository's
  Web-Admin-Vue checkout), the adapter demos (`LLM_ENV=1`), the PostgreSQL demo (`PG_ENV=1`), and the
  reference-project demo (manual by decision) (`4J/scripts/release-gate.sh`:22-28).
- `release.yml` triggers on `v*` tags (`4J/.github/workflows/release.yml`:25-26). Its first step is
  `bash scripts/check-pin-lag.sh --pins-only --strict`, before anything is built (`:45-59`). The deploy
  step publishes four artifacts under `-Prelease deploy` with `autoPublish=true` (`:226-230`).

### 4. Order of a release

1. **Gate green on the exact commit.** The commit that will carry the tag is the one the gate ran on.
2. **Tag that commit.** Use annotated tags. When another worktree is dirty, create the tag by explicit
   SHA: a tag moves refs only and does not touch another session's working tree (`handoff`:96-103).
3. **Push the tag to both remotes.** All three repositories have a Gitee remote and a GitHub remote
   (`git remote -v`). The contract procedure is `git tag -a vX.Y.Z -m "<message>"`, then push the branch
   and the tag (`contract/CONTRIBUTING.md`:50-51).
4. **Wait for the publication surface of that line.**
   - `KeelBase`: the GitHub Release carries the notes (`docs/versioning.md`:95).
   - `KeelBase4J`: the Release workflow must succeed and the four artifacts must resolve on Maven Central
     (`handoff`:13-17); a green job means published because `autoPublish=true` (`handoff`:83).
   - `keelbase-contract`: the pushed tag is the publication act; there is no build product.
5. **The consumer raises its pin deliberately** (`contract/CONTRIBUTING.md`:53-55). In this family the
   consumer pins are: this repository's contract pin in the `Server-NestJS/specs/protocol` submodule;
   KeelBase4J's contract pin, read from `.github/workflows/ci.yml` rather than copied
   (`4J/scripts/release-gate.sh`:34-36); and the host's pin to KeelBase4J, a separate step
   (`weekly` R3).

#### "Prepared but not published" is not "published"

A release that has passed its gate is still **prepared**. Publication means a tag on both remotes plus a
resolvable consumer-facing artifact or a publication record.

- **Before.** On 2026-11-07, `KeelBase4J` `0.1.17` was prepared: the gate was 13/13 at `2189212`, there
  was **no tag**, and Central returned 404 for `0.1.17` (`plan`:22, :36).
- **After.** Following the user's go-ahead, tag object `94aab9a9e500134393b6e470aa9342dc840d01e2` was cut at
  `2189212` and pushed to both remotes; Release run `42350347260` succeeded in 5m42s, including the
  "Deploy to Maven Central Portal" step; all four artifacts returned HTTP 200; a GitHub Release exists
  (`handoff`:11-19).
- **The test to apply to any claimed release:** does the tag exist on **both** remotes, and does the
  consumer-facing artifact resolve? A gate log answers neither question.

### 5. Stop conditions

- **Gate not green at the exact commit** ⇒ do not tag. For this week's 4J release the bar is 13/13 at
  `2189212` (`plan`:30, :44; `weekly` R1).
- **Central still unresolvable after one full release run by the agreed date** (11-10 for the current
  train) ⇒ keep the old version (`0.1.16`), record the outcome, and do not tag (`plan`:30, :44;
  `weekly` R2).
- **A tag cannot be taken back** ⇒ never tag a commit that is not pushed and CI-green (`4J/CLAUDE.md`:56-58;
  `handoff`:96-103).
- **Contract `main`** ⇒ if conflicts are non-mechanical, stop and report; do not force-push and do not
  re-tag (`plan`:44).

### 6. Who decides

- **Version decisions belong to the user, not to a session.** This week's D1 — "decide `1.3.1`: publish now
  or fold into the next release" — is marked `11-12 (**User**)` in the due column (`weekly`:24, :52), and
  the checkpoints state that D1/D2 need the user (`weekly`:32). Its acceptance is either a `v1.3.1`
  Release or a written decision row (`weekly`:24).
- A session prepares the gate and publishes only after the user's go-ahead (`handoff`:13).
- D1's acceptance evidence now exists: `v1.3.1` is tagged on both remotes and published as a GitHub
  Release on 2026-11-07 20:45 +08 (`gh release list`; both remotes).

### Sources

Paths without a repository prefix are relative to this repository (`KeelBase`).

- `release-precheck.md` — `docs/manual/release-precheck.md`
- `release-gate.md` — `docs/manual/release-gate.md`
- `scripts/release-gate.sh` — `scripts/release-gate.sh`
- `scripts/check-contract-release-gate.mjs` — `scripts/check-contract-release-gate.mjs`
- `package.json` — `package.json`
- `plan` — `D:/Rain6fish/KeelBase-Private/KeelBase4TS/KeelBase-下阶段规划与开发计划_2026-10-17.md`, §2026-11-07 revision
- `weekly` — `D:/Rain6fish/KeelBase-Private/notes/CTO每周例会/2026-11-07-下周开发计划.md`
- `handoff` — `D:/Rain6fish/handoff/4j-017-publish-20261107.md`
- `contract/…` — `D:/Rain6fish/keelbase-contract/…`
- `4J/…` — `D:/Rain6fish/KeelBase4J/…`

## 中文

本页写明 KeelBase 家族的**发版节奏**：版本何时开、有哪几条发布线、打 tag 前必过什么、发布的先后
顺序、什么时候停、以及谁来决定。本页只写规则——不发布任何版本、不改任何代码。每条规则都标出它来自
哪个文件哪一行；引用里用的短名见文末「出处」。标为「当前值」的是快照，核于 2026-11-08。

### 1. 按消费者需求开版本，不按日历

- 4–6 周计划件的唯一主目标是**消费者能核验的已发布产物**，不是日历上的某一天（`plan`:24）。
- 它的「必须不做」载着真正约束节奏的那一条：**同一消费者需求最多一条发布列车**（`plan`:28）；同一
  修订段的中文写法是「不再一周多个发布列车」（`plan`:42）。两句合读：已有列车在跑的需求等那班车；
  同一需求不并行再开第二班。
- 消费者是**自己**决定何时采用的，契约不会伸进消费者里（`contract/CONTRIBUTING.md`:53-55）。因此一次
  发布的存在，是为了服务消费者下一次抬 pin，而不是为了填满排期。
- 同一修订段把待发版本当作**一项裁决**，而不是「活干完了就自动发」：第 ④ 项写的是「决定 `1.3.1`」，
  不是「发布 `1.3.1`」（`plan`:26、:40）。

### 2. 三条发布线

| 仓 | 版本线 | 版本空间 | tag | 当前值（2026-11-08） |
|---|---|---|---|---|
| `KeelBase`（本仓） | `1.3.x`，当前维护线（`docs/versioning.md`:44-49） | `MAJOR.MINOR.PATCH`；产品版本 = 根 `package.json`，唯一真源（`release-precheck.md`:61-77） | 附注 tag `vX.Y.Z`（`v1.3.1` 是 tag 对象） | `1.3.1`（`package.json`:3）；tag `v1.3.1` 两个远端都有；GitHub Release 发布于 2026-11-07 20:45 +08 |
| `keelbase-contract` | `v1.x.y` | MAJOR = 删除、改名或改变已承诺的语义；MINOR = 加性新增文件；PATCH = 只更正非规范性内容；文档与工具不在版本线上（`contract/README.md`:133-155） | 附注 tag `vX.Y.Z`（`contract/CONTRIBUTING.md`:50） | 最新 tag `v1.22.0`（提交 `1eb05d3`）在 GitHub 远端；Gitee 远端仍止于 `v1.21.0`（两者均于 2026-11-08 观测） |
| `KeelBase4J` | `0.1.x` | `0.1.x` | 附注 tag `v0.1.x`（`v0.1.17` 是 tag 对象） | `0.1.17`（`pom.xml`:16）；tag `v0.1.17` 两个远端都有；四个 artifact 在 Maven Central 均可解析（`handoff`:13-17） |

契约的一次发布**从上一个发布 tag 切出**，不从 `main` 末端切；`v1.21.0`（`contract/CHANGELOG.md`:39-40）
与 `v1.18.0`（`contract/CHANGELOG.md`:194-195）都记着这条。

### 3. 打 tag 前必过什么

#### 3.1 每条线共通

- tag 只打在**已推送且 CI 绿**的提交上；已发布的 tag 重打不了（`4J/CLAUDE.md`:56-58）。
- 发布说明写的是 tag **实际包含**的东西：打 tag 前把 `git log --oneline <上一 tag>..HEAD` 与 tag 正文、
  CHANGELOG 条目逐条比对（`4J/CLAUDE.md`:60-67）。

#### 3.2 主仓 `KeelBase`

`docs/manual/release-precheck.md` 是固定的发布前程序，按顺序执行：

1. **四层代码审核**，固定为四层、不再增加（`release-precheck.md`:7、:26）：OpenCodeReview 审发布区间
   diff；Claude 自带的多维审查；code-review skill 的 Standards 与 Spec 双轴；AI Code Economy Review。
   阻塞项必须在发布前修掉（`release-precheck.md`:24）。
2. **全量测试表**（`release-precheck.md`:39-51）：后端单测 + 覆盖率门槛、后端 e2e、Web-Admin-Vue
   vitest、Flutter 测试、生成器/CLI 测试、Golden Application 脚本、端点-文档一致性、契约成员性发版闸，
   以及 `./scripts/release-gate.sh`。
3. **覆盖率**必须达标，且不低于上一版（`release-precheck.md`:53-57）。
4. **版本 bump 与对账**——产品版本是根 `package.json`；门禁是
   `node scripts/check-version-parity.mjs`（`release-precheck.md`:59-84），CI 的 `version-parity` job 也跑
   它（`.github/workflows/ci.yml`:299-308）。
5. **文档同步**（`release-precheck.md`:86-109）。

可执行的闸是 `scripts/release-gate.sh`，依次检查：

- Gate 1：Golden Application（AI CRM 一次跑通）（`scripts/release-gate.sh`:33-57）。
- Build：后端编译、生成器 dry-run、生成器/CLI 单测（`:59-64`）。
- Endpoints：`CLAUDE.md` §9 与实际 Controller 路由（`:66-72`）。
- Delivery：交付验收单必须带覆盖声明（`:74-81`）。
- Trust：14 个 e2e 套件分 4 批，只有 jest 未产出汇总行时才重试（`:83-144`）；撤销幂等（`:146-148`）；
  审计写入必须 await（`:150-154`）；审计链压测（`:156-158`）；CE-1 协议语料、wire Schema、术语、证据
  canonical、场景包（`:160-166`）。
- Private：AIization 与迁移一致性（`:168-183`）。
- Run/Adversarial：仅在 `LLM_ENV=1` 时执行（`:185-195`）。
- 只有失败数为零才退 0（`:197-199`）。

`docs/manual/release-gate.md` 记的是五维判定（Build / Run / Trust / Private 加对抗性证明），并写明
External 已降级为 1.0 后的增长里程碑、不阻塞发布（`release-gate.md`:22、:127-129）。那份文档记判据；
今天可执行的形式是 `scripts/release-gate.sh`。

#### 3.3 契约 `keelbase-contract`

- 契约仓里，`npm run check` 串起五项：schema（离线）、协议 conformance、registry v2、registry 路径
  （strict）、family block（`contract/package.json`:12）。
- 本仓里，`npm run check:contract-release-gate` 是成员性发版闸，五条判据都可反向证伪
  （`scripts/check-contract-release-gate.mjs`:16-28）：
  - C1 —— pin 提交在契约远端可达；远端读不出 = 未核验 = 红。
  - C2 —— 两版 README 的 `main` 行写着同一个契约版本，且该版本是远端上的 tag。
  - C3 —— pin 落在该 tag 上或由它派生，多出来的提交不携带仍在暂缓中的能力。
  - C4 —— 声称的版本由上一个发布 tag 派生。
  - C5 —— 声称树或 pin 树里出现的每个 schema 能力都有实现方。
- 契约发布线并入 `main` 后，CI 必须跑（`weekly` C1）。
- **发布 tag 打在 `main` 的 first-parent 线上，提交日期沿拓扑保持单调。** `git describe` 用按提交日期遍历的
  启发式给 tag 排名，子提交日期早于父提交时会把更旧的 tag 说成最近的。契约仓里 v1.19.0 的发布提交
  （`8cfd423`）与它的 merge（`a161596`）日期都早于各自的父提交；pin 实际含着 v1.22.0 时，`git describe`
  返回的是 v1.18.0。因此门禁改读**祖先中版本最高**的 tag（`git tag --merged HEAD --list 'v[0-9]*'
  --sort=-v:refname`），pin 也是按这个读数前移的（`95ce9269`）。把 tag 打在 first-parent 线上、保持日期
  单调，才能让这个读数 —— 以及将来任何 `git describe` 调用 —— 如实反映最近的那版。

#### 3.4 `KeelBase4J`

- `bash scripts/release-gate.sh` 是确定性闸：每维一行 PASS/FAIL、末尾一行汇总；只有全不失败才退 0
  （`4J/scripts/release-gate.sh`:4-14、:44-45）。`v0.1.17` 的干净一轮是 13 pass / 0 fail、805 秒
  （`handoff`:40-42）。
- 四项**有意**不在默认跑里：golden path（需要主仓的 Web-Admin-Vue 检出）、适配器 demo（`LLM_ENV=1`）、
  PostgreSQL demo（`PG_ENV=1`）、参考项目 demo（按决定保持手动）（`4J/scripts/release-gate.sh`:22-28）。
- `release.yml` 由 `v*` tag 触发（`4J/.github/workflows/release.yml`:25-26）。第一步是
  `bash scripts/check-pin-lag.sh --pins-only --strict`，排在一切构建之前（`:45-59`）。发布步以
  `-Prelease deploy` 发四个 artifact，`autoPublish=true`（`:226-230`）。

### 4. 发布的先后顺序

1. **门禁在确切的那个提交上全绿。** 将要打 tag 的提交，就是门禁跑过的那个提交。
2. **打 tag。** 用附注 tag。别的 worktree 脏时按显式 SHA 打：tag 只动 ref，不碰别的会话的工作树
   （`handoff`:96-103）。
3. **把 tag 推到两个远端。** 三个仓都有 Gitee 与 GitHub 两个远端（`git remote -v`）。契约的程序是
   `git tag -a vX.Y.Z -m "<message>"`，然后推分支与 tag（`contract/CONTRIBUTING.md`:50-51）。
4. **等这条线自己的发布面。**
   - `KeelBase`：GitHub Release 承载发布说明（`docs/versioning.md`:95）。
   - `KeelBase4J`：Release workflow 必须成功，四个 artifact 必须在 Maven Central 可解析
     （`handoff`:13-17）；因为 `autoPublish=true`，job 绿就等于已发布（`handoff`:83）。
   - `keelbase-contract`：推上去的 tag 本身就是发布动作，没有构建产物。
5. **消费者自己抬 pin**（`contract/CONTRIBUTING.md`:53-55）。这个家族里的消费者 pin 是：本仓的契约 pin
   在 `Server-NestJS/specs/protocol` 子模块；`KeelBase4J` 的契约 pin 从 `.github/workflows/ci.yml`
   **读**出来、不另抄一份（`4J/scripts/release-gate.sh`:34-36）；宿主到 `KeelBase4J` 的 pin 是另一步
   （`weekly` R3）。

#### 「发版件备齐」不等于「已发布」

过了门禁的发布，仍然只是**备齐**。已发布 = tag 在两个远端 + 消费者可见的产物可解析（或有发布记录）。

- **备齐时。** 2026-11-07 的 `KeelBase4J` `0.1.17` 是备齐状态：`2189212` 上门禁 13/13，但**没有 tag**，
  Central 对 `0.1.17` 返回 404（`plan`:22、:36）。
- **已发布后。** 用户批准后，tag 对象 `94aab9a9e500134393b6e470aa9342dc840d01e2` 打在 `2189212` 上并
  推到两个远端；Release run `42350347260` 5 分 42 秒成功，含「Deploy to Maven Central Portal」这一步；
  四个 artifact 均返回 HTTP 200；GitHub Release 已存在（`handoff`:11-19）。
- **对任何「已发布」声称都可以套用的检验：** tag 是不是**两个**远端都有？消费者要的产物解析得到吗？
  一份门禁日志对这两个问题都答不了。

### 5. 停止条件

- **确切提交上的门禁不全绿** ⇒ 不打 tag。本周 4J 发布的线是 `2189212` 上 13/13（`plan`:30、:44；
  `weekly` R1）。
- **一次完整发布 run 后，到约定日期 Central 仍不可解析**（当前这班车是 11-10）⇒ 维持旧版（`0.1.16`）、
  记录结论、不打 tag（`plan`:30、:44；`weekly` R2）。
- **tag 收不回来** ⇒ 绝不在没有推送、或 CI 不绿的提交上打 tag（`4J/CLAUDE.md`:56-58；`handoff`:96-103）。
- **契约 `main`** ⇒ 冲突非机械时停下上报；不 force-push、不重打 tag（`plan`:44）。

### 6. 谁裁

- **版本决定属于用户，不属于会话。** 本周 D1——「决定 `1.3.1`：现在发，或并入下一版」——到期一栏标着
  `11-12（**用户**）`（`weekly`:24、:52），检查点也写明 D1/D2 需用户裁（`weekly`:32）。它的验收是有了
  `v1.3.1` 的 Release，或有了一行成文决定（`weekly`:24）。
- 会话负责把门禁备齐；发布只在用户批准之后进行（`handoff`:13）。
- D1 的验收证据现在已存在：`v1.3.1` 在两个远端都有 tag，并于 2026-11-07 20:45 +08 发布为 GitHub Release
  （`gh release list`；两个远端）。

### 出处

不带仓前缀的路径都相对本仓（`KeelBase`）。

- `release-precheck.md` —— `docs/manual/release-precheck.md`
- `release-gate.md` —— `docs/manual/release-gate.md`
- `scripts/release-gate.sh` —— `scripts/release-gate.sh`
- `scripts/check-contract-release-gate.mjs` —— `scripts/check-contract-release-gate.mjs`
- `package.json` —— `package.json`
- `plan` —— `D:/Rain6fish/KeelBase-Private/KeelBase4TS/KeelBase-下阶段规划与开发计划_2026-10-17.md`，§2026-11-07 周会修订
- `weekly` —— `D:/Rain6fish/KeelBase-Private/notes/CTO每周例会/2026-11-07-下周开发计划.md`
- `handoff` —— `D:/Rain6fish/handoff/4j-017-publish-20261107.md`
- `contract/…` —— `D:/Rain6fish/keelbase-contract/…`
- `4J/…` —— `D:/Rain6fish/KeelBase4J/…`
