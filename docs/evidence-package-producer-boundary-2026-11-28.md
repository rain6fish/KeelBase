<!-- SPDX-License-Identifier: Apache-2.0 -->

# Java host evidence-package boundary — DECIDED
# Java 宿主的证据包边界 —— 已决定

> **Status: decided by the AI on 2026-11-28 under weekly-plan item Q11 (boundary form).** No
> implementation, contract change or schema change is part of this decision. The decision is one of
> the two forms Q11 allows: a written boundary, not "implement".
>
> **状态：2026-11-28 由 AI 按周计划 Q11 作出（边界形式）。** 本决定不含实现、不改契约、不改
> schema。Q11 只允许两种形态，这里选的是**写明边界**，不是「实现」。

---

## 0. The decision / 决定

English:

**The Java host is not required to emit evidence packages or evidence roots of any format
(`/1`–`/6`).** The TypeScript governance console is the single producer of evidence packages for
both a TypeScript-hosted and a Java-hosted deployment. `KeelBase4J` declares itself a **non-producer**
and keeps only its chain reads (`GET /audit/verify`, `GET /audit/coverage`).

This is not "Java stops at `/4`". Java never produced a generation of the evidence package: there is
no producer in its source, and the `/4` that appears in the vendored scenario corpus is a corpus
expectation (see §2). Any sentence that puts Java "at" a format level is wrong even when the level
is `/4`, because it implies a producer that does not exist.

Scope boundary, in normative terms:

1. `KeelBase4J` — and any host embedding it — must not advertise, export or sign an evidence package
   or evidence root in any format.
2. Outward text must say: the Java runtime serves `/audit/verify` and `/audit/coverage`; evidence
   packages and roots are obtained from the TypeScript governance console. It must not say Java
   "supports", "emits", "is at" or "lags behind on" the package format.
3. TypeScript-side claims are constrained: no claim that Java produces the same evidence package or
   root, and no claim of "TS/Java dual-implementation consistency" for evidence packages. This is
   the evidence-layer blocker already ruled on 2026-11-28 (`2026-11-28.md` §六, ruling ⑥).
4. The `evidence_root` scenario stays recorded as unservable in the 4J replay. It must not be
   silently dropped, nor its expectation rewritten to `/5` / `/6`: either edit would turn a missing
   producer into an apparent pass.
5. Consuming the v7 schemas stays allowed. The vendored snapshot in `conformance/vectors/` is a
   read-only copy used to validate what the runtime does serve; consumption is not production.
6. Reopen condition: if host delivery ever requires signed evidence packages from the Java side, that
   is a new product decision item, not a defect in this boundary. Its cost is not just an endpoint:
   `/6` also needs a target-status lookup store the Java runtime does not have today (§2.5).

中文：

**Java 宿主不必产出任何格式（`/1`–`/6`）的证据包或证据根。** TypeScript 治理控制台是唯一生产者：
无论部署宿主是 TypeScript 还是 Java，证据包都由它产出。`KeelBase4J` 自述为**非生产者**，只保留
自己的链读面（`GET /audit/verify`、`GET /audit/coverage`）。

这不是「Java 停在 `/4`」。Java 从未产出过任何一代证据包：源码里没有生产者，而 vendored 场景语料
里出现的 `/4` 是语料的期望值（见 §2）。任何把 Java 写成「位于某一代」的句子都是错的 —— 即便那一代
写的是 `/4`，因为它暗示了一个并不存在的生产者。

范围边界（规范表述）：

1. `KeelBase4J` 及任何内嵌它的宿主，不得对外宣称、导出或签署任何格式的证据包或证据根。
2. 对外文字只能写：Java 运行时提供 `/audit/verify` 与 `/audit/coverage`；证据包与证据根取自
   TypeScript 治理控制台。不得写 Java「支持」「产出」「位于」或「落后于」某一代包格式。
3. TS 侧主张受约束：不得声称 Java 产出同样的证据包或证据根，不得作「TS/Java 双实现一致」的
   证据包级声明。这正是 2026-11-28 已裁的证据层阻断（`2026-11-28.md` §六 裁决⑥）。
4. 4J 重放中的 `evidence_root` 场景保持记为不可服务。不得悄悄删掉，也不得把它的期望改写成
   `/5` `/6`：两种改法都会把「没有生产者」变成「看起来通过」。
5. 消费 v7 schema 仍然允许。`conformance/vectors/` 的 vendored 快照是只读副本，用来校验运行时真正
   提供的东西；消费不等于生产。
6. 重开条件：若将来宿主交付确实要求 Java 侧给出签名的证据包，那是新的产品决策项，不是本边界里的
   缺陷。它的成本不止一个端点：`/6` 还需要一个 Java 运行时今天没有的目标状态读数存储（§2.5）。

