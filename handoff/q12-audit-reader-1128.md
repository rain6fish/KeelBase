# Q12 — Host machine audit-reader regression on the published pin (2026-11-28) / Q12 — 已发布 pin 上的宿主机器审计读者回归

**English.** Q12 asks for one thing: take the audit reader's path on the published host pin —
locate → six answers → export → second entry — and have every cell answered. This run does that on
a throwaway real stack built from pinned clean checkouts, and it adds the step the delivery
baseline (Q5) did not take: **the export** (six-column and check CSVs, R5/R6/R8). It also confirms
U-3 live for the first time: the host operate-log **detail** returns `userName = null` while the list
returns the name.

**中文。** Q12 要的是一件事：在已发布的宿主 pin 上走一遍审计读者的路 —— 定位 → 六问 → 导出 →
第二入口，逐格有答。本次在一套由钉住的干净检出构建的一次性真栈上跑完，并补上交付基线（Q5）没做的那一步：
**导出**（六列与八列核对 CSV，R5/R6/R8）。同时首次**实测确认 U-3**：宿主操作日志**详情**返回
`userName = null`，而列表返回名字。

---

## 1. Definitions this run was held to / 本次所对的定义

- **Published pin / 已发布 pin**: the host `KeelBase-Vue-Pro` at its published HEAD. Clone used:
  `be88b997e6aa2cfd3279a12e4a56f13370df9ea8` — the same pinned checkout Q5's baseline used. Host `main`
  has since moved to `602e8be0`, which touches only two handoff Markdown files and no audit code.
  宿主 `KeelBase-Vue-Pro` 的已发布 HEAD。用的克隆 `be88b997` —— 与 Q5 基线同一钉住检出。宿主 `main`
  此后到了 `602e8be0`，只改了两个 handoff Markdown、未动审计代码。
- **Six answers / 六问**: Who · When · Which business object · What changed · Who confirmed · Result.
  谁 · 何时 · 哪个业务对象 · 改成什么 · 谁确认 · 结果。
- **Twelve cells / 十二格**: the six answers on each of the gate's two cases (a risk-blocked write, a
  write a second person approves). This run also carries a `decision` case and an update case.
  门自身两档（风险级拦截的写、第二人批准的写）各六格；本次另有 `decision` 档与 update 档。
- **Second entry / 第二入口**: the host's own 「系统管理 → 审计日志 → 操作日志」, compared on object /
  time / who. 宿主自己的「系统管理 → 审计日志 → 操作日志」，比对象 / 时间 / 谁。
- **Export / 导出**: the console's six-column business CSV and eight-column check CSV, plus the
  internal-name refusal. 控制台六列业务 CSV 与八列核对 CSV，及内部名拒绝。
- **Acceptance / 验收判据**: twelve cells answered or an explicit boundary; `/audit/verify` valid;
  second entry matches; the fourth question carries at least one before/after field or a
  product-approved boundary sentence. 十二格有答或明确边界；`/audit/verify` valid；第二入口一致；
  第 4 格至少一个改前/改后字段，或有产品批准的边界句。

## 2. Command, exit code, evidence / 命令、退出码、证据

```bash
bash scripts/delivery-baseline.sh --steps audit --keep-stack \
  --evidence D:/Rain6fish/.delivery-baseline/q12-audit-1128/evidence \
  --keelbase <worktree claude/q12-audit-reader-1128, 96f8f2ad> \
  --java D:/Rain6fish/.delivery-baseline/20261128/KeelBase4J \
  --vuepro D:/Rain6fish/.delivery-baseline/20261128/KeelBase-Vue-Pro
```

- Audit step exit **0**; `summary.txt` → `audit-reader PASS`. The script's `--keep-stack` keeps PG/Redis;
  the host is stopped by design at exit, so it was restarted by hand on the same ports for the export step.
- Evidence: `D:/Rain6fish/.delivery-baseline/q12-audit-1128/evidence/` — `readings.txt`, `summary.txt`,
  `logs/audit-two-cases.log`, `logs/audit-acceptance-reading.log`, `logs/q12-export-gen.log`,
  `logs/q12-export-verify.log`, `export/` (the two CSVs and the JSON reading).
- Stack: PG `delivery-baseline-pg-bl1128061026` (127.0.0.1:61074), Redis `…-redis-bl1128061026` (61075),
  host `http://127.0.0.1:61077`. Update-case execution `ab03f5e7-49e8-4094-8cc6-4591c4fa7f8a`.
- 审计段退出 **0**，`audit-reader PASS`。`--keep-stack` 留 PG/Redis；宿主按设计在退出时停掉，故在同一端口
  手动重起以跑导出。证据与栈信息见上。

## 3. The twelve cells / 十二格

Gate cases (from `audit-two-cases.log`, `78 ok / 0 failed`):

