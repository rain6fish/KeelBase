# Sixth-Reader Recheck on the Released Artifact / 已发布产物上的第六位读者复验

> **Status (2026-11-08): a runbook, not a reading.** Nothing in this file has been executed. It was
> written against `KeelBase` main `32e0d3da`, for the artifact described in §2. The evidence is the
> filled record from a session (§7); this file is never the evidence.
> **Scope.** It changes no product code, no CI, and no other document, and it merges nothing.

**Who reads what.**

| Role | Sections | Time |
|---|---|---|
| Operator who prepares the stack | §2, §4, §7 | 30–60 min |
| Host (must not be a developer) | §3, §5, §7 | 15 min |
| The sixth reader | §5, printed, with nothing else | 30–45 min |
| Whoever grades the session | §1, §6, §8 | 10 min |

## 1. What a pass means

The 4–6 week objective is *released-artifact proof*: one M7-style read on the **published** artifact,
hosted outside the project, in which the reader can locate the operation **by business object** and
export the record for cross-checking, and in which the R4 second approver has a UI entry.

Source: `KeelBase-Private/KeelBase4TS/KeelBase-下阶段规划与开发计划_2026-10-17.md`, section
"2026-11-07 周会修订" → "Single objective (4–6 weeks): released-artifact proof".

A session passes only when a reader who took no part in the implementation does all four **without a
prompt**:

1. locates one operation from a business object plus a date range — not from a numeric caller id;
2. reads the six answers on that row;
3. exports a record someone else can check;
4. cross-checks who did what against a second entry.

Each clause is judged on its own (§8). A capability that is absent is **not met**; it is never
"not testable". The session still records every reading it did get.

### 1.1 The falsifiers

The plan names them; this section only turns them into things to look at.

| Falsifier | Where it shows | Read in |
|---|---|---|
| the released artifact still answers `not recorded` / `does not record who` | the six-answer expansion of an executed, blocked or approved row | §5.2 |
| search still requires a numeric caller id | the audit page's filter row, and the read API's parameters | §5.1 |
| the gate is absent from CI | `.github/workflows/real-stack.yml`, `scripts/run-all-scenarios.sh` | §2 (d) |

None of the three is read from memory. Each is re-measured at session time; the readings go into §7.

## 2. Prerequisites

Everything in this table must be true **on the day of the session**. Anything that is not is written
"not available" in the record — never assumed, and never quietly repaired during the session.

| # | Item | Check | Expected | Reading, 2026-11-08 |
|---|---|---|---|---|
| a | 4J `0.1.17` is published | tag + Central | tag resolves; pom answers 200 | tag `v0.1.17` → `2189212a5ac773cd31cdefe0e93d9518593786c0` (commit dated 2026-11-06 20:28 +08); pom 200 |
| b | the host is pinned to `0.1.17` | `yudao-server/pom.xml` | both keelbase4j dependencies on `0.1.17` | lines 39 and 55 |
| c | the jar carries the **published** runtime | sha1 inside the boot jar = Central's sha1 | three pairs equal | core `f1a2d83f…`, protocol `4f1f7fc4…`, springai `9e867533…` — equal |
| d | the two-case gate is on main **and** in CI | discovery list + workflow | listed and executed | `scripts/run-all-scenarios.sh:131`; `real-stack.yml`, job "Every real-stack scenario gate passes against a running host", on push/PR to main |
| e | contract `v1.20.0+` is on contract main | ancestry | ancestor | contract main `98cb8a4`; `v1.20.0` and `v1.22.0` both ancestors |
| f | U1 — see §2.1 | host read face + branches | — | **not available on the host read face** |
| g | U2 — see §2.2 | host console | — | **API only; no UI entry** |

**(a) Release and tag.**

```bash
cd D:/Rain6fish/KeelBase4J
git show -s --format='%H %ad' v0.1.17
curl -sS -o /dev/null -w '%{http_code}\n' \
  https://repo1.maven.org/maven2/cn/com/keelbase/keelbase4j-core/0.1.17/keelbase4j-core-0.1.17.pom
```

Expected: a commit hash and date, then `200`.

**(b) Pin.**

```bash
grep -n '0.1.17' D:/Rain6fish/KeelBase-Vue-Pro/yudao-server/pom.xml
```

**(c) The runtime identity — the one check that decides whether this is the released artifact at all.**

```bash
cd D:/Rain6fish/KeelBase-Vue-Pro
for a in core protocol springai; do
  unzip -p yudao-server/target/yudao-server.jar "BOOT-INF/lib/keelbase4j-$a-0.1.17.jar" > /tmp/rt-$a.jar
  echo -n "$a local    "; sha1sum /tmp/rt-$a.jar | cut -d' ' -f1
  echo -n "$a central  "; curl -sS \
    "https://repo1.maven.org/maven2/cn/com/keelbase/keelbase4j-$a/0.1.17/keelbase4j-$a-0.1.17.jar.sha1"; echo
done
```

All three pairs must be equal. If one is not, stop: the session would read a build, not the release.

> A **rebuilt** `keelbase4j-core/target/*.jar` is not byte-identical to Central's — JAR entry
> timestamps differ — while the classes are the same. Measured 2026-11-08: rebuild `0c3bff49…`,
> Central `f1a2d83f…`. Never identify the runtime by a local rebuild; identify it from the jar
> extracted out of the boot jar, which Maven took from the repository.

**(d) The gate.** It is `scripts/run-audit-two-cases-scenarios.mjs` (the blocked-call case and the
second-person approval case). It runs against a live host:

