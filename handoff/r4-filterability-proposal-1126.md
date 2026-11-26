# R-4 遗留 · 「按释放种类筛选审计行」的决策稿（提案，未实现）

- 日期：2026-11-26
- worktree `heuristic-bun-3bc67c` / 分支 `claude/heuristic-bun-3bc67c`，从本地 `main` `18a81546` 起
- 契约子模块 pin：`015f474ebf0cf5f45c855614b18020857665c700`（本 worktree 内初始化；未改、未推）
- 范围：**只写方案**。未改代码、未改 schema、未改契约、未改私库、未推送、未打 tag。
- 上游口径：R-4 交接件（`handoff/r4-stale-view-1125.md`）把「只读审计行不能靠结构字段筛出拒绝」列为已知边界，
  触发点写作「出现一个只读审计行就要据以行动的消费者」。本稿核对该触发点今天是否成立、并给出翻契约的具体形状与代价。

---

## 0. 结论速览

| 问题 | 结论 |
|------|------|
| 今天能不能按种类筛？ | **部分能，没有一处是完整的**。「这是不是一次释放」有契约背书的结构信号（下文 §1.6）；「自动清扫的目标驱动释放」有精确的 `userId` 通道；缺的是**人工释放 vs 人工对账的目标驱动释放**，以及**拒绝的可靠计数**。 |
| 该不该现在翻契约？ | **不该**。触发点未成立：今天没有任何消费者必须据审计行筛选/计数（下文 §2）。§1.6 的两条零契约读法先覆盖最常见的两种问法。 |
| 若将来必须做，选哪个？ | **方案 A**：给审计行加一个链外列 `releaseKind`（三值）。不扩 `outcome`、不拆动作（下文 §3、§5）。 |
| 代价 | 契约 MINOR（行 schema v9 + 向量）+ 一次迁移 + 4 个写入点 + 两张读面 + 控制台；约一个专注会话 + 一轮契约发版（§3.1）。 |
| 零契约可先做的 | ①把「`releaseLookups` 非空 ⇒ 这是一次释放」写成读规则（已由 v8 描述背书，只需文档化）；②修 `claim_release` 行在六问导出/控制台里的**标签**（今天三种行都显示成同一句话，且 Result 列显示 `Executed`，§1.7）。 |

待用户裁定的是 §6 的 D1–D4。

---

## 1. 已核实的事实（可逐条指到文件/行）

### 1.1 三种行的写入点

`Server-NestJS/src/governance-shared/services/write-claim-decision.service.ts`：

| 行 | 写入点 | 调用面 |
|---|---|---|
| 人工释放 | `release()` `:171` → `_writeReleaseRow(... , this._detail(...), evidence)` `:269-274` | `POST /ai/tool-effects/claims/:id/release`（`ai.controller.ts:1067-1072`） |
| 目标驱动释放 | `recordTargetRelease()` `:312` → 同一构造器 `:319` | `AiToolEffectsService.reconcileClaim()` 收到 `not_executed` 之后（`ai-tool-effects.service.ts:514-522`），人工对账与每小时清扫都走这条 |
| `stale_view` 拒绝 | `release()` 的前置比对 `:196-206`，及条件更新落空后的重读分支 `:245-258`，各写一行 | 同上，人工端点 |

`_writeReleaseRow()` `:473` 是 `claim_release` 的**唯一写入点**；`action: 'claim_release'` `:482`，
`releaseLookups` 只在 `evidence` 非空时写 `:494`，`source: 'claim_release'` `:495`。拒绝路径两处都传 `null`
（`:198-201`、`:249-253`）。

### 1.2 三种行的字段实况

| 事实 | 人工释放 | 目标驱动释放 | `stale_view` 拒绝 |
|---|---|---|---|
| `detail` 开头 | `release write claim #N (tool, as user X) → closed_unknown; note: …`（`_detail` `:587`） | `release write claim #N (tool, as user X) → released; origin: target answered not_executed (METHOD path at T); initiated by: …`（`_targetDetail` `:612-616`） | `release refused (stale_view): … changed: …; view: …; ledger now: …`（`_refusalDetail` `:555-560`） |
| `releaseLookups` 列 | 有 | 有 | **无**（`:494` 的 `...(evidence ? …)`） |
| `outcome` | `null` | `null` | `null`（`:485-490` 明确不传） |
| `action` / `source` | `claim_release` / `claim_release` | 同左 | 同左 |
| `tool` | 工具名 | 工具名 | 工具名 |
| `username` | JWT 的 `user.username`（`ai.controller.ts:1074`） | **空**（`recordTargetRelease` 只传 `{ userId }`，`:319`；`AuditService.log` 的 `actorContext` 回落也为空，`audit.service.ts:127`） | JWT 的 `user.username` |
| `userId` | 管理员 id | `system:sweep`（自动清扫）或管理员 id（人工对账） | 管理员 id |
| 占位行状态 | `status=claimed`、`decisionState=closed_unknown`、`releaseReason='manual_release_unknown'`（`:237`） | `status=released`、`releaseReason='target_status_not_executed'`（`write-claim.store.ts:325`），`decisionState` 不动 | 未动 |

