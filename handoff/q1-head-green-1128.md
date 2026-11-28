# Q1 — HEAD back to green: the trust-proof corpus names the evidence root `/6` (2026-11-28)

- Worktree `.claude/worktrees/festive-kepler-429e20` / branch `claude/great-khayyam-cc4177`, based on local `main` `638ef385`.
- Fix commit `7cd5c6ae`, handoff `c69d4662`. The branch was pushed to GitHub (`github`) on 2026-11-28; Gitee was not pushed (only GitHub runs CI). No tag, no release; contract repo, private repo, Q2/Q3 files untouched.

## What was red

`test/scenario-replay.e2e-spec.ts` replays `specs/scenarios/trust-proof-v1.json` against this implementation.
S7's entry asserted `expect: { format: "keelbase-audit-evidence/4" }` while the endpoint it maps to
(`GET /ai/governance/evidence-root/...`) has emitted `keelbase-audit-evidence/6` since the signed
reading-kind upgrade. The corpus was stale; `/6` itself is not defective.

Reproduced before the change:

```
NODE_ENV=test npx jest --config test/jest-e2e.json --runTestsByPath test/scenario-replay.e2e-spec.ts --forceExit
# exit 1 — format: expected keelbase-audit-evidence/4, received keelbase-audit-evidence/6
```

## What changed

| File | Change |
|---|---|
| `Server-NestJS/specs/scenarios/trust-proof-v1.json` | S7 `expect.format` → `keelbase-audit-evidence/6`; S7 `title` reads "导出 /6"; the pack note names the `/6` constant instead of "v3". |
| `Server-NestJS/scripts/verify-trust-proof.mjs` | The S7 label (header comment, section comment, `console.log` tag) reads `/6`; the export-failure and format-check labels read `/6`; the format predicate is now the exact `/6` instead of `includes('/3')`. |

The title stays verbatim between the pack and the script, so the pack-to-script drift gate
(`src/ai/scenarios-pack.spec.ts`) still holds. The script's old `includes('/3')` check would already have
reported S7 bad against the `/4` implementation — same class of staleness, fixed here.

## Readings (this worktree, after the change)

| Check | Command | Result | Log |
|---|---|---|---|
| Replay e2e | `NODE_ENV=test npx jest --config test/jest-e2e.json --runTestsByPath test/scenario-replay.e2e-spec.ts --forceExit` | exit 0, 4/4 | `/tmp/q1/after-scenario-replay.log` |
| Pack drift gate | `npx jest src/ai/scenarios-pack.spec.ts --forceExit` | exit 0, 24/24 | `/tmp/q1/after-pack-gate.log` |
| Full e2e (4 shards) | `NODE_ENV=test npm run test:e2e` | exit 0, 49 suites / 478 tests (129·76·210·63) | `/tmp/q1/full-e2e-2.log` |
| Unit + coverage | `npm run test:cov` | exit 0, 447 suites passed / 1 skipped (needs live PG), 4244 passed / 3 skipped; coverage 95.35 / 80.66 / 91.41 / 96.47 vs 86 / 72 / 81 / 86 | `/tmp/q1/unit-cov-2.log` |
| Wiring gate | `npm run check:app-wiring` (repo root) | exit 0 (17.6 s) | `/tmp/q1/app-wiring.log` |
| Build | `npm run build` | exit 0 | `/tmp/q1/build.log` |
| Live S7 proof | `node dist/main` on port 3999, temp SQLite; `BASE_URL=http://localhost:3999/api/v1 node scripts/verify-trust-proof.mjs` | exit 0, 17/17; S7 offline verification PASS, tamper detection FAIL | `/tmp/q1/trust-proof-live.log` |

The log paths are local temp files; the commands above reproduce each reading.

## Environment note

The worktree's `specs/protocol` submodule was checked out at `015f474` while the parent records
`0ffd867` (contract v1.24.0). `015f474` has no `schemas/v7/evidence-package.schema.json`, so the first
`test:cov` run failed one unrelated spec (`audit-evidence.service.spec.ts`). The submodule was fetched
and restored to the recorded pointer; that spec then passed 44/44 and `test:cov` exited 0. The parent
gitlink is unchanged, and the submodule now matches HEAD (parent `git status` clean).

## Not done

- **Q1's acceptance is met.** The fix reached `main` as `bcf3bb7e`; CI run `46106315422` (push,
  `b9b61d08` — the first main head containing it) succeeded, with the **`test` job success** and the
  other 38 jobs success (`https://github.com/rain6fish/KeelBase/actions/runs/46106315422`). The same
  head's CodeQL run `46106315470` succeeded. `ci.yml` triggers only on a push to `main` or a pull
  request to `main`, so a branch push alone starts no run.
- Three outward documents still carry the old "v3" wording; left alone as outside Q1: `docs/evidence/README.md:116`,
  `docs/evidence-root.spec.md:189`, `docs/manual/security-showcase.md:43`. (`docs/manual/delivery-recipe.md`
  pins `/4` and is checked by `scripts/check-delivery-coverage-statement.mjs`; also untouched.)
- Q2 (4J pin/version) and Q3 (README row, CHANGELOG opening) were not touched.

---

# Q1 —— HEAD 回绿：Trust 证明包改断证据根 `/6`（2026-11-28）

