# R-1 后续 · 「读历史」模式的决策稿（提案，未实现）

- 日期：2026-11-26
- worktree `jolly-cartwright-0ff27b` / 分支 `claude/jolly-cartwright-0ff27b`，从本地 `main` `f45d9655` 起
- 契约子模块 pin：`015f474ebf0cf5f45c855614b18020857665c700`
- 范围：只写方案。**未改代码、未改 schema、未改契约、未改私库、未推送。**
- 上游口径：R-1 已落地读数种类 `basis`（`current_state` / `receipt`）；F-106 台账记载「可读历史的目标为 0」，故这是**前瞻设计**，不是为现有目标补洞。

---

## 0. 结论速览

| 问题 | 结论 |
|------|------|
| 怎么声明 | 新增独立配置键 `historyPath`（`[METHOD] path`，`{key}` 复用 `statusPath` 约定）；声明即选中历史模式。推荐**同时声明两条路径按 `misconfigured` 拒绝**（不猜哪种问题）。 |
| 应答形状 | 历史端点仍须给**显式判决** `{status, basis?}`（R-1 原样），可附 `history{available, coversActionKey, complete, retainedFrom, events}` 作披露；探针只读 `status`/`basis`，披露字段只在**没有判决**时转成 `unknown` 成因。 |
| 收敛权 | 仍只在目标手里。**空历史 + 无判决 = `unknown`，绝不是 `not_executed`。** |
| 新 `unknown` 成因 | `history-no-verdict`、`history-does-not-cover`、`history-truncated`、`history-unavailable`（可选）；`not_permitted` 复用 F-122。 |
| 证据行 | 不加列、不加迁移：仍是一次尝试一行，`queryPath` 记下问的是哪个端点，`reason` 记新成因。 |
| 决定行 | `releaseLookups.items[]` 原样透传 `id/at/conclusion/reason/basis/lookedUpBy`；R-3 的 id 回查与水位口径不变。 |
| 读面/控制台 | 后端零新增字段；只需把「可问」判据扩到 `historyPath`。控制台加 4 个成因文案键。 |
| 迁移 | **不需要**（`reason` 是 `varchar(32)` 字符串列，最长新值 22 字符；`historyPath` 在 Settings JSON 里）。 |
| 契约 | **不需要改**（`releaseLookups` 是 `string|null`、无内部结构约束；`ai_target_status_lookups` 不在契约内；`historyPath` 不是 wire schema）。 |

待用户裁定的点集中在 §7（D1–D5）。

---

## 1. 已核实的事实（可逐条指到文件/行）

### 1.1 探针今天只有一种模式

`Server-NestJS/src/ai/proxy/target-status.ts:107-189` 的 `lookup()` 是唯一查询路径：

1. `:117-119` 先看**声明**：`resolveCapabilities(tool).statusLookup !== 'yes'` ⇒ `target-status-unavailable`，一个字节都不发（AW-19：`no` 与 `unknown` 同读）。
2. `:122` 声明 `yes` 却没配 `statusPath` ⇒ 同样记缺口。
3. `:125` 用 `splitStatusPath()`（`:61-68`）把 `[METHOD] path` 拆成方法与路径，缺方法默认 GET。
4. `:129-135` 三道构造性守卫：方法必须 `GET`；路径不得是绝对 URL 或 `//` 开头；必须含 `{key}`，代入后不得残留其它 `{占位}`。任一不满足 ⇒ `misconfigured`，**不发送**。
5. `:137-143` 用**原写入者**的委托身份签 token；签不出 ⇒ `misconfigured`。
6. `:147-154` **一次** `proxyFetch`，GET，无重试。
7. `:155-157` 非 2xx ⇒ `unknown`/`non_2xx`（F-122 把 401/403 分出成 `not_permitted`，见 §1.7）。
8. `:158-171` 只认 `{"status":"executed"|"not_executed"}`；`basis` 经 `declaredBasis()`（`:78-82`）只认 `current_state` / `receipt`，其余与缺席一律 `null`。
9. `:172-180` 认不出的响应体 ⇒ `unknown`/`unrecognized_answer`。
10. `:181-188` 异常按 `timeout` / `unreachable` / `call_failed` 归类，全部 `unknown`。

