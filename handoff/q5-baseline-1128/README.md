# Q5 — Reproducible delivery baseline, core half (2026-11-28) / Q5 — 可复现交付基线·核心半

**English.** The baseline's definition is the one `scripts/delivery-baseline.sh` implements (the CTO
ruling of 2026-11-28, §十一): from clean checkouts pinned to each repository's published HEAD, one
command takes five readings — clean checkouts, CI on the three active repositories (the JDK 25 legs
reported, never counted), `check:all`, e2e run on its own, and a release-rehearsal image built from
HEAD with no tag and no push — and writes every command, exit code, log path and reading into one
evidence directory. The **core half** (`ci,checks,e2e,rehearsal`) ran first (4 m 09 s, exit 0); the
machine audit-reader regression `(d)` — the other half — was then run on the same tree and **also
passed** (exit 0, 3 m 45 s, evidence in `evidence-audit/`).

**中文。** 口径以 `scripts/delivery-baseline.sh` 实现的为准（2026-11-28 CTO 裁决 §十一）：从钉在各仓已发布
HEAD 的干净检出出发，一条命令取五项读数 —— 检出干净、三活跃仓 CI（JDK 25 腿只报告、不计入）、`check:all`、
e2e 单列跑、从 HEAD 构建的发布彩排镜像（不打 tag、不推）；命令、退出码、日志路径与逐项读数写进同一个证据目录。
**核心半**（`ci,checks,e2e,rehearsal`）先跑（4 分 09 秒，退出码 0）；机器审计读者回归 `(d)` —— 另一半 ——
随后在同一棵树上跑，**同样通过**（退出码 0，3 分 45 秒，证据在 `evidence-audit/`）。

## Pins and environment / 钉住的提交与环境

