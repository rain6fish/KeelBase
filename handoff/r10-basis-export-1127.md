# R-10 收口 —— 六问导出带上读数种类（2026-11-27）

- 工作树：`.claude/worktrees/practical-wiles-fe8a81`，分支 `claude/practical-wiles-fe8a81`，基于本地 `main` `17b23296`。
- 未推送、未打 tag、契约仓未动、私库未动、schema / 列 / 迁移未动、Java 线未动。

## 结论

六列不变；`claim_release` 行的「结果」列现在写出最新读数的种类，于是 `current_state` 与 `receipt`
两种读数**在导出文件内部**即可区分，不必解析散文。种类按数据读自链外 `releaseLookups` 列
（`items[0].basis` 与 `recorded`），**不解析 `detail`**；不认识的取值一律报「未记录」，绝不回显。

## 1. 六列口径：为什么限定「结果」列，而不是加第七列

结论：**保持六列**，把种类接在结果词之后。

- **六列是 U1 的验收本身。** `docs/audit-object-search.spec.md` §1 与 `test/audit-six-answers.e2e-spec.ts`
  逐列全等断言「六列」；第七列会把「六问」变成七问，并改变每一份已存 CSV 的形状。这项任务的验收允许
  两种做法，我们选了不动列数的那一种。
- **种类是结果的证据性质，不是第七个问题。** 读者问「这条结果是怎么知道的」，答案紧挨结果最自然；
  它也只在释放行出现，独立成列会有大片空格。
- **「0 内部名」不破。** 新词只落在同一个词表模块（`audit-export-vocabulary.ts`）：
  `current-state reading` / `receipt reading` 是产品词，不是 `current_state` / `receipt` 令牌；
  单测与 e2e 都跑 `scanForInternalNames` 断言 0 命中。
- **只读既有结构化列。** `releaseLookups` 是 F-85b 起就有的链外列（`ai-audit-log-row` 既有字段），
  不是新契约字段；wire schema 一字未动，契约停止条件未触发。
- **状态词不动。** `explainState` / `releaseRowState` 的推导与词表原样保留，只在后面加一句证据说明；
  单事件解释面与导出仍共用同一个状态。

### 取值表（「结果」列）

| 情形 | 结果格 |
|---|---|
| 最新读数 `current_state` | `Result unknown — the newest reading is a current-state reading` |
| 最新读数 `receipt` | `Result unknown — the newest reading is a receipt reading` |
| 有读数但种类未记录（或认不出） | `Result unknown — the newest reading's kind was not recorded` |
| 目标答过、本次读数行缺失（R-6b） | `Result unknown — the target answered; the reading for this ask was not recorded` |
| 有旧读数、但本次读数行缺失（R-6b 残留） | `Result unknown — the newest recorded reading is a receipt reading; the reading for this ask was not recorded` |
| 人工释放、无读数 | `Result unknown`（原样） |
| 拒绝行（无该列） | `Rejected`（原样） |

「最新」指 `releaseLookups.items[0]`（写入侧按 `at DESC, id DESC` 拷贝，最近在前）。写法用
**「the newest reading」**而不是「这次释放所依据的读数」：`releaseLookups` 没有结构化的
「目标驱动 / 人工」标志，人工释放也可能带旧读数，导出不能替它断言因果；R-6b 的 `recorded:false`
则明确说出「拷贝条目是更早的问次」，不让旧读数顶替这一次。

## 2. 各报表逐项结论