```bash
HOST_URL=http://127.0.0.1:<PORT> PG_CONTAINER=<pg> PG_DB=<db> \
  node scripts/run-audit-two-cases-scenarios.mjs
```

It prints its own counts and exits non-zero on any failure. The 2026-11-08 reading on an isolated
stack was `78 ok / 0 failed`; re-read it, do not quote it.

**(e) Contract.**

```bash
cd D:/Rain6fish/keelbase-contract
git log --oneline -1
git merge-base --is-ancestor v1.20.0 main && echo "v1.20.0 on main"
```

### 2.1 U1 — audit search by business object, range, and the six-answer export

It is task **U1** of the week of 2026-11-09: *audit search by business object + range + export the six
answers*. Depends on R3. Acceptance: object + range query works; CSV has six columns and zero internal
names. Stop condition: needs a new contract field ⇒ stop and propose. Due **2026-11-22**. The plan
marks it "starts, not finishes".

Read on **2026-11-08**, on the host read face (the surface the fifth reader used):

- the audit page filters by caller id, a start instant, and an error flag only —
  `keelbase-ui/host-overlay/src/views/keelbase/governance/AuditChainPage.vue:44-58`. There is no
  business-object filter, no end instant, and no export control;
- the read API under it takes `userId, since, isError, agentId, orgId, denied, limit, offset` and
  nothing object-shaped — `keelbase4j-core/src/main/java/cn/com/keelbase/runtime/web/AuditController.java:100-110`;
- the host console contains no export affordance at all.

A first slice exists **elsewhere**: in the TS main repository, branch `claude/elegant-dubinsky-15e9a5`
@ `a752634a` (26 files: admin console, `docs/audit-object-search.spec.md`, e2e under
`test/audit-six-answers.e2e-spec.ts`). It is **not merged to main and not released**, so it is not part
of the artifact this runbook reads.

### 2.2 U2 — the R4 second approver's UI entry

It is task **U2** of the same week: *R4 second-approver UI entry*. Depends on R3. Acceptance: approval
can be given in the UI; the row names the approver. Stop condition: needs a new endpoint ⇒ decision
package. Due **2026-11-22**. Also "starts".

Read on **2026-11-08**:

- the endpoint exists —
  `keelbase4j-core/src/main/java/cn/com/keelbase/runtime/web/ConfirmationController.java:127`
  (`POST /ai/confirmations/{token}/approve-by`), driven by the gate at
  `scripts/run-audit-two-cases-scenarios.mjs:327` and `:330`;
- the host console has **no** entry for it. Its two confirmation surfaces are the caller's own
  pending decisions (`/ai/my/confirmations/{token}/decide`) and a read-only window on the audit chain
  page. An audit reader who opens the page cannot approve there, and the API refuses the reader (403,
  asserted by the same gate).

### 2.3 What §2.1 and §2.2 mean for the session

If the session runs before U1 and U2 land on the artifact, clauses 1 and 3 of §1 cannot pass, and the
U2 half of the objective cannot pass either. Record them as **not available**, with the readings above
and the branch or file that carries the evidence. Do not build a manual substitute — a `curl` pipeline
that writes a CSV is the operator's own work, not the product's capability, and recording it as the
capability would be a false reading.

## 3. Reader eligibility and hosting

**The reader.** The sixth reader. Non-project, took no part in the implementation, does not write code
day to day. Someone who writes code daily, or the developer who built the feature, is a control run and
not evidence. Someone who has already read the M7 packs, the first reader's ledger entry, or §5 below
is recorded "retest after briefing", not a first read.

**The host.** Not a developer. The objective is stricter than the M7 protocol here: it asks for a host
from outside the project. If the host is a project member — as in the third M7 session — record it as a
protocol deviation in the record header, with what was and was not explained.

**The opening sentence, read aloud, adding nothing.** The Chinese wording used in the earlier sessions
is in the Chinese block below; an English-speaking reader is given the English one.

> We are not looking at code today — just this page. Write down what you see, against the questions on
> the paper. If you do not understand something, write "I do not understand"; that is exactly the
> result I want.

Then hand over the printed §5 and the account slip, and step back.

**Questions from the reader.** One answer only: "Write down what you see." Count every question; the
count is the original evidence for "needed a prompt". Do not point at a row, do not open it for them,
do not translate a term, do not say what the page is supposed to prove.

**Contamination.** If a developer is present and explains anything at all, the session is void as
evidence — even if the explanation was about something else. Record it and end the session.

**Verbatim only.** Quote what the reader wrote or said. Never paraphrase into their mouth, and never
fill a cell they left blank.

## 4. Environment and preflight

**The stack.** Reuse the M7 local-stack card (`M7-runbook-local-stack.md`, in the local handoff folder
outside this repository) for the start, stop and known-pitfall sections. Two of its rules are not
optional:

- the host binds loopback (`SERVER_ADDRESS=127.0.0.1`), so a LAN peer cannot reach the API;
- the model key is only needed if the session must produce a **new** AI write. If the rows come from
  the two-case gate (§2 d), no model key is needed.

Use container names, ports and a database name that belong to this session, so nothing collides with
another session on the same machine.

**Preflight — all green before the reader arrives.** It keeps the M7 card's checks and adds the ones
the six answers depend on.