占位行留不住目标驱动那份决定：重占位会把 `status` / `releaseReason` / `claimedAt` 清掉（`write-claim.store.ts:148`），
故带链的审计行是它唯一留得住的地方 —— 这一点是 R-3 写行的理由，原样成立。

### 1.3 哪些事实机器可读、哪些只能解析散文

- **机器可读**：`action`、`tool`、`userId`（含 `system:sweep`）、`createdAt`、`username`、`releaseLookups` 的有无。
- **只能解析散文**：谁发起的（人工对账 vs 自动清扫，且仅当 `userId` 不足以判断时）、目标答了什么、
  `queriedAt`、屏幕说的 vs 账本现在说的、`note` 与 `evidenceRef`、拒绝的成因（今天是 `stale_view`）。
- **两者都读不到**：这条释放**属于哪份占位/哪个业务对象**。审计行不带业务对象；对象索引走
  `claim.audit_row_id`，只解析到触发那次执行的 `tool_call` 行（`audit-object-index.service.ts:74-90`），
  释放行不在其中；`write_claim_id` 列存在，但 `AuditEntry` 没有这个字段（`audit.service.ts:23-52`），
  释放行从未写过它，且它也不在线上行 schema 里（§1.5）。

### 1.4 契约

- **动作是闭集**：`audit-payload` v4 的 `action` 枚举（`schemas/v4/audit-payload.schema.json:14`）含
  `claim_release`；该文件 `additionalProperties: false`、`required: ["userId","action"]`（`:7-8`）。
- **`outcome` 是冻结词表**：`ai-audit-log-outcome-v3-vector.json:41-43` 的
  `legalByAction["any-other-action"] = [null]` —— `claim_release` 只能不带 `outcome`。写任何词都是契约外取值，
  且会替「结论未知」下判决。
- **查询行 v8**：`schemas/v8/ai-audit-log-row.schema.json`，`additionalProperties: false`；`releaseLookups`
  只约束为 `["string","null"]`（`:218-224`），描述写明 **“absent on rows that are not releases”**。
  即：**有值 ⇒ 这是一次释放**是契约背书的；反向（没有值 ⇒ 不是释放）**契约不背书**，只在本实现 F-85b
  之后写下的行上成立（§1.6）。
- **版本规则**：新增可选属性 = 新 schema 目录 + registry，MINOR；改 `action` 枚举 = 新 `audit-payload`
  版本 + Java 运行时 pin 前移（`specs/protocol/README.md:131-142`，`CHANGELOG.md` v1.21.0 / v1.23.0 两处先例）。
- **链内/链外**：`releaseLookups`、`outcome`、`tool` **不在** hash payload 里
  （`governance-core/payload.ts:20-56`）；`detail` 在（且截到 2000 字符，`audit.service.ts:143/166`）。
  故任何链外判别列都不被哈希覆盖 —— 篡改它不破链；证伪只能靠链内的 `detail` 散文。

### 1.5 读面能按什么筛

