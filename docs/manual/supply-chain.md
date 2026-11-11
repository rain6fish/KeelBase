# Supply-Chain Security Criterion / 供应链安全口径

This document states how this repository decides whether its dependencies are safe enough to ship: what
is scanned, what fails, where it runs, how base images are pinned, and what the recorded exceptions
oblige. Every rule points at the file and line that implements it; where no mechanism exists, this
document says so instead of describing one.

Read at commit `9b38afd2` (2026-11-08). The gate itself is not changed by this document. The image-pin
half (§1, §3, §4, §7) was read on 2026-11-10, when the compose images and the CI service image were
pinned and `check:pinned-images` added — that half is changed by this document.

---

# English

## 1. Scope — what is scanned

The supply-chain gate is one script, `scripts/check-dependency-scan.mjs`, plus a second, older check that
predates it. The script runs `osv-scanner scan source -r <root>` (`scripts/check-dependency-scan.mjs:208-209`)
with the root set to the repository directory (`:68`). Two more checks were added on 2026-11-10 — an image
scan in the publish workflow and an SBOM coverage check — and are described below. The scanner walks the
file system, not `git ls-files`, which has three consequences:

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

### Beyond the lockfiles (2026-11-10)

- **The built image is scanned before it is published.** `.github/workflows/docker-publish.yml` builds
  without pushing (`load: true`), runs Trivy (action pinned by commit `ed142fd0…` = v0.36.0, binary pinned to
  `v0.76.2`), and pushes only if the scan exits 0. The gate fails on `HIGH`/`CRITICAL` **with a fix
  available** (`--ignore-unfixed`); findings with no fix are printed by `scripts/trivy-unfixed-report.mjs`
  and do not block. The Trivy version and vulnerability-DB timestamp are printed before the gate runs.
  Accepted exceptions live in `.trivyignore.yaml`, and `npm run check:trivyignore` requires a `statement`
  and a future `expired_at` on every entry. **Measured 2026-11-10** with these exact settings:
  `alpine:3.24@sha256:3f4d…` exits 0; `node:14-alpine` exits 1 (38 fixable HIGH/CRITICAL); the pinned
  `node:22-alpine@sha256:0e17…` base exits 1 with 10 fixable HIGH in npm's bundled `node_modules` (OS
  packages clean). **No tag bump clears that:** on 2026-11-10 `node:22-alpine`'s own digest **is** the pin,
  `22-alpine3.23` and `22-slim` reproduce the same 10, and `24-alpine` still reads 6 (`brace-expansion`,
  `undici`). All 10 live in the base's `/usr/local/lib/node_modules/npm`, which the runtime never
  executes, so `Dockerfile.single`'s `single` stage deletes that directory and the `npm`/`npx` shims.
  **Measured on `node:24-alpine@sha256:a34a…` on 2026-11-11:** untouched it exits 1 with 6 fixable
  findings; with the same `rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm
  /usr/local/bin/npx` from `Dockerfile.single` it exits 0 with 0. This is a reading, not a decision —
  moving the pin to 24 is a separate call and still needs a runtime compatibility review.
  **Re-measured on `main` 2026-11-10 against a build of that file with the gate's settings: exit 0, 0
  findings** — the same command still exits 1 with 10 against the untouched base, so that is a fix rather
  than a loosened gate. The built container starts and `/api/v1/health` answers 200. `Dockerfile`'s
  `server` stage keeps npm on purpose — `deploy.sh` runs `npx ts-node scripts/create-admin.ts` there.
- **Development-dependency findings are gated against the baseline.** Every entry carries
  `scope: production | dev`, which is part of the matching key, and `scripts/check-dependency-scan.mjs`
  gates both scopes by default; `--no-dev` gives the old recorded-only reading for one run. The scan
  reading this slice produced on 2026-11-10 (7 lockfiles, 3466 packages) was **9 production / 97 dev-only**
  high-critical known, **0 new** in either scope — that reading predates the 2026-11-11 prunes. The first
  prune removed exactly the five rows that had stopped firing (`Front-Taro` `brace-expansion` under two
  advisories, `Web-Admin-React` `source-map-js` under one); a second, after `Front-Taro`'s dev-only
  `node-forge` moved 1.4.0 → 1.4.3 (reached through `selfsigned`), removed the six stale `node-forge`
  rows and found no new ones. The baseline now holds **95 rows: 5 production + 90 dev-only, 63 HIGH + 32
  CRITICAL**, with `generatedAt` `2026-11-11`. Backend dev dependencies are **shipped and executed** in
  the compose deployment (`npm ci --include=dev`, the whole `node_modules` is copied, and `npx ts-node`
  runs at deploy time), so a future `Server-NestJS` dev finding is a production finding in substance; that
  tree has none today.