| # | Check | Passing shape | Keep |
|---|---|---|---|
| 1 | login works | three fields (tenant name included) → lands on the home page | note |
| 2 | governance boundary page renders | entries + the withheld labels + the files-read line | screenshot |
| 3 | coverage card renders | its own gap count and registry version | screenshot |
| 4 | an **executed** row exists | its expansion says where the write landed | screenshot |
| 5 | a **blocked** row exists | its expansion answers the six (the object is named at the end of the row's sentence) | screenshot |
| 6 | a **second-approver** row exists | its expansion names the approver; the decision row reads 5/6 with the last cell blank — that is how the module answers a decision row, not a defect; write what it actually says | screenshot |
| 7 | a business object to locate exists | record its kind and key (for example a customer the session's own write touched) | note |
| 8 | the reader cannot write | the reader's `GET /ai/tool-effects` answers 200; `DELETE /ai/tool-effects/<id>` answers 403 | command + exit code |
| 9 | the reader's menu has no developer entry | only the governance entries the role is meant to have | screenshot |

If any of 4–6 is red, the corresponding clause cannot be read. Do not create the missing situation by
hand during the session; if the gate (§2 d) has to be run, run it **before** the reader arrives and say
so in the record.

## 5. The reader's four steps

The reader gets this section printed. Nothing else. Times are for the host's use, not to hurry the
reader.

### 5.1 Locate one operation by business object and range (5–10 min)

- Open the governance console, then the audit chain page.
- Find the operation for the object written on the paper (its kind and key), inside the date range
  written on the paper.
- Write down **how** you got there: a filter you typed, or a row you found by reading the columns.
- Write down the row number you settled on.

If the only field that accepts an identity is a number (a caller id), write "no search by business
object" and continue by reading the object column. That is a reading, not a failure of the reader.

### 5.2 Read the six answers (10–15 min)

- Open the row. It expands into six lines. Copy them word for word:
  **who · when (with its timezone) · which business object · what it became · who confirmed · the
  result**.
- These six are the product's own criterion, not house wording:
  `keelbase-ui/host-overlay/src/keelbase/sixQuestions.mjs:27`.
- For each line, also write one of three words: *business words*, *internal words* (a tool
  registration name, a table name, a source id), or *empty*.
- If a line says a fact was not recorded, quote it exactly — that is the first falsifier in §1.1.

### 5.3 Export a record someone else can check (5 min)

- Look for an export control on the page.
- If there is one: use it, then write the file name, the column headers, and the number of rows.
  Mark every cell that carries an internal word.
- If there is none: write "no export on this page", and list the controls you did check.
- Screenshots are **substitute evidence**, not an export. Label them that way in the record.

### 5.4 Cross-check who did what against a second entry (10 min)

- Open the second entry: the action center's expansion for the same write (it places the host's own
  business-log rows for the same object beside the action), or the host's own operation-log page.
- For that object id, write what each entry says about **who**, **what**, and **when**.
- Write whether the two agree, and where they do not.
- Write down any statement the page itself makes about how exact the correlation is. The action
  center labels the second entry as *related*, not linked: nothing writes a shared id, the business
  log's trace ids are empty, and the AI-caused row carries no user. That sentence is part of the
  reading.
- If the second entry is empty for the reader's role, say so and use the host's own operation-log page
  instead. If it refuses, quote the refusal. An empty list and a refusal are both readings.

### 5.5 Readings that must be taken on the spot

| Reading | How |
|---|---|
| session start and end | `date -Is` at both ends, both written down |
| which role the page session runs as | the account slip and the page's own role surface |
| every command run for the record | command + exit code, copied, not retyped |
| the six answers | screenshot of the expansion, plus the reader's own copy |
| the second entry | screenshot, plus whether it agreed |
| absence of a capability | screenshot of the controls that do exist, plus the file:line from §2 |

## 6. Coverage boundaries

The session reads what the page shows, on a stack that was not built for it. State these in the record;
they bound every sentence the record can make.

1. **The database is not reset.** Rows and accounts from earlier sessions are inside every count and
   every window (`M7-runbook-local-stack.md` §0 and §5). If a fresh database is used instead, record
   that as a deviation and state how many pre-existing rows it held.
2. **The runtime is the published artifact, not HEAD.** A defect fixed after the tag still shows here;
   a defect that exists only in HEAD is out of scope. This is the point of the recheck, and it is also
   its limit.
3. **Rows with `hash IS NULL` were never in a chain.** Neither `verify` nor the anchor can see them —
   `docs/hs11-audit-chain.spec.md` §5 and §6.3.
4. **The tail anchor reaches only up to `observedAt`.** A row deleted after that instant waits for the
   next anchor — same sections.
5. **The tail anchor covers `aiAudit` and `operationAudit` only.** The side-effect ledger is not
   covered by it — `docs/hs11-audit-chain.spec.md` §6.3, "Boundaries, restated".
6. **An anchor nobody outside compares proves nothing** — same section.
7. **The approver answer is bounded by the loaded window.** The page holds 20 rows
   (`keelbase-ui/host-overlay/src/views/keelbase/governance/AuditChainPage.vue:312`) and names the
   approver only when the decision row is inside them (`:665-670`). On an older page it falls back to
   "this row does not record who".
8. **This session reads the Java host console.** It says nothing about the TS admin console, which is a
   different surface with its own audit page.
9. **The chain proves internal continuity, not "append-only".** That word belongs to a preservation
   layer this repository does not build — `docs/hs11-audit-chain.spec.md` §5.

## 7. Record template

One session, one record. Archive it with the private reader notes, under
`notes/审计读者/` (same rule as the M7 sessions). Fill every line; a blank is a blank, not a pass.

```
Sixth-reader recheck — session record
- date / start–end (date -Is, both) / duration:
- reader code / role / writes code (daily / once / never):
- relation to the team (external / same team, non-technical / developer):
- has read the M7 packs, the ledger entry, or this runbook: yes / no   (yes => retest, not first read)
- a developer was present and explained: yes / no   (yes => session void as evidence)
- host name / role (must not be a developer; if a project member, say so):

Artifact under test
- host checkout commit:
- boot jar path / sha256:
- runtime jars (core / protocol / springai) sha1 = Central sha1: yes / no, with the three pairs:
- database name / was it reset: yes / no
- reader account / role / tenant:

Prerequisites (§2), each with its reading
- a 4J tag + Central pom:
- b pin:
- c runtime identity:
- d gate: in main (file:line) / in CI (workflow job) / last run id:
- e contract main + ancestry:
- f U1: available / not available — evidence:
- g U2: available / not available — evidence:

Step readings
- 5.1 located by: filter / scanning; object kind + key; row id; was a business-object search offered:
- 5.2 six answers (verbatim, six lines):
       who / when / object / change / confirmation / result
      each marked: business words / internal words / empty
- 5.3 export: file name / headers / rows / internal names found; or "not available", controls checked:
- 5.4 second entry: which one; who / what / when on each; agree / disagree; the page's own caveat:
- prompts given (count):
- 5.5 readings: commands + exit codes; screenshot file names:

Verdict (§8)
- clause 1 locate by object + range: met / not met / not testable (reason)
- clause 2 six answers: met / not met / not testable (reason)
- clause 3 export: met / not met / not testable (reason)
- clause 4 cross-check: met / not met / not testable (reason)
- U2 half (UI entry that names the approver): met / not met (reason)
- any falsifier of §1.1 reproduced: yes (which) / no
- objective met: yes / no
- boundaries observed (§6): list the ones that actually bound this session

Evidence
- folder:
- files: screenshots / gate log / reader's paper
```

## 8. Verdict rules

- The objective has two halves: the reader's four clauses, and the U2 UI entry. Each half is judged on
  its own.
- Four clauses, four verdicts. Never average them, never let one carry another.
- **Met** means the reader did it unaided. A prompt, a point, or a clicked row is a failure for that
  clause.
- **Not available** is *not met*. It is not "not testable". "Not testable" is reserved for a session
  that could not run at all, with the reason written.
- Any falsifier of §1.1 reproduced ⇒ the objective is **not met**, whatever the other readings say.
- The objective is met only when all four clauses are met in one session, by one qualified reader,
  with no developer explanation, **and** the U2 half is met.
- A capability that lands after the session does not retroactively pass it. Run it again.

## 9. Not in scope

This runbook does not merge U1 or U2, does not change CI, does not fix anything the session finds, and
does not re-run gates for the record's benefit. Findings go to the handoff report and the ledger; the
fixes go through their own claim.

## 10. Sources

| Fact in this file | Source |
|---|---|
| objective, falsifiers, U1/U2 shape | `KeelBase-Private/KeelBase4TS/KeelBase-下阶段规划与开发计划_2026-10-17.md`, "2026-11-07 周会修订" |
| U1/U2 ids, dependency, due, "starts, not finishes" | `KeelBase-Private/notes/CTO每周例会/2026-11-07-下周开发计划.md` |
| reader qualification, opening sentence, prompt rule, contamination | M7 second-reader pack (`M7-second-reader-20261024.md`), §2, §4, §7 |
| how sessions were actually run, and the deviations | the second-, third- and fourth-reader session records and the fifth reader's achievement note (`M7-场次记录-2026-10-25-第二位读者.md`, `M7-场次记录-2026-10-26-第三位读者.md`, `M7-第四位读者执行包_20261031.md`, plan file above) |
| stack start/stop, known pitfalls, preflight | `M7-runbook-local-stack.md`, §1–§6 |
| boundaries: not reset, runtime not HEAD | the same card §0/§5; the plan's M7 status line |
| `hash IS NULL`, `observedAt`, chain coverage, "an anchor nobody compares" | `docs/hs11-audit-chain.spec.md` §5 and §6.3 |
| six answers' keys | `keelbase-ui/host-overlay/src/keelbase/sixQuestions.mjs:27` |
| audit filters and API parameters | `AuditChainPage.vue:44-58`, `AuditController.java:100-110` |
| approver window | `AuditChainPage.vue:312`, `:665-670` |
| U1 first slice | branch `claude/elegant-dubinsky-15e9a5` @ `a752634a` in the TS main repository |
| second-approver endpoint | `ConfirmationController.java:127`; gate `run-audit-two-cases-scenarios.mjs:327,330` |
| gate discovery and CI job | `scripts/run-all-scenarios.sh:131`, `.github/workflows/real-stack.yml` |
| runtime identity method | `real-stack.yml`, "The jar must be executable, on the pinned runtime" (extracts `BOOT-INF/lib/keelbase4j-*`) |

---

# 中文 — 已发布产物上的第六位读者复验

> **状态（2026-11-08）：这是一份规程，不是读数。** 本文一条都没跑过。它是对着 `KeelBase` main
> `32e0d3da`、以及 §2 描述的那份产物写的。证据永远是一场的记录（§7），不是这个文件。
> **射程。** 它不改产品码、不改 CI、不改任何其它文件，也不合并任何东西。

**谁读哪节。**

| 角色 | 章节 | 用时 |
|---|---|---|
| 准备栈的运维方 | §2、§4、§7 | 30–60 分钟 |
| 主持人（不得是开发） | §3、§5、§7 | 15 分钟 |
| 第六位读者 | 只看打印出来的 §5 | 30–45 分钟 |
| 判分的人 | §1、§6、§8 | 10 分钟 |

## 1. 什么算通过

4–6 周的主目标是**已发布产物上的证明**：在**已发布**的产物上做一次 M7 式解读，由项目之外的人主持，读者能
**按业务对象**定位操作、并导出可核对记录；且 R4 的第二批准人有 UI 入口。

出处：`KeelBase-Private/KeelBase4TS/KeelBase-下阶段规划与开发计划_2026-10-17.md`，
「2026-11-07 周会修订」→「唯一主目标（4–6 周）：已发布产物上的治理可读与可追溯」。

只有当一个**没有参与实现**的读者，在**没有任何提示**的情况下做完下面四件事，这一场才算通过：

1. 用**业务对象 + 日期区间**定位到一条操作——不是用数字调用方 id；
2. 读出那一行的六问；
3. 导出别人能核对的记录；
4. 拿另一个入口交叉核对「谁做了什么」。

四条各自判（§8）。能力不存在就是**不成立**，不能写成「无法测」。这一场仍然把它读到的每一项都记下来。

### 1.1 反例

计划件点名了反例；这里只把它们变成「看哪里」。

| 反例 | 会出现在哪 | 在哪读 |
|---|---|---|
| 已发布产物仍答 `not recorded` / `does not record who` | 已执行 / 被拦 / 已批准那一行的六问展开 | §5.2 |
| 检索仍只能填数字调用方 id | 审计页的筛选行、读接口的参数 | §5.1 |
| 门禁不在 CI 里 | `.github/workflows/real-stack.yml`、`scripts/run-all-scenarios.sh` | §2（d） |

三条都不是凭记忆写的。开场当天各自重测一次，读数进 §7。

## 2. 前置

下表每一条都必须在**开场当天**为真。不为真的，就在记录里写「不可用」——不假设，也不在开场过程中顺手修好。

| # | 项 | 怎么查 | 通过的样子 | 2026-11-08 读数 |
|---|---|---|---|---|
| a | 4J `0.1.17` 已发布 | tag + Central | tag 可解析；pom 答 200 | tag `v0.1.17` → `2189212a5ac773cd31cdefe0e93d9518593786c0`（该提交日期 2026-11-06 20:28 +08）；pom 200 |
| b | 宿主钉在 `0.1.17` | `yudao-server/pom.xml` | 两条 keelbase4j 依赖都是 `0.1.17` | 第 39、55 行 |
| c | jar 里装的是**已发布**运行时 | boot jar 内 sha1 = Central sha1 | 三对全等 | core `f1a2d83f…`、protocol `4f1f7fc4…`、springai `9e867533…`——全等 |
| d | 两档门禁在 main **且**在 CI | 发现清单 + workflow | 被列出且被执行 | `scripts/run-all-scenarios.sh:131`；`real-stack.yml` 的作业「Every real-stack scenario gate passes against a running host」，push / PR 到 main 时跑 |
| e | 契约 `v1.20.0+` 在契约 main | 祖先判定 | 是祖先 | 契约 main `98cb8a4`；`v1.20.0` 与 `v1.22.0` 都是祖先 |
| f | U1——见 §2.1 | 宿主读面 + 分支 | — | **宿主读面上不可用** |
| g | U2——见 §2.2 | 宿主控制台 | — | **只有接口，没有 UI 入口** |

**（a）发布与 tag。**

```bash
cd D:/Rain6fish/KeelBase4J
git show -s --format='%H %ad' v0.1.17
curl -sS -o /dev/null -w '%{http_code}\n' \
  https://repo1.maven.org/maven2/cn/com/keelbase/keelbase4j-core/0.1.17/keelbase4j-core-0.1.17.pom
```

期望：一个提交哈希与日期，然后 `200`。

**（b）pin。**

```bash
grep -n '0.1.17' D:/Rain6fish/KeelBase-Vue-Pro/yudao-server/pom.xml
```

**（c）运行时身份——决定「这到底是不是已发布产物」的那一条。**

```bash
cd D:/Rain6fish/KeelBase-Vue-Pro
for a in core protocol springai; do
  unzip -p yudao-server/target/yudao-server.jar "BOOT-INF/lib/keelbase4j-$a-0.1.17.jar" > /tmp/rt-$a.jar
  echo -n "$a local    "; sha1sum /tmp/rt-$a.jar | cut -d' ' -f1
  echo -n "$a central  "; curl -sS \
    "https://repo1.maven.org/maven2/cn/com/keelbase/keelbase4j-$a/0.1.17/keelbase4j-$a-0.1.17.jar.sha1"; echo
done
```

三对必须全等。有一对不等就停：这一场读的会是某次构建，不是发布件。

> **本机重建**的 `keelbase4j-core/target/*.jar` 与 Central 的**不是逐字节相同**——JAR 条目时间戳不同——
> 而里面的类是一样的。2026-11-08 实测：重建 `0c3bff49…`，Central `f1a2d83f…`。别拿本地重建认运行时；
> 认从 boot jar 里解出来的那一个——它是 Maven 从仓库取来的。

**（d）门禁。** 就是 `scripts/run-audit-two-cases-scenarios.mjs`（被拦下的一档 + 第二人批准的一档）。
对着活宿主跑：

```bash
HOST_URL=http://127.0.0.1:<PORT> PG_CONTAINER=<pg> PG_DB=<db> \
  node scripts/run-audit-two-cases-scenarios.mjs
```

它自己打印计数，任何一条不过就非零退出。2026-11-08 在隔离栈上的读数是 `78 ok / 0 failed`；当天重读，
不要照抄。

**（e）契约。**

```bash
cd D:/Rain6fish/keelbase-contract
git log --oneline -1
git merge-base --is-ancestor v1.20.0 main && echo "v1.20.0 on main"
```

### 2.1 U1——审计按业务对象 + 区间检索，并导出六问

它是 2026-11-09 那一周的 **U1**：*审计按业务对象 + 区间检索并导出六问*。依赖 R3。验收：对象 + 区间可查；
CSV 六列、0 内部名。停止条件：需新契约字段 ⇒ 停并提案。截止 **2026-11-22**。计划件写的是「启动，不完成」。

**2026-11-08** 在宿主读面（第五位读者用的那个面）上的读数：

- 审计页只按调用方 id、一个起始时刻、一个错误标记筛选——
  `keelbase-ui/host-overlay/src/views/keelbase/governance/AuditChainPage.vue:44-58`。没有业务对象筛选、
  没有结束时刻、没有导出控件；
- 它下面的读接口只收 `userId, since, isError, agentId, orgId, denied, limit, offset`，没有任何对象维度的参数——
  `keelbase4j-core/src/main/java/cn/com/keelbase/runtime/web/AuditController.java:100-110`；
- 宿主控制台里没有任何导出入口。

第一片在**别处**：TS 主仓分支 `claude/elegant-dubinsky-15e9a5` @ `a752634a`（26 个文件：管理台、
`docs/audit-object-search.spec.md`、`test/audit-six-answers.e2e-spec.ts`）。它**未合 main、未发布**，
因此不属于本规程所读的那份产物。

### 2.2 U2——R4 第二批准人的 UI 入口

它是同一周的 **U2**：*R4 第二批准人 UI 入口*。依赖 R3。验收：UI 可批准；行读得到批准人。停止条件：
需新端点 ⇒ 决策包。截止 **2026-11-22**。同样是「启动」。

**2026-11-08** 读数：

- 接口有——
  `keelbase4j-core/src/main/java/cn/com/keelbase/runtime/web/ConfirmationController.java:127`
  （`POST /ai/confirmations/{token}/approve-by`），门禁在 `scripts/run-audit-two-cases-scenarios.mjs:327`
  与 `:330` 驱动它；
- 宿主控制台**没有**它的入口。控制台只有两处确认面：调用方本人的待决裁决
  （`/ai/my/confirmations/{token}/decide`），以及审计链页上一个只读的窗口。审计读者在页上批准不了，
  接口也拒读者（403，同一道门禁断言过）。

### 2.3 §2.1 与 §2.2 对这场意味着什么

如果这一场在 U1 / U2 落到产物之前跑，§1 的第 1、3 条不可能通过，主目标的 U2 那一半也通不过。
记录里写**不可用**，附上面的读数与承载它的分支或文件。**不要自己搭一个替身**——用 `curl` 拼出一份 CSV 是运维自己的活，
不是产品能力；把它记成能力就是假读数。

## 3. 读者资格与主持

**读者。** 第六位。非项目方，没有参与实现，日常不写代码。日常写代码的人、或做这个功能的开发本人，
那是对照场，不算证词。已经读过 M7 各包、第一位读者的台账条目、或本文 §5 的人，记「受训后复测」，
不算首读。

**主持人。** 不得是开发。主目标在这条上比 M7 协议更严：它要求主持人来自项目之外。若主持人是项目成员
（如 M7 第三场），在记录头里记下这条协议偏差，并写明解释了什么、没有解释什么。

**开场那句话，照读，一个字不加。** 英文版在英文块里；中文读者用下面这句：

> 「今天不看代码，就看看这一页，按纸上的问题写下你的想法。不懂就写『不懂』，这本身就是我要的结果。」

然后把打印的 §5 与账号纸条递过去，退开。

**读者提问。** 只回一句：「先按你看到的写下来。」每问一次记一次；这个次数就是「需要提示」的原始证据。
不指行、不替他展开、不翻译术语、不告诉他这一页想证明什么。

**污染。** 开发在场并解释了任何内容，这一场就作废、不能作证——哪怕解释的是别的事。记下来，结束。

**只写原话。** 读者写什么就抄什么。不要把话塞进他嘴里，也不要替他填空着的格子。

## 4. 环境与预检

**栈。** 起、停与已知坑沿用 M7 本机栈卡（`M7-runbook-local-stack.md`，在仓外的本机 `handoff/` 目录）。
其中两条不是可选项：

- 宿主只绑回环（`SERVER_ADDRESS=127.0.0.1`），同网段打不到 API；
- 只有当这一场需要**新造**一次 AI 写时才要模型密钥。若行来自两档门禁（§2 d），不需要密钥。

容器名、端口、库名都用本场自己的，别和本机别的会话撞。

**预检——读者到场前全绿。** 保留 M7 栈卡的那几项，补上六问现在依赖的几项。

| # | 查什么 | 通过的样子 | 留什么 |
|---|---|---|---|
| 1 | 能登录 | 三栏（含租户名）→ 落到首页 | 记 |
| 2 | 治理边界页渲染 | 条目表 + 扣留标签 + 「读了 … 个文件」 | 截图 |
| 3 | 覆盖卡渲染 | 它自己的缺口数 + 登记表版本 | 截图 |
| 4 | 至少一行**已执行** | 展开里写明这次写落在哪条记录 | 截图 |
| 5 | 至少一行**被拦** | 展开能答六问（对象写在那行句末） | 截图 |
| 6 | 至少一行**第二人批准** | 展开里点得出批准人；裁决行是 5/6、末格空——裁决行本来就答成这样，不是缺陷；按它实际写的记 | 截图 |
| 7 | 有可定位的业务对象 | 记下种类与主键（例如本场自己那次写碰到的客户） | 记 |
| 8 | 读者写不了 | 读者的 `GET /ai/tool-effects` 200；`DELETE /ai/tool-effects/<id>` 403 | 命令 + 退出码 |
| 9 | 读者的菜单里没有开发入口 | 只有这个角色本该有的治理项 | 截图 |

第 4–6 项有红，对应条款就读不出来。**不要**在开场过程中手工补造缺失的情形；要跑门禁（§2 d）就在读者到场
**之前**跑，并在记录里写明。

## 5. 读者的四步

读者只拿这一节打印稿。别的都不给。括号里的时间是给主持人掌握节奏的，不是催读者。

### 5.1 按业务对象 + 区间定位一条操作（5–10 分钟）

- 打开治理控制台，再打开审计链页。
- 找到纸上写的那个对象（种类 + 主键）、在纸上写的日期区间里的那次操作。
- 记下**你是怎么找到的**：填了哪个筛选，还是读着各列一行行找出来的。
- 记下你最后停在哪一行。

如果唯一能填身份的字段是个数字（调用方 id），就写「没有按业务对象检索」，然后继续读「对象」列。
这是一条读数，不是读者的失败。

### 5.2 读六问（10–15 分钟）

- 展开这一行。它会展开成六行。逐字抄下来：
  **谁 · 何时（带时区）· 哪个业务对象 · 改成什么 · 谁确认 · 结果**。
- 这六问是产品自己的判据，不是本文另立的措辞：
  `keelbase-ui/host-overlay/src/keelbase/sixQuestions.mjs:27`。
- 每一行再标一个词：*业务词*、*内部词*（工具注册名、表名、来源 id）、或*空*。
- 哪一行说某件事没记下来，就原样抄下那句——那就是 §1.1 的第一个反例。

### 5.3 导出一份别人能核对的记录（5 分钟）

- 在页上找导出控件。
- 有：用它，然后记文件名、列头、行数；把带内部词的格子标出来。
- 没有：写「本页没有导出」，并列出你确实查过的控件。
- 截图是**替身证据**，不是导出。在记录里就这么标。

### 5.4 拿另一个入口交叉核对「谁做了什么」（10 分钟）

- 打开第二个入口：行动中心里同一次写的展开（它把宿主自己那张业务日志里同一对象的行摆在动作旁边），
  或者宿主自己的操作日志页。
- 对同一个对象 id，写两边各自说的**谁**、**做了什么**、**何时**。
- 写两边是否一致，哪里不一致。
- 把页面自己关于「这条关联有多准」的话记下来。行动中心把第二行标成**相关**、不是链接：没有任何东西写
  共享 id，那张日志里每个 trace id 都是空的，而 AI 引起的那行根本不带用户。这句话本身也是读数。
- 第二个入口对读者的角色是空的，就写「空」，改用宿主自己的操作日志页。被拒就原样抄下拒绝。
  空与拒都是读数。

### 5.5 必须现场取下的读数

| 读数 | 怎么取 |
|---|---|
| 开场与收场的时刻 | 两头各跑一次 `date -Is`，都写下来 |
| 这个页面会话是什么角色 | 账号纸条 + 页面自己的角色显示 |
| 为记录跑的每条命令 | 命令 + 退出码，复制，不要重敲 |
| 六问 | 展开的截图 + 读者自己抄的那份 |
| 第二入口 | 截图 + 是否一致 |
| 某项能力不存在 | 现有控件的截图 + §2 里的 `文件:行` |

## 6. 覆盖边界

这一场读的是页面在**别人搭的栈上**显示的东西。把这些写进记录；它们限定记录能说的每一句话。

1. **库未重置。** 先前会话留下的行与账号都在每一个计数、每一个窗口里（`M7-runbook-local-stack.md`
   §0 与 §5）。若改用新库，记为偏差，并写明它原有几行。
2. **运行的是已发布产物，不是 HEAD。** tag 之后修好的缺陷在这里仍然看得见；只存在于 HEAD 的缺陷不在
   射程内。这既是复验的意义，也是它的限度。
3. **`hash IS NULL` 的行从未入链。** `verify` 与锚都看不见它们——`docs/hs11-audit-chain.spec.md` §5 与 §6.3。
4. **链尾锚只到 `observedAt`。** 那一刻之后被删的行要等下一次锚——同两节。
5. **链尾锚只覆盖 `aiAudit` 与 `operationAudit`。** 副作用台账不在内——
   `docs/hs11-audit-chain.spec.md` §6.3「边界重述」。
6. **没人从域外对照的锚什么也证明不了**——同节。
7. **批准人那一答受已载入窗口限制。** 这页只载入 20 行
   （`keelbase-ui/host-overlay/src/views/keelbase/governance/AuditChainPage.vue:312`），裁决行落在其中才点得出
   批准人（`:665-670`）。翻到更旧的一页会回落成「这一行没有记下」。
8. **本场读的是 Java 宿主控制台。** 它对 TS 管理台什么也没说——那是另一个面，有自己的审计页。
9. **链证明的是内部连续性，不是「只能追加」。** 那个词属于本仓不做的保全层——
   `docs/hs11-audit-chain.spec.md` §5。

## 7. 记录模板

一场一份记录。与私库的读者笔记一起归档，放在 `notes/审计读者/`（与 M7 各场同一条规矩）。每一行都填；
空着就是空着，不是通过。

```
第六位读者复验 —— 场次记录
- 日期 / 起止（两头 date -Is）/ 用时：
- 读者代号 / 岗位 / 是否写代码（日常 / 曾经 / 从不）：
- 与团队关系（外部 / 同团队非技术 / 开发本人）：
- 是否读过 M7 各包、台账条目或本规程：是 / 否   （是 ⇒ 受训后复测，不算首读）
- 开发是否在场并解释：是 / 否   （是 ⇒ 本场作废、不作证据）
- 主持人姓名 / 岗位（不得是开发；若是项目成员，写明）：

受测产物
- 宿主检出提交：
- boot jar 路径 / sha256：
- 运行时 jar（core / protocol / springai）sha1 与 Central sha1 相等：是 / 否，三对读数：
- 库名 / 是否重置：是 / 否
- 读者账号 / 角色 / 租户：

前置（§2），每项带读数
- a 4J tag + Central pom：
- b pin：
- c 运行时身份：
- d 门禁：在 main（文件:行）/ 在 CI（workflow 作业）/ 最近一次 run id：
- e 契约 main 与祖先判定：
- f U1：可用 / 不可用——依据：
- g U2：可用 / 不可用——依据：

步骤读数
- 5.1 定位方式：筛选 / 读列；对象种类 + 主键；行 id；是否提供了按业务对象检索：
- 5.2 六问（逐字，六行）：
       谁 / 何时 / 对象 / 改成什么 / 谁确认 / 结果
       每行标注：业务词 / 内部词 / 空
- 5.3 导出：文件名 / 列头 / 行数 / 发现的内部名；或「不可用」+ 查过的控件：
- 5.4 第二入口：用的是哪一个；两侧的谁 / 做了什么 / 何时；一致 / 不一致；页面自己的限度声明：
- 给的提示次数：
- 5.5 读数：命令 + 退出码；截图文件名：

判定（§8）
- 第 1 条 按对象 + 区间定位：成立 / 不成立 / 无法测（原因）
- 第 2 条 六问：成立 / 不成立 / 无法测（原因）
- 第 3 条 导出：成立 / 不成立 / 无法测（原因）
- 第 4 条 交叉核对：成立 / 不成立 / 无法测（原因）
- U2 那一半（能点出批准人的 UI 入口）：成立 / 不成立（原因）
- §1.1 的反例是否重现：是（哪一个）/ 否
- 主目标是否达成：是 / 否
- 实际约束本场的边界（§6）：列出

证据
- 目录：
- 文件：截图 / 门禁日志 / 读者的纸
```

## 8. 判定规则

- 主目标有两半：读者的四条，与 U2 的 UI 入口。两半各自判。
- 四条、四个判定。不许平均，不许互相顶替。
- **成立**指读者无人提示地做出来了。一次提示、一次指路、一次替他点开，这条就不成立。
- **不可用**就是**不成立**，不是「无法测」。「无法测」只留给整场根本跑不起来的情形，并写明原因。
- §1.1 的任何反例重现 ⇒ 主目标**不成立**，别管其它读数多好。
- 只有四条在同一场、同一位合格读者、且全程没有开发者解释的情况下全部成立，**并且** U2 那一半也成立，
  主目标才算达成。
- 场次之后才落地的能力，不能倒过来让这一场通过。要再跑一场。

## 9. 不做

本规程不合并 U1 或 U2，不改 CI，不修这一场发现的问题，也不为记录好看去重跑门禁。发现进交接报告与台账；
修复走它自己的认领。

## 10. 出处

| 本文里的事实 | 出处 |
|---|---|
| 主目标、反例、U1/U2 的形态 | `KeelBase-Private/KeelBase4TS/KeelBase-下阶段规划与开发计划_2026-10-17.md`「2026-11-07 周会修订」 |
| U1/U2 编号、依赖、截止、「启动，不完成」 | `KeelBase-Private/notes/CTO每周例会/2026-11-07-下周开发计划.md` |
| 读者资格、开场话、提示规则、污染 | M7 第二读者启动包（`M7-second-reader-20261024.md`）§2、§4、§7 |
| 场次实际怎么跑的、有哪些偏差 | 第二、三、四位读者的场次记录与第五位读者的达成记录（`M7-场次记录-2026-10-25-第二位读者.md`、`M7-场次记录-2026-10-26-第三位读者.md`、`M7-第四位读者执行包_20261031.md`、上面那份计划件） |
| 起栈 / 停栈、已知坑、六项预检 | `M7-runbook-local-stack.md` §1–§6 |
| 边界：库未重置、运行时不是 HEAD | 同一张卡 §0/§5；计划件的 M7 状态行 |
| `hash IS NULL`、`observedAt`、链的覆盖、「没人对照的锚」 | `docs/hs11-audit-chain.spec.md` §5 与 §6.3 |
| 六问的键 | `keelbase-ui/host-overlay/src/keelbase/sixQuestions.mjs:27` |
| 审计筛选与接口参数 | `AuditChainPage.vue:44-58`、`AuditController.java:100-110` |
| 批准人窗口 | `AuditChainPage.vue:665-670` |
| U1 第一片 | TS 主仓分支 `claude/elegant-dubinsky-15e9a5` @ `a752634a` |
| 第二批准接口 | `ConfirmationController.java:127`；门禁 `run-audit-two-cases-scenarios.mjs:327,330` |
| 门禁发现与 CI 作业 | `scripts/run-all-scenarios.sh:131`、`.github/workflows/real-stack.yml` |
| 运行时身份的取法 | `real-stack.yml` 的「The jar must be executable, on the pinned runtime」（解 `BOOT-INF/lib/keelbase4j-*`） |
