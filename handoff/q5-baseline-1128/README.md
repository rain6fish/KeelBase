# Q5 — Reproducible delivery baseline, core half (2026-11-28) / Q5 — 可复现交付基线·核心半

**English.** The baseline's definition is the one `scripts/delivery-baseline.sh` implements (the CTO
ruling of 2026-11-28, §十一): from clean checkouts pinned to each repository's published HEAD, one
command takes five readings — clean checkouts, CI on the three active repositories (the JDK 25 legs
reported, never counted), `check:all`, e2e run on its own, and a release-rehearsal image built from
HEAD with no tag and no push — and writes every command, exit code, log path and reading into one
evidence directory. This slice is the **core half**: `ci,checks,e2e,rehearsal`. The machine
audit-reader regression `(d)` is the other half and was **not taken here**.

**中文。** 口径以 `scripts/delivery-baseline.sh` 实现的为准（2026-11-28 CTO 裁决 §十一）：从钉在各仓已发布
HEAD 的干净检出出发，一条命令取五项读数 —— 检出干净、三活跃仓 CI（JDK 25 腿只报告、不计入）、`check:all`、
e2e 单列跑、从 HEAD 构建的发布彩排镜像（不打 tag、不推）；命令、退出码、日志路径与逐项读数写进同一个证据目录。
本片是**核心半**：`ci,checks,e2e,rehearsal`。机器审计读者回归 `(d)` 属另一半，**本次未跑**。

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
```

Exit 0 = every selected criterion passed (the script's own semantics; unverified is never green).

## Results / 结果

| Criterion | Status | Reading |
|---|---|---|
| checkout:clean | PASS | three checkouts clean at recorded HEADs |
| (a) ci | PASS | every required workflow success at each pinned commit; JDK 25 legs reported, not counted |
| (b1) check:all | PASS | exit 0, **36/36** gates (`[check-all] 36/36 全过（47.4s）`), log `evidence/logs/check-all.log` |
| (b2) e2e | PASS | exit 0, 49 suites, **478 tests passed** (129 + 76 + 210 + 63), log `evidence/logs/e2e.log` |
| (c) release-rehearsal | PASS | `keelbase:delivery-baseline-20261128061708`, id `sha256:dcdc3ef6…a570`, 910,748,250 bytes, built locally; `pushed: no`, `tagged: no`, log `evidence/logs/rehearsal.log` |
| evidence | PASS | `evidence/` (SUMMARY.md, summary.txt, readings.txt, ci.json, environment.txt, logs/) |

Timings this run (local UTC+08:00, Docker build cache warm from the same-morning run): CI 26 s,
`check:all` 58 s, e2e 2 m 15 s, rehearsal 30 s — **4 m 09 s total**. e2e needs no Postgres, Redis or
credentials: the suites run on sqlite.

Timings 计时（本地 UTC+08:00，Docker 构建缓存同日已热）：CI 26 秒、`check:all` 58 秒、e2e 2 分 15 秒、
彩排 30 秒 —— **合计 4 分 09 秒**。e2e 不需要 Postgres、Redis 或凭据：套件跑在 sqlite 上。

## Not met / not taken — and why / 未达成与未取数

- **`(d)` machine audit-reader regression: not taken in this slice.** It is the other half of the
  ruling; running it needs the Vue-Pro host (Maven build) plus throwaway PostgreSQL/Redis. Another
  session was running that half concurrently (`delivery-baseline-pg/redis-bl1128061026` containers
  up at 14:10 local, not ours), so no reading is claimed here either way.
- Everything else the script can read was read and passed. **No product defect was found**; no
  product code was changed.
- `(d)` 机器审计读者回归：本片未取数。它是裁决的另一半，需要 Vue-Pro 宿主（Maven 构建）与一次性
  PostgreSQL/Redis；另一会话当时正在跑这半（14:10 本地起的 `delivery-baseline-pg/redis-bl1128061026`
  容器，非本会话），故本片不对它作任何声称。
- 其余可取的读数都取了且全过。**未发现产品缺陷**，未改产品代码。

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
