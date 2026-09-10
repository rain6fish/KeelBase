# Proof Card 外部验证指南 — Proof Card External Verification

> 面向**外部独立开发者**：在干净的机器上按本页复现 KeelBase 的 Protocol × Trust Proof Card，并把结果交回。这不仅是「跑一次脚本」——你的运行（`EXECUTOR=<github_id>`）是 KeelBase 能否对外声明 PASS 的**独立证据**（规格 docs/protocol-trust-proof-card.spec.md §3：只有非作者的陌生开发者跑出的卡才算有效）。

> **现阶段状态（诚实声明）**：仓库内已有的记分卡全部是**作者内部预跑**（R2=yellow，作者自跑）。要成为**对外可声明的 PASS**，需要你（陌生开发者）跑出 R2=green 且无红行。本页就是为此准备的。

---

## 0. 一分钟看懂

| 项 | 值 |
|---|---|
| 验证什么 | 一条 spec（如 `specs/leads.json` / `specs/invoices.json`）→ keelbase-init 生成普通源码 → 编译运行 → **生成物自带的 AI 工具自动进入治理**（写需确认/只读自动）→ 确认/拒绝 → 证据根离线可验 + 篡改即断 → 撤销软删 → 重跑幂等 |
| 你要做什么 | clone → `npm ci` → 跑 1 条命令 → 把记分卡贴回 GitHub Issue |
| 时长 | `npm ci` 数分钟；**干净 clone 首次跑卡 ≈10-12 分钟（绝大部分是后端 `npm run build`，不是卡逻辑）**；已有 `dist` 时增量重跑才 ~1-2 分钟 |
| 需要 LLM key 吗 | **不需要**（确定性 demo provider，无外部依赖） |
| 需要数据库吗 | 不需要（SQLite 自动；后端自起隔离端口，不动你机器上已有的 3000） |
| OS | macOS / Ubuntu 22.04+ / Windows 10+（Git Bash） |
| 前置 | Node.js ≥ 20 + npm + git；脚本另需 `openssl` `sha256sum` `curl` `mktemp`（Windows Git Bash 另需 `cygpath`、停服走 `taskkill`）——这些通常随 Git Bash 自带 |

## 1. 你是谁（陌生开发者判定，规格 §3）

同时满足才算有效：

- **S-1**：非 KeelBase 作者 / 从未向本项目提交过代码；
- **S-2**：只按本页 + 公开文档执行，不读 `src/` 实现；
- **S-3**：熟练 NestJS/TypeScript（跑卡需要能判断编译/脚本报错），对 KeelBase 零经验；
- **S-4**：执行期间不询问作者。

跑的时候把 `EXECUTOR` 设成你的 GitHub id 即可（不满足 S-1..S-4 也没关系，如实记录即可，卡会标「内部预跑」）。

## 2. 环境与基线

```bash
git clone https://github.com/rain6fish/KeelBase.git
cd KeelBase            # 仓库根
git checkout <本页顶部列出的 tag/commit>   # 见下方「当前基线」
cd Server-NestJS
npm ci                 # 装依赖（数分钟）
```

> **当前基线**：请在**最新 release tag** 上运行（card 会自行记录实际 baseline）。若你 clone 的是 master，记分卡会带上 master 的 commit hash——同样有效，只要如实。

> **⚠️ 跑卡会改写工作树**：这不是只读操作。生成器会**新增生成模块文件**并**改写 15 个已跟踪文件**（`.keelbase/manifest.json`、后端/Flutter/Taro/Vue 的接线文件）。请在**一次性 clone** 里跑、跑完丢弃，别在你正在开发的分支上跑。

## 3. 跑卡（任选一条即可）

> **两条卡请各用一个全新 clone**（同一 clone 里连跑会让第二条继承第一条的生成物；虽然 R10 幂等已修，仍建议 clone 隔离以保证干净）。

### 3a. 生成模块卡（invoices）

