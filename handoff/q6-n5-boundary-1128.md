# Q6 — the N5 boundary in outward material (2026-11-28) / 把 N5 边界写进对外材料

- Task source: `KeelBase-Private/notes/CTO每周例会/2026-11-28-下周开发计划.md` Q6; ruling: `2026-11-28.md` §十一 item 4.
- Starting point: local `main` `638ef385`; this worktree `great-curran-179998` / branch `claude/great-curran-179998`.
- Local commit only; nothing pushed; no other repository edited.

## English

**The ruling.** Outward material may say only "demo-ready, not deliverable, E3, no E4" (原文：演示可用、不可交付，E3，无 E4). The record-layer "recorded as passed" must never appear alone. If a surface cannot carry the full boundary, delete that surface's claim instead of weakening the boundary.

**What was found.** Neither this repository nor the main checkouts of `KeelBase4J` and `KeelBase-App-X` contains any mention of N5. The two "N5"-shaped strings in this repository are different namespaces and were left untouched: `SECURITY.md` N-5 is the fifth "Not-a-*" item (idempotency keys for legacy systems), and `Server-NestJS/specs/scenarios/README.md:75,81` "N1–N5" are the Java-line replay spec items. The N5 acceptance claim lives in the private repository and in the loose `D:/Rain6fish/handoff/` N5 files; those were inventoried, not edited.

**Surfaces inspected in this repository (13).**

| # | Surface | What it says | Full boundary before | Action |
|---|---|---|---|---|
| 1 | `README.md` — Try in 60 Seconds | live demo + demo video + series | no | **patched**: one line after the three links |
| 2 | `README.zh-CN.md` — 60 秒体验 | same | no | **patched**: one line |
| 3 | `docs/manual/demo-live.md` — 演示价值 / What This Proves | "what this proves" bullets | no | **patched**: two lines after the bullets |
| 4 | `docs/enterprise-readiness.md` — header | capability-status page for enterprise evaluation | no | **patched**: two lines in the header quote |
| 5 | `docs/manual/sixth-reader-recheck.md` | runbook; status says "a runbook, not a reading. Nothing in this file has been executed" | no claim made | not patched: it asserts no result, so the boundary has nothing to bound |
| 6 | `docs/manual/30min-acceptance.md` / `-en.md` | a developer's 30-minute build/module acceptance script | no | not patched: a different acceptance; the N5 phrase here would conflate two things |
| 7 | `docs/manual/release-gate.md` | release gates; synthetic stranger; external validation named unavailable | no N5 claim | not patched |
| 8 | `CHANGELOG.md` | historical release entries; no N5 | — | not patched: no N5 claim, and its opening is owned by the unmerged Q3 branch |
| 9 | `SECURITY.md` — Not-a-* N-5 | idempotency-key boundary | — | not patched: different namespace |
| 10 | `Server-NestJS/specs/scenarios/README.md` "N1–N5" | Java-line replay spec items | — | not patched: different namespace |
| 11 | `docs/manual/faq.md` / `-en.md` | production deploy questions | no acceptance claim | not patched |
| 12 | `docs/intro/keelbase-project-intro.md` | "已完成（约 95%）" feature-completion claim | not an acceptance claim | not patched |
| 13 | `Front-Flutter/README.md`, `Web-Admin-Vue/README.md`, `Web-Admin-React/README.md` | component readmes | no acceptance text | not patched |

The two pages under `docs/official-video/` carry no acceptance or deliverability wording; README now states the boundary where those pages are linked.

**Other repositories — list only, nothing edited.**

- `KeelBase4J` (main checkout, `--exclude-dir=.claude`): zero N5 hits in `README*.md`, `CHANGELOG.md`, `docs/`. Its compatibility claim is "proven by reproducing the frozen vectors", which is not an acceptance claim. **No patch needed.** (The N5-looking hits under `KeelBase4J/.claude/worktrees/` belong to other sessions' worktrees, not the repository's outward surfaces.)
- `KeelBase-App-X` (main checkout): zero N5 hits. `README.md` claims "M0–M6 已完成", a module-completion claim, not the N5 acceptance. **No patch needed.**

**Private repository — patched on the user's instruction (private commits `99f388a4`, `a6d48c5a`; local only, nothing pushed).**

