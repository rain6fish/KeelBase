# Golden Demo 60 秒演示脚本（P0-3）

> 目标：README 首页第一屏用真实 Runtime AI 闭环（而非技术栈）让陌生开发者 **60 秒看懂**——AI 不只是聊天，而是在权限和审计边界内真正干活。
> 本文档是 README 视频/GIF 的**录制脚本**：每个场景 ≤60 秒，完整展示 `Tool → Permission → Confirmation → Audit`。
> 演示载体：`./deploy/demo.sh`（一键起工作台 AI CRM Golden Flow，http://localhost:3000）或单容器（`./scripts/docker-single.sh`），演示账号 `alex / Alex@2026$Demo`。

---

## 场景 1：AI CRM「哪些客户本周最值得跟进？」（推荐首屏）

**时长**：约 50 秒。**展示**：AI 读真实业务数据 + 写操作确认 + 审计。

| 时间 | 画面 | 用户操作 / AI 行为 | 展示点 |
|---|---|---|---|
| 0-5s | 登录页 → 工作台 | 输入 `alex / Alex@2026$Demo` 登录 | 演示账号 |
| 5-12s | AI CRM → 客户详情 | 打开客户 → 点「AI 助手」按钮（AI Copilot）→ 输入「**分析这家客户的风险，值得跟进吗？**」 | 真实业务数据 |
| 12-30s | 工具步骤卡 | AI 依次调用 `query_customer_orders` → `query_customer_activities` → `analyze_customer_risk` | **读工具**（蓝色「读」徽标）+ 过程可视化 |
| 30-40s | AI 回复 + 写操作 | AI：「云帆商贸有逾期订单且连续两月未续约，建议跟进」→ 问「要我为云帆创建跟进任务吗？」 | 写操作触发确认 |
| 40-48s | 确认卡 | 用户点「确认」→ AI 调用 `create_followup_task` | **写工具**（橙色「写」徽标）+ **确认** |
| 48-55s | 结果 | 「已创建跟进任务 #12」+ 自动打开**治理轨迹**（谁 / 何时 / 做了什么 / 为什么允许 / 审计） | **审计** |

**一句话字幕**：AI 读你的数据 → 判断风险 → 在你确认后写数据 → 每一步可审计。

> **✅ 2026-08-27 实测通过（D1 流式闭环）**：`./deploy/demo.sh` 同源工作台（Vite dev + 后端 3000）实测黄金路径——登录 alex → CRM 客户详情 → AI 助手 → 流式工具卡（读操作 `analyze_customer_risk` 徽标）→ AI 结构化风险分析 → 提问创建跟进任务 → 写操作 `create_followup_task`「需确认」确认卡（批准/拒绝/本会话信任）→ 批准 → 系统创建 `crm_task #14` → **治理抽屉自动打开**（谁 alex / 何时 / 做了什么 / 为何允许 ✓用户已确认 / 结果 / 副作用）。时间线以 Human-Agent-System 责任链渲染（人/AI/系统标签）。**Demo 已就绪可录制**。

## 场景 2：AI Project「判断项目延期风险」

**时长**：约 45 秒。**展示**：AI 分析 + 主动建议。

| 时间 | 画面 | 操作 / AI 行为 |
|---|---|---|
| 0-5s | AI Project → 项目详情 | 打开项目（如「数据仓库迁移」）→ 点「AI Copilot」→ 输入「**帮我看看这个项目有没有延期风险**」|
| 5-30s | 工具卡 | AI 调 `query_projects` → `query_project_tasks` → `analyze_project_risk`（读）|
| 30-45s | 结果 | AI：「官网改版因设计资源紧张 + 2 个任务未完成 → 中风险」，建议建跟进任务（确认后执行）|

**展示点**：AI 不只是问答，而是**基于业务规则分析风险**并主动建议动作。

## 场景 3：AI Approval「AI 预审 + 人工复核」

**时长**：约 50 秒。**展示**：治理闭环——AI 预审分级、低风险自动通过、高风险人工复核。