`canAsk()`（`:201-212`）是同一组门的**不发请求**版本，供读面与清扫使用。

### 1.2 声明面

- `Server-NestJS/src/ai/proxy/proxy-tool.ts:39-54`：`ProxyToolConfig.statusPath`，注释写明「`[METHOD] path`、`{占位}`，与 `revokePath` 同一约定；只接受 GET」。
- `proxy-tool.ts:94-95` 只读字段；`:130-132` 能力派生：`statusLookup: cfg.statusPath ? 'yes' : 'unknown'`。**这是新增模式必须同步的一处**：只配历史端点、不配状态端点的工具，按现逻辑会被判成 `unknown` 而不能问。
- `Server-NestJS/src/ai/interfaces/tool.interface.ts:244-263`：`ToolCapabilityDeclarations.statusLookup` 的三值语义；`:290` 解析时缺席填 `unknown`。
- 配置从 Settings `ai_proxy_tools` 整体透传（`proxy-tool.service.ts:37-80`），**没有字段白名单**，故新增 `historyPath` 不需要改注册服务。
- OpenAPI 导入器把 `x-keelbase-status-path` 映射为 `statusPath`：`scripts/generator/import-openapi-proxy.mjs:161-163`，测试 `scripts/keelbase-init.test.mjs:1500`。

### 1.3 词表

`Server-NestJS/src/governance-core/target-status.ts`：

- `:28-35` 结论 `executed` / `not_executed` / `unknown`。
- `:61-66` 种类 `current_state` / `receipt`；`:79` 读面种类另加 `unknown`。
- `:93-107` 成因：`target-status-unavailable` / `misconfigured` / `timeout` / `unreachable` / `call_failed` / `non_2xx` / `unrecognized_answer`。
- `:121-139` 一次查询留下的证据结构（`queriedAt` / `queryMethod` / `queryPath` / `conclusion` / `reason` / `basis`）。

### 1.4 对账与落账

`Server-NestJS/src/governance-shared/services/ai-tool-effects.service.ts`：

- `:423-474` `reconcileClaim()`：三道守卫（非 `claimed`、未过陈旧阈值、没有探针/通道）→ 调 `probe.lookup()` → `_recordLookup()` 落证据。
- `:485` 只有**真答案**才动账（`claims.reconcileClaim`）；`:476-483` 结论 `unknown` 一律 `unresolved`，账保持 `claimed`。
- `:648-651` 每小时清扫用 `canAsk()` 决定跳过，`skippedUnaskable` 只计数、不写证据行。
- `:742-770` `_recordLookup()`：把 `queryMethod` / `queryPath` / `conclusion` / `reason` / `basis` 写进 `ai_target_status_lookups`。

### 1.5 证据表与读面

- 实体 `Server-NestJS/src/governance-shared/entities/target-status-lookup.entity.ts:56-77`：`query_method` `varchar(8)`、`query_path` `varchar(255)`、`conclusion` `varchar(16)`、`reason` `varchar(32)`（显式 `type: 'varchar'` 是因为 TS 联合会被反射成 `Object`，sqlite 拒绝）；`:79-95` `basis` `varchar(16)` 可空、无默认、不回填。
- 读面 `write-claim-query.service.ts:232-310` `lookupsFor()`：范围判定、F-85 的 `seq`/`intervalSeconds`、R-2 的 `coverage`；`:463-474` `projectLookup()` 原样透出 `reason` 与 `basis`（`l.basis ?? 'unknown'`）。
- 在途清单 `lastLookup` 与 `reconcilable` 都取自同一探针的 `canAsk()`（`write-claim-query.service.ts:312-315`）。

### 1.6 决定行与拷贝