1. `notes/审计读者/N5-场次记录-2026-11-25.md` — a boundary line added to the header, and a correction note after §G's final status: the "只描述 11-24 那一次" clause is no longer an exemption; both 11-24 and 11-25 sit under the same boundary. The original text is kept.
2. `notes/CTO每周例会/2026-11-21-下周开发计划.md` — one bracket appended to each of the two N5 rows (EN/ZH): every earlier "recorded as passed" note is quoted only together with "demo-ready, not deliverable, E3, no E4".
3. `KeelBase4TS/KeelBase-execution-log.md` — the 11-26 heading now reads "N5 recorded passed at E3 — demo-ready, not deliverable, no E4", and one Q6 sentence is appended to each body paragraph.
4. `notes/会话认领约定.md` — the N5 record row carries the boundary; a Q6 claim row was added and closed in `a6d48c5a`.
5. Not patched (marked optional before; unchanged): `D:/Rain6fish/handoff/n5-closeout-1126.md`, `n5-verdict-1126.md` — they quote the same clause but state the E3 ceiling and forbid "acceptance passed" wording on the same page.
6. Left untouched: the uncommitted 11-27 verdict hunk in the week-plan file (another session's work) stays in the working tree; the two commits above carry only this pass's brackets.
7. `notes/项目周例会/2026-11-28.md`, `notes/CTO每周例会/2026-11-28-项目周会上报.md`, `notes/CTO每周例会/2026-11-28.md` §十一 — already carried the full boundary; no change.

**Gates run (this worktree).** `npm run check:readme-parity` ✓ (54 links per language, sets identical); `npm run check:family-block` ✓; `npm run check:terminology` ✓. No code, schema, contract or test file touched.

## 中文

**裁决。** 对外材料只能说「演示可用、不可交付，E3，无 E4」；记录层「记为通过」不得单独出现。某面写不下完整边界，就删掉该处主张，不放宽边界。

**清点结论。** 本仓与 `KeelBase4J`、`KeelBase-App-X` 的主检出都**没有** N5 字样。本仓两处形似 N5 的串属不同命名空间，未动：`SECURITY.md` 的 N-5 是「不承诺清单」第五条（老系统的幂等键），`Server-NestJS/specs/scenarios/README.md:75,81` 的「N1–N5」是 Java 线重放规格条目。N5 验收主张在私库与 `D:/Rain6fish/handoff/` 下的 N5 文件里；那些只清点，未编辑。

**本仓检查的对外面（13 处）。** 已补 4 处（README 中英、`docs/manual/demo-live.md`、`docs/enterprise-readiness.md`）；9 处经核实不含 N5 主张或属不同命名空间，未补（明细见英文表）。两页 `docs/official-video/` 无验收或可交付措辞，README 在链接处已带边界。

**其它仓 —— 只列不改。**

- `KeelBase4J`：主检出零 N5 命中；其主张是「复现冻结向量证明兼容」，不是验收主张 ⇒ 无需补丁。`.claude/worktrees/` 下的命中属其它会话的检出，不是该仓对外面。
- `KeelBase-App-X`：主检出零 N5 命中；README 的「M0–M6 已完成」是模块完成度，不是 N5 ⇒ 无需补丁。

**私库 —— 按用户指示已补（私库提交 `99f388a4`、`a6d48c5a`；仅本地，未推送）。**

1. `notes/审计读者/N5-场次记录-2026-11-25.md`：抬头加一行边界；§G 末段后加更正注——「只描述 11-24 那一次」不再作为豁免依据，11-24 与 11-25 同受一条边界约束；原文保留。
2. `notes/CTO每周例会/2026-11-21-下周开发计划.md`：两个 N5 主行（中英各一）各追加一个方括号，写明「以上各条『记为通过』只能连同『演示可用、不可交付，E3，无 E4』一起引用」。
3. `KeelBase4TS/KeelBase-execution-log.md`：11-26 标题改为「N5 recorded passed at E3 — demo-ready, not deliverable, no E4」；中英两段正文各追加一句 Q6 边界说明。
4. `notes/会话认领约定.md`：N5 场次记录登记行补上边界；新增 Q6 认领行并在 `a6d48c5a` 注销。
5. 未补（此前标为可选）：`D:/Rain6fish/handoff/n5-closeout-1126.md`、`n5-verdict-1126.md` —— 同页已写证据上限 E3 且禁用「验收通过」措辞。
6. 未触碰：周计划文件里 11-27 判定那段属他会话的未提交改动，仍留在工作树；上述两笔提交只含本次方括号。
7. `notes/项目周例会/2026-11-28.md`、`notes/CTO每周例会/2026-11-28-项目周会上报.md`、`notes/CTO每周例会/2026-11-28.md` §十一：本已带完整边界，不改。

**门禁读数（本 worktree）。** `check:readme-parity` ✓（每语言 54 条链接、集合一致）；`check:family-block` ✓；`check:terminology` ✓。私库 `check-claim-closure.mjs` exit 0。未动代码、schema、契约与测试。

**边界。** 本仓只改 Q6 worktree；私库改动按用户 2026-11-28 指示执行；两仓均只做本地提交、未推送；未宣称任何验收通过；未碰兼容矩阵 README 行与 CHANGELOG 开口（属未合并的 Q3 分支）。