| 报表 | 带上种类？ | 结论与理由 |
|---|---|---|
| 六问导出 `GET /api/v1/audit/answers` | **是** | 释放行的「结果」列带最新读数种类（本项）。 |
| Action report `GET /api/v1/audit/action-report` | 否 | 它是**按结局的区间聚合**（executed / approved / rejected / blocked / refused / errors、byAction、byDay、samples、effectDiffs），不枚举任何一条读数。种类属于**一次查询（lookup）事件**，报表没有这个维度；加「按种类计数」是新报表口径，且 `report.summary` 在签名包的 canonical 里 —— 会改签名包的形状。**须用户裁**，本轮不动。 |
| 签名证据包 `GET /api/v1/audit/action-report/export` | 否 | = Action report + `compliance` + `chain`（全量链行的 canonical payload）+ 签名。`releaseLookups` 按构造是**链外列**（`governance-core/payload.ts` 的 `buildPayload` 不含它），塞进链行会破坏「payload 即链规范输入、可离线重算」这一性质；要带只能作为链外附段做格式修订（`keelbase-audit-evidence/2` → 新版本）。**须用户裁**，本轮不动。 |
| 证据根 `GET /api/v1/ai/governance/evidence-root/:resultType/:resultId`（`/4`） | 否 | 它围绕**一条业务动作**：副作用 + 触发行 + 会话内链行 + 授权 / 决策 + coverage。释放行不写 `conversationId`，不在会话链行里；`/4` 是已归档的格式（代码 `format: 'keelbase-audit-evidence/4'`，包的形状由 `docs/evidence-root.spec.md` 固定），加一段是格式修订。**须用户裁**，本轮不动。 |

补充：读面本轮未动，且已带种类 —— 审计列表投影的 `releaseLookups.items[*].basis`、claims 查询历史
的 `basis`、在途清单的 `lastLookup.basis`。R-10 补的正是「被带走的那一份文件」这一处。

## 3. 断言在哪

- `src/governance-shared/services/audit-answers.service.spec.ts` —
  `a release says what its newest reading was based on — current state versus receipt`：
  六行覆盖 §1 取值表；两条 `not.toBe` 钉住「导出内部可区分」；`scanForInternalNames` 钉住 0 内部名；
  另用 `basis: 'event_log'` 钉住「认不出的种类不回显」。
- `src/governance-shared/services/audit-export-vocabulary.spec.ts` —
  `the Result cell carries a release reading's kind in product words (R-10)`：词表模块是唯一能把令牌
  翻成文字的地方，这一层单独钉住。
- `test/audit-six-answers.e2e-spec.ts` —
  `a release exports what its newest reading was based on — current state versus receipt`：
  真 DI + 真库，两条 `claim_release` 行（`current_state` / `receipt`）经 `/audit/answers` 导出后，
  「结果」列得到两种取值并 `sort()` 全等。
- **变异检查**：把 `productResultCell(state, reading)` 改回 `productResultCell(state, undefined)`
  （即旧行为）⇒ 单测新用例转红（**1 failed / 10 passed**），已还原。

## 4. 读数

- 定向：`audit-answers.service.spec.ts` + `audit-export-vocabulary.spec.ts` **21/21**。
- `npx jest src/governance-shared`：**37 套通过 / 1 套跳过**（pg-snapshot 需活 PG）/ **553 例通过**。
- `test/audit-six-answers.e2e-spec.ts`：**9/9**（含新增 1 例）。
- 改动文件 `eslint --max-warnings 0`：**0**（未加 `--fix`）。
- `KEELBASE_JAVA_REPO=D:/Rain6fish/KeelBase4J npm run check:all`：见下方「门禁」。
- 环境：`Server-NestJS/node_modules` 为指向主检出的目录联接（未入库）；`specs/protocol` 已按 pin
  `015f474e` init。

门禁：`KEELBASE_JAVA_REPO=D:/Rain6fish/KeelBase4J npm run check:all` —— **36/36 全过**（57.8s，退出码 0）。

## 5. 文档（中英同步）

- `docs/audit-object-search.spec.md` §2：英文段 + 中文段，写清「结果列带种类」与「为什么不是第七列」。
- `docs/revoke-contract.spec.md` §6：释放证据段中英各加一句（六问导出把该列当数据读、结果列写出种类）。
- `CLAUDE.md` §9 `/audit/answers` 行：英文句 + 中文句。

## 6. 未做

- Action report / 签名证据包 / 证据根不带种类 —— 理由见 §2；三者都要报表口径或**格式修订**，按任务要求
  停手留用户裁。
- 未把**读数结论**（`executed` / `not_executed`）写进导出结果列：R-10 只要求种类；结论仍在 `detail`
  与查询读面（`conclusion`），本轮不扩。
- 未改契约仓、未加列 / 迁移、未动 Java 线、未推送、未打 tag。