- `write-claim-decision.service.ts:385-443` `_releaseEvidence()`：单条窗口查询（`COUNT(*) OVER ()` + `LIMIT 3`）读最近读数；`items[]` 带 `id`（读数行主键）、`at`、`conclusion`、`reason`、`basis`、`lookedUpBy`；`:436-442` 最新 id 即**水位**。
- R-3 已定：拷贝是边界而非全集；一致性靠读数表**仅追加**（无 update/delete/保留期）。
- 因此新增成因值会**自动**随拷贝进入审计行的链外列 `releaseLookups`，无需改构造器。

### 1.7 F-122（`not_permitted`）当前状态

- 主 `main` `f45d9655` 上**没有** `not_permitted`（`governance-core/target-status.ts` 的成因表止于 `unrecognized_answer`，`ai/proxy/target-status.ts:155-157` 仍是全量 `non_2xx`）。
- 它在分支 `claude/wonderful-banach-252d61`：`8c280a5e`（实现）+ `49a67954`（读数），**未并入 main**（`git branch --contains` 仅该分支）。
- 本提案把 `not_permitted` 当作**将要落地**的既有成因复用；若它最终不落，历史模式的「拒绝」需要自成一个取值，不建议。

### 1.8 覆盖事实

- `Server-NestJS/src/ai/proxy/outbound-target-facts.ts:48-51`：B 路径「写工具没有 `statusPath` ⇒ 问不到」。**只配 `historyPath` 的工具按现逻辑会被误报成缺口**，这是新增模式必须同步的第二处。
- 缺口定义 `governance-core/coverage-gaps.ts:254-270`：`target-status-unavailable`，`verdictImpact: 'partial'`，措辞是「an external write target offers no read-only status query」。

### 1.9 契约

- `releaseLookups` 在 `schemas/v8/ai-audit-log-row.schema.json:218-224` 只约束为 `["string","null"]`，**内部结构不约束**；向量 `ai-audit-log-release-evidence-v1-vector.json` 里的样本 `reason` 均为 `null`，没有枚举。
- 契约仓里**没有** `ai_target_status_lookups` 的表或 API schema（`grep -c lookups wire-schema-registry-v2.json` = 0）。
- 结论：新增成因值、新增 `historyPath` 配置键，均**不触契约**。

### 1.10 控制台

- `Web-Admin-Vue/src/views/ai-tools/AiToolsView.vue:589-598` `LOOKUP_REASON_KEYS` 把成因映射到文案键；`:599-602` 认不出的成因原样回退显示。`zh.ts:1241-1247` / `en.ts:1245-1251` 是现有七个键。

### 1.11 文档现状

- `docs/ai-agent.spec.md:430-441`（EN AW-17 段，含「只发 GET / 一次 / 目标身份 / 形状」四约束）与 `:455-466`（ZH，含「问不到的目标」）。
- 同文件 `:468-470`（EN）/ `:472` 起（ZH）的 AW-19 段也写着「`ProxyTool` 从 `statusPath` 派生 `statusLookup`」——新增模式后这句要一并改。
- `docs/revoke-contract.spec.md:574-754` §6，尤其 `:611-619`「目标可以被问一次，且只读」与 `:621-632`「目标驱动释放留下决定」。

---

## 2. 设计空间：三个方案

> 以下 §2–§8 是**建议**，不是事实；事实只到 §1 为止。凡与 §1 冲突处，以 §1 为准。

### 方案 A —— 历史只作证据，不参与收敛

声明 `historyPath`，GET 一次，把返回的历史当作**证据展示**；结论恒为 `unknown`，新增成因 `history-no-verdict`。

- 优点：零推导、零新增判决路径；账绝不会因为历史读错而动。
- 缺点：**没有收敛力**。对「事件就绪型目标」毫无帮助——而那正是唯一会声明 `historyPath` 的目标类型。
- 代价：探针 + 一个成因 + 文案，约一天。

### 方案 B（推荐）—— 历史端点仍由目标给判决

历史端点按**同一条声明协议**回答 `{"status": "...", "basis": "..."}`，可附 `history{available, coversActionKey, complete, retainedFrom, events}` 作披露。探针只读 `status` / `basis`，其余字段不解析；披露字段只在**没有判决**时转成 `unknown` 成因。

