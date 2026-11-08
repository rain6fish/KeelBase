# Supply-Chain Security Criterion / 供应链安全口径

This document states how this repository decides whether its dependencies are safe enough to ship: what
is scanned, what fails, where it runs, how base images are pinned, and what the recorded exceptions
oblige. Every rule points at the file and line that implements it; where no mechanism exists, this
document says so instead of describing one.

Read at commit `9b38afd2` (2026-11-08). The gate itself is not changed by this document.

---

# English

## 1. Scope — what is scanned

The supply-chain gate is one script, `scripts/check-dependency-scan.mjs`, plus a second, older check that
predates it. The script runs `osv-scanner scan source -r <root>` (`scripts/check-dependency-scan.mjs:208-209`)
with the root set to the repository directory (`:68`). The scanner walks the file system, not
`git ls-files`, which has three consequences:

- every lockfile in the tree is read, including one inside an initialised submodule;
- on a local run, files that are not committed are read too; CI checks out a clean tree;
- the gate prints the list of lockfiles the scanner actually read (`:238-242`, `:316-320`). For any given
  run, that list — not this document — is the honest answer to "what was covered".

Reading on 2026-11-08 from a clean checkout (7 lockfiles, 3466 packages):

| Lockfile | Packages | Read |
|---|---|---|
| `Front-Flutter/pubspec.lock` | 104 | yes |
| `Front-Taro/package-lock.json` | 1380 | yes |
| `package-lock.json` | 62 | yes |
| `Server-NestJS/package-lock.json` | 1054 | yes |
| `Server-NestJS/specs/protocol/package-lock.json` | 6 | yes — inside the contract submodule |
| `Web-Admin-React/package-lock.json` | 424 | yes |
| `Web-Admin-Vue/package-lock.json` | 436 | yes |
| `Front-Taro/pnpm-lock.yaml` | — | no |

`Front-Taro` carries both a `package-lock.json` and a `pnpm-lock.yaml`. CI installs that tree with
`npm ci` (`.github/workflows/ci.yml:941`), so the pnpm file is a stale local artefact that would only
report the same packages twice. `isShadowed` skips any lockfile whose directory also holds a
`package-lock.json` (`scripts/check-dependency-scan.mjs:144-149`), and the run names what it skipped
(`:320`).

Outside the scope of this gate:

- **Image layers and OS packages.** Nothing scans a built image; `.github/workflows/ci.yml` never builds
  one (its only mention of Docker is a comment at `:962`). Images are built by
  `.github/workflows/docker-publish.yml:98` on tag pushes and manual dispatch (`:14-17`).
- **Compose run-time images.** `image:` entries are not lockfiles: `docker-compose.yml:10`
  (`pgvector/pgvector:pg17`), `:27` (`redis:7-alpine`), `:160` (`ollama/ollama:latest`), and
  `docker-compose.observability.yml:26,34,52,60` (Prometheus, Grafana, Jaeger, Loki). None is pinned.
- **Development dependencies.** Scanned, counted and reported, not gated (`:24-25`, `:310`).
- **Gradle.** `Front-Flutter/android/app/build.gradle.kts` is not a lockfile and no JVM scanner runs here.
- **GitHub Actions versions.** Covered by Dependabot only, with `open-pull-requests-limit: 0`
  (`.github/dependabot.yml:70-77`) — an alerting channel, not a gate.

## 2. Criteria — what fails

**Severity bands** (`scripts/check-dependency-scan.mjs:90-97`): CVSS >= 9 is `CRITICAL`, >= 7 `HIGH`,
>= 4 `MODERATE`, below that `LOW`; a score that is not a number is `UNKNOWN`.

**The gated set** is `HIGH`, `CRITICAL` and `UNKNOWN` (`:73`). `UNKNOWN` is gated so that nothing can
hide by having no CVSS score.

**Production scope** is read from the lockfile itself (`:158-202`):

- npm `package-lock.json` with `lockfileVersion >= 2`: every entry whose `dev` is not `true`;
- npm `lockfileVersion 1`: unreadable (`null`), so every reported finding is treated as production —
  over-gating, never under-gating;
- `pubspec.lock`: everything except entries marked `direct dev` (Pub cannot say whether a `transitive`
  package is reachable from a dev dependency, so the conservative direction is taken);