- **The SBOM is one full-tree CycloneDX 1.6 document.** CI runs the pinned scanner with
  `scan source -r … --format cyclonedx-1-6 --all-packages --no-ignore`. `--all-packages` is required:
  without it the output contains only components that have vulnerabilities (74 components vs 2631 on
  2026-11-10), which is a vulnerability report, not an inventory. `--offline` cannot be used — it exits 127
  with "no offline version of the OSV database is available" and writes an empty BOM.
  `scripts/check-sbom-coverage.mjs` derives the expected set from the scanner's own `Scanned …` lines
  (7 lockfiles; the shadowed `Front-Taro/pnpm-lock.yaml` is reported, not demanded) and requires one marker
  component per tree. Paths inside an installed `node_modules` tree are dropped before the comparison —
  `--no-ignore` makes the scanner walk into them, and they are output of the declared lockfiles, not
  sources; a directory that merely starts with the same word stays in scope. The document is uploaded as
  the `keelbase-sbom` artifact, and `docker-publish.yml`'s `sbom-release` job attaches the same file (built
  by `scripts/generate-sbom.sh`) to the GitHub Release for a `v*` tag. Signing it (Sigstore attestation) is
  deliberately **not** done — that is a separate identity/key decision (§7.8).

### Commands added by this slice

```bash
node scripts/check-dependency-scan.mjs --no-dev
node scripts/check-trivyignore.mjs [--selftest]
node scripts/trivy-unfixed-report.mjs trivy-high-critical.json
node scripts/check-sbom-coverage.mjs [--selftest] [--sbom <path>] [--scan-log <path>]
```

Outside the scope of this gate:

- **Image layers and OS packages.** The dependency scanner does not read images. A separate scan covers
  the image built from `Dockerfile.single` before it is pushed (§7); scheduled scans and the compose
  `web` image are still open there.
- **Compose run-time images and CI service images.** `image:` entries are not lockfiles, so the dependency
  scanner does not read them. They are digest-pinned and gated separately (§4); that gate checks the pin,
  it does not scan the image.
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

The binary can live anywhere; the gate only needs its path. This checkout keeps it off `PATH` at
`D:/Rain6fish/.tools/osv-scanner/osv-scanner.exe` — 2.7.0, the version CI pins, with the sha256 above —
and points at it per run:

```bash
OSV_SCANNER="D:/Rain6fish/.tools/osv-scanner/osv-scanner.exe" node scripts/check-dependency-scan.mjs
```

With neither `OSV_SCANNER` nor an `osv-scanner` on `PATH`, the gate exits **2** and prints
`未核 (unverified) — osv-scanner could not be run (ENOENT)`. That is neither a pass nor a finding: the
tree was never scanned. Measured 2026-11-10.

One operational fact, measured 2026-11-08: `osv-scanner` does not read a tree that lives under a
`.claude/` directory. A lockfile placed under `…/.probe-plain/` was read (1 package); the same file under
`…/.claude/probe-plain/` was not read (0 packages). The gate compensates: when the recursive walk finds
no package sources it retries with `--no-ignore` (`scripts/check-dependency-scan.mjs:404`), so a run from
a desktop-app worktree at `.claude/worktrees/<name>` still yields a real reading. An exit 2 from a
worktree now means something else — the retry also found nothing, the OSV API was unreachable, or the
binary was missing — not that such a checkout cannot be read.

**Not in `npm run check:all`.** `check-all.mjs` runs only `check:*` scripts (`scripts/check-all.mjs:56`)
and the gate is not registered as one; a local skip would print as a pass in that summary table. The same
reasoning excludes `migration-consistency-postgres`. CI is the runner (`scripts/check-dependency-scan.mjs:33-34`).

**The pinned-image gate is a separate job.** `check:pinned-images` runs in the `pinned-images` job at the
end of `.github/workflows/ci.yml` with its own self-test, and — unlike the dependency scan — it is
registered as a `check:*` script, so it is also part of `npm run check:all`. It sits at the end of the
workflow on purpose: this document cites line numbers above it, and an insertion earlier in the file
would silently invalidate every one of them.

## 4. Pinned images — Dockerfiles, compose and CI services

### Base images

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

**Upgrading a base image:** the steps are written beside the pins (`Dockerfile:6-11`,
`Dockerfile.single:13-18`) and are the same four steps as the compose procedure below, ending in a
rebuild instead of a compose-file edit.

`Dockerfile.single` is the image published to `ghcr.io` (`.github/workflows/docker-publish.yml:98`; the
file says so at `Dockerfile.single:12-13`), so its digest is what users of the published image receive.

### Compose images

Eight `image:` entries in three compose files, all pinned on 2026-11-10. Each entry was a floating tag
before that; the five `latest` ones were resolved to the version tag that currently carries the same
digest, so pinning changed nothing at pin time.

| Reference | Digest | Where |
|---|---|---|
| `pgvector/pgvector:pg17` | `sha256:7d0a41464797aeb9862dfdc0bbf1526b82cfd324cdd8036df19e3545f4a9ccb8` | `docker-compose.yml:18` |
| `redis:7-alpine` | `sha256:c5d34a98396a4775e223c74e929162c35c5a2182901ba26b50ade939941ce14b` | `docker-compose.yml:35` |
| `ollama/ollama:0.40.15` | `sha256:0e59999e0e8f9fd4e704bd788a89b7e4cad399367fb1365f8c102ac662288761` | `docker-compose.yml:168` |
| `prom/prometheus:v3.16.0` | `sha256:e04987641b57704f408e31f6373ba4138ecf27cb4a165d24aabb6c38fddd0f06` | `docker-compose.observability.yml:31` |
| `grafana/grafana:13.3.0` | `sha256:488984b716c0862639f91a698adbe2862677a5a07bad42da5f03f3030883b205` | `docker-compose.observability.yml:39` |
| `jaegertracing/all-in-one:1.76.0` | `sha256:ab6f1a1f0fb49ea08bcd19f6b84f6081d0d44b364b6de148e1798eb5816bacac` | `docker-compose.observability.yml:57` |
| `grafana/loki:3.7.9` | `sha256:0db216b630ae1f348a1584c67f3cead8b4c1fc839169a39501db664744158e28` | `docker-compose.observability.yml:65` |
| `postgres:17-alpine` | `sha256:3540c0362c809df084ffac0ae69fe794515f9de92692f02178bcdce0ef0302ac` | `Server-NestJS/postgresql/docker-compose.db.yml:11` |