| Repository | HEAD | CI |
|---|---|---|
| KeelBase | `96f8f2ad1d2e91a162d322a420f5f745dd51bd21` (GitHub `main`) | success · run [46113549417](https://github.com/rain6fish/KeelBase/actions/runs/46113549417) |
| KeelBase4J | `f6aacb5559b0ea1559716efa0fbbbe542874b093` (GitHub `main`) | success · run [46112212580](https://github.com/rain6fish/KeelBase4J/actions/runs/46112212580) |
| KeelBase-Vue-Pro | `602e8be0c1faca39d65221c258cb91031d36fdbe` (GitHub `main`) | success · runs [46112803988](https://github.com/rain6fish/KeelBase-Vue-Pro/actions/runs/46112803988) / [46112804053](https://github.com/rain6fish/KeelBase-Vue-Pro/actions/runs/46112804053) |

Contract submodule `Server-NestJS/specs/protocol` = `0d45fa19` (v1.24.0). Environment: Windows 11,
Git Bash 5.3.9, node 24.22.2, npm 11.14.1, JDK 17.0.20.1 default, Maven 3.9.16, Docker 29.9.2,
Flutter 3.47.2 — full readings in `evidence/environment.txt`.

## Command / 命令

```bash
KEELBASE_JAVA_REPO=D:/Rain6fish/KeelBase4J bash scripts/delivery-baseline.sh \
  --evidence D:/Rain6fish/.delivery-baseline/q5-1128/evidence \
  --keelbase <this worktree> --java D:/Rain6fish/KeelBase4J --vuepro D:/Rain6fish/KeelBase-Vue-Pro \
  --steps ci,checks,e2e,rehearsal --wait-ci 600

# audit half, same tree, evidence kept separate so the core-half readings are not overwritten
bash scripts/delivery-baseline.sh \
  --evidence D:/Rain6fish/.delivery-baseline/q5-1128/evidence-audit \
  --keelbase <this worktree> --java D:/Rain6fish/KeelBase4J --vuepro D:/Rain6fish/KeelBase-Vue-Pro \
  --steps audit
```

Exit 0 = every selected criterion passed (the script's own semantics; unverified is never green).
The audit half needs Docker, throwaway PostgreSQL/Redis containers, and a JDK 25 resolved by the
Vue-Pro checkout's `scripts/jdk25.sh`.

## Results / 结果

| Criterion | Status | Reading |
|---|---|---|
| checkout:clean | PASS | three checkouts clean at recorded HEADs |
| (a) ci | PASS | every required workflow success at each pinned commit; JDK 25 legs reported, not counted |
| (b1) check:all | PASS | exit 0, **36/36** gates (`[check-all] 36/36 全过（47.4s）`), log `evidence/logs/check-all.log` |
| (b2) e2e | PASS | exit 0, 49 suites, **478 tests passed** (129 + 76 + 210 + 63), log `evidence/logs/e2e.log` |
| (c) release-rehearsal | PASS | `keelbase:delivery-baseline-20261128061708`, id `sha256:dcdc3ef6…a570`, 910,748,250 bytes, built locally; `pushed: no`, `tagged: no`, log `evidence/logs/rehearsal.log` |
| (d) audit-reader | PASS | met via the update case — twelve cells 6/6 + 6/6 (a `decision` case 6/6 as well); gate **78 ok / 0 failed**; `/audit/verify valid=true checked=9`; second entry aligned on `crm_customer#1` / `2026-11-28 15:54:15 UTC+08:00` / `#9001`; logs `evidence-audit/logs/` |
| evidence | PASS | `evidence/` and `evidence-audit/` (SUMMARY.md, summary.txt, readings.txt, ci.json, environment.txt, logs/) |

Timings this run (local UTC+08:00, Docker/Maven caches warm from the same-morning runs): core half —
CI 26 s, `check:all` 58 s, e2e 2 m 15 s, rehearsal 30 s (**4 m 09 s**); audit half — containers +
seed 85 s, incremental Maven build 41 s (a built `yudao-server.jar` was already present), host up +
two-cases gate 72 s, update case 13 s, acceptance reading 5 s (**3 m 45 s**). The audit run's KeelBase
tree was `ef7419a7` = `96f8f2ad` + this evidence commit only (source diff zero). e2e needs no
Postgres, Redis or credentials: the suites run on sqlite.

计时（本地 UTC+08:00，Docker/Maven 缓存同日已热）：核心半 —— CI 26 秒、`check:all` 58 秒、e2e 2 分 15 秒、
彩排 30 秒（**4 分 09 秒**）；审计半 —— 起容器+灌库 85 秒、Maven 增量构建 41 秒（已有构建好的
`yudao-server.jar`）、宿主起+两档门 72 秒、更新档 13 秒、验收读数 5 秒（**3 分 45 秒**）。审计轮的
KeelBase 树是 `ef7419a7`，即 `96f8f2ad` 加本证据提交（源码差异为零）。e2e 不需要 Postgres、Redis
或凭据：套件跑在 sqlite 上。

## `(d)` in detail / 审计半细目

The gate read `block`, `approve` and `decision` at **6/6 cells each** (78 ok / 0 failed). The
acceptance reading, taken as the audit reader on the update case, passed every criterion it can read:
R1 three rows (executed #9, attempted #8, approved #7), R1b a named second approver (李静 #9901 ≠ the
walkthrough reader #9001), R2 six cells per row, **R3 `/audit/verify valid=true checked=9`** (3 hashed
rows, 9 nodes end to end), **R4 second entry aligned** on object `crm_customer#1` / time
`2026-11-28 15:54:15 UTC+08:00` / person `#9001`, R7 internal-name refusal; R5/R6/R8 skip without
CSVs. The named gate's own fourth cells still carry no before/after; the update case does — the same
product caveat the ruling names, unchanged.

点名门三档各 **6/6 格**（78 ok / 0 failed）。以审计读者身份在更新档上取的验收读数，可读的判据全过：
R1 三行齐（执行 #9 / 试过 #8 / 批准 #7）、R1b 具名第二批准人（李静 #9901 ≠ 走查读者 #9001）、R2 每行六格、
**R3 `/audit/verify valid=true checked=9`**（3 行有哈希、9 个节点首尾相接）、**R4 第二入口三处对上**
（对象 `crm_customer#1` / 时间 `2026-11-28 15:54:15 UTC+08:00` / 谁 `#9001`）、R7 内部名拒绝；
R5/R6/R8 因未给 CSV 而 SKIP。点名门自己的第 4 格仍不带改前/改后，更新档带 —— 与裁决点名的产品口径
相同，未变。

One evidence file is **deliberately outside this repository**: `evidence-audit/logs/audit-host.log`
(kept at `D:/Rain6fish/.delivery-baseline/q5-1128/evidence-audit/logs/audit-host.log`). The host's
access-log interceptor records request bodies, so that log contains plaintext logins for the
documented demo accounts; publishing it would put credentials in a public repository. Everything else
in `evidence-audit/` is committed unedited.

**No product defect was found**; no product code was changed. During this run another session was
executing its own audit half (`delivery-baseline-*-bl1128075238` containers, still up afterwards);
that stack is theirs and was left untouched.

有一份证据**特意留在仓外**：`evidence-audit/logs/audit-host.log`（存于
`D:/Rain6fish/.delivery-baseline/q5-1128/evidence-audit/logs/audit-host.log`）。宿主访问日志拦截器会记录
请求体，这份日志里有演示账号的明文登录；公开进仓等于把凭据放进公开仓库。`evidence-audit/` 其余文件
原样提交。
**未发现产品缺陷**，未改产品代码。本次运行期间另一会话也在跑它的审计半（`delivery-baseline-*-bl1128075238`
容器，其后仍在运行）；那套栈属于它，未动。

## Process note / 过程备注

The first attempt (14:02–14:10 local) took the same four readings and all four passed, but recorded
`checkout:clean` as FAIL because the evidence directory had been created **inside** the checkout
before the cleanliness read (`?? handoff/q5-baseline-1128/`). The re-run above puts the evidence
outside the checkout and the tree was clean (only fix in between: moving that directory out). Worth a
follow-up in the script: the natural place for `--evidence` is inside the repo, so the gate should
ignore the evidence path (or default it outside the checkout).

第一次尝试（本地 14:02–14:10）四项读数同样全过，但 `checkout:clean` 记成 FAIL —— 因为证据目录建在
**检出之内**、在判干净之前就出现了（`?? handoff/q5-baseline-1128/`）。上面的复跑把证据放在检出之外，
树是干净的（两轮之间唯一的动作就是把这个目录移出去）。值得给脚本提一条后续：`--evidence` 最自然的位置
就在仓内，这道闸应当忽略证据路径（或把默认位置放到检出之外）。

## What was not done / 未做

No tag, no release page, no push of `main`; only this branch is pushed. No product code, no contract
repo, no claim table, no `sync-vectors.sh`.
未打 tag、未建发布页、未推 `main`；只推本分支。未改产品代码、契约仓与认领表，未跑 `sync-vectors.sh`。

Machine run; evidence ceiling per the ruling's own wording: **E3, no E4** (no person performed or
accepted this run). E2's requirement — a script plus run logs and an evidence directory — is met.
机器运行；证据上限按裁决原文：**E3、无 E4**（无真人执行或验收）。E2 的要求 —— 脚本 + 运行日志 + 证据目录
—— 已满足。
