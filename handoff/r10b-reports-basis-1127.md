# R-10b 收口 —— 三份报表带上读数种类（2026-11-27）

- 工作树：`.claude/worktrees/dreamy-mclaren-4ec708`，分支 `claude/dreamy-mclaren-4ec708`，基于本地 `main` `e30aa3c1`。
- 未推送、未打 tag；契约子模块 `Server-NestJS/specs/protocol` 只按 pin `015f474e` 初始化（未改、未提交）；
  私库 `KeelBase-Private`、Java 线 `KeelBase4J`、schema / 列 / 迁移均未动。

## 0. 裁定表

| 报表 | 带读数种类？ | 结论与理由 |
|---|---|---|
| `GET /api/v1/audit/action-report` | **否（本轮）** | 它是**期间聚合**（executed/approved/rejected/blocked/refused/errors、byAction、byDay、samples、effectDiffs、hashChain），不枚举单次读数。它的冻结契约 `specs/protocol/schemas/v2/audit-action-report.schema.json` 是 `additionalProperties: false`，加任何字段都是**契约 MINOR**（新 schema 目录 + registry + Java runtime pin + PC-2 用例），且「按种类计数」会改聚合口径（`summary` 又进了 `/2` 的签名 canonical）。属须用户裁的 A 方案（§3.2），本轮不动。 |
| `GET /api/v1/audit/action-report/export`（`keelbase-audit-evidence/2`） | **是（已实现）** | 包顶层新增 `releaseReadings` 链外附段：`chain` 中每条带 `releaseLookups` 列的 `claim_release` 行一条，按数据读出（不解析 `detail`）。**不入签名 canonical**，`format` 仍 `/2`；证据包 schema 的 `/2` 分支是 `additionalProperties: true`，故零契约变更；离线重算与 `verify-evidence.mjs` 一字不改。 |
| `GET /api/v1/ai/governance/evidence-root/:resultType/:resultId`（`keelbase-audit-evidence/4`） | **是（已实现）** | 包顶层新增 `targetStatusReadings` 链外附段：这次动作写键（`effect.compensationGroup ?? effect.idempotencyKey`）上已记录的目标状态询问，读自 `ai_target_status_lookups`，最近在前。**不入签名 canonical**，`format` 仍 `/4`；`/4` 分支同样 `additionalProperties: true`，零契约变更。 |

「带 / 不带」的分界是**信任边界**，不是能力：附段与它的来源同级（`releaseLookups` 不进 `buildPayload`；
`ai_target_status_lookups` 是独立链外表），故它是「包本身能读出种类」的便利，**不是**被签名背书的断言。
要让它可验签，是 `/3` 与 `/5` 的格式修订 —— 见 §3，须用户批准。

## 1. 实现形状

### 1.1 `/2`：`releaseReadings`（`audit-evidence.service.ts:193`、`:684`、`:713`）

- 来源：`getActionReportExport` 已为链取出的**全部已入链行**（`rows`，`order: id ASC`）中，
  `action === 'claim_release' && releaseLookups != null` 的行。拒绝行按构造 `releaseLookups = null`
  （写入侧只给真正的释放写证据列），故没有条目；「有该列但零读数」的释放有条目（`readings: []`、`latest: null`）。
- 每条：`{auditRowId, count, askable, askUnrecorded, latest, readings}`。`readings: null` 表示列存在但读不出
  （畸形），与 `[]`（读得出、确实没拷到读数）区分。
- 顺序随链（最老在前），条目可用 `auditRowId` 连回 `chain` 行。
- **范围**：链那一半有意保持完整（只验一部分行的链不是校验），本段与之对齐；**不**跟随 `report` 的
  `userId` / `since` 收窄。
- **不入 canonical**：`canonical` 仍是 `summary/hashChain/effectDiffs/compliance/chain/exportedAt` 六键；
  用例用「按这六键复现 HMAC == signature.hmac」钉住。

### 1.2 `/4`：`targetStatusReadings`（`audit-evidence.service.ts:251`、`:772`、`:802`、`:993`）

- 来源：`ai_target_status_lookups`，按写键 `effect.compensationGroup ?? effect.idempotencyKey` 查，
  `order: at DESC, id DESC`。这个键与占位行的 `idempotency_key` 同源（都出自 `buildKey`），是这个动作与
  读数表**唯一精确的共同键**。
- 为什么不直接用释放行拷贝的 `releaseLookups`：释放行**不带 `conversationId`、也没有占位行的边**（写入侧
  从不写 `write_claim_id`），定位它只能解析 `detail` 散文 —— 本任务明确禁止。读查询表既精确又不碰散文。
- 每条：`{id, at, conclusion, reason, basis, lookedUpBy}`；`basis` 取读面词表（`current_state` / `receipt` /
  `unknown`），认不出的词报 `unknown`，绝不回显。