- 优点：
  1. 保住 AW-17 的唯一不变式：**只有目标自己说的话能让账动**（与现状同一条）。
  2. 与 R-1 一致：种类由目标声明，不从方法或路径反推。
  3. 对事件就绪型系统反而是最自然的实现——它本来就有事件，给个判决是加一层投影，不是造新存储。
  4. 不复制判断（R-3 口径）：证据行只说「问过什么、答了什么」，决定行只引用读数行 id。
  5. 日后若要方案 C，可在本形状上追加（事件条目自带状态），不必推翻。
- 缺点：目标侧必须做一次改造（历史端点 + 判决）。对「只能给列表、给不了判决」的目标无效。
- 代价：KeelBase 侧一个新配置键 + 一个解析分支 + 4 个成因 + 两处「可问」判据；目标侧一个端点。

### 方案 C —— 探针从事件列表推导结论

目标只给事件列表，探针按声明的「事件种类 → 结论」规则推导。

- 必须同时具备：① 事件种类词表（谁定？）；② 覆盖证明（窗口覆盖写入时刻、`complete: true`），否则「空历史」会被读成 `not_executed`——这正是 AW-17 要防的那个错。②若由我们判，`TargetStatusProbe.lookup` 得先拿到写入时刻（接口变更，见 §3.2）。
- 与 R-1 已裁的边界冲突：结论从**目标**转移到**我们**。R-1 的注释明说「收据不是权威声明……本词表说的是答案基于什么，不是它有多真」，推导等于我们开始判定「有多真」。
- 结论：**不建议本轮做**。若用户要，必须先立一条决定（谁有权给判决、覆盖证明由谁承担），那是比本模式更大的事。

**推荐：B。** 若用户希望先零风险观察一轮，退到 A 也可，但要知道它对 F-106 的场景（0 个可读历史目标）没有实际推进。

---

## 3. 推荐方案的详细规格（B）

### 3.1 模式怎么声明

新增配置键（与 `revokePath`、`statusPath` 并列）：

```
historyPath?: string   // `[METHOD] path`，如 "GET /contracts/{key}/history"
```

- 语义：**声明即选中历史模式**。没有 `historyPath` 时行为与今天完全一致。
- 复用现有约定，一字不改：`[METHOD] path` 拆分（`splitStatusPath`）、缺方法默认 GET、`{key}` 代表幂等键、代入后不得残留 `{占位}`、路径必须相对 `baseUrl`。
- **两条路径同时声明**：推荐记 `misconfigured`（发送前拒绝），理由——两处声明是两个问题，探针只问一个；猜哪个问，正是本项存在的意义所反对的那类错。`canAsk()` 仍返回 `true`（通道确实存在），与「配了但不可用仍报 `misconfigured`」的既有语义一致（`tool-effects.types.ts:359-380` 的接口注释）。
- 备选：`statusPath` + `statusMode: 'history'`。多一个键、表达同一件事，不推荐。

### 3.2 应答形状

```jsonc
{
  "status": "executed" | "not_executed",   // 收敛的唯一依据；缺席 ⇒ 不收敛
  "basis": "current_state" | "receipt",    // 可选；R-1 规则原样（缺席/认不出 ⇒ null）
  "history": {                              // 可选，纯披露；探针只在没有 status 时读它
    "available": true,                      // 明说「我不保留历史」时为 false
    "coversActionKey": true,                // 我保留的这段是否覆盖这个 key 发生的时刻
    "complete": true,                       // 这份回答是否把保留段内的条目都给全了
    "retainedFrom": "2026-11-01T00:00:00Z", // 仅作说明，探针**不**拿它与任何时钟比较
    "events": [ { "at": "...", "kind": "accepted" } ]  // 探针不解析、不存储
  }
}
```