- any other lockfile format: `null`, so every reported finding is treated as production.

A finding fails the gate when it is in a production dependency, its band is in the gated set, and it is
not in the baseline (`:307-311`, `:453-456`).

**The baseline** is `scripts/dependency-scan-baseline.json`. Each entry holds five fields — `lockfile`,
`package`, `version`, `id`, `severity` (`:5-279`; the writer emits exactly those five, `:345-358`). The
matching key is `lockfile|package|id` and deliberately excludes the version (`:251-253`, `:308`): while
the same advisory is still reported, a version bump does not make the entry stop matching.

**Stale entries.** An entry that no longer fires is printed on every run, at most ten shown, and is *not*
a failure (`:446-451`). `--update-baseline` rewrites the file from the current gated findings, which
prunes them (`:345-358`, `:437-442`).

**Failure must never read as clean.** Before scanning, the gate probes the OSV API itself
(`:298-299`, `:107-125`). Any of the following is reported as **未核 (unverified)** and exits 2
(`:83-88`, `:214-233`):

- the probe fails;
- the scanner exits with a code outside `{0, 1}`;
- the scanner reports an extraction error;
- the report is unreadable, or has no `results` array.

The reason this exists is measured: with the OSV API unreachable, `osv-scanner` still wrote a valid
report containing `{"results": []}` and exited 127. A gate that read only the file would have called that
run clean.

**`--selftest`** (`:389-427`) proves the gate can still go red, green and 未核, on fixtures built in the
OS temp directory (`:360-387`) so that no vulnerable package enters a repository lockfile:

| Check | Fixture | Expected |
|---|---|---|
| red | `minimist@1.2.5` | at least one new gated finding |
| green | `minimist@1.2.6` | zero new, zero gated |
| 未核 | child run with `OSV_PROBE_URL` pointed at `127.0.0.1:9` | exit 2 and output containing `未核` |

The first two need network access.

## 3. Where it runs

**CI.** Job `supply-chain` (`.github/workflows/ci.yml:746-814`), in order:

| Step | Line | What it does |
|---|---|---|
| `npm ci` | `:761` | lockfile and `package.json` must agree |
| `npm audit --omit=dev --audit-level=high` | `:763-764` | Server-NestJS only; the pre-existing line, kept |
| SBOM (SPDX) + artifact upload | `:766-772` | Server-NestJS production set only |
| fetch osv-scanner (pinned) | `:788-799` | version `2.7.0` and sha256, verified before use (`:791-792`) |
| dependency scan | `:800-804` | the gate, `--verbose` |
| dependency scan self-test | `:810-814` | `--selftest` |

The scanner is pinned on two axes at the fetch step. The script also carries the version string
(`scripts/check-dependency-scan.mjs:71`) but does not verify it; the CI step verifies the digest.

The workflow runs on pushes to `main` and on pull requests targeting `main` (`ci.yml:6-10`). Whether a red
`supply-chain` job *blocks* a merge is a repository branch-protection setting, which is not part of this
tree — the workflow can only make the check fail.

**Locally.** There is no npm script for the gate: the root `package.json` scripts block (`:32-68`) has none,
and nothing outside CI and the baseline note references it. Run it directly, with the binary path supplied
through `OSV_SCANNER` (`scripts/check-dependency-scan.mjs:128`):

```bash
curl -sSfL -o /tmp/osv-scanner \
  https://github.com/google/osv-scanner/releases/download/v2.7.0/osv-scanner_linux_amd64
echo "160c6253e2922e9e0a6a9771c5c4c40a4b3c6090b34a3cdd5e80c96cc2e4218b  /tmp/osv-scanner" | sha256sum -c -
chmod +x /tmp/osv-scanner
OSV_SCANNER=/tmp/osv-scanner node scripts/check-dependency-scan.mjs --verbose
```

On Windows the release asset is `osv-scanner_windows_amd64.exe`, with sha256
`9964ed64ec9a387391eb4cc006ad5c531154821aef29b793e02c448de4686438`.