- `null` = 查询存储缺席（降级装配，无法确证）；`[]` = 存储在场且没有任何记录。两者可区分。
- **范围诚实**：本段列的是**已记录**的询问；一次询问若没留下读数行（R-6b），这里不会留条目。它不声称
  覆盖全部发生过的询问。
- **不入 canonical**：`canonicalObj` 的键序未动；用例用「按原键集复现 HMAC == signature.hmac」钉住。

### 1.3 共用解析器（`governance-core/release-readings.ts`）

- `parseReleaseReadings(raw)`：链外列 → `{count, askable, askUnrecorded, latest, readings}`。
  `latest` 沿用六问导出既有规则（原始首个条目：对象无声明种类 ⇒ `unknown`；非对象 ⇒ `null`），
  `readings` 跳过畸形条目；不认识/缺省的 basis 一律 `unknown`。
- `target-status.ts` 新增 `targetStatusBasisView(raw)` 作为「存储值 → 读面词表」的唯一归一化；
  `audit-answers.service.ts` 的 `parseReadingKinds` 改为复用共用解析器（行为保持不变，既有 21 例全绿）。
- 两个读面（六问导出 / 两个证据包）从此用同一份解析，故同一行不会在一个读面是 `receipt`、在另一个是
  `current_state`。

## 2. 为什么 Action report 不带（裁定）

1. 契约是冻结的：`audit-action-report.schema.json` 顶层 `additionalProperties: false`，加字段 = **契约 MINOR**；
   `audit-evidence.service.spec.ts` 的 PC-2「无越界键」用例本来就守这条。
2. 它是聚合：加「按种类计数」是**新聚合口径**，且 `report.summary` 在 `/2` 的签名 canonical 里 ——
   会连带改证据包形状。
3. 单次读数证据已经有归属：六问导出（R-10）、审计列表投影、claims 读面、以及本轮的 `/2` / `/4` 附段。
   聚合报表再加一份会形成第二份「证据索引」，而它与链那一半的范围还不一致。

若用户要它：见 §3.2 的 A 方案（契约 MINOR + 新口径），须批准。

## 3. 方案 A/B 与代价

### 3.1 让附段可验签（`/2` → `/3`，`/4` → `/5`）

**B（本轮已做，推荐先落地）**：附段不入 canonical。零版本号变更、零契约变更、零离线脚本变更；
代价是附段不可验签，必须按「与来源同级」阅读。文档已在协议 §2.5 与 evidence-root spec §3.1 写明。

**A（须批准，未做）**：把附段放进签名 canonical，新版本号 `/3`（包）与 `/5`（证据根）。代价：

| 面 | 具体改动 |
|---|---|
| 导出侧 | `audit-evidence.service.ts` 两个 canonical 字面量各加一键、两处 `format` 升版；`ActionReportExport` / `EvidenceRootExport` 注释同步 |
| 离线验证 | `scripts/verify-evidence.mjs`：`isV4` 改为按版本分派、`rootCanonical` 增加 `/5` 分支、`format` 白名单加 `/3` `/5`；`scripts/lib/evidence-package-canonical.mjs` 增加 `/3` 的键（离线验证与期间报告共用） |
| 防漂移闸 | `scripts/check-evidence-canonical.mjs`：必填键表、三处解析锚点、`/2` 与 `/3` 两套 canonical 都要改；否则三处可以「一致地」错 |
| 契约仓 | `specs/protocol` 的 `evidence-package.schema.json` 出新版（`/3` `/5` 分支，或把附段设为必填）→ 契约发版 + wire registry |
| Java 镜像 | `KeelBase4J` 的 protocol pin 前移 + `conformance/vectors` 的 schema 副本 / samples 同步（Java 运行时消费证据包时按版本校验） |
| 下游 | Web-Admin-Vue `ActionReportExport` 类型（已按 B 更新，A 下形状相同）、期间报告渲染（共用 `evidence-package-canonical.mjs`）、`docs/benchmark` 证据包 fixture、两处协议文档 |
| 兼容 | 新验证器认旧包；**旧验证器**遇到新版本会干净地拒（未知 format），不是假 PASS —— 这正是升版的目的 |
| 工期 | 约一个专注会话 + 一次契约 MINOR 发版 + 一次 Java pin 前移 |

**建议**：若「种类」要作为**可举证**的事实（审计机构能断言这次释放不是弱读数的伪装），选 A；若只是
「带走的那份文件里读得出来、且知道它与链外列同级」，B 已足够。本轮的实现使 A 的改动面收敛为
「把已有附段挪进 canonical + 升版」，不再需要新增数据装配。

### 3.2 Action report 带种类（须批准，未做）

