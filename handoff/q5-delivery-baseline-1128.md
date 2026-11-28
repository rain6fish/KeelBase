# Q5 — Reproducible delivery baseline, first slice (2026-11-28) / Q5 — 可复现交付基线第一片

**English.** This slice adds one command that takes the four readings the CTO ruling of 2026-11-28 asks
for, from clean checkouts pinned to each repository's published HEAD: CI on the three active
repositories (the JDK 25 leg reported, never counted), `check:all` and e2e, a release-rehearsal
artifact built from HEAD, and the machine audit-reader regression. The run below is **real**: every
reading in it was taken on 2026-11-28 on one machine, and the criteria that are not met are named with
the reason, not worked around.

**中文。** 本片新增一条命令，从钉在各仓已发布 HEAD 的干净检出出发，取 2026-11-28 CTO 裁决要的四项读数：
三活跃仓 CI（JDK 25 腿只报告、不计入）、`check:all` 与 e2e、从 HEAD 构建的发布彩排产物、机器审计读者回归。
下面这次是**真跑**：每项读数都于 2026-11-28 在同一台机器上取得；不成立的判据点名原因，不绕过。

---

## 1. Branch, commit, evidence / 分支、提交、证据

- Branch `claude/nostalgic-cannon-fb36b2` (worktree `nostalgic-cannon-fb36b2`); commit **`<COMMIT>`** —
  `scripts/delivery-baseline.sh`, `scripts/delivery-baseline-ci.mjs`, this note. Not pushed; no tag.
- Evidence directory: **`D:/Rain6fish/.delivery-baseline/20261128/evidence`** (logs, `readings.txt`,
  `ci.json`, `SUMMARY.md`), plus the audit-only rerun `…/evidence-audit4` (logs copied into
  `evidence/logs/audit-final-*`). The checkout clones live beside them under
  `D:/Rain6fish/.delivery-baseline/20261128/{KeelBase,KeelBase4J,KeelBase-Vue-Pro}`.
- 分支 `claude/nostalgic-cannon-fb36b2`（worktree `nostalgic-cannon-fb36b2`）；提交 **`<COMMIT>`** ——
  `scripts/delivery-baseline.sh`、`scripts/delivery-baseline-ci.mjs`、本交接件。未推送、未打 tag。
- 证据目录：**`D:/Rain6fish/.delivery-baseline/20261128/evidence`**（日志、`readings.txt`、`ci.json`、
  `SUMMARY.md`）。三份检出克隆在旁边的
  `D:/Rain6fish/.delivery-baseline/20261128/{KeelBase,KeelBase4J,KeelBase-Vue-Pro}`。

## 2. The command / 命令

```bash
scripts/delivery-baseline.sh --evidence <dir> \
  [--keelbase <clean checkout>] [--java <clean 4J checkout>] [--vuepro <clean Vue-Pro checkout>] \
  [--steps ci,checks,e2e,rehearsal,audit] [--wait-ci SECONDS] [--keep-stack] [--allow-dirty]
```

Exit codes: `0` every selected criterion passed; `1` at least one failed; `2` nothing failed but at
least one reading could not be taken (unverified). Unverified is never printed as green.

退出码：`0` 选中的判据全过；`1` 至少一条不成立；`2` 没有不成立，但至少一项取不到数（未核验）。
未核验绝不打印成绿。

## 3. Pins and environment / 钉住的提交与环境

| Repository | Pinned HEAD |
|---|---|
| KeelBase (GitHub `main`) | `c7f329abb19f7f356145fb535992524256adf0ae` |
| KeelBase4J (GitHub `main`) | `b8caa437b3c030ef18c17abec846a18fa6e4862e` |
| KeelBase-Vue-Pro (GitHub `main`) | `be88b997e6aa2cfd3279a12e4a56f13370df9ea8` |

All three were fresh `git clone --shared --no-checkout` copies of the local checkouts, detached at the
pinned commit; `origin` was pointed at GitHub and `origin/main` set to the pin, so `--base origin/main`
gates compared against the published HEAD rather than a local branch. All three were clean.

Environment: Windows 11, Git Bash 5.3.9, node 24.22.2, npm 11.14.1, default JDK 17.0.20.1, JDK 25.0.4.1
via `scripts/jdk25.sh` (below the 25.0.5+8 fix line — the CI-4 environment reading, not code green),
Maven 3.9.16, Docker 29.9.2, Flutter 3.47.2. Full readings in `environment.txt`.