```bash
cd Server-NestJS
EXECUTOR=<your-github-id> npm run verify:protocol-trust
```

### 3b. CRM Reference 卡（leads 生成轨 + AI CRM 旗舰轨，推荐）

```bash
cd Server-NestJS
EXECUTOR=<your-github-id> npm run verify:protocol-trust:crm
```

> **端口**：`verify:protocol-trust` 默认占 **3399**（`BENCH_PORT` 可改）；`verify:protocol-trust:crm` 用 **3419**（内部生成轨用其 -20 即 3379）。若这些端口被占，脚本**不会**主动报错——可能静默连到外来 server 得到错误结果。跑前请确认端口空闲，或显式 `BENCH_PORT=<空端口>`。
> **Windows 请用 Git Bash**（脚本用 `cygpath`/`taskkill`）。
> 跑完记分卡在 `Server-NestJS/docs/benchmark/protocol-trust-card-<UTC时间>.md`（**真 UTC**）。CRM 卡另产独立的生成轨卡；committed 的 `protocol-trust-card-crm-2026-09-08.md` 是作者写的汇总说明，不是每次跑自动更新。

## 4. 怎么读懂结果

> 规格定义的十行是 **R1-R10**；记分卡实际显示约 **20 行**——因为把关键行拆了子断言（如 R6b/R6c 写确认/读自动、R7b/R7c 副作用/轨迹、R8b 篡改检测、R9b 撤销生效）。看红行即可，不必逐行对号。

- **PASS**：R1-R10 无红行，且 R2 = green（`github=<你的id>`）。
- **R2 = yellow**：你没有填 `EXECUTOR`，或自我判定不满足 S-1..S-4 → 结果仍有效但记为「内部预跑」，不是外部 PASS。
- **红行**：**红行是诊断，不是脚本失败**（规格 §6）。请把红行**逐字**贴回 Issue——这正是 KeelBase 要找的「卡暴露的真实缺口」，不是要你修，是要你如实报告。
- 每条都跑不出（编译失败/命令不存在）：先对照本页命令与 Node 版本；仍不行就把终端原文贴回 Issue。

## 5. 把结果交回来

在 GitHub 仓库开一个 Issue，标题：`[Proof Card] external run by <your-github-id>`，正文贴：

```text
- 基线：<记分卡头部的 baseline>
- 命令：verify:protocol-trust  /  verify:protocol-trust:crm（注明跑了哪个）
- R2：green(your id) / yellow(内部预跑)
- 红行数：N
- 记分卡全文：<把 protocol-trust-card-<ts>.md 内容贴进来，或附上 pastebin>
- 环境：OS / Node 版本 / 时间
- 备注：任何红行/卡点的原文
```

作者收到后会据此把这张卡标记为「外部 PASS（由 <id> 验证）」，或把红行转成 roadmap 诊断项。你的报告就是 KeelBase 的证据——请如实，哪怕结果是 FAIL 也一样有价值。

## 6. 这张卡**不**证明什么（诚实边界，规格 §8 / SECURITY.md N-1..N-13）

- 不证明「KeelBase 能生成任意复杂业务系统」——协议只覆盖高频 20% CRUD 子集；analyze / R5 不可逆阻断 / R4 双人审批等**旗舰级深度为手写**。
- 不证明跨系统 saga / 分布式事务回滚、DBA 级信任、不可抵赖存储。
- 它只证明一件事：**一条 spec 生成的模块，从生成起就携带可治理语义并进入受治理的执行环境**（写需确认、证据可离线验、撤销真实软删）。

## 7. 关联文档

- 规格：`docs/protocol-trust-proof-card.spec.md`（十行测量定义）
- 现有内部预跑留档：`Server-NestJS/docs/benchmark/protocol-trust-card-*.md`（invoices/leads）、`protocol-trust-card-crm-2026-09-08.md`
- 复现命令即上述 §3（脚本 `Server-NestJS/scripts/proof-protocol-trust.sh` / `proof-crm-reference.sh`）