One operational fact, measured 2026-11-08: `osv-scanner` does not read a tree that lives under a
`.claude/` directory. A lockfile placed under `…/.probe-plain/` was read (1 package); the same file under
`…/.claude/probe-plain/` was not read (0 packages). Desktop-app worktrees are created at
`.claude/worktrees/<name>`, so running
the gate from one reports "No package sources found" and the gate exits 2 as **未核** — correctly, since
it cannot claim a clean tree. Run it from a plain checkout to get a reading.

**Not in `npm run check:all`.** `check-all.mjs` runs only `check:*` scripts (`scripts/check-all.mjs:56`)
and the gate is not registered as one; a local skip would print as a pass in that summary table. The same
reasoning excludes `migration-consistency-postgres`. CI is the runner (`scripts/check-dependency-scan.mjs:33-34`).

## 4. Base images

Two Dockerfiles, four references, each pinned by digest. Each digest was read at pin time and verified
against the registry and a smoke build when it was pinned.

| Reference | Digest | Where |
|---|---|---|
| `node:22-alpine` | `sha256:0e1754758c2df4cfa3e68d59e2e1b7374bb7fd9ea6328eaaacf15cc934af8202` | `Dockerfile:24`, `:41`, `:70`; `Dockerfile.single:32`, `:53`, `:63` |
| `alpine:3.24` | `sha256:3f4d6b32e26703c6082839234f43769d5046b3ac7c910033911d1e71d8cd630a` | `Dockerfile:92` |

`FROM scratch` (`Dockerfile:65`, `Dockerfile.single:49`) is the reserved empty base for the pre-built
Flutter artefact and cannot be pinned.

The reason is written in both files (`Dockerfile:1-4`, `Dockerfile.single:7-10`): a floating tag moves
underneath a rebuild, and a container built before the move keeps the base it was created from, with
nothing in CI saying so.

**Upgrading**, also written beside the pins (`Dockerfile:6-11`, `Dockerfile.single:13-18`):

1. `docker pull <tag>`
2. `docker inspect <tag> --format '{{index .RepoDigests 0}}'`
3. confirm what is inside (`docker run --rm --entrypoint node <tag> --version`)
4. replace the digest and rebuild.

Never copy a digest out of a report: tags move, and an older read points at an older image.

`Dockerfile.single` is the image published to `ghcr.io` (`.github/workflows/docker-publish.yml:98`; the
file says so at `Dockerfile.single:12-13`), so its digest is what users of the published image receive.

## 5. Recorded exceptions — the baseline and its obligations

The baseline holds 39 entries — 38 `HIGH`, 1 `CRITICAL` — all in production dependencies. At land time:
`Front-Taro` 15, `Web-Admin-Vue` 14, `Web-Admin-React` 10. They are real advisories against the installed
versions, and the fixes exist upstream; they are recorded so the gate starts green and fails only on new
findings (`scripts/check-dependency-scan.mjs:27-31`, `scripts/dependency-scan-baseline.json:2-4`).

**What each entry records:** `lockfile`, `package`, `version`, `id`, `severity` — that is the entire
schema.

**What is not recorded, and therefore not enforced:**

- **A reason.** The file's own note asks for one "in the reviewing PR" (`scripts/dependency-scan-baseline.json:2`,
  emitted at `scripts/check-dependency-scan.mjs:351`). The file has no field for it, and no check reads a
  pull-request description.
- **An owner.** No such field exists anywhere in the tree.
- **An expiry or review date.** No such concept exists. Nothing expires.

**Consequences, stated plainly:**

- an entry that still fires and has never been reviewed does **not** fail the gate — only a production
  finding absent from the file fails (`:307-311`, `:453-456`);
- an entry that no longer fires does **not** fail either — it is printed as prunable (`:446-451`);
- so "untriaged" and "overdue" are not states this gate can produce today. A stale baseline cannot turn
  CI red.

**What this manual records as the obligation:**

1. An entry may only be added by a change whose review states why the finding is accepted and what would
   remove it. The gate's failure message names the same two options — upgrade, or record and say why
   (`:335-343`).
2. An entry that stops firing is pruned in the change that notices it.
3. The baseline is re-read at each release — date, scanner version, known and new counts — and the
   reading is reported rather than assumed. The release checklist does not call this step yet; wiring it
   in is open.

**Who.** The author of the change that adds an entry owns it until the advisory is cleared. The baseline
as a whole is read by whoever runs the release.