| 读面 | 今天可用的筛选 | 对 `claim_release` 行意味着什么 |
|---|---|---|
| `GET /audit/logs`（`audit-query.dto.ts`，投影 `audit-query.service.ts:165-273`） | `userId` / `agentId` / `orgId` / `since` / `until` / `isError` / `denied` / `objectType+objectId` | **没有** `action` / `outcome` / `tool` / 种类筛选。行里带 `releaseLookups`（管理员整行；审计读者白名单含它，`audit-reader-projection.ts:47-74`） |
| 六问导出 `GET /audit/answers`（`audit-answers.service.ts:103-146`、`_answer` `:236-290`） | 对象 + 区间；无对象时导出区间内全部行 | Action 列取 `productActionLabel(tool, action)`：`tool` 有值时**优先显示工具标签**（`audit-export-vocabulary.ts:125-133`），故释放行显示成 `Create event` 之类；Result 列走 `explainState`，`outcome=null` + `isError=false` ⇒ 一律 **`Executed`**（`audit-explanation-state.ts:147-148`）；Initiated by 列只读 `username`，空 ⇒ `Not recorded`（`:244-253`） |
| AI Action Report `GET /audit/action-report`（`audit-evidence.service.ts:464-472`） | 只统计 `tool_call` / `tool_confirmation` | `claim_release` 行**不入任何计数** —— 这里没有误读，但也没有释放读数 |
| 对象检索 | 经占位 → 副作用 | 释放行**检索不到**（§1.3） |
| 控制台 AI 审计 `AiAuditView.vue` | 用户 / Agent / 对象对；行为过滤只认 `tool_call` / `chat`（`:552-560`），且是**对当前页**的前端过滤 | `claim_release` 行归 `other`；Action 列取 `actionLabel`，三种行同一句；本地类型 `AuditLog`（`types/audit.ts:3-33`）**没有** `outcome` / `tool` / `releaseLookups` 字段 |
| 单事件解释 `GET /audit/logs/:id/interpretation` | — | 同样返回 `state: 'executed'`（`audit-evidence.service.ts:1016-1021`） |
| AI 时间线 `AiTimelineView.vue:364-421` | — | `claim_release` 落 `default` 分支，显示原始动作令牌（无 `action.claim_release` 文案键） |
| 治理台双写副本 | — | 上报体不含 `releaseLookups`、`outcome`、`tool`（`audit.service.ts:239-256`），接收端映射也不接（`external-governance.controller.ts:36-54`） |

### 1.6 今天已有的三条结构信号，及各自的边界

1. **`releaseLookups != null` ⇒ 这是一次释放。** 契约 v8 描述背书（“absent on rows that are not releases”
   的逆否），本实现两条释放路径都写它。
   - 边界：它**不能**反过来说「没有值 ⇒ 拒绝」。契约只保证「非释放 ⇒ 没有值」。本实现每条释放都会写，
     故对 F-85b 之后写下的行，没有值才等于拒绝；**v7 形态的释放行**同样没有值 —— 契约 v1.21.0（2026-11-07）
     先引入 `claim_release`，v1.23.0（2026-11-24）才加 `releaseLookups`，**两者之间的窗口**里写下的释放行
     会被这条规则算成拒绝；窗口的实际下界取决于部署，不是某个固定日期。
     向量 `ai-audit-log-release-evidence-v1-vector.json` 明确保留 `release-without-evidence` 合法。
   - 边界二：该列不入 hash payload，篡改不破链（§1.4）。
2. **`userId = 'system:sweep'` ⇒ 自动清扫的目标驱动释放。** 该账号在本仓只由清扫这一条路径作为审计行的
   `userId` 使用（`ai-tool-effects.service.ts:102/683`；`grep -rn system:sweep` 可核），且那条路径只会写这一种行。
   这是今天**最精确**的一条筛选通道（`/audit/logs?userId=system:sweep`）。
   - 边界：它只覆盖自动路径；人工对账用管理员 id，与人工释放同号。
3. **占位表能确认「人工释放」，但读不到「目标驱动释放」。** 人工释放 ⇒ `status=claimed` +
   `decisionState=closed_unknown`；目标驱动 ⇒ `status=released`（`write-claim.store.ts:325`）。
   而 `GET /ai/tool-effects/claims` 的查询**恒以 `status=claimed` 为条件**（`write-claim-query.service.ts:140-142`），
   故目标驱动释放的占位根本不在这个读面上 —— 即便 `decisionState=all`。加上重占位会清列（`:148`），
   结论是：**目标驱动释放的唯一可查记录就是那条审计行**。人工释放的占位行虽在，但释放行与它的关联键
   （`write claim #N`）只在散文里。

### 1.7 已存在的标签误读（与「可筛性」相邻，但是两条问题）

对 `claim_release` 行，六问导出今天会输出一行读起来像「成功的工具动作」的记录：

- Action：工具标签优先 ⇒ 例如 `Create event`（`audit-export-vocabulary.ts:125-133`）；
- Result：`Executed`（`audit-explanation-state.ts:147-148`）；
- Object：`Not recorded`（该行不挂 effect）；
- Initiated by：目标驱动行 `Not recorded`（`username` 空）。