三份检出都是本地检出的 `git clone --shared --no-checkout` 副本，detach 到钉住的提交；`origin` 指向
GitHub、`origin/main` 设为钉住的提交，于是以 `--base origin/main` 为基线的闸比的是已发布 HEAD，而不是
本地分支。三份都干净。环境读数见 `environment.txt`。

## 4. The five criteria — one by one / 五条判据逐条

### (1) CI on the three active repositories — **not met** / 不成立

`delivery-baseline-ci.mjs` read each pinned commit:

| Repository | Reading |
|---|---|
| KeelBase `c7f329ab` | **failure** — https://github.com/rain6fish/KeelBase/actions/runs/46108368530 |
| KeelBase4J `b8caa43` | success — https://github.com/rain6fish/KeelBase4J/actions/runs/46108644740 |
| KeelBase-Vue-Pro `be88b997` | success (CI + Real-stack) — runs `46104093323` / `46104093289` |

KeelBase's failing jobs: `contract-matrix`, `java-vector-drift`, `release-gate`. The JDK 25 legs on 4J
(both conformance and release-rehearsal) are green and are **reported, not counted** (Q4 ruling).

**Root cause, reproduced locally:** KeelBase's contract submodule gitlink is `0ffd867` — the contract's
`v1.23.0-2-g0ffd867` — while both `README.md` and `README.zh-CN.md` name **v1.24.0**. `check-contract-matrix`
says it verbatim: *"README.md — 写的是 v1.24.0，而 pin 的最新 tag 是 v1.23.0"*, and
`check-contract-release-gate` fails C3 ("pin 落在声称的版本线上"). Q2 moved **4J's** pin to `v1.24.0`
(tag `076f2e5`); **KeelBase's gitlink was not moved**. The local `check:all` on the same checkout
reproduces exactly these two reds, so the CI red is the tree, not the runner.

KeelBase 失败作业：`contract-matrix`、`java-vector-drift`、`release-gate`。4J 的两条 JDK 25 腿是绿的，
只报告、不计入（Q4 裁决）。**根因已在本机复现：** KeelBase 的契约子模块 gitlink 是 `0ffd867`
（`v1.23.0-2-g0ffd867`），而两份 README 都写 **v1.24.0**。`check-contract-matrix` 原话是
「README.md — 写的是 v1.24.0，而 pin 的最新 tag 是 v1.23.0」，`check-contract-release-gate` 的 C3
「pin 落在声称的版本线上」同时红。Q2 抬的是 **4J 的** pin（tag `076f2e5`），**KeelBase 的 gitlink 没动**。
同一检出上的本地 `check:all` 复现了这两条红，说明红在树上，不在 runner。

### (2) `check:all` and e2e — **not met** (check:all), e2e green / 不成立（check:all），e2e 绿

- `check:all`: **34/36**, exit 1. The two failures are the same contract-pin pair
  (`check:contract-matrix`, `check:contract-release-gate`); the other 34 gates pass, including
  `check:java-vectors` (the 4J sibling at `b8caa43` matches the scenario vectors).
- e2e, run on its own: **exit 0**, four shards, 129 + 76 + 210 + 63 = **478 tests passed**, 49 suites,
  log `logs/e2e.log`.

`check:all` **34/36**、exit 1：两条红就是同一组契约 pin 问题（`check:contract-matrix`、
`check:contract-release-gate`），其余 34 道过，含 `check:java-vectors`（同级 4J 在 `b8caa43`，与场景向量一致）。
e2e 单列跑 **exit 0**：四片、49 套件、**478 例全过**，日志 `logs/e2e.log`。

### (3) Release rehearsal from HEAD — **met** / 成立

`scripts/docker-single.sh build` in the clean KeelBase checkout built the single-container release image
locally: **`keelbase:delivery-baseline-20261128045448`**, id `sha256:824cfb4dc8991dd7e6a364977971ece8ff24d1f911859ae463766447329f5959`,
910,748,335 bytes. No tag was created; nothing was pushed. Log `logs/rehearsal.log`.

`scripts/docker-single.sh build` 在干净检出里本地构建单容器发布镜像：**`keelbase:delivery-baseline-20261128045448`**，
id `sha256:824cfb4dc8991dd7e6a364977971ece8ff24d1f911859ae463766447329f5959`，910,748,335 字节。
未打 tag、未推送。日志 `logs/rehearsal.log`。