**Current standing.** The triage that would give each of the 39 entries an owner and an expiry is an open
work item, not a completed one. Until it lands, the 39 are recorded debt, and this document does not
describe them as accepted risk.

## 6. Stop conditions

- **A production dependency with a `HIGH` or `CRITICAL` finding that the baseline does not record fails
  the gate** (`:336-343`, exit 1 at `:453-456`). It must not be merged. The remedy is to upgrade, or to
  record the exception together with the reason in the same change.
- **未核 (exit 2) is not a pass and is not an accepted state.** It means the tree was not verified
  (`:83-88`). Do not merge on it, and do not read it as clean.
- **Moderate, low and dev-only findings are not stop conditions.** They are counted and printed
  (`:310-311`, `:326`).

## 7. What this does not cover

1. **Image-layer scanning.** No `trivy image` / `grype` runs anywhere, so CVEs in a base image's OS
   packages are unreported.
2. **Compose images still float**, including three `latest` tags (`docker-compose.yml:160`,
   `docker-compose.observability.yml:26,34,52,60`).
3. **Dev-dependency findings are not gated** — 97 high/critical at the 2026-11-08 reading.
4. **The 39 baseline entries are debt, not a fix.**
5. **The OSV API is unauthenticated** and rate-limited; the self-test adds three queries per CI run.
6. **The `pubspec.lock` production closure is conservative** and can over-gate, never under-gate.
7. **An npm v1 lockfile would gate everything**; none exists today.
8. **The SBOM covers Server-NestJS only**, not the other six lockfiles.
9. **Required-check status is not in this tree.** Whether a red job blocks a merge is a GitHub setting.

---

# 中文

## 1. 射程 —— 扫什么

供应链门禁是一个脚本 `scripts/check-dependency-scan.mjs`，外加一条早于它存在、被原样保留的旧检查。
脚本执行 `osv-scanner scan source -r <根>`（`scripts/check-dependency-scan.mjs:208-209`），根为仓库目录
（`:68`）。扫描器走的是文件系统，不是 `git ls-files`，由此有三个后果：

- 树里每一份锁文件都会被读，包括已初始化子模块里的那一份；
- 本地运行时，未提交的文件同样会被读；CI 检出的是干净树；
- 门禁会打印扫描器实际读过的锁文件清单（`:238-242`、`:316-320`）。对任何一次具体运行来说，
  「覆盖了什么」的诚实答案在那份清单里，不在这份文档里。

2026-11-08 在干净检出上实测（7 份锁文件、3466 个包）：

| 锁文件 | 包数 | 是否读取 |
|---|---|---|
| `Front-Flutter/pubspec.lock` | 104 | 是 |
| `Front-Taro/package-lock.json` | 1380 | 是 |
| `package-lock.json` | 62 | 是 |
| `Server-NestJS/package-lock.json` | 1054 | 是 |
| `Server-NestJS/specs/protocol/package-lock.json` | 6 | 是 —— 在契约子模块内 |
| `Web-Admin-React/package-lock.json` | 424 | 是 |
| `Web-Admin-Vue/package-lock.json` | 436 | 是 |
| `Front-Taro/pnpm-lock.yaml` | — | 否 |

`Front-Taro` 同时带着 `package-lock.json` 与 `pnpm-lock.yaml`。CI 用 `npm ci` 安装这棵树
（`.github/workflows/ci.yml:941`），所以 pnpm 那份只是本地残留，扫它只会把同一批包重复报一遍。
`isShadowed` 会跳过「同目录另有 `package-lock.json`」的锁文件
（`scripts/check-dependency-scan.mjs:144-149`），运行输出里也会点名跳过了哪些（`:320`）。

本门禁不覆盖的部分：

- **镜像层与操作系统包。** 没有任何东西扫描构建出的镜像；`.github/workflows/ci.yml` 根本不构建镜像
  （其中唯一提到 Docker 的地方是 `:962` 的一句注释）。镜像由
  `.github/workflows/docker-publish.yml:98` 在打 tag 与手动触发时构建（`:14-17`）。
- **编排里的运行时镜像。** `image:` 不是锁文件：`docker-compose.yml:10`
  （`pgvector/pgvector:pg17`）、`:27`（`redis:7-alpine`）、`:160`（`ollama/ollama:latest`），以及
  `docker-compose.observability.yml:26,34,52,60`（Prometheus、Grafana、Jaeger、Loki）。它们都没有钉摘要。