---

## 1. What `/5` and `/6` actually add / 两代实际加了什么

English:

Contract `v1.24.0` (2026-11-27) adds two formats to the evidence package under `schemas/v7/`
(`keelbase-contract/CHANGELOG.md:8-26`):

| Format | Base shape | Required addition | In the signed canonical |
|---|---|---|---|
| `keelbase-audit-evidence/5` | `/2` (report + compliance + chain + signature) | `releaseReadings` — one entry per `claim_release` chain row, carrying the copied `releaseLookups` readings | yes |
| `keelbase-audit-evidence/6` | `/4` (evidence root: action / authorization / decision / effect / chains / root / coverage) | `targetStatusReadings` — the recorded target-status asks for this action's write key (`null` = lookup store unavailable) | yes |

Evidence in the schema (`schemas/v7/evidence-package.schema.json`):

- `/5` `required` includes `releaseReadings` at lines 126–135; the format const is at lines 145–146;
  the section is defined at lines 204–209; entry shapes `releaseReadingEntry` / `releaseReading` are
  at lines 1133–1233.
- `/6` `required` includes `targetStatusReadings` at lines 608–621; the format const is at lines
  631–632; the section is at lines 804–811; the item shape `targetStatusReading`
  (`{id, at, conclusion, reason, basis, lookedUpBy}`, `basis` ∈ `current_state|receipt|unknown`) is at
  lines 1236–1258.
- Both sections are inside the package canonical, so changing a reading kind breaks the signature
  (schema description line 5; `docs/evidence-root.spec.md:90-98`).
- The format namespace is shared with the evidence root, where `/3` and `/4` were already taken;
  that is why the package is `/5` and the root is `/6` (`CHANGELOG.md:14`). The `/1`–`/4` branches
  and bytes are unchanged.

The TypeScript implementation emits both: `/5` from the action-report export
(`Server-NestJS/src/governance-shared/services/audit-evidence.service.ts:730`) and `/6` from the
evidence-root export (`.../audit-evidence.service.ts:1017`).

中文：

契约 `v1.24.0`（2026-11-27）在 `schemas/v7/` 下给证据包加了两代
（`keelbase-contract/CHANGELOG.md:8-26`）：

| 格式 | 基础形状 | 新增必填段 | 是否入签 |
|---|---|---|---|
| `keelbase-audit-evidence/5` | `/2`（report + compliance + chain + signature） | `releaseReadings` —— 链上每条 `claim_release` 行一条，携带 `releaseLookups` 读数拷贝 | 是 |
| `keelbase-audit-evidence/6` | `/4`（证据根：action / authorization / decision / effect / chains / root / coverage） | `targetStatusReadings` —— 该动作写键上已记录的目标状态询问（`null` = 查询存储不可用） | 是 |

schema 里的位置（`schemas/v7/evidence-package.schema.json`）：

- `/5` 的 `required` 含 `releaseReadings`（126–135 行）；format 常量在 145–146 行；段定义在
  204–209 行；条目形状 `releaseReadingEntry` / `releaseReading` 在 1133–1233 行。
- `/6` 的 `required` 含 `targetStatusReadings`（608–621 行）；format 常量在 631–632 行；段在
  804–811 行；条目形状 `targetStatusReading`（`{id, at, conclusion, reason, basis, lookedUpBy}`，
  `basis` ∈ `current_state|receipt|unknown`）在 1236–1258 行。
- 两段都在整包 canonical 里，故改一个读数种类即破签（schema 描述第 5 行；
  `docs/evidence-root.spec.md:90-98`）。
- 格式号与证据根共用，而 `/3` `/4` 已被占用，故包是 `/5`、根是 `/6`（`CHANGELOG.md:14`）。
  `/1`–`/4` 分支与字节不变。

TypeScript 实现两代都产：`/5` 出自 Action Report 导出
（`Server-NestJS/src/governance-shared/services/audit-evidence.service.ts:730`），`/6` 出自证据根导出
（同文件 `:1017`）。

---

## 2. The Java side today / Java 侧现状

English:

1. **No producer exists.** `grep -rn 'keelbase-audit-evidence' --include=*.java KeelBase4J` returns
   zero hits in `src/main` and `src/test`; the only Java-side mention of `evidence-package` is a
   comment in `ScenarioReplayTest.java:93` describing the corpus read. The weekly meeting's own
   reading agrees: "no producer (test references only)" (`2026-11-28.md` §三 item 18).