- 工作树 `.claude/worktrees/festive-kepler-429e20` / 分支 `claude/great-khayyam-cc4177`，基于本地 `main` `638ef385`。
- 修复提交 `7cd5c6ae`，交接 `c69d4662`。分支已于 2026-11-28 推到 GitHub（`github`）；Gitee 未推（CI 只在 GitHub 跑）。未打 tag、未发版；契约仓、私库、Q2/Q3 的文件均未动。

## 红在哪

`test/scenario-replay.e2e-spec.ts` 拿 `specs/scenarios/trust-proof-v1.json` 在本实现上重放。S7 的条目断言
`expect: { format: "keelbase-audit-evidence/4" }`，而它映射到的端点（`GET /ai/governance/evidence-root/...`）
自「读数种类入签」升级起就产出 `keelbase-audit-evidence/6`。是语料腐坏，`/6` 本身没有缺陷。

改动前复现：

```
NODE_ENV=test npx jest --config test/jest-e2e.json --runTestsByPath test/scenario-replay.e2e-spec.ts --forceExit
# 退出码 1 —— format: 期望 keelbase-audit-evidence/4，实得 keelbase-audit-evidence/6
```

## 改了什么

| 文件 | 改动 |
|---|---|
| `Server-NestJS/specs/scenarios/trust-proof-v1.json` | S7 的 `expect.format` → `keelbase-audit-evidence/6`；S7 `title` 读「导出 /6」；包注里的「v3 常量」改为点名 `/6`。 |
| `Server-NestJS/scripts/verify-trust-proof.mjs` | S7 的标签（头部注释、分节注释、`console.log` 标签）读 `/6`；导出失败与格式判定的标签读 `/6`；格式判定由 `includes('/3')` 改为精确等于 `/6`。 |

标题在包与脚本之间保持逐字一致，所以 pack↔脚本漂移门（`src/ai/scenarios-pack.spec.ts`）仍成立。
脚本原先的 `includes('/3')` 判定对 `/4` 实现就已经会报 S7 坏 —— 同类腐坏，本次一并修掉。

## 读数（本工作树，改动之后）

| 校验 | 命令 | 结果 | 日志 |
|---|---|---|---|
| 重放 e2e | `NODE_ENV=test npx jest --config test/jest-e2e.json --runTestsByPath test/scenario-replay.e2e-spec.ts --forceExit` | 退出码 0，4/4 | `/tmp/q1/after-scenario-replay.log` |
| 包漂移门 | `npx jest src/ai/scenarios-pack.spec.ts --forceExit` | 退出码 0，24/24 | `/tmp/q1/after-pack-gate.log` |
| 全量 e2e（4 片） | `NODE_ENV=test npm run test:e2e` | 退出码 0，49 套件 / 478 例（129·76·210·63） | `/tmp/q1/full-e2e-2.log` |
| 单测 + 覆盖率 | `npm run test:cov` | 退出码 0，447 套通过 / 1 跳过（需活 PG），4244 例通过 / 3 跳过；覆盖率 95.35 / 80.66 / 91.41 / 96.47，门槛 86 / 72 / 81 / 86 | `/tmp/q1/unit-cov-2.log` |
| 装配门 | `npm run check:app-wiring`（仓根） | 退出码 0（17.6 秒） | `/tmp/q1/app-wiring.log` |
| 构建 | `npm run build` | 退出码 0 | `/tmp/q1/build.log` |
| 实测 S7 | 端口 3999 起 `node dist/main`（临时 SQLite）；`BASE_URL=http://localhost:3999/api/v1 node scripts/verify-trust-proof.mjs` | 退出码 0，17/17；S7 离线验证 PASS、篡改检测 FAIL | `/tmp/q1/trust-proof-live.log` |

日志路径是本机临时文件；上面的命令可逐条复现读数。

## 环境备注

本工作树的 `specs/protocol` 子模块检出在 `015f474`，而父仓记录的是 `0ffd867`（契约 v1.24.0）。
`015f474` 没有 `schemas/v7/evidence-package.schema.json`，故第一次 `test:cov` 挂了一个无关的 spec
（`audit-evidence.service.spec.ts`）。取回子模块并复位到记录的指针后，该 spec 44/44 通过、`test:cov`
退出码 0。父仓 gitlink 未变，子模块现与 HEAD 一致（父仓 `git status` 干净）。

## 未做

- **Q1 的验收已满足。** 修复经 `bcf3bb7e` 落到 `main`；CI run `46106315422`（push，`b9b61d08` ——
  含该修复的第一个 main HEAD）success，其中 **`test` 作业 success**，其余 38 个作业也是 success
  （`https://github.com/rain6fish/KeelBase/actions/runs/46106315422`）。同一 HEAD 的 CodeQL run
  `46106315470` success。`ci.yml` 只在推送 `main` 或向 `main` 开 PR 时触发，故只推分支不会启动它。
- 三处对外文档仍带旧的「v3」措辞，按 Q1 范围未动：`docs/evidence/README.md:116`、
  `docs/evidence-root.spec.md:189`、`docs/manual/security-showcase.md:43`。（`docs/manual/delivery-recipe.md`
  仍写 `/4`，由 `scripts/check-delivery-coverage-statement.mjs` 校验；同样未动。）
- Q2（4J pin/版本）与 Q3（README 发布行、CHANGELOG 开口）未触碰。