- **开发依赖。** 会扫描、会计数、会报告，但不判红（`:24-25`、`:310`）。
- **Gradle。** `Front-Flutter/android/app/build.gradle.kts` 不是锁文件，本仓也没有 JVM 扫描器。
- **GitHub Actions 的版本。** 只由 Dependabot 覆盖，且 `open-pull-requests-limit: 0`
  （`.github/dependabot.yml:70-77`）—— 那是告警通道，不是门禁。

## 2. 判据 —— 什么算红

**严重度分档**（`scripts/check-dependency-scan.mjs:90-97`）：CVSS 大于等于 9 为 `CRITICAL`，大于等于 7 为
`HIGH`，大于等于 4 为 `MODERATE`，再低为 `LOW`；不是数字的分数记为 `UNKNOWN`。

**受门禁约束的分档**是 `HIGH`、`CRITICAL` 与 `UNKNOWN`（`:73`）。把 `UNKNOWN` 纳入，是为了不让任何一条
发现靠「没有 CVSS 分」藏起来。

**生产范围**从锁文件本身读出（`:158-202`）：

- npm `package-lock.json` 且 `lockfileVersion >= 2`：所有 `dev` 不为 `true` 的条目；
- npm `lockfileVersion 1`：读不出来（`null`），于是扫描器报出的每一条都按生产处理 —— 宁可多判，不会漏判；
- `pubspec.lock`：除标为 `direct dev` 之外的全部（Pub 说不清一个 `transitive` 包是否只被开发依赖引入，
  故取保守方向）；
- 其它任何锁文件格式：`null`，于是每一条都按生产处理。

一条发现判红的条件是：属于生产依赖、分档在受约束集合内、且不在基线里（`:307-311`、`:453-456`）。

**基线**是 `scripts/dependency-scan-baseline.json`。每条五个字段 —— `lockfile`、`package`、`version`、`id`、
`severity`（`:5-279`；写出侧也只写这五个，`:345-358`）。匹配键是 `lockfile|package|id`，**有意不含版本**
（`:251-253`、`:308`）：只要同一条公告还在报，版本升了这条登记仍然匹配。

**陈旧条目。** 不再触发的条目每次运行都会打印，最多显示十条，且**不**判定失败（`:446-451`）。
`--update-baseline` 会用当前的受约束发现重写整个文件，从而把它们清掉（`:345-358`、`:437-442`）。

**失败绝不能被读成干净。** 扫描之前，门禁会自己探一次 OSV API（`:298-299`、`:107-125`）。下列任一情形
都判为**未核**并以 2 退出（`:83-88`、`:214-233`）：

- 探测失败；
- 扫描器退出码不在 `{0, 1}` 内；
- 扫描器报了提取错误；
- 报告读不出来，或没有 `results` 数组。

这条规则来自实测：OSV API 不通时，`osv-scanner` 仍然写出一份合法的报告，内容是 `{"results": []}`，
并以 127 退出。只读文件的门禁会把那一次判成干净。

**`--selftest`**（`:389-427`）证明这道门仍然能红、能绿、能报未核。夹具建在系统临时目录里
（`:360-387`），不会有带漏洞的包进任何仓库锁文件：

| 检查 | 夹具 | 期望 |
|---|---|---|
| 红 | `minimist@1.2.5` | 至少一条新的受约束发现 |
| 绿 | `minimist@1.2.6` | 新增零条、受约束零条 |
| 未核 | 子进程把 `OSV_PROBE_URL` 指向 `127.0.0.1:9` | 退出码 2，输出含「未核」 |

前两项需要网络。

## 3. 执行处 —— 在哪里跑

**CI。** 任务 `supply-chain`（`.github/workflows/ci.yml:746-814`），依次为：

| 步骤 | 行 | 做什么 |
|---|---|---|
| `npm ci` | `:761` | 锁文件与 `package.json` 必须一致 |
| `npm audit --omit=dev --audit-level=high` | `:763-764` | 仅 Server-NestJS；项目原有的那条线，保留 |
| SBOM（SPDX）+ 产物上传 | `:766-772` | 仅 Server-NestJS 的生产集合 |
| 下载 osv-scanner（钉住） | `:788-799` | 版本 `2.7.0` 与 sha256，使用前校验（`:791-792`） |
| 依赖扫描 | `:800-804` | 门禁本体，带 `--verbose` |
| 依赖扫描自检 | `:810-814` | `--selftest` |

