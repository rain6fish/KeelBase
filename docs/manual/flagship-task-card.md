# 三旗舰 LLM 实测任务卡（阶段 2 Run/Private 维度）

> 目的：在**真实 LLM（本地 Ollama 或云端）**下，用演示账号把三旗舰各跑一个真实业务任务，验证「AI 真正干活 + 安全干活」，并记录 **Agent Success Rate**（Release Gate Run 维度）。
> 前置：单容器或本地后端已起 + 演示账号（alex / 123456，空库首启自动种 seed）。LLM 配置见 [private-ai-verification.md](private-ai-verification.md)（AI_PROVIDER=ollama 或云端）。
> 无 LLM 的验收（CRUD/CASL/确认/审计 HTTP 层）见 [verify-flagships.sh](../../scripts/verify-flagships.sh)。

---

## 前置准备（一次）

```bash
# 1. 起 Ollama + 模型（本地 AI 实测）
docker run -d -p 11434:11434 ollama/ollama
ollama pull qwen2.5:7b && ollama pull bge-m3
# 2. 起 KeelBase（本地后端，AI 走本地）
cd Server-NestJS && AI_PROVIDER=ollama OLLAMA_BASE_URL=http://localhost:11434 npm run start:dev
# 3. 登录 alex（空库自动种三旗舰 seed：CRM 8 客户 / PM 4 项目 / Approval 3 政策+3 请求）
```

## 任务卡 A：AI CRM「找风险客户建跟进」

| 项 | 内容 |
|---|---|
| 用户输入 | 「哪些客户本周最值得跟进？」 |
| 期望 AI 工具序列 | `query_customers` → `query_customer_orders` → `analyze_customer_risk`（读，蓝色「读」徽标）|
| 期望回答 | 指出云帆商贸（逾期订单 + 连续两月未续约）等高风险客户 |
| 跟进写操作 | 「为云帆创建跟进任务」→ `create_followup_task`（写，橙色「写」+ 确认框）→ 确认 → 落库 →「已确认 · 可撤销」|
| 观测点 | 工具卡读/写徽标 + 确认 + 审计（管理台 AI 审计）+ 撤销（轨迹页）|
| 结果 | ☐ SUCCESS ☐ HUMAN_INTERVENTION ☐ FAIL |

## 任务卡 B：AI Project「判断项目延期风险」

| 项 | 内容 |
|---|---|
| 用户输入 | 「帮我看看哪些项目有延期风险」|
| 期望工具序列 | `query_projects` → `query_project_tasks` → `analyze_project_risk`（读）|
| 期望回答 | 指出官网改版（设计资源紧张 + 2 任务未完成 → 中风险）|
| 可选写操作 | 「给官网改版建一个跟进任务」→ `create_project_task`（写，确认）|
| 观测点 | 读工具 + 风险打分 +（可选）写确认 |
| 结果 | ☐ SUCCESS ☐ HUMAN_INTERVENTION ☐ FAIL |

## 任务卡 C：AI Approval「AI 预审 + 人工复核」

| 项 | 内容 |
|---|---|
| 用户输入 | 「帮我预审一下待处理的报销」|
| 期望工具序列 | `query_approval_policies`（拿政策阈值）→ `query_approval_requests` → `review_approval_request`（预审，写需确认）|
| 期望回答 | 差旅报销 ¥800 ≤ 阈值 ¥1000 → **自动通过**（低风险）；服务器采购 ¥12000 > 阈值 → **转人工复核**（高风险）|
| 人工复核 | 高风险请求点「通过/驳回」（decide）|
| 观测点 | AI 预审分级 + 人工复核 + 审计（政策匹配理由）|
| 结果 | ☐ SUCCESS ☐ HUMAN_INTERVENTION ☐ FAIL |

## Agent Success Rate 汇总（1hr 内跑完三任务）

| 任务 | 结果 | 耗时 | 卡点（Where/Why） |
|---|---|---|---|
| CRM | | | |
| PM | | | |
| Approval | | | |

**判定**：三任务全部 SUCCESS（或 HUMAN_INTERVENTION 但达业务目标）= Run 维度达标；任一 FAIL → 记录卡点，下一迭代修。

## 相关

- [release-gate.md](release-gate.md) — Release Gate（0.9.x 里程碑质量门禁）
- [private-ai-verification.md](private-ai-verification.md) — 数据不出域验证（含 AI CRM Golden Path）
- [golden-demo-script.md](golden-demo-script.md) — 60s 演示脚本（同场景录制）
- [dev-challenge.md](dev-challenge.md) — 外部开发者挑战