- `status` 存在 ⇒ 与今天完全同路：`executed` → `settled`，`not_executed` → `released`，`basis` 照记。
- `status` 缺席 ⇒ 一律 `unknown`，按 `history` 的**显式披露**选成因（见 §3.4）。**空历史且无披露 ⇒ `history-no-verdict`。**
- 判断「覆盖不覆盖」由**目标**说（`coversActionKey`），不由我们拿 `retainedFrom` 与占位时刻比：`TargetStatusProbe.lookup(toolName, actionKey, userId)` 的签名里**没有写入时刻**（`tool-effects.types.ts:368`），要比就得改接口；而目标的时钟与我们的时钟谁更可信，本就不该由我们裁决。备选（若用户偏好由我们判）：给 `lookup` 增一个可选 `writtenAt`，代价是接口变更与一次跨系统时间比较。
- 事件列表**不入库**：证据表没有列可放，也不该为此加列（那是把目标的响应复制进我们的账）。要再看，就再问一次目标。

### 3.3 只读、一次、不重试怎么保持

- `:129-135` 的三道构造性守卫整段复用（只 GET、相对路径、`{key}` 必须存在且代入干净）。
- 仍然**只有一次** `proxyFetch`（`:147-154`），不跟随分页、不跟游标、不重试。
- **历史答 `unknown` 时不得回退去问 `statusPath`**：那会在一次对账里发两个请求，正是「一次询问」要避免的。下一次询问由清扫计划决定（预算与衰减不变）。
- 身份仍是**原写入者**（`:137-143` 不变）。

### 3.4 新成因清单

| 成因 | 何时产生 | 目标说了什么 | 为什么不是 `not_executed` |
|------|----------|--------------|---------------------------|
| `not_permitted`（复用，F-122） | 401/403 | 「不让你看」 | 拒绝不等于没跑 |
| `history-unavailable`（新，可选） | 2xx，目标明说没有历史（`history.available:false`） | 「我不保留」 | 不保留 ≠ 没发生 |
| `history-does-not-cover`（新） | 目标显式披露 `history.coversActionKey:false` 且无 `status` | 「这个 key 的时段我留不到」 | 留不到 ≠ 没落库 |
| `history-truncated`（新） | 目标显式披露 `history.complete:false`（或 `hasMore:true`）且无 `status` | 「还有，但不在这份回答里」 | 没看到 ≠ 没有 |
| `history-no-verdict`（新） | 返回了历史（含空列表），但没有 `status` | 给了材料、没给判决 | 材料不是判决 |
| `unrecognized_answer`（复用） | 根本不是历史形状 | 「答了，认不出」 | 认不出 ≠ 没跑 |
| `misconfigured`（复用） | 非 GET / 绝对路径 / 缺 `{key}` / 残留占位 / 两条路径同时声明 | 「配置不可用」 | 没问 ≠ 没跑 |
| `timeout` / `unreachable` / `call_failed` / `non_2xx`（复用） | 传输层 | 没有回答 | 沉默不是答案 |

无 `status` 时按固定优先级取成因，避免同一次回答落进两个名字：

`history.available:false` → `history-unavailable`；否则 `history.coversActionKey:false` → `history-does-not-cover`；否则 `history.complete:false` → `history-truncated`；否则（含空列表、含只有 `events` 的回答）→ `history-no-verdict`。形状认不出（连 `history` 都没有、或类型不对）→ `unrecognized_answer`。

四条硬规则：

1. **没有披露的空历史 = `history-no-verdict`**，不是 `not_executed`。这是本模式最重要的一行。
2. `history-unavailable` **只来自 2xx 的显式声明**；历史端点 404/501 ⇒ 仍是 `non_2xx`（路由不在，不等于目标在说「我不保留」）。
3. 成因只在使用**历史模式**时产生，但写入同一张表、同一个字段、同一段读面——读者不需要知道模式，`queryPath` 已说明问的是哪个端点。
4. `history-does-not-cover` 与 `history-truncated` **只在没有 `status` 时**才被选中。目标既给了判决、又披露了不全，是它自己的两份声明；我们按判决收敛并使用 `basis`（R-1：我们不审它的收据）。若用户不同意，见 D3。

### 3.5 决定行与证据行如何引用历史读数