扫描器在下载这一步按两个轴钉住。脚本里也带着版本串（`scripts/check-dependency-scan.mjs:71`），但脚本
本身不校验它；校验摘要的是 CI 那一步。

工作流在推送到 `main` 与针对 `main` 的拉取请求上触发（`ci.yml:6-10`）。红的 `supply-chain` 是否**阻止**
合并，取决于仓库的分支保护设置，那不在本树里 —— 工作流能做的只是让这项检查失败。

**本地。** 门禁没有 npm script：根 `package.json` 的 scripts 块（`:32-68`）里没有，CI 与基线注记之外
也没有任何地方引用它。直接跑，二进制路径经 `OSV_SCANNER` 传入（`scripts/check-dependency-scan.mjs:128`）：

```bash
curl -sSfL -o /tmp/osv-scanner \
  https://github.com/google/osv-scanner/releases/download/v2.7.0/osv-scanner_linux_amd64
echo "160c6253e2922e9e0a6a9771c5c4c40a4b3c6090b34a3cdd5e80c96cc2e4218b  /tmp/osv-scanner" | sha256sum -c -
chmod +x /tmp/osv-scanner
OSV_SCANNER=/tmp/osv-scanner node scripts/check-dependency-scan.mjs --verbose
```

Windows 上的发布件是 `osv-scanner_windows_amd64.exe`，sha256 为
`9964ed64ec9a387391eb4cc006ad5c531154821aef29b793e02c448de4686438`。

一条 2026-11-08 实测的操作事实：`osv-scanner` 不读位于 `.claude/` 目录之下的树。放在
`…/.probe-plain/` 下的锁文件被读到（1 个包），同一份放在 `…/.claude/probe-plain/` 下则没被读到
（0 个包）。桌面应用把工作树建在
`.claude/worktrees/<名字>`，所以从那里跑门禁会报「没有找到包源」，门禁以 2 退出、报**未核** —— 这是对的，
因为它无法声称这棵树是干净的。要拿到读数，请在普通检出里跑。

**它不进 `npm run check:all`。** `check-all.mjs` 只跑 `check:*` 脚本（`scripts/check-all.mjs:56`），
而这道门没有注册成其中之一；本地跳过会在那张汇总表里读起来与通过一模一样。`migration-consistency-postgres`
被排除是同一个理由。跑它的是 CI（`scripts/check-dependency-scan.mjs:33-34`）。

## 4. 基础镜像

两个 Dockerfile，四处引用，全部按摘要钉住。摘要在钉住那一刻读出，并对过镜像仓库与一次冒烟构建。

| 引用 | 摘要 | 位置 |
|---|---|---|
| `node:22-alpine` | `sha256:0e1754758c2df4cfa3e68d59e2e1b7374bb7fd9ea6328eaaacf15cc934af8202` | `Dockerfile:24`、`:41`、`:70`；`Dockerfile.single:32`、`:53`、`:63` |
| `alpine:3.24` | `sha256:3f4d6b32e26703c6082839234f43769d5046b3ac7c910033911d1e71d8cd630a` | `Dockerfile:92` |

`FROM scratch`（`Dockerfile:65`、`Dockerfile.single:49`）是给预先构建好的 Flutter 产物用的保留空基础，无法钉摘要。

理由写在两个文件里（`Dockerfile:1-4`、`Dockerfile.single:7-10`）：浮动标签会在重建之下悄悄换掉，而在换掉之前
构建出的容器留着它被创建时那份基础镜像，CI 对此什么也不会说。

**升级做法**，同样写在钉子旁边（`Dockerfile:6-11`、`Dockerfile.single:13-18`）：

1. `docker pull <标签>`
2. `docker inspect <标签> --format '{{index .RepoDigests 0}}'`
3. 确认里面是什么（`docker run --rm --entrypoint node <标签> --version`）
4. 替换摘要并重建。

不要把某份报告里的摘要抄过来：标签会移动，抄来的旧摘要指向旧镜像。