2. **The boundary is already stated outward.** `KeelBase4J/README.md:212-219` — "Not an
   evidence-package exporter. … It does not export an evidence package or an evidence root: there is
   no such endpoint here, and none is planned on this line. Under a Java host deployment, evidence
   packages are obtained from the TypeScript governance console." The Chinese edition says the same
   at `README.zh-CN.md:170`. This note turns that prose into a decided boundary with violation
   criteria; it does not invent a new position.
3. **The `/4` is a corpus expectation, not a Java output.** The vendored scenario
   `conformance/vectors/scenarios/trust-proof-v1.json:68-75` declares the `evidence_root` step with
   `"read": "evidence-package"` and `"expect": {"format": "keelbase-audit-evidence/4"}` (format at
   line 74). The replay test records that step under `TRUST_UNSERVABLE`
   (`ScenarioReplayTest.java:139`, alongside `cross_user_denied` and `r5_blocked`), and asserts the
   recorded set exactly (`:186-187`). So the case is "recorded as not served", which is what keeps
   the suite green without a producer. The `/4` expectation is the stale corpus pinned at
   `KeelBase v1.2.0` (Q10's subject), not a level Java reached.
4. **Existing reads are not packages.** The runtime serves `GET /audit/verify` (recomputes and
   verifies its own chain) and `GET /audit/coverage` (the coverage statement, `README.md:220-228`).
   Neither is an evidence package, and neither carries `releaseReadings` or `targetStatusReadings`.
5. **The `/6` substrate is absent.** `/6` reads the recorded target-status asks for the action's
   write key (`docs/evidence-root.spec.md:90-98`). The Java repo has no such store: the only hit for
   `releaseLookups` / target-status is a vector round-trip test
   (`keelbase4j-protocol/src/test/java/cn/com/keelbase/protocol/ReleaseEvidenceVectorTest.java:65`),
   not a table or a read face. A Java `/6` would require a new read store, the signed canonical
   branch and an export endpoint — an implementation project, not a design-note deliverable.
6. **Green CI does not cover this.** The 4J `conformance` job runs `mvn verify` against the endpoints
   the runtime serves; the `evidence_root` scenario is not replayed, and `vector-drift` compares the
   snapshot with its pinned source. So the two green JDK legs (run `46108644740`, `b8caa43`) say
   nothing about evidence-package parity — the gap is real and currently invisible to the gate.

中文：

1. **没有生产者。** `grep -rn 'keelbase-audit-evidence' --include=*.java KeelBase4J` 在 `src/main`
   与 `src/test` 中零命中；Java 侧唯一提到 `evidence-package` 的是 `ScenarioReplayTest.java:93`
   描述语料读法的那行注释。周会自己的读数一致：「无生产者（仅测试引用）」
   （`2026-11-28.md` §三第 18 项）。
2. **边界已经对外写过。** `KeelBase4J/README.md:212-219`：「不是证据包导出方。……它不导出证据包
   或证据根：这里没有这样的端点，本线也没有计划加。在 Java 宿主部署下，证据包从 TypeScript
   治理控制台取得。」中文版同义，见 `README.zh-CN.md:170`。本注记把那句散文变成带违反判据的
   已决定边界，没有另立新立场。
3. **`/4` 是语料期望，不是 Java 的输出。** vendored 场景
   `conformance/vectors/scenarios/trust-proof-v1.json:68-75` 把 `evidence_root` 步声明为
   `"read": "evidence-package"`、`"expect": {"format": "keelbase-audit-evidence/4"}`（format 在
   第 74 行）。重放测试把该步记在 `TRUST_UNSERVABLE`
   （`ScenarioReplayTest.java:139`，与 `cross_user_denied`、`r5_blocked` 并列），并精确断言这个
   集合（`:186-187`）。所以这一步是「记为不可服务」，正是它让套件在没有生产者时保持绿。`/4`
   是钉在 `KeelBase v1.2.0` 的陈旧语料（Q10 的对象），不是 Java 达到的版本。
4. **现有读面不是证据包。** 运行时提供 `GET /audit/verify`（重算并校验自己的链）与
   `GET /audit/coverage`（覆盖声明，`README.md:220-228`）。两者都不是证据包，也都不带
   `releaseReadings` 或 `targetStatusReadings`。
5. **`/6` 的底座缺失。** `/6` 读的是动作写键上已记录的目标状态询问
   （`docs/evidence-root.spec.md:90-98`）。Java 仓没有这样的存储：`releaseLookups` / 目标状态的
   唯一命中是一个向量往返测试
   （`keelbase4j-protocol/src/test/java/cn/com/keelbase/protocol/ReleaseEvidenceVectorTest.java:65`），
   不是表、也不是读面。Java 要产 `/6`，需要新的读存储、入签 canonical 分支和一个导出端点 ——
   那是一个实现项目，不是本注记的交付物。
6. **绿 CI 不覆盖这一点。** 4J 的 `conformance` 作业对运行时真正服务的端点跑 `mvn verify`；
   `evidence_root` 场景没有重放，`vector-drift` 只比快照与其钉住的来源。故两条 JDK 腿全绿
   （run `46108644740`，`b8caa43`）对证据包是否同源一无所述 —— 缺口是真的，而现有闸门看不见它。

---

## 3. Falsifiable criteria / 可证伪判据

English:

The boundary is violated if any of the following is true. Each is checkable without judgement.

| ID | Violation | How to check |
|---|---|---|
| V1 | Any tracked text calls Java a producer of evidence packages, or places it "at" a package level (`/4`, `/5`, `/6`) | Run the `git grep` below over `KeelBase4J` docs/READMEs, plus the same check over `KeelBase` docs; any hit implying Java output fails |
| V2 | The 4J replay turns green while `evidence_root` is no longer in `TRUST_UNSERVABLE`, and no endpoint returns a schema-valid `/6` package | Read `ScenarioReplayTest.java`; diff the constant. Green without a producer is a violation, not progress |
| V3 | The vendored `evidence_root` expectation is changed from `/4` to `/5` or `/6` without a Java producer | `git diff` on `conformance/vectors/scenarios/trust-proof-v1.json:74`; a format bump here must ship with V2's endpoint test |
| V4 | A release note, review, or differential-verification report counts 4J's green conformance as evidence-package parity, or claims "TS/Java both produce `/5` `/6`" | Read the report against §0.2–0.3; the claim itself is the violation, no runtime check needed |
| V5 | A Java evidence-export endpoint appears (any format) while this note still declares a non-producer | `grep -rn 'evidence-package\|evidence-root' --include=*.java` over `src/main`; a hit means a new decision must replace this note first |

中文：

下列任一条成立，即本边界被违反。每条都无需主观判断即可核对。

| 编号 | 违反 | 怎么查 |
|---|---|---|
| V1 | 任何受版本控制的文字把 Java 说成证据包生产者，或把它放在某个包格式「某一代」（`/4`、`/5`、`/6`） | 在 `KeelBase4J` 对 `docs`、`README.md`、`README.zh-CN.md` 跑下表给出的 `git grep`，并在 `KeelBase` 文档上做同样检查；任何暗示 Java 有产出的命中即失败 |
| V2 | 4J 重放转绿时 `evidence_root` 已不在 `TRUST_UNSERVABLE`，且没有任何端点返回 schema 合法的 `/6` 包 | 读 `ScenarioReplayTest.java` 并与常量比对。没有生产者却绿，是违反而不是进展 |
| V3 | 没有 Java 生产者，却把 vendored `evidence_root` 的期望从 `/4` 改成 `/5` 或 `/6` | 对 `conformance/vectors/scenarios/trust-proof-v1.json:74` 跑 `git diff`；此处抬格式必须与 V2 的端点测试同批落地 |
| V4 | 发布说明、评审或差分验证报告把 4J 的绿 conformance 算作证据包同源，或声称「TS/Java 都产 `/5` `/6`」 | 按 §0.2–0.3 读报告；主张本身即违反，无需运行时检查 |
| V5 | Java 出现证据导出端点（任何格式），而本注记仍声明非生产者 | 对 `src/main` 跑 `grep -rn 'evidence-package\|evidence-root' --include=*.java`；命中即须先以新决定取代本注记 |

V1's command / V1 的检查命令：

```bash
git grep -nE 'Java.*(emit|produce|export|support|at)|evidence.?package' -- docs README.md README.zh-CN.md
```

---

## 4. What this note does not decide / 本注记不决定的事

English:

- It does not fix the stale `/4` corpus (Q10) or the main-repo e2e corpus (`trust-proof-v1.json:74`
  there, Q1). Those are separate plan items; this note only says the `/4` is not a Java output level.
- It does not decide the 4J scenario-pack pin raise (Q10), nor whether Java should ever produce
  packages (that is the reopen condition in §0.6).
- It does not change the contract, the schemas, the TS producer, or any Java code.

中文：

- 不修陈旧的 `/4` 语料（Q10），也不修主仓 e2e 语料（那边的 `trust-proof-v1.json:74`，Q1）。那些是
  各自独立的计划项；本注记只说明 `/4` 不是 Java 的输出代数。
- 不决定 4J 场景包 pin 抬升（Q10），也不决定 Java 将来是否应产出证据包（那是 §0.6 的重开条件）。
- 不改契约、不改 schema、不改 TS 生产者、不改任何 Java 代码。