- 证据行：一步不多——每次尝试仍是一行，`queryMethod` = `GET`，`queryPath` = 实际请求的历史路径（只读事实，读面原样输出），`conclusion` / `reason` / `basis` / `asUserId` / `lookedUpBy` 同今天。
- 决定行：`releaseLookups.items[]` 原样把上述值连同**读数行 id** 拷进审计行（`write-claim-decision.service.ts:423-435`），水位仍是最新 id（`:436-442`）。R-3 的「拷贝是边界不是全集」「只装观测值、不装派生值」两条不变；历史模式**不新增派生值**。
- 因此**不需要新列、不需要迁移**。

### 3.6 读面与控制台的最小改动面

后端（三处判据，零字段）：

1. `proxy-tool.ts:131` 的能力派生改为 `cfg.statusPath || cfg.historyPath ? 'yes' : 'unknown'`。
2. `ai/proxy/outbound-target-facts.ts:48-51` 的可问判据改为「既无 `statusPath` 又无 `historyPath` 才算缺口」；否则只配历史端点的目标会被误报覆盖缺口。
3. `canAsk()`（`target-status.ts:201-212`）接受 `historyPath`，守卫同 `lookup()`（GET / 相对 / `{key}` / 不同时声明）。这一步决定清扫与「可对账」按钮是否亮。

读面 `write-claim-query.service.ts` **一行不改**：`projectLookup` 已经透出 `reason`/`basis`/`queryPath`。

控制台：`AiToolsView.vue:589-598` 加 4 个映射键，`zh.ts`/`en.ts` 各加 4 条文案（如「历史不可用」「历史未覆盖该时段」「历史被截断」「历史未给判决」）。无布局改动。

导入器：`import-openapi-proxy.mjs:161-163` 增 `x-keelbase-history-path` → `historyPath`，并补 `keelbase-init.test.mjs:1500` 同形的测试。

### 3.7 迁移与契约结论

- **迁移：不需要。** 新成因值是 `varchar(32)` 列上的字符串（最长 `history-does-not-cover` 22 字符，`history-unavailable` 19，`history-no-verdict` 18）；`historyPath` 是 Settings JSON，不入表。
- **契约：不需要。** 三条依据：`releaseLookups` 在 v8 schema 里是 `string|null`、内部结构不约束（`schemas/v8/ai-audit-log-row.schema.json:218-224`）；`ai_target_status_lookups` 不在契约内（registry 中 0 次 `lookups`）；配置键不是 wire schema。若日后把事件条目也写进审计行，那才会触契约——本提案明确不做。

### 3.8 覆盖声明

- 现有 `target-status-unavailable` 的措辞（「offers no read-only status query」）在历史模式下**仍然成立**：声明了 `historyPath` 的工具就是「有查询」，不该报缺口。
- 是否新增一个「有状态查询但无历史查询」的缺口 id（如 `target-history-unavailable`）：**建议本轮不做**。F-106 是 0，一上线会让每个部署都多一条缺口，而它不是「无法收敛」的缺口——只是「证据少一类」。若要，见 D4。

---

## 4. 非目标

1. 不改 `statusPath` 的任何语义、默认值或现有目标的行为。
2. 不跟随分页、不跟游标、不重试、不在一次对账里问第二个端点。
3. 不从事件列表推导结论（方案 C 不在本轮）。
4. 不新增表、不新增列、不写迁移。
5. 不把目标的历史条目存进我们的库。
6. 不改 claim 状态机、自动重问预算、陈旧阈值、释放闸。
7. 不改契约仓；不新增审计 `action`。
8. 不给 `basis` 增加 `history` 取值（理由见 §5）。

## 5. 被否决的备选（附理由）

- **`basis: 'history'`**：`basis` 回答的是「答案基于什么」，不是「问的是哪一类端点」。历史读数本质上仍是目标的事件/受理记录，即 `receipt`；新增取值会把「问题形式」和「证据种类」揉进同一个词表，且读面/拷贝/文档三处都要跟着改。模式从 `queryPath` 与配置即可读出。
- **`statusPath` 扩展（如 `GET /x/{key}?view=history`）**：等于「把查询改大」，与 F-106 的口径相反；也让 `statusPath` 的既有语义（单次当前状态）不再冻结。
- **`statusMode` 显式键**：表达的信息与 `historyPath` 是否出现完全重复，多一个键就多一处不一致的可能。
- **同时声明时回退**：一次对账两个请求，且把「问哪个」这个决定藏进了运行时。