拒绝行同样如此 —— 一次**被拒的释放**在导出里读作「Create event / Executed」。
这不是筛选问题，但它是「消费者按工具语义读所有审计行」的直接后果，证明「审计行今天不能安全地按动作/结局分桶」。
`handoff/r2r3-review-1124.md` 第九节第 3 条已记过 `username` 为空这一次要问题。

---

## 2. 触发判据：什么时候才值得翻契约

R-4 的触发点是「出现一个只读审计行就要据以行动的消费者」。按**问法**拆开核对：

| 消费者的真实问题 | 今天能不能答 | 该读哪里 |
|---|---|---|
| 「这段时间实际释放了几次？（被拒的不算）」 | **能**：数 `releaseLookups != null`（`/audit/logs` 按区间取行） | 审计行 |
| 「自动清扫替目标回答释放了几次？」 | **能**：`?userId=system:sweep` | 审计行 |
| 「拒绝了几次？」 | **能，但要用时间下界**：`releaseLookups == null` 且该行写于 F-85b 之后 | 审计行 + 迁移时刻 |
| 「人工对账的目标驱动释放 vs 人工释放各几次？」 | **不能**（只有散文 `origin:` 与 `userId` 的间接推断） | 需要新事实 |
| 「这份占位现在能不能重试？」 | **不能从审计行答，也不该**：重试资格是占位的 `status`（`claimWrite` 见 `claimed` 即拒、见 `released` 即允许），审计行不是权威 | 占位表（`ai_write_claims.status`） |
| 「这个业务对象的释放历史」 | **不能**（§1.3 的关联断点） | 需要新关联 |

所以触发条件是**具体的一条**：

> **T1**：出现一个需要把「人工对账的目标驱动释放」与「人工释放」**按机器分开计数/筛选**的消费者
> （报表、合规问题、控制台列）。或者
> **T2**：服务端需要按种类分页/筛选（前端对单页过滤不能用于计数）。
> 或者 **T3**：需要从业务对象反查它的释放历史。

「能否重试」**不是**触发条件 —— 它今天就有正确的权威（占位），把审计行升格为权威是错误的改动方向。

---

## 3. 三个方案

> §3 起是**建议**，不是事实。凡与 §1 冲突处，以 §1 为准。

### 3.1 方案 A —— 新增链外列 `releaseKind`（推荐）

**形状**：`ai_audit_logs.release_kind varchar(32) null`，`claim_release` 行必填、其余行为空；
线上行 schema 增一个可选属性 `releaseKind`（`string|null`）。

**改动面**：

| 层 | 改动 |
|---|---|
| 实体/迁移 | `ai-audit-log.entity.ts` 加一列；`npm run migration:generate` 产出一份（Postgres；SQLite 开发态 synchronize） |
| 写入 | `_writeReleaseRow` 增一个 kind 入参，4 个调用点各给值（人工 / 目标 / 两处拒绝） |
| 读面 | `audit-query.service.ts` 投影 1 行；`audit-reader-projection.ts` 白名单 2 行；`AuditQueryDto` + 查询谓词加 `releaseKind`（**服务端**筛选，否则计数仍只能靠前端对单页过滤） |
| 控制台 | `types/audit.ts` 加字段；AI 审计页加一列或一个筛选（含中英文案 + 测试） |
| 契约 | 新 `schemas/v9/ai-audit-log-row.schema.json`（v8 逐字 + 新属性）+ 样例 + `wire-schema-registry*.json` + **一份钉取值的向量**（参照 `ai-audit-log-outcome-v3-vector.json` 的做法：行 schema 不约束取值，取值由向量钉）+ MINOR 发版（v1.23.0 之后的下一版号）+ 主仓 pin 前移 |
| 回填 | **不做**。历史行为空 —— 按散文回填等于把措辞烧进永久列；历史读法保持 §1.6 的规则，并在文档里写明这条时间分界 |
| 治理台 | 若治理台要读，需在 `reportAudit` 与 `external-audit` 接收映射里加这一列（接收端 `additionalProperties: true`，但映射是显式的，属代码改动，不触契约） |

**代价**：约一个专注会话（后端 + 契约 + 控制台 + 测试），外加一轮契约发版流程；风险集中在流程（契约 MINOR、
Java 运行时是否 vendor 该行 schema 需在动手时确认 —— v8 的 CHANGELOG 未提 Java，`audit-payload` 的 v4 提了）。

**兼容性**：加性。旧行合法；不读该列的消费方不受影响；`additionalProperties: false` 意味着线上行必须升到 v9，
按 v8 校验新行的消费方会拒 —— 与本仓既有每次 MINOR 的行为一致。