| 时间 | 画面 | 操作 / AI 行为 |
|---|---|---|
| 0-5s | 审批中心 | 进入「审批中心」列表 |
| 5-20s | AI 对话 | 输入「帮我预审一下待处理的报销」|
| 20-35s | 工具卡 | AI 调 `query_approval_policies`（拿政策）→ `query_approval_requests` → `review_approval_request`（预审）|
| 35-45s | 结果 | AI：「差旅报销 ¥800 ≤ 阈值 ¥1000 → **自动通过**（低风险）」「研发服务器采购 ¥12000 > 阈值 → **转人工复核**（高风险）」|
| 45-50s | 人工复核 | 高风险请求由用户点「通过/驳回」|

**展示点**：**AI 预审 + 人工复核**（P0-16）——低风险自动、高风险人定，全程审计。

---

## 录制建议

| 项 | 建议 |
|---|---|
| 载体 | `./deploy/demo.sh`（工作台 AI CRM Golden Flow，http://localhost:3000）或单容器 `./scripts/docker-single.sh` |
| 分辨率 | 1280×800（浏览器窗口），字号放大 1.25× |
| 录制工具 | macOS `screencapture -V` / Windows Xbox Game Bar / OBS / Giphy Capture（GIF）|
| 时长 | 每场景 ≤60s；首屏用「场景 1」（CRM）|
| 字幕 | 叠加 5-8 字说明（如「AI 分析风险」「写操作需确认」）|
| 目标 | GIF < 3MB（README 内嵌）；或 mp4 首帧图 + 链接 |

## Phase 1 旗舰验证清单（可勾选）

> 跑三旗舰 Golden Demo 时按此清单核对（development-plan §7.1 Phase 1），每项勾选确认。
> 配合 [30min-acceptance.md](30min-acceptance.md) 与 `scripts/verify-private-ai.sh`（Private AI Golden Path）。

### 场景 1：AI CRM「哪些客户本周值得跟进？」

- [ ] AI 调用读工具（`query_customer_orders` → `query_customer_activities` → `analyze_customer_risk`），工具卡显示「读」徽标
- [ ] 工具调用按 userId 限定数据范围（只查本人客户/订单）
- [ ] 写操作（`create_followup_task`）触发人工确认，确认后才执行
- [ ] 管理台「AI 审计」可见本次工具调用记录（谁 / 什么工具 / 结果）
- [ ] 副作用可撤销：创建的任务可撤销（软删 + 回收站恢复）
- [ ] 数据真实：seed 客户 / 逾期订单存在，AI 回答基于真实数据（非编造）

### 场景 2：AI Project「判断项目延期风险」

- [ ] `query_projects` → `query_project_tasks` → `analyze_project_risk` 调用链
- [ ] 风险分级（中 / 高）基于真实逾期任务 / 延期里程碑 / 未解决风险
- [ ] 写工具（`create_project_task`）确认 + 可撤销
- [ ] 结果可解释：AI 给出逾期任务 / 里程碑清单作为理由

### 场景 3：AI Approval「预审 + 人工复核」

- [ ] `query_approval_policies` → `query_approval_requests` → `review_approval_request` 调用链
- [ ] 低风险（≤ 阈值）自动通过 / 高风险转 `needs_review`
- [ ] 人工复核 `decide` 通过 / 驳回生效
- [ ] 全程审计哈希链完整（HS-11，`GET /audit/verify`）

> **通过标准**：三场景全部勾选 = 旗舰验证通过（Capability Validated）；任一不通过 → 记录差距进下迭代（development-plan §7.1 平台冻结原则：只修 bug 不加功能）。

## 相关

- 单容器一键跑：`./scripts/docker-single.sh`（[quickstart.md](quickstart.md)）
- 演示站：`./deploy/demo.sh`（[demo-deploy.md](demo-deploy.md)）
- 端定位：Web 业务 UI 归工作台，移动预览 `/mobile`（[tutorial.md](tutorial.md)）
- P0-3 目标：README 首屏展示真实 Runtime AI 闭环（[roadmap V2 §P0-3]）