| 选项 | 内容 | 代价 |
|---|---|---|
| A1 契约 MINOR + 新顶层段 | `audit-action-report.schema.json` 新目录加 `releaseReadings`（或按种类计数）| schema 新版本 + registry + Java pin + PC-2 用例；若是计数还会改 `summary`（`/2` 签名 canonical）|
| A2 只在导出包带 | 把 `/2` 的 `releaseReadings` 也塞进 `report`（不加到端点契约）| `report` 的 schema 允许扩展，但端点与导出的 `report` 形状会分叉，且与包顶层已有段重复；不建议 |
| B 不带 | 维持现状 | 聚合报表不提供单次读数；读者用 `/2` / `/4` 附段或审计列表 |

## 4. 断言在哪

- `Server-NestJS/src/governance-core/release-readings.spec.ts`：共用解析器 6 例 —— 最新种类、两种读数、
  不认识的值不回声、`recorded:false`、零读数、缺席/畸形 ⇒ `null`、原始首条目的规则。
- `Server-NestJS/src/governance-shared/services/audit-evidence.service.spec.ts:243`
  `R-10b：/4 附段带走读数的种类，不入 canonical；存储缺席与无记录可区分`：
  两条读数（`receipt` / `current_state`）在包内可区分；按原 canonical 键集复现 HMAC 与 `signature.hmac`
  一致（证明不入签）；存储在场无记录 ⇒ `[]`、缺席 ⇒ `null`。
- 同文件 `:798` `R-10b：释放读数种类随 /2 包带走（链外附段，不入 canonical；不解析散文）`：
  两条释放两种种类；拒绝行（`releaseLookups: null`）没有条目；**散文故意说反**（`detail` 写
  `basis=current_state`、列写 `receipt`）证明不解析 `detail`；按 `/2` 六键复现 HMAC 一致。
- `Server-NestJS/test/evidence-root.e2e-spec.ts:328` ⑦：真 DI + 真库，向
  `ai_target_status_lookups` 落两条读数（`current_state` / `receipt`），导出 `/4` 得两种种类（最近在前），
  再跑一次 `verify-evidence.mjs` 仍 **PASS**（附段不影响离线验证）。
- **变异检查**：`/2` 的过滤条件加 `&& false` ⇒ 新用例转红（1 failed）；`/4` 的 `lookupRows && false` ⇒
  新用例转红（Received: undefined）；两次均还原并复跑绿。

## 5. 读数

- 定向单测：`audit-evidence.service.spec.ts` + `release-readings.spec.ts` **49/49**。
- `npx jest src/governance-shared`：**37 套通过 / 1 套跳过**（pg-snapshot 需活 PG）/ **563 例通过、3 例跳过**，退出码 0。
- 相关 e2e：`test/evidence-root.e2e-spec.ts` **7/7**（含新增 ⑦）。
- 改动文件严格 eslint（`--max-warnings 0`，未加 `--fix`）：**0 problem**。
- `node scripts/check-evidence-canonical.mjs`：`/4` 三处一致、`/1|/2` 两处一致，均绿。
- 根 `KEELBASE_JAVA_REPO=D:/Rain6fish/KeelBase4J npm run check:all`：**36/36 全过（46.1s）**。
- `Web-Admin-Vue` `npm run typecheck`：通过。
- 环境：`Server-NestJS/node_modules` 与 `Web-Admin-Vue/node_modules` 为指向主检出的目录联接（未入库）；
  `specs/protocol` 按 pin `015f474e` 初始化。

## 6. 文档（中英同步）

- `docs/protocols/ai-governance-protocol.md` §2.5：签名覆盖范围改为「canonical 列出的段」，新增
  「链外附段」英文段 + 中文段（`/2` `releaseReadings`、`/4` `targetStatusReadings` 的来源、不入 canonical、
  零契约变更、升版才是另一档）。
- `docs/evidence-root.spec.md` §3.1：新增 `/4` 附段 `targetStatusReadings` 的英文段 + 中文段（来源键、
  形状、`null` vs `[]`、只列已记录询问、不入 canonical）。正文既有 `/3` → `/4` 漂移**未顺手改**。
- `CLAUDE.md` §9：Action report 行补「仍是聚合、不列单次读数」；新增 `action-report/export` 行；
  evidence-root 行补 `/4` 的 `targetStatusReadings`。均英文句 + 中文句。
- `Web-Admin-Vue/src/api/audit.ts`：`ActionReportExport` 增加 `releaseReadings` 类型（下游消费者同步）。

## 7. 未做 / 遗留

- `/3` / `/5` 可验签版本（§3.1 A）：须用户批准；涉及契约发版、Java pin、离线验证器与防漂移闸。
- Action report 带种类（§3.2）：须用户批准；涉契约 MINOR 或新聚合口径。
- 未改契约仓、私库、Java 线；未推送、未打 tag；未动 schema / 列 / 迁移。
- `targetStatusReadings` 只含「已记录的询问」；R-6b 的「这一次没留下读数行」在 `/4` 附段里无法表达
  （释放行无精确边），这是已披露的边界，不靠散文补。