### 3.2 方案 B —— 独立动作（如 `claim_release_refused`）

**改动面**：`audit-payload` 新版本（action 枚举）+ 样例 + registry + Java pin 前移 + `ai-feature-map.ts`
动作标签 + `audit-export-vocabulary.ts`（`ACTION_LABELS` / `HUMAN_ONLY_ACTIONS`）+ 控制台文案 + 测试；
主仓 pin 与 Java 向量门禁同步。

**问题**：

1. 它只解决「拒绝 vs 释放」，**仍分不开**人工释放与人工对账的目标驱动释放 —— 触发条件 T1 依旧满足不了。
2. 它把**一次动作的两个结局**拆成两个动作名，正是 R-4 裁定拒绝这么做的那条理由
   （`write-claim-decision.service.ts:49-53`、`docs/revoke-contract.spec.md` §6），也与
   `tool_confirmation` / `effect_revoke` 的「动作名动作、结局写别处」先例相反。
3. 代价最高：enum 变更要两个实现同批、要 Java pin 前移。

结论：**不建议**，除非设计前提被推翻（例如有人主张「拒绝不是这个动作的结局」—— 那需要 ADR，不是本条）。

### 3.3 方案 C —— 不翻契约的几种读法

- **C1：把 §1.6 的读法写成规则，并修标签。** 零契约、零迁移；只动文档 + 导出/控制台的标签推导（§5）。
  能覆盖「实际释放数、自动释放数、拒绝数（带时间下界）」；覆盖不了 T1。
- **C2：查询时按散文匹配（`detail LIKE 'release refused (%'`）。拒绝。** 这正是
  `ai-audit-log-outcome-v3-vector.json` 的 note 明确不做的事 ——「把实现的措辞烧进契约」；本轮改措辞就会静默
  漏行，而且没人会收到信号。
- **C3：建派生表/外部索引，解析历史行回填。** 拒绝。第二份真相、会漂移；回填靠解析散文，等于把猜测写成永久数据；
  读数表「仅追加」那类诚实性论证在这里没有对应物。

---

## 4. 推荐

**现在：做 C1，不做契约变更。** 理由：

1. 触发条件 T1/T2/T3 一个都没成立（§2）：今天没有任何代码或报表需要按「人工 vs 目标驱动」分桶；
   已有的两种问法（实际释放数、自动释放数）用现成结构就能答。
2. 契约变更的代价主要不是代码，而是**每次 MINOR 都要两个实现同批 + pin 前移**；在没有消费者之前付这笔钱，
   属于 CLAUDE.md §15.4 明确禁止的「为未来扩展造结构」。
3. 拒绝路径已有第二重可读性：散文首句 `release refused (stale_view)` 在**链内**（hash 覆盖），
   任何链外列都不具备这一点；现在就加列，不会让拒绝更容易被证伪，只会让它更容易被筛。

**将来（T1 或 T2 成立时）：做方案 A**，并按 §5 的形状落。**不做方案 B。**「不做」的边界：

- 不因为「以后可能要按种类统计」而加列；
- 不在任何服务端读面解析 `detail` 做筛选；
- 不建派生索引；
- 不把审计行升格为「能否重试」的权威。

---

## 5. 若现在做：A 的具体形状与两个零契约动作

### 5.1 方案 A 的落法

- 列名：`release_kind`（线上 `releaseKind`），`varchar(32)`，可空。
- 取值（建议三值，**由向量钉住**，行 schema 不约束）：
  - `manual_release` —— 人工在端点释放；
  - `target_release` —— 目标答 `not_executed` 引起的释放（人工对账与自动清扫同值；「谁发起」仍由 `userId` /
    `detail` 回答，不塞进这一列）；
  - `refused` —— 释放被拒（今天是 `stale_view`；成因留在 `detail`，不在这列复制，避免每加一种拒绝就加一个枚举）。
- 不推荐复用占位行的 `release_reason` 字符串（`manual_release_unknown` / `target_status_not_executed`）：
  那两个值描述的是**账的处置**（`closed_unknown` vs `released`），不是「这次决定从哪来」，且拒绝没有对应值。
  这一条是 D3。
- 写入点：`_writeReleaseRow(claim, actor, detail, evidence, kind)`；两处拒绝传 `refused`。
- 历史：不回填；文档写明「v9 之前的行为空，按 §1.6 的规则读」。
- 验收（若实施）：三类行各一条 e2e，断言 `releaseKind` 与 `releaseLookups` 的有无**同时**成立；一条反证：
  未知取值被 schema/向量拒绝。