### CI service container and the migration check

The same `pgvector/pgvector:pg17` image also appears at `.github/workflows/ci.yml:142` (the
`migration-consistency-postgres` service container) and as `IMAGE` in
`Server-NestJS/scripts/check-pg-migration-consistency.mjs:25`. Both carry the compose digest
(`sha256:7d0a…ccb8`), so all three sites describe one image. The workflow one is covered by the gate; the
script constant is not a YAML pull reference and is pinned by hand.

### The gate

`scripts/check-pinned-images.mjs` (job `pinned-images`, §3). It fails on any pull reference with no
`@sha256:<64 hex>`, names the file and line, and is exercised in both directions by
`scripts/check-pinned-images.test.mjs`. Its scope is every YAML file that pulls: any `docker-compose*.yml`
in the tree (skipping `node_modules`, `.git` and `.claude`), and `image:` inside a `services:` or
`container:` block in `.github/workflows/*.yml` (a `run:` heredoc that says `image:` is text, and the
tests pin that). Pull references in shell scripts and markdown it does not read — see §7.

**Upgrading a pinned image.** The same rule as the Dockerfiles, same reason:

1. read the version you intend to run, then its manifest-list digest from the registry at pin time —
   `docker buildx imagetools inspect <repo>:<version>` prints `Digest:`; or use the registry API
   (`auth.docker.io` token, then `registry-1.docker.io/v2/<repo>/manifests/<tag>`, whose
   `Docker-Content-Digest` header and the sha256 of the response body must agree);
2. confirm the tag you are writing resolves to that digest — re-read it and compare, or
   `docker buildx imagetools inspect <repo>:<version>@sha256:<digest>`;
3. replace `<version>` and the digest at **every** site listed above, then run
   `npm run check:pinned-images`.

Never copy a digest out of a report: tags move, and an older read points at an older image.

**A tag that has moved since its pin is normal.** On 2026-11-10 `alpine:3.24` resolved to
`sha256:f59a…71bf` while the Dockerfile pins `sha256:3f4d…630a` — the tag moved, the pinned image did
not, which is the point. Both stay pullable; the pins are what the build and the offline bundle must
stage.

## 5. Recorded exceptions — the baseline and its obligations

The baseline holds 95 entries — 63 `HIGH`, 32 `CRITICAL` — split by `scope`: 5 production and 90
dev-only. They are real advisories against the installed versions; most have an upstream fix, `vm2` does
not. They are recorded so the gate starts green and fails only on new findings
(`scripts/check-dependency-scan.mjs:27-31`, `scripts/dependency-scan-baseline.json:2`).

**What each entry records:** `scope` (`production` or `dev`, part of the matching key), `lockfile`,
`package`, `version`, `id`, `severity`, `reason`, `owner`, `expiry` (YYYY-MM-DD, +08).

**What is enforced:**

- **A reason, an owner and an expiry.** An entry missing any field, with an unparseable date, or past its
  expiry fails the gate (`scripts/check-dependency-scan.mjs:95`, `:324-346`). "Untriaged" and "overdue"
  are therefore states the gate can produce; the 2026-11-08 baseline had neither.
- **New findings.** A high/critical finding absent from the baseline fails the gate (`:463-467`); the
  failure names both remedies — upgrade, or record it with a reason, an owner and an expiry.
- **Staleness is reported, not red.** An entry that no longer fires is printed as prunable (`:691-698`);
  `--update-baseline` prunes it and keeps the remaining triage (`:490-492`).

**Current triage.** Every entry carries a bilingual `reason`, `owner: maintainer`, and an expiry. All
**95** entries expire **2027-02-08**. The two production findings once dated 2026-12-06 —
`decode-uri-component@0.2.2` (HIGH) and `swiper@6.8.0` (CRITICAL) — were re-triaged on 2026-11-11 to the
common date, with the measured upgrade path recorded in their `reason`. When an expiry arrives the gate
turns red until the entry is upgraded, re-decided, or cleared.

**What this manual records as the obligation:**

1. An entry may only be added by a change that states why the finding is accepted and what would remove
   it; the gate enforces the same fields.
2. An entry that stops firing is pruned in the change that notices it.
3. The baseline is re-read at each release — date, scanner version, known and new counts — and the
   reading is reported rather than assumed. The release checklist does not call this step yet; wiring it
   in is open.

**Who.** The `owner` field is `maintainer` for every current entry; the author of a change that adds an
entry owns it until the advisory is cleared.

**Current standing.** The triage landed on 2026-11-08/11: the 95 entries are recorded debt with an owner
and an expiry, and the gate now rejects an untriaged or expired entry. The two Taro-path production items
were re-decided on 2026-11-11 and now share the 2027-02-08 date; the 90 dev-only rows remain, most of
which clear only by removing the Taro webpack5 runner.

## 6. Stop conditions