`Dockerfile.single` 就是发布到 `ghcr.io` 的那个镜像（`.github/workflows/docker-publish.yml:98`；
文件自身在 `Dockerfile.single:12-13` 也这么说），所以它的摘要就是已发布镜像的用户真正拿到的东西。

## 5. 已登记的例外 —— 基线与其义务

基线共 39 条 —— 38 条 `HIGH`、1 条 `CRITICAL` —— 全部在生产依赖里。落地时的分布是：`Front-Taro` 15、
`Web-Admin-Vue` 14、`Web-Admin-React` 10。它们是针对已安装版本的真实公告，修复在上游已经存在；
登记它们是为了让门禁从绿起步、只对新发现判红（`scripts/check-dependency-scan.mjs:27-31`、
`scripts/dependency-scan-baseline.json:2-4`）。

**每条记录什么：** `lockfile`、`package`、`version`、`id`、`severity` —— 结构就这些。

**没有记录、因而也没有被强制的：**

- **理由。** 文件自己的注记要求在「评审这次改动的拉取请求里」写明理由
  （`scripts/dependency-scan-baseline.json:2`，由 `scripts/check-dependency-scan.mjs:351` 写出）。文件里没有这个
  字段，也没有任何检查去读拉取请求的描述。
- **责任人。** 树里任何地方都没有这个字段。
- **到期或复核日期。** 没有这个概念。没有任何东西会到期。

**后果，直说：**

- 一条仍在触发、且从未被复核过的登记，**不会**让门禁判红 —— 只有不在文件里的生产发现才会
  （`:307-311`、`:453-456`）；
- 一条不再触发的登记同样**不会**判红 —— 它只被打印成可清理（`:446-451`）；
- 所以「未逐条复核」与「已逾期」都不是这道门今天能产出的状态。陈旧的基线无法让 CI 变红。

**本文件记录下来的义务：**

1. 新增一条登记，只能由一次在评审中写明「为何接受这条发现、什么改动会把它消除」的改动来做。门禁的失败
   信息也给出同样两条路 —— 升级，或登记并写明理由（`:335-343`）。
2. 不再触发的登记，在发现它的那次改动里一并清掉。
3. 每次发版前重读一遍基线 —— 日期、扫描器版本、已知与新增条数 —— 报告读数，而不是假定。发布检查单
   目前还没有这一步；把它接进去是未完成项。

**谁。** 新增某条登记的改动作者，在该公告被清除之前负责这一条。整份基线由执行发版的人通读。

**当前状态。** 给这 39 条逐一补上责任人与到期日的逐条复核，是一项在办工作，不是已完成的工作。在它落地之前，
这 39 条是已登记的债；本文件不把它们描述成已接受的风险。

## 6. 停止条件

- **生产依赖里出现基线未登记的 `HIGH` 或 `CRITICAL`，门禁判红**（`:336-343`，在 `:453-456` 以 1 退出）。
  **不得合并。** 处理方式是升级该依赖，或在同一次改动里登记例外并写明理由。
- **未核（退出码 2）不是通过，也不是可接受的状态。** 它的意思是这棵树没有被核过（`:83-88`）。
  不要凭它合并，也不要把它读成干净。
- **中危、低危与仅开发依赖的发现，不是停止条件。** 它们会被计数并打印（`:310-311`、`:326`）。

## 7. 未覆盖项

1. **镜像层扫描。** 任何地方都没有 `trivy image` / `grype`，所以基础镜像里操作系统包的 CVE 不会被报。
2. **编排镜像仍然浮动**，其中三个带 `latest`（`docker-compose.yml:160`、
   `docker-compose.observability.yml:26,34,52,60`）。
3. **开发依赖的发现不判红** —— 2026-11-08 这次读数是 97 条高/严重。
4. **那 39 条基线是债，不是修复。**
5. **OSV API 是匿名的**，受速率限制；自检每次 CI 再多三条查询。
6. **`pubspec.lock` 的生产闭包是保守的**，可能多判，不会漏判。
7. **npm v1 锁文件会让全部发现都判红**；今天没有这种文件。
8. **SBOM 只覆盖 Server-NestJS**，不含另外六份锁文件。
9. **必过检查的状态不在本树里。** 红的 job 是否阻止合并，是 GitHub 上的设置。