| Cell | block (risk-blocked write) | approve (second-person approval) |
|---|---|---|
| Who 谁 | 周敏 (account #N) | 周敏 (account #N) |
| When 何时 | UTC+08:00 | UTC+08:00 |
| Object 对象 | Project · #N | Sample follow-up · #N · E**** · still there |
| What changed 改成什么 | nothing was changed — no write happened | no before was recorded, and this write itself recorded no field values |
| Who confirmed 谁确认 | no one can — blocked at a risk level | 李静 approved it — a second person |
| Result 结果 | Blocked | Executed |

All three gate readings report `cells 6/6` with `unanswered (none)`. The `decision` case is also `6/6`.

Update case (acceptance reading, execution `ab03f5e7…`): the fourth question **carries fields** —
`改前: 客户名称 D**** …` / `改后: 客户名称 D**** → 修**** …` (three rows #7 approved / #8 attempted /
#9 executed, approver 李静 #9901 ≠ reader #9001).

三档门读数均 `6/6`、`unanswered (none)`；update 档第 4 格**带改前/改后**。门自身两档的第 4 格无字段，
属已声明的产品边界（被拦的写没改动；`escalate_customer`/`decision` 无改前）。

## 4. Export (the step Q5 did not take) / 导出（Q5 未做的一步）

```bash
# 1) generate — writes the six-column and eight-column CSVs from the same modules the screen uses
node scripts/n5-acceptance-reading.mjs --execution ab03f5e7-… --host http://127.0.0.1:61077 \
  --token <audit_reader> --out D:/…/evidence/export
# 2) verify the produced files against the screen and hash them
node scripts/n5-acceptance-reading.mjs --execution ab03f5e7-… --host http://127.0.0.1:61077 \
  --token <audit_reader> \
  --csv …/audit-six-20261128-141402.csv --check-csv …/audit-check-20261128-141402.csv \
  --sha256 …/export
```

Reading: **R5 PASS** (BOM · CRLF · 6 columns · 3 rows identical to the selection), **R6 PASS**
(BOM · CRLF · 8 columns · 3 rows · carries the “related, not linked” note), **R8 PASS** (3 files),
**R7 PASS** (both CSVs throw `CsvLeak` on an injected internal name). `EXIT 0` — every criterion passes.

读数：R5/R6/R8 **PASS**，R7 负向 **PASS**；`EXIT 0`。

## 5. `/audit/verify` and the second entry / 校验与第二入口

- **R3**: `valid=true checked=9 · 3 rows hashed · 9 nodes chained`.
- **R4**: object `crm_customer#1` · time `2026-11-28 14:12:36 UTC+08:00` · who `#9001` — all three align
  with the host's operate-log row (`id=1, user_id=9001, CRM 客户 / 更新客户`).

## 6. U-3 — confirmed live, Java half fixed / U-3 —— 实测确认，Java 半已修

Read as admin against the same host:

```
GET /admin-api/system/operate-log/get?id=1  → { userId: 9001, userName: null, subType: "更新客户", bizId: 1 }
GET /admin-api/system/operate-log/page      → [{ id: 1, userId: 9001, userName: "走查读者" }]
```

The **detail** dropped the operator name; the **list** had it. This matched the source-read diagnosis in
`handoff/abc-a-path-fixes-1127.md` §2: `OperateLogController#getOperateLog` lacked `@TransMethodResult`
while `/page` and `/export-excel` carried it.

**Fixed on 2026-11-28 at the user's instruction** (`KeelBase-Vue-Pro` branch
`claude/u3-operate-log-detail-1128`, commit `1d734cedd4`, based on `origin/main` `602e8be0`): the
annotation is added to `/get`. Verified on a rebuilt stack, same row `id=1`:

```
before: GET /admin-api/system/operate-log/get?id=1 → userName: null
after : GET /admin-api/system/operate-log/get?id=1 → {"userId":9001,"userName":"走查读者","subType":"更新客户"}
        GET /admin-api/system/operate-log/page     → unchanged, userName "走查读者"
```

The **UI half remains open**: the host's detail dialog component (`OperateLogDetail.vue`) is not in this
repository — the admin UI is fetched at build time — so its rendering could not be patched or verified
here. With `/get` now returning `userName`, a dialog that binds that field will show the name; that has
not been observed. U-3 is a human-facing gap only; it does not change any machine reading (R4 compares
`userId`, not `userName`).

**详情**此前丢名字、**列表**有名字，与 `abc-a-path-fixes-1127.md` §2 的源码诊断一致。

**2026-11-28 按用户指示已修**（`KeelBase-Vue-Pro` 分支 `claude/u3-operate-log-detail-1128`，提交
`1d734cedd4`，基于 `origin/main` `602e8be0`）：给 `/get` 补上该注解。在重建的栈上、同一行 `id=1` 实测：
修前 `userName: null`，修后 `"走查读者"`，`/page` 不变。

**UI 半仍开着**：宿主详情弹窗组件（`OperateLogDetail.vue`）不在本仓（管理端 UI 构建时拉取），故其渲染
未能在本处打补丁或实测。`/get` 现在回名字，绑定该字段的弹窗应能显示，但未亲眼观察到。U-3 只影响人读的
详情，不改任何机器读数（R4 比 `userId`，不比 `userName`）。

## 7. Boundaries / 边界

- No product code changed in **this** repository, no tag, nothing pushed to `main`. This file is on
  `claude/q12-audit-reader-1128`. The U-3 Java fix lives in `KeelBase-Vue-Pro` on its own branch
  (`claude/u3-operate-log-detail-1128`, commit `1d734cedd4`), also unpushed.
- Non-human machine run: evidence ceiling **E3**, no E4. It does not claim a real-person acceptance.
- Reproducible in principle with Docker, JDK 25 (`scripts/jdk25.sh`), and network for the first Maven
  resolve; without a stack, the machine half cannot run and U-3 stays deferred (the Q12 stop condition).
- One environment note: two of my own baseline instances briefly overlapped on one evidence directory
  and were both stopped before a clean single run; the readings above are from that single clean run
  (`readings.txt` timestamped 06:10Z, containers `bl1128061026`).

本仓未改产品代码、未打 tag、未推 `main`；本件在 `claude/q12-audit-reader-1128` 分支上。U-3 的 Java
修复在 `KeelBase-Vue-Pro` 自己的分支 `claude/u3-operate-log-detail-1128`（提交 `1d734cedd4`，同样未推）。
非真人机器运行，证据上限 **E3**、无 E4。
