# 30min Build 外部验证 / 30-min Build External Verification

> **定位（V-6）**：30min-acceptance.md 的**外部验证仪器**——让一位不熟悉 KeelBase 的开发者**亲自计时**完成「30min Build」，记录实际耗时并对照 30 分钟门槛判定。本文是被验证者与验证者共用的计时记录表。
> **Positioning (V-6)**: the external verification instrument for [30min-acceptance.md](30min-acceptance.md) — let a developer unfamiliar with KeelBase **personally time** the 30-min Build, record actual durations, and judge against the 30-minute gate.

> **背景**：[30min-acceptance.md](30min-acceptance.md) 定义了 10 步技术链路（协议 → 生成 → 编译 → 迁移 → 单测 → API → 前端 → AI 工具 → 确认+审计 → 权限）。本文把它变成可记录的计时实验。

---

## 0. 被验证者条件 / Subject Profile

- **不熟悉 KeelBase**（未用过 `keelbase init`、未读过生成器代码）——本文档是首次接触
- 熟悉一种后端语言（Java / Go / Node 均可，不限 TypeScript）
- 有 Node 22 + Docker 或本地环境

## 1. 环境 / Environment

```bash
# 干净 clone（或干净工作区）
git clone <keelbase-repo> && cd KeelBase
npm install            # Server-NestJS
# 后端可启动（任意一种）
npm run start:dev      # 或单容器
```

## 2. 计时流程 / Timed Flow

从「打开文档」计时开始，按表逐行执行。**每完成一行，记录实际耗时**（不回头修，卡住 ≤2 分钟就记失败原因）。

| # | 步骤 | 动作 | 预期耗时 | 实际耗时 | 结果 ✅/❌ |
|---|---|---|---|---|---|
| 1 | 写协议 | 用 `specs/contract.json`（或自写一个）作为模块协议 | ~3 min | ______ | |
| 2 | 生成 | `node scripts/keelbase-init.mjs --spec specs/contract.json` | ~1 min | ______ | |
| 3 | 编译 | `cd Server-NestJS && npm run build` | ~1 min | ______ | |
| 4 | 迁移 | `npm run migration:generate -- src/migrations/Add<Module>` | ~1 min | ______ | |
| 5 | 单测 | `npm test -- <plural>`（如 contracts） | ~30 s | ______ | |
| 6 | API | 起服务 `curl /api/v1/contracts`（带 token）→ 200 | ~2 min | ______ | |
| 7 | 前端 | `cd Front-Flutter && flutter analyze`（0 error） | ~2 min | ______ | |
| 8 | AI 工具 | `query_contracts`（读）+ `create_contract`（写需确认）已在工具清单 | 0（自动） | ______ | |
| 9 | 确认+审计 | AI 对话「创建一条合同」→ 确认 → 落库 → 审计哈希链 | ~5 min | ______ | |
| 10 | 权限 | 另一账号访问他人数据 → 403 | ~1 min | ______ | |
| | **合计** | | **≤ 30 min** | **______** | |

> 步骤 8-10 可用自动化校验替代手动：`node Server-NestJS/scripts/verify-golden-crm.mjs`（AI 黄金流程：分析→确认→创建→审计→撤销，写报告到 `docs/benchmark/`）。

## 3. 判定门槛 / Gate

- ✅ **通过**：总耗时 ≤ 30 分钟，且步骤 3/5/6/9/10 全部通过（编译 0 error、单测绿、API 200、确认落库、越权 403）
- ⚠ **有条件通过**：总耗时 ≤ 30 分钟但个别步骤失败（记录失败点，可接受 1 处非关键失败，如步骤 7 前端 analyze 警告）
- ❌ **未通过**：总耗时 > 30 分钟或关键链路（3/5/6/9/10）失败

## 4. 记录输出 / Record Output

验证完成后填写并提交：

```
被验证者背景：________________（语言栈 / 是否用过 KeelBase）
开始时间：________  结束时间：________  总耗时：________
模块名：________（如 contracts）
结果：通过 / 有条件通过 / 未通过
失败/卡点记录：____________________
建议：____________________
```

> 结果沉淀到 `docs/benchmark/30min-build-*.md`（本实验首次外部运行后补写实际数据）。

## 5. 相关 / Related

- [30min-acceptance.md](30min-acceptance.md) — 30min Build 技术链路与验收基准（本验证的上游定义）
- [verify-golden-crm.mjs](../../Server-NestJS/scripts/verify-golden-crm.mjs) — 步骤 8-10 的自动化校验
- [adoption-30min.md](adoption-30min.md) — 30 分钟接入治理（运行时侧，MOAT-1，与此构建侧互补）