- **A production dependency with a `HIGH` or `CRITICAL` finding that the baseline does not record fails
  the gate** (`:336-343`, exit 1 at `:453-456`). It must not be merged. The remedy is to upgrade, or to
  record the exception together with the reason in the same change.
- **未核 (exit 2) is not a pass and is not an accepted state.** It means the tree was not verified
  (`:83-88`). Do not merge on it, and do not read it as clean.
- **Moderate and low findings are not stop conditions.** They are counted and printed. **Dev-only
  high/critical findings are stop conditions** since 2026-11-10 unless the baseline records them (§1).

## 7. What this does not cover

1. **Image-layer scanning covers the published image, with limits.** The pre-push gate scans the image
   built from `Dockerfile.single` before the push. A **weekly scheduled** run
   (`.github/workflows/image-scan-weekly.yml`, Mondays 04:17 UTC) now records HIGH/CRITICAL findings for
   the published `:latest` and both pinned bases (`node:22-alpine`, `alpine:3.24`) in the job summary and
   an artifact. It keeps findings with **no fix yet** — the gate's fail step runs `--ignore-unfixed`, so
   this reading is deliberately wider and the summary separates the two counts. It is **report-only** —
   its exit code is not a gate, because a fix in an upstream base is not this repository's to ship.
   Not covered: the compose `web` (nginx) image, which is built per deploy.
   The pinned `node:22-alpine` base fails the gate **on its own** (10
   fixable HIGH in npm's bundled modules; no tag bump clears them — §1), but the published image is not
   that base: `Dockerfile.single`'s `single` stage deletes the bundled npm directory and the `npm`/`npx`
   shims, and that image re-measured on `main` on 2026-11-10 at **exit 0 / 0 findings**. The next publish
   therefore needs neither a base bump nor an exception — keeping that `RUN` in the `single` stage is what
   keeps the gate green. Moving the pin to `node:24-alpine` was measured to reach the same 0 findings
   through the same deletion (§1), but that is a separate decision and still needs a runtime
   compatibility review; the pin stays at 22.
2. **Compose images are pinned but not scanned.** Every compose image and the CI service image are
   digest-pinned and gated by `check:pinned-images` (§4); that gate checks the pin, not the image, so a CVE
   inside one of them is only seen when the same image is the release image scanned in item 1.
3. **Dev-dependency findings are gated, but the debt is large and the toolchain is the fix.** 90 dev-only
   rows are recorded with owner `maintainer` and expiry `2027-02-08`; 29 of them are `vm2@3.11.5`, which is
   deprecated and has no fixed release, so only removing the Taro webpack5 runner clears them. A **new**
   dev advisory is red; §6 records this as a stop condition.
4. **The 95 baseline rows (5 production + 90 dev) are debt, not a fix.**
5. **The OSV API is unauthenticated** and rate-limited; the self-test adds three queries per CI run, and the
   full-tree SBOM generation is a second full scan of the same tree.
6. **The `pubspec.lock` production closure is conservative** and can over-gate, never under-gate.
7. **An npm v1 lockfile would gate everything**; none exists today.
8. **The SBOM is full-tree CycloneDX, but it is not a verdict.** It covers all 7 scanned lockfiles and is
   checked by `scripts/check-sbom-coverage.mjs`; nothing consumes it as a vulnerability gate (the dependency
   gate is that). It **is** attached to the GitHub Release for a `v*` tag by `docker-publish.yml`'s
   `sbom-release` job, which regenerates it with `scripts/generate-sbom.sh` — the same script CI validates —
   and uploads it as a release asset. Signing it (Sigstore attestation) is still an open decision.
9. **Required-check status is not in this tree.** Whether a red job blocks a merge is a GitHub setting.
10. **Pull references outside YAML are not gated.** `deploy/deploy-offline.sh` checks staged images by tag,
    `docs/manual/offline-deploy.md` §2.1 pins its `docker pull` lines to digests by hand, and the `IMAGE`
    constant in `Server-NestJS/scripts/check-pg-migration-consistency.mjs:25` is a hand pin. The gate reads
    YAML only; each of these can drift back to a floating tag without turning anything red.

---

# 中文

## 1. 射程 —— 扫什么

供应链门禁是一个脚本 `scripts/check-dependency-scan.mjs`，外加一条早于它存在、被原样保留的旧检查。
2026-11-10 又加了两道 —— 发布工作流里的镜像扫描、以及 SBOM 覆盖检查 —— 见下文。脚本执行
`osv-scanner scan source -r <根>`（`scripts/check-dependency-scan.mjs:208-209`），根为仓库目录
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

### 锁文件之外（2026-11-10）

- **构建出的镜像在发布之前被扫描。** `.github/workflows/docker-publish.yml` 只构建、不推送（`load: true`），
  跑 Trivy（action 按提交钉住 `ed142fd0…` = v0.36.0，二进制钉住 `v0.76.2`），只有扫描以 0 退出才推送。
  门禁只对**有修复版本**的 `HIGH`/`CRITICAL` 判红（`--ignore-unfixed`）；无修复的发现由
  `scripts/trivy-unfixed-report.mjs` 打印，不阻止发布。Trivy 版本与漏洞库时间戳在判红之前写进日志。
  已接受的例外写在 `.trivyignore.yaml`，`npm run check:trivyignore` 要求每条都有 `statement` 与未来的
  `expired_at`。**2026-11-10 以完全相同的一组设置实测**：`alpine:3.24@sha256:3f4d…` 以 0 退出；
  `node:14-alpine` 以 1 退出（38 条有修复的 HIGH/CRITICAL）；钉住的 `node:22-alpine@sha256:0e17…` 基础以 1
  退出，npm 自带的 `node_modules` 里有 10 条有修复的 HIGH（操作系统包干净）。**换标签也清不掉：** 2026-11-10
  实测 `node:22-alpine` 标签自己的摘要**就是**钉住的那一枚，`22-alpine3.23` 与 `22-slim` 复现同样 10 条，
  `24-alpine` 仍读 6 条（`brace-expansion`、`undici`）。这 10 条全在基础的
  `/usr/local/lib/node_modules/npm` 里，而运行阶段从不执行它，故 `Dockerfile.single` 的 `single` 阶段删掉该目录
  与 `npm`/`npx` 两个入口。**2026-11-11 对 `node:24-alpine@sha256:a34a…` 的实测：** 未删除 npm 时以 1 退出、
  6 条有修复的发现；按 `Dockerfile.single` 同一条 `rm -rf /usr/local/lib/node_modules/npm
  /usr/local/bin/npm /usr/local/bin/npx` 处理后以 0 退出、0 条。这是读数、不是决定 —— 把钉住的版本换到 24
  是另一项独立的决定，仍需做运行时兼容性复核。**2026-11-10 在 `main` 上对该文件的构建按门禁设置复测：以 0 退出、0 条发现** ——
  同一条命令扫未改的基础仍以 1 退出、10 条，所以这是修复而不是放宽门禁。构建出的容器能启动，
  `/api/v1/health` 回 200。`Dockerfile` 的 `server` 阶段有意保留 npm —— `deploy.sh` 在那里执行
  `npx ts-node scripts/create-admin.ts`。
- **开发依赖的发现同样按基线判红。** 每条基线带 `scope: production | dev`，并计入匹配键；
  `scripts/check-dependency-scan.mjs` 默认两个作用域都判红，`--no-dev` 用于「只记录、不判红」的那一次运行。
  本次（2026-11-10，7 份锁文件、3466 个包）的扫描读数是：生产 **9 条已知**、开发 **97 条已知**，两边 **0 条新增**
  —— 这是 2026-11-11 两轮剪枝**之前**的读数。第一轮只删掉不再触发的五行（`Front-Taro` 的 `brace-expansion`
  在两条公告下、`Web-Admin-React` 的 `source-map-js` 在一条公告下）；第二轮里 `Front-Taro` 仅开发期的
  `node-forge` 由 1.4.0 升到 1.4.3（经 `selfsigned` 引入），六条陈旧的 `node-forge` 登记被清掉、无新增。
  基线现在共 **95 行：生产 5 + 开发 90，63 条 HIGH + 32 条 CRITICAL**，`generatedAt` 为 `2026-11-11`。
  后端开发依赖在编排部署里**会被打进镜像并在部署时执行**（`npm ci --include=dev`、整个 `node_modules` 被复制、
  部署时跑 `npx ts-node`），所以将来 `Server-NestJS` 的一条开发发现，实质上就是生产发现；该树今天没有。
- **SBOM 是一份全仓 CycloneDX 1.6 文档。** CI 用钉住的扫描器跑
  `scan source -r … --format cyclonedx-1-6 --all-packages --no-ignore`。`--all-packages` 是必需的：
  不带它时输出只含「有漏洞的组件」（2026-11-10 实测：74 个组件 vs 带上后的 2631 个），那是漏洞报告、
  不是清单。`--offline` 不可用 —— 它以 127 退出并报「没有离线 OSV 数据库」，只写出一份空 BOM。
  `scripts/check-sbom-coverage.mjs` 从扫描器自己的 `Scanned …` 行取期望集合（7 份锁文件；被遮蔽的
  `Front-Taro/pnpm-lock.yaml` 只报告、不要求），并要求每棵树有一个标记组件。落在已安装 `node_modules`
  树里的路径在比对前被剔除 —— `--no-ignore` 让扫描器走了进去，而它们是已声明锁文件的产物、不是来源；
  只是以同一个词开头的目录仍在射程内。文档作为 `keelbase-sbom` 产物上传；`docker-publish.yml` 的
  `sbom-release` job 会把同一份文件（由 `scripts/generate-sbom.sh` 生成）附到 `v*` tag 对应的
  GitHub Release 上。签名（Sigstore attestation）**有意不做** —— 那是另一个关于身份与密钥的决定（§7.8）。

### 本次新增的命令

```bash
node scripts/check-dependency-scan.mjs --no-dev
node scripts/check-trivyignore.mjs [--selftest]
node scripts/trivy-unfixed-report.mjs trivy-high-critical.json
node scripts/check-sbom-coverage.mjs [--selftest] [--sbom <path>] [--scan-log <path>]
```

本门禁不覆盖的部分：

- **镜像层与操作系统包。** 依赖扫描器不读镜像。另有一道门禁在推送前扫描由 `Dockerfile.single` 构建出的
  镜像（见 §7）；定时扫描与 compose 的 `web` 镜像仍未覆盖。
- **编排里的运行时镜像与 CI service 镜像。** `image:` 不是锁文件，依赖扫描器不读它们。它们已按摘要钉住、
  由另一道门禁单独守（§4）；那道门禁查的是「钉没钉」，不是「镜像里有没有洞」。
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

二进制放哪都行，门禁只要它的路径。本检出把它放在 `PATH` 之外 ——
`D:/Rain6fish/.tools/osv-scanner/osv-scanner.exe`（2.7.0，即 CI 钉住的版本，sha256 见上）—— 每次运行
指过去：

```bash
OSV_SCANNER="D:/Rain6fish/.tools/osv-scanner/osv-scanner.exe" node scripts/check-dependency-scan.mjs
```

既没有 `OSV_SCANNER`、`PATH` 上也没有 `osv-scanner` 时，门禁以 **2** 退出并打印
`未核 (unverified) — osv-scanner could not be run (ENOENT)`。它既不是通过也不是发现：这棵树根本没被扫过。
2026-11-10 实测。

一条 2026-11-08 实测的操作事实：`osv-scanner` 不读位于 `.claude/` 目录之下的树。放在
`…/.probe-plain/` 下的锁文件被读到（1 个包），同一份放在 `…/.claude/probe-plain/` 下则没被读到
（0 个包）。门禁对此有补偿：走查找不到包源时会以 `--no-ignore` 重试
（`scripts/check-dependency-scan.mjs:404`），因此在 `.claude/worktrees/<名字>` 下的桌面应用工作树里跑
**仍能得到真实读数**。从工作树里以 2 退出，现在意味着别的缘故 —— 重试后仍找不到、OSV API 不通，或二进制
缺失 —— 不再意味着这类检出读不了。

**它不进 `npm run check:all`。** `check-all.mjs` 只跑 `check:*` 脚本（`scripts/check-all.mjs:56`），
而这道门没有注册成其中之一；本地跳过会在那张汇总表里读起来与通过一模一样。`migration-consistency-postgres`
被排除是同一个理由。跑它的是 CI（`scripts/check-dependency-scan.mjs:33-34`）。

**钉住镜像的门禁是另一个 job。** `check:pinned-images` 在 `.github/workflows/ci.yml` 末尾的
`pinned-images` job 里跑，自带自检；而且与依赖扫描不同，它注册成了 `check:*` 脚本，所以也在
`npm run check:all` 里。它有意放在工作流末尾：本文引用的是它上面的行号，插在前面会让那些行号**全部**
悄悄失效。

## 4. 钉住的镜像 —— Dockerfile、编排与 CI service

### 基础镜像

两个 Dockerfile，四处引用，全部按摘要钉住。摘要在钉住那一刻读出，并对过镜像仓库与一次冒烟构建。

| 引用 | 摘要 | 位置 |
|---|---|---|
| `node:22-alpine` | `sha256:0e1754758c2df4cfa3e68d59e2e1b7374bb7fd9ea6328eaaacf15cc934af8202` | `Dockerfile:24`、`:41`、`:70`；`Dockerfile.single:32`、`:53`、`:63` |
| `alpine:3.24` | `sha256:3f4d6b32e26703c6082839234f43769d5046b3ac7c910033911d1e71d8cd630a` | `Dockerfile:92` |

`FROM scratch`（`Dockerfile:65`、`Dockerfile.single:49`）是给预先构建好的 Flutter 产物用的保留空基础，无法钉摘要。

理由写在两个文件里（`Dockerfile:1-4`、`Dockerfile.single:7-10`）：浮动标签会在重建之下悄悄换掉，而在换掉之前
构建出的容器留着它被创建时那份基础镜像，CI 对此什么也不会说。

**升级基础镜像：** 做法写在钉子旁边（`Dockerfile:6-11`、`Dockerfile.single:13-18`），与下面的编排做法是同
样的四步，最后以重建收尾，而不是改编排文件。

`Dockerfile.single` 就是发布到 `ghcr.io` 的那个镜像（`.github/workflows/docker-publish.yml:98`；
文件自身在 `Dockerfile.single:12-13` 也这么说），所以它的摘要就是已发布镜像的用户真正拿到的东西。

### 编排镜像

三个编排文件里的八条 `image:`，全部在 2026-11-10 钉住。在此之前每条都是浮动标签；其中五条 `latest` 已解析
成**当前与它同摘要的那个版本标签**，所以钉住那一刻行为没有任何变化。

| 引用 | 摘要 | 位置 |
|---|---|---|
| `pgvector/pgvector:pg17` | `sha256:7d0a41464797aeb9862dfdc0bbf1526b82cfd324cdd8036df19e3545f4a9ccb8` | `docker-compose.yml:18` |
| `redis:7-alpine` | `sha256:c5d34a98396a4775e223c74e929162c35c5a2182901ba26b50ade939941ce14b` | `docker-compose.yml:35` |
| `ollama/ollama:0.40.15` | `sha256:0e59999e0e8f9fd4e704bd788a89b7e4cad399367fb1365f8c102ac662288761` | `docker-compose.yml:168` |
| `prom/prometheus:v3.16.0` | `sha256:e04987641b57704f408e31f6373ba4138ecf27cb4a165d24aabb6c38fddd0f06` | `docker-compose.observability.yml:31` |
| `grafana/grafana:13.3.0` | `sha256:488984b716c0862639f91a698adbe2862677a5a07bad42da5f03f3030883b205` | `docker-compose.observability.yml:39` |
| `jaegertracing/all-in-one:1.76.0` | `sha256:ab6f1a1f0fb49ea08bcd19f6b84f6081d0d44b364b6de148e1798eb5816bacac` | `docker-compose.observability.yml:57` |
| `grafana/loki:3.7.9` | `sha256:0db216b630ae1f348a1584c67f3cead8b4c1fc839169a39501db664744158e28` | `docker-compose.observability.yml:65` |
| `postgres:17-alpine` | `sha256:3540c0362c809df084ffac0ae69fe794515f9de92692f02178bcdce0ef0302ac` | `Server-NestJS/postgresql/docker-compose.db.yml:11` |

### CI service 容器与迁移检查

同一个 `pgvector/pgvector:pg17` 还出现在 `.github/workflows/ci.yml:142`
（`migration-consistency-postgres` 的 service 容器）与
`Server-NestJS/scripts/check-pg-migration-consistency.mjs:25` 的 `IMAGE` 常量。两处都带编排用的那个摘要
（`sha256:7d0a…ccb8`），于是三处描述的是同一个镜像。工作流那一处由门禁覆盖；脚本常量不是 YAML 拉取
引用，是手工钉的。

### 门禁

`scripts/check-pinned-images.mjs`（job `pinned-images`，见 §3）。任何拉取引用只要没有
`@sha256:<64 位十六进制>` 就判红，并点名文件与行号；两个方向都由 `scripts/check-pinned-images.test.mjs`
覆盖。射程是所有会拉取的 YAML：树内任意 `docker-compose*.yml`（跳过 `node_modules`、`.git` 与
`.claude`），以及 `.github/workflows/*.yml` 里 `services:` 或 `container:` 块内的 `image:`（`run:` 的
heredoc 写着 `image:` 只是文本，测试里钉住了这一点）。shell 脚本与 markdown 里的拉取引用它不读 —— 见 §7。

**升级一个已钉住的镜像。** 与 Dockerfile 同一条规则、同一个理由：

1. 先确定要跑的版本，再在钉的时候从镜像仓库读出它的清单列表摘要 ——
   `docker buildx imagetools inspect <仓>:<版本>` 会打印 `Digest:`；或用 registry API
   （向 `auth.docker.io` 取 token，再请求 `registry-1.docker.io/v2/<仓>/manifests/<标签>`，
   其 `Docker-Content-Digest` 响应头与响应体的 sha256 必须一致）；
2. 确认你要写的那个标签解析到的正是这个摘要 —— 重读一次比对，或
   `docker buildx imagetools inspect <仓>:<版本>@sha256:<摘要>`；
3. 在上文列出的**每一处**替换 `<版本>` 与摘要，然后跑 `npm run check:pinned-images`。

不要把某份报告里的摘要抄过来：标签会移动，抄来的旧摘要指向旧镜像。

**钉住之后标签移动是正常的。** 2026-11-10 读数里 `alpine:3.24` 已解析到 `sha256:f59a…71bf`，而
Dockerfile 钉的是 `sha256:3f4d…630a` —— 标签动了、被钉住的镜像没动，这正是钉子的意义。两者都仍可拉取；
构建与离线包要预置的是**钉住的那个**。

## 5. 已登记的例外 —— 基线与其义务

基线共 95 条 —— 63 条 `HIGH`、32 条 `CRITICAL` —— 按 `scope` 分为 5 条生产与 90 条仅开发期。它们
是针对已安装版本的真实公告；多数上游已有修复，`vm2` 没有。登记它们是为了让门禁从绿起步、只对新
发现判红（`scripts/check-dependency-scan.mjs:27-31`、`scripts/dependency-scan-baseline.json:2`）。

**每条记录什么：** `scope`（`production` 或 `dev`，并入匹配键）、`lockfile`、`package`、`version`、
`id`、`severity`、`reason`、`owner`、`expiry`（YYYY-MM-DD，+08）。

**被强制的是什么：**

- **理由、责任人与到期日。** 缺任一字段、日期不可解析、或已过到期日，门禁判红
  （`scripts/check-dependency-scan.mjs:95`、`:324-346`）。「未 triage」与「已逾期」由此成为门禁
  真能产出的状态 —— 2026-11-08 的基线还没有这两态。
- **新发现。** 基线未登记的高危/严重发现，门禁判红（`:463-467`）；失败信息给出两条路 —— 升级，
  或登记并补上理由、责任人与到期日。
- **陈旧只报不红。** 不再触发的登记被打印成可清理（`:691-698`）；`--update-baseline` 会把它清掉，
  并保留其余条目的 triage（`:490-492`）。

**当前 triage。** 每条都带双语 `reason`、`owner: maintainer` 与到期日。**95 条全部**在 **2027-02-08**
到期。原先日期为 2026-12-06 的两条生产发现 —— `decode-uri-component@0.2.2`（HIGH）与 `swiper@6.8.0`
（CRITICAL）—— 已于 2026-11-11 重新裁决到同一日期，实测的升级路径记在各自的 `reason` 里。到期后门禁会红，
直到该条被升级、重新裁决或清除。

**本文件记录下来的义务：**

1. 新增一条登记，只能由一次写明「为何接受这条发现、什么改动会把它消除」的改动来做；门禁强制同样的
   字段。
2. 不再触发的登记，在发现它的那次改动里一并清掉。
3. 每次发版前重读一遍基线 —— 日期、扫描器版本、已知与新增条数 —— 报告读数，而不是假定。发布检查单
   目前还没有这一步；把它接进去是未完成项。

**谁。** 当前每条登记的 `owner` 均为 `maintainer`；新增某条登记的改动作者，在该公告被清除之前负责
这一条。

**当前状态。** 逐条复核已于 2026-11-08/11 落地：95 条是带责任人与到期日的已登记债，门禁现在会
拒绝未 triage 或已过期的条目。两条 Taro 路径上的生产条目已于 2026-11-11 重新裁决、与其余条目同日到期；
剩下 90 条仅开发期条目 —— 其中多数只有移除 Taro webpack5 runner 才能清除。

## 6. 停止条件

- **生产依赖里出现基线未登记的 `HIGH` 或 `CRITICAL`，门禁判红**（`:336-343`，在 `:453-456` 以 1 退出）。
  **不得合并。** 处理方式是升级该依赖，或在同一次改动里登记例外并写明理由。
- **未核（退出码 2）不是通过，也不是可接受的状态。** 它的意思是这棵树没有被核过（`:83-88`）。
  不要凭它合并，也不要把它读成干净。
- **中危与低危发现不是停止条件。** 它们会被计数并打印。**仅开发依赖的高危/严重发现自 2026-11-10 起是
  停止条件**，除非基线已登记（见 §1）。

## 7. 未覆盖项

1. **镜像层扫描覆盖的是已发布镜像，且仍有边界。** 这道门扫描 `Dockerfile.single` 构建出的镜像、
   **在推送之前**。新增的**每周定时**运行（`.github/workflows/image-scan-weekly.yml`，每周一 04:17 UTC）
   把已发布 `:latest` 与两个钉住基础（`node:22-alpine`、`alpine:3.24`）的 HIGH/CRITICAL 发现记进 job summary
   与 artifact。它保留**暂无修复**的条目 —— 门禁的判红步骤带 `--ignore-unfixed`，所以本读数的发现集有意更宽，
   摘要把两种计数分开。它是**报告制** —— 退出码不作为门禁，因为上游基础镜像的修复不在本仓手里。
   未覆盖：compose 的 `web`（nginx）镜像（按次部署构建）。钉住的 `node:22-alpine` 基础**本身**会判红
   （npm 自带模块里 10 条有修复的 HIGH；换标签也清不掉，见 §1），但发布镜像并不是那个基础：
   `Dockerfile.single` 的 `single` 阶段删掉了自带的 npm 目录与 `npm`/`npx` 两个入口，该镜像 2026-11-10
   在 `main` 上复测为**以 0 退出、0 条发现**。所以下一次发布既不需要升级基础，也不需要登记例外 ——
   `single` 阶段里保留那条 `RUN` 才是让门禁保持绿色的原因。把钉住的版本换到 `node:24-alpine`，实测经同一条
   删除也能到 0 条（见 §1），但那是另一项独立的决定，仍需做运行时兼容性复核；当前钉住的仍是 22。
2. **编排镜像已钉摘要，但没有被扫描。** 每个编排镜像与 CI service 镜像都已钉住，由 `check:pinned-images`
   守着（§4）；那道门禁查的是「钉没钉」，不是「镜像里有没有洞」，所以只有它与第 1 条里被扫的发布镜像
   是同一个镜像时，里面的 CVE 才会被看见。
3. **开发依赖的发现已判红，但债很大、解法在工具链。** 90 条仅开发期的条目已登记，责任人 `maintainer`、
   到期 `2027-02-08`；其中 29 条是 `vm2@3.11.5` —— 它已废弃且没有修复版本，只有移除 Taro 的 webpack5
   runner 才能清掉。**新增**的开发期公告会判红；§6 已把这一条写成停止条件。
4. **那 95 条基线（生产 5 + 开发 90）是债，不是修复。**
5. **OSV API 是匿名的**，受速率限制；自检每次 CI 再多三条查询，而全仓 SBOM 生成是对同一棵树再扫一遍。
6. **`pubspec.lock` 的生产闭包是保守的**，可能多判，不会漏判。
7. **npm v1 锁文件会让全部发现都判红**；今天没有这种文件。
8. **SBOM 是全仓 CycloneDX，但它不是判定。** 它覆盖全部 7 份被扫的锁文件，由
   `scripts/check-sbom-coverage.mjs` 检查；没有任何东西把它当作漏洞门禁（漏洞判定是依赖门禁）。它**会**
   由 `docker-publish.yml` 的 `sbom-release` job 附到 `v*` tag 对应的 GitHub Release 上：该 job 用
   `scripts/generate-sbom.sh` 重新生成（与 CI 验证的是同一个脚本），并作为 Release 资产上传。是否签名
   （Sigstore attestation）仍是待定决定。
9. **必过检查的状态不在本树里。** 红的 job 是否阻止合并，是 GitHub 上的设置。
10. **YAML 之外的拉取引用不进本门禁。** `deploy/deploy-offline.sh` 按标签查已预置的镜像、
    `docs/manual/offline-deploy.md` §2.1 的 `docker pull` 行是按摘要手工钉的、
    `Server-NestJS/scripts/check-pg-migration-consistency.mjs:25` 的 `IMAGE` 常量也是手工钉的。门禁只读
    YAML；这几处都可能悄悄漂回浮动标签而不让任何东西变红。