### (4) Machine audit-reader regression — **met** / 成立

`run-audit-two-cases-scenarios.mjs` (the named gate) on a throwaway real stack: containers
`delivery-baseline-pg-bl1128051147` / `delivery-baseline-redis-bl1128051147`, database seeded with 174
tables from `deploy/demo-ecs/bootstrap-db.sh` plus bpm/fms, host built with `scripts/jdk25.sh` and started
on `scripts/run-server.sh`. **Exit 0, 78 ok / 0 failed**; both cases read `READING block.cells 6/6` and
`READING approve.cells 6/6` — the twelve cells are answered.

The acceptance reading (`n5-acceptance-reading.mjs --execution 2a0898f5-4131-416b-937e-08741bbd4eda`, as
the audit reader) covers what the gate does not: **EXIT 0**; R1 three rows, R1b a named second approver
(李静 #9901 ≠ 走查读者 #9001), R2 six cells, **R3 `/audit/verify valid=true checked=9`**, **R4 the second
entry aligned on object `crm_customer#1` / time `2026-11-28 13:14:01 UTC+08:00` / person `#9001`**, R7
internal-name refusal. R5/R6/R8 are SKIP because no CSVs were supplied.

**The fourth question.** The named gate's own fourth cells carry no fields (blocked: *nothing was
changed*; `escalate_customer`: no before). The update case — a customer update under the approval policy,
initiated by `m7reader` (9001) and approved by `auditapprover` (9901) — carries them: `改前: 客户名称 D**** …;
改后: 客户名称 D**** → 修**** …`. If the criterion requires the fields inside the twelve, the gate needs an
update case or a product-approved boundary sentence; that is a product decision.

`run-audit-two-cases-scenarios.mjs`（点名的门）在一次性真栈上：容器
`delivery-baseline-pg-bl1128051147` / `delivery-baseline-redis-bl1128051147`，库由
`deploy/demo-ecs/bootstrap-db.sh` 加 bpm/fms 灌出 174 张表，宿主用 `scripts/jdk25.sh` 构建、`scripts/run-server.sh`
启动。**exit 0、78 ok / 0 failed**；两档 `READING block.cells 6/6`、`READING approve.cells 6/6` —— 十二格有答。

验收读数（`n5-acceptance-reading.mjs --execution 2a0898f5-4131-416b-937e-08741bbd4eda`，以审计读者身份）
补上点名门未覆盖的部分：**EXIT 0**；R1 三行齐全、R1b 具名第二批准人（李静 #9901 ≠ 走查读者 #9001）、
R2 六格有答、**R3 `/audit/verify valid=true checked=9`**、**R4 第二入口在对象 `crm_customer#1` / 时间
`2026-11-28 13:14:01 UTC+08:00` / 谁 `#9001` 三处对上**、R7 内部名拒绝。R5/R6/R8 因未给 CSV 而 SKIP。

**第 4 问。** 点名门自己的第 4 格不带字段（被拦的写「没有改动」；`escalate_customer` 无改前）。更新档 ——
批准策略下的客户更新，`m7reader`（9001）发起、`auditapprover`（9901）批准 —— 带：`改前: 客户名称 D**** …;
改后: 客户名称 D**** → 修**** …`。若判据要求字段落在十二格之内，该门需要一个更新档或一句产品批准的边界句；
那是产品裁定。

### (5) One HEAD, one environment, with commands and exit codes — **met as evidence; the slice as a whole is not achieved** / 证据成立；本片整体未达成

Every reading above was taken in one run, on one machine, from checkouts pinned to the commits in §3;
each has its command, exit code and log path under `logs/`, and the summary is regenerated from the same
data (`SUMMARY.md`, `readings.txt`). Criterion 5 is about the evidence's integrity, and it holds. The
slice's own success condition is "all five criteria met"; criteria (1) and (2) do not, so **this slice
is not achieved**, and the stop condition applies: the open items need either a repository fix (the
submodule pin, outside this slice's boundary) or a product decision (the fourth question's boundary
sentence), not a workaround here.

上面的每项读数都在同一次运行、同一台机器、§3 钉住的检出上取得；各自带命令、退出码与日志路径
（`logs/`），汇总由同一份数据生成（`SUMMARY.md`、`readings.txt`）。判据 5 讲的是证据本身的完整性，
这一条成立。本片的达成条件 = 五条全成立；判据（1）（2）不成立，故**本片未达成**，停止条件适用：
未决项要么需要修仓（子模块 pin，超出本片边界），要么需要产品裁定（第 4 格的边界句），不在本片绕。