### 5.2 零契约动作一：把读规则写进文档

契约 v8 的行描述已写明「absent on rows that are not releases」（`schemas/v8/ai-audit-log-row.schema.json:218-224`），
**不改契约仓**，只在主仓 `docs/revoke-contract.spec.md` §6（EN + ZH 各一段）补一条**读法**：

- `releaseLookups != null` ⇒ 这是一次释放（契约背书）；
- `releaseLookups == null` ⇒ 拒绝，**仅当**该行写于 F-85b 之后；之前的行不可据此判定；
- 自动清扫的释放另有 `userId='system:sweep'` 可精确取。

代价：一段文档；不动契约（描述性文本本来就不占版本号，README §「什么不在版本线里」；本稿也不改契约仓）。

### 5.3 零契约动作二：修标签

三处都在代码侧，可独立提交、不触契约：

1. `explainState` / 六问导出：`claim_release` 行不应落到 `Executed`。最小改法是 `_answer()` 对
   `action === 'claim_release'` 分出两句话（`releaseLookups` 有无 ⇒ `Release recorded` / `Release refused`），
   或在 `explainState` 加「非工具动作不宣称结局」。两种都要同步 `audit-evidence.service.ts:1016-1021` 的解释面。
2. `productActionLabel`：`claim_release` 行应显示动作而非工具标签（现在是 `Create event`）。
3. Initiated by：`recordTargetRelease` 的调用链手上其实有身份 —— `reconcileClaim(claimId, byUserId)`
   可由控制器多传一个 `username`（`ai.controller.ts:657-662` 手里有 `user`），自动清扫则如实标成
   `system:sweep`，并在词表里给「自动清扫」一句自己的话（今天会落到 `(directly)`，那是人的说法）。

这三条是「消费者按工具语义读所有审计行」的**现有**缺陷，与筛选无关；建议单独裁、单独提。

---

## 6. 待用户裁定

| 编号 | 问题 | 建议 |
|---|---|---|
| **D1** | 现在翻契约，还是等 T1/T2/T3 成立？ | 等；先做 C1（§5.2） |
| **D2** | 若做，选 A（链外列）还是 B（独立动作）？ | A。B 分不开人工/目标驱动，且与 R-4 已裁的「一次动作两种结局」冲突 |
| **D3** | 取值用 `manual_release` / `target_release` / `refused`，还是复用占位的 `release_reason` 字符串？ | 前者；后者把账的处置语义带进线上契约 |
| **D4** | 是否先做 §5.3 的标签修正（零契约）？ | 是；它修的是今天的误读，不是为将来加结构 |

---

## 7. 若实施时的核对清单（供届时使用）

- [ ] `check:contract-release-gate` 绿；契约 MINOR 与实现同批落地；主仓 pin 前移；Java 侧是否 vendor 本行 schema 已确认
- [ ] 迁移在 Postgres 上跑过；SQLite 开发态同步无差异告警
- [ ] `releaseKind` 与 `releaseLookups` 的三类行 e2e（人工 / 目标 / 拒绝），含「拒绝无 `releaseLookups`」的负断言
- [ ] 审计读者白名单同步（fail-closed 的构造决定：不加就看不到）
- [ ] 服务端筛选有测试（分页 + 计数不能靠前端单页过滤）
- [ ] 历史行为空的说明进了 `docs/revoke-contract.spec.md` 与 `CLAUDE.md` 端点行
- [ ] 治理台是否同步：`reportAudit` 与 `/external/audit` 的显式映射

---

## 8. 附：本稿核过的命令与读数

| 命令 | 读数 |
|---|---|
| `git -C Server-NestJS/specs/protocol rev-parse HEAD` | `015f474ebf0cf5f45c855614b18020857665c700`（本 worktree 内 `submodule update --init` 后） |
| `git rev-parse --abbrev-ref HEAD` / `git log --oneline -1` | `claude/heuristic-bun-3bc67c` / `18a81546` |
| 代码与契约核对 | 只读；`grep`/`sed` 定位见正文行号 |

未运行测试套件：本稿未改任何代码或 schema，无需回归；若 D1 裁「现在做」，按 §7 逐项执行门禁。

---

## 9. 后续（2026-11-26）

用户裁定 **D1 = 先做零契约**。§5.2（读规则文档化）与 §5.3（标签修正）已实施，见
`handoff/r4-filterability-c1-1126.md`；D2/D3（是否加 `releaseKind` 列、取值词表）仍未裁，触发条件不变。