---

## 6. 停止条件

出现下列任一情况，停下并把问题带回裁定，而不是就地扩大实现：

1. 需要分页才能到达写入时刻 ⇒ 就停在 `history-truncated`，不上分页。
2. 需求变成「让探针自己判 `executed`/`not_executed`」⇒ 回到 D2，C 需要独立决定。
3. 需要把历史条目存进库里（审阅者要离线看）⇒ 回来重新设计，那会触迁移与契约。
4. 实现中发现必须新增列或改 `releaseLookups` 的内部结构 ⇒ 同上。
5. 某集成方要求「两条路径都声明并自动回退」⇒ 回到 D1。

---

## 7. 待用户裁定的点

- **D1 模式声明**：独立 `historyPath`（推荐）／`statusPath` 扩展／`statusMode` 显式键？两条同时声明时：`misconfigured` 拒绝（推荐）／`statusPath` 优先？
- **D2 判决权**：目标给判决（B，推荐）／探针从事件推导（C）／只作证据（A）？
- **D3 目标自相矛盾**（说了 `not_executed` 又说历史不全）：以目标的判决为准（推荐，符合 R-1 不审收据）／降为 `unknown` + `history-truncated`？
- **D4 成因与缺口粒度**：`history-unavailable` 要不要（推荐要）？是否新增覆盖缺口 `target-history-unavailable`（推荐本轮不做）？
- **D5 `basis`**：保持两个取值、历史读数归 `receipt`（推荐）／新增 `history` 取值？

---

## 8. 下一轮实现清单（若按 B 执行，供排期用，不含在本提交内）

1. `governance-core/target-status.ts`：成因表加 3–4 个值（含注释：每一种都是「目标没告诉我们」）。
2. `ai/proxy/proxy-tool.ts`：`historyPath` 配置字段 + 只读字段 + 能力派生（`:131`）。
3. `ai/proxy/target-status.ts`：模式选择、路径守卫复用、历史解析分支、`canAsk` 扩展。
4. `ai/proxy/outbound-target-facts.ts`：可问判据（`:48-51`）。
5. `scripts/generator/import-openapi-proxy.mjs` + `keelbase-init.test.mjs`：`x-keelbase-history-path`。
6. `Web-Admin-Vue`：`LOOKUP_REASON_KEYS` + `zh.ts`/`en.ts` 文案 + 视图测试。
7. 测试：`ai/proxy/target-status.spec.ts` 每个成因至少一例，必须有「空历史 + 无披露 ⇒ unknown」与「拒绝不发第二个请求」两条反向对照；`write-claim-query.service.spec.ts` 成因透传；`target-status-reconcile.spec.ts` 目标驱动释放。
8. 文档：`docs/ai-agent.spec.md` AW-17 与 AW-19 两段（EN+ZH）、`docs/revoke-contract.spec.md` §6（EN+ZH）、`CLAUDE.md` §9 两行（reconcile 与 lookups）、`docs/manual/ai-bridge*.md`、`proxy-tool.ts` JSDoc。

---

## 9. 验证记录（本提案包含的核对）

- 契约 pin：`git -C Server-NestJS/specs/protocol rev-parse HEAD` ⇒ `015f474ebf0cf5f45c855614b18020857665c700`。
- 主 `main`：`f45d9655`。
- F-122 归属：`git branch --contains 8c280a5e` ⇒ 仅 `claude/wonderful-banach-252d61`（`49a67954` 为同分支读数）。
- 契约内无 `lookups` 相关 schema：`grep -c lookups wire-schema-registry-v2.json` ⇒ `0`。
- 本提案未运行测试、未改代码；文中每条现状陈述均可按 §1 的文件行号复核。