## 5. Defects this run found / 本次运行暴露的缺陷

1. **KeelBase's contract gitlink lags the claimed contract release.** README says v1.24.0; the pin is
   v1.23.0+2. Two CI jobs and two `check:all` gates go red for this one cause, on every push, until the
   gitlink moves to tag `076f2e5` (or the READMEs say v1.23.0). This is Q1/Q2 territory; this slice only
   reports it.
2. **The named audit gate's fourth question carries no before/after.** Both of its cases are either "no
   write happened" (blocked) or a write with no before snapshot (`escalate_customer` writes a new
   follow-up). The cell is *answered*, but not with fields; Q5's criterion asks for fields or a
   product-approved boundary sentence. The update case (customer update under approval) is the machine
   case that does carry `Before`/`After` — see §4(4).
3. **The second entry needs a mapped module.** `n5-acceptance-reading.mjs` maps only `crm_*` result types
   to the host operate log; a `follow_up` execution has no mapping, so R4 is unreadable on the gate's
   second case. The update case gives a `crm_customer` object and R4 reads.

1. **KeelBase 的契约 gitlink 落后于它所声称的契约发布**：README 写 v1.24.0，pin 是 v1.23.0+2。两个 CI
   作业与两道 `check:all` 闸因这一个原因、在每次推送上都红，直到 gitlink 移到 tag `076f2e5`（或 README
   改回 v1.23.0）。属 Q1/Q2 范围，本片只报告。
2. **点名的审计门第 4 问不带改前/改后**：它的两档要么「没有发生写」（被拦），要么是没有改前快照的写
   （`escalate_customer` 写出一条新跟进）。该格有答，但不带字段；Q5 判据要字段或产品批准的边界句。
   客户更新档（批准策略下的更新）才带 `改前`/`改后` —— 见 §4(4)。
3. **第二入口需要有映射的模块**：`n5-acceptance-reading.mjs` 只把 `crm_*` 结果类型映射到宿主操作日志；
   `follow_up` 执行没有映射，故两档门的第二档 R4 取不到数。客户更新档给出 `crm_customer` 对象，R4 读得到。

## 6. Rerun / 复跑

```bash
BASE=D:/Rain6fish/.delivery-baseline/20261128
bash scripts/delivery-baseline.sh --evidence "$BASE/evidence-audit" \
  --keelbase "$BASE/KeelBase" --java "$BASE/KeelBase4J" --vuepro "$BASE/KeelBase-Vue-Pro" \
  --steps ci,checks,e2e,rehearsal,audit
```

For the audit half only, keep `--steps audit`; the host build in the same checkout is incremental after
the first run. `--keep-stack` leaves the containers and host up for inspection (the trap then stops the
cleanup). The script needs Docker, a JDK 25 (resolved by `scripts/jdk25.sh` from the Vue-Pro checkout),
and network for the first `npm ci` / Maven resolve; offline, the e2e step records "unverified" per N7
and the CI step records the reading it could not take — neither is printed as green.

只跑审计半时用 `--steps audit`；同一检出里的宿主构建在第一次之后是增量的。`--keep-stack` 留下容器与宿主
供查看（此时退出钩子不做清理）。脚本需要 Docker、一个 JDK 25（由 Vue-Pro 检出里的 `scripts/jdk25.sh`
解析）与首次 `npm ci`/Maven 解析所需的网络；离线时 e2e 按 N7 记「未核验」、CI 记「取不到数」，两者都不
打印成绿。

## 7. What this slice did not do / 本片未做

- No CI change, no tag, no push, no contract-repository change; the three shared checkouts were untouched
  (only throwaway clones were used).
- Did not fix the contract gitlink (Q1/Q2) or decide the fourth question's boundary sentence (product).
- Did not claim E4 or a human-accepted run; this is a machine run, evidence ceiling E3.
- 未改 CI、未打 tag、未推送、未改契约仓；未碰三份共用检出（只用一次性克隆）。
- 未修契约 gitlink（Q1/Q2），未裁定第 4 格的边界句（产品）。
- 不声称 E4、不声称真人验收；这是机器运行，证据上限 E3。
