# Release Gate（0.9.x 里程碑质量门禁 / 阶段 2 Phase 4）

> 依据 development-plan §7.1 Phase 4：**Code Complete ≠ Product Validated**。本文件把 Release Gate 落地为可执行检查单。
> **版本策略（2026-08-18 用户决定）**：先不发行 1.0，**继续 0.9.x 版本线**——本 Gate 作为 0.9.x 里程碑质量检查；五维不达标 → 记录差距进下一迭代；1.0 是否发另行决策。

---

## 门禁总览

| 维度 | 核心指标 | 当前状态 | 验证方法 |
|---|---|---|---|
| **Build** | 30min Create——陌生开发者从零生成带权限/AI 工具/确认/审计的模块 | 🔶 工程已通 | [dev-challenge.md](dev-challenge.md) + [30min-acceptance.md](30min-acceptance.md) |
| **Run** | 1hr 真实业务任务 + Agent Success Rate | 🔶 需 LLM 实测 | 三旗舰业务任务 + [verify-flagships.sh](../../scripts/verify-flagships.sh) LLM 部分 |
| **Trust** | Safe Execution / Unauthorized Action / Human Intervention Rate | ✅ 无 LLM 部分全绿 | [verify-flagships.sh](../../scripts/verify-flagships.sh) + HS e2e |
| **Private** | Offline + Local AI（数据不出域）| 🔶 需 Ollama 实测 | [private-ai-verification.md](private-ai-verification.md) + [verify-private-ai.sh](../../scripts/verify-private-ai.sh) |
| **External** | 5-10 人 + 至少一个真实项目 | ⬜ 需社区 | [dev-challenge.md](dev-challenge.md) 反馈表 |

**判定**：五维全部达标才发 v1.0；任何一维不达标 → 记录差距，不发布。

---

## 1. Build：30min Create

**指标**：陌生开发者 30 分钟内生成一个业务模块（权限 + AI 工具 + 确认 + 审计）。

| 检查点 | 命令 / 证据 | 达标线 |
|---|---|---|
| 协议 → 模块 | `node scripts/keelbase-init.mjs --spec specs/<module>.json` | 输出「生成业务模块」+ 多端接线 |
| 编译 | `cd Server-NestJS && npm run build` | 0 error |
| 迁移 | `npm run migration:generate -- src/migrations/Add<Module>` | 生成迁移 + 一致性 No changes |
| 单测 | `npm test -- <plural>.service` | 通过 |
| API | `curl /api/v1/<plural>`（带 token）| 200 + 本人数据 |
| **生成模块 e2e** | `npx jest --config test/jest-e2e.json test/generated-modules.e2e-spec.ts` | 通过（CRUD + admin 403/200 + 401）|

**实测记录**：generated-modules e2e 3 通过；suppliers/contracts 模块已生成并接线。

## 2. Run：1hr 真实业务任务 + Agent Success Rate

**指标**：AI 在 1 小时内完成真实业务任务（如 CRM「找风险客户建跟进」）；Agent Success Rate（AI 独立完成/人工干预完成/失败）。

| 检查点 | 方法 |
|---|---|
| 三旗舰业务任务 | 用 `alex` 账号各跑一次：CRM 找风险客户建任务 / PM 判断延期建任务 / Approval 预审+复核 |
| Agent Success Rate | 记录每次任务：AI 全程独立完成（SUCCESS）/ 需人工介入（HUMAN_INTERVENTION）/ 失败（FAIL）|
| 时间 | 每任务目标 <20min（三任务 1hr 内）|

**前置**：需要 LLM/Ollama 环境（`verify-private-ai.sh` 先通）。

## 3. Trust：Safe Execution / Unauthorized Action / Human Intervention Rate

**指标**：AI 只在授权范围内操作；写操作必确认；可审计可撤销。

| 检查点 | 命令 | 达标线 |
|---|---|---|
| 三旗舰 + 生成模块 e2e | `./scripts/verify-flagships.sh` | 7/7 通过 |
| 越权 | e2e（他人数据 403 / admin 端点 403 / user 访问 admin 403）| 全部 403 |
| 写操作确认 | e2e（approval decide / create 需确认）| 写操作无绕过 |
| 审计哈希链 | `/audit/verify` + `/audit/operations/verify` | valid: true |
| 撤销 | 本人撤销 AI 副作用（P0-15）+ admin 撤销 | 软删可恢复 |

**状态**：✅ 无 LLM 部分全绿（HS e2e + verify-flagships 7/7）。

## 4. Private：Offline + Local AI

**指标**：数据不出域——本地 LLM / 本地 embedding / 本地审计全链路。

| 检查点 | 命令 |
|---|---|
| 一键验证 | `./scripts/verify-private-ai.sh`（Cloud OFF + Ollama + 本地 embedding + AI 冒烟）|
| CRM Golden Path | verify-private-ai.sh 第 5 步 + [private-ai-verification.md](private-ai-verification.md) §8 |
| 离线部署 | [offline-deploy.md](offline-deploy.md) |

**状态**：🔶 需 Ollama 实测（脚本已就绪，本机无 Ollama）。

## 5. External：5-10 人 + 至少一个真实项目

**指标**：不认识作者的外部开发者完成挑战，至少一个放进真实项目。

| 检查点 | 方法 |
|---|---|
| 招募 5-10 人 | Dev Challenge 发布（[dev-challenge.md](dev-challenge.md)）|
| 反馈采集 | 反馈表：Where stuck / Why stuck / Missing abstraction |
| 真实项目 | 至少一个 PoC 进入外部开发者真实项目 |

**状态**：⬜ 需社区运营。

---

## 结论模板

```text
v1.0 Release Gate 结论：
- Build: ✅/❌（证据）
- Run:   ✅/❌（Agent Success Rate = ?）
- Trust: ✅/❌
- Private: ✅/❌
- External: ✅/❌（N 人 / 真实项目数）
→ 达标 / 不达标（差距：...）
```

## 相关

- [dev-challenge.md](dev-challenge.md) — 外部开发者验收包
- [verify-flagships.sh](../../scripts/verify-flagships.sh) — 三旗舰严格验收
- [verify-private-ai.sh](../../scripts/verify-private-ai.sh) — 数据不出域验证
- [30min-acceptance.md](30min-acceptance.md) — 30 分钟验收内部版
