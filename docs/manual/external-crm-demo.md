# EB-1 演示：外部 CRM 接入（不替换系统，获得 AI 能力）

> **Enterprise Capability Bridge（企业能力桥）**：企业已有系统（CRM/ERP/OA）不替换，作为 AI Agent 的 **Business-safe 能力来源**。本演示用「一个既有 CRM 系统」的 OpenAPI 描述，经 AI Bridge（`--import-openapi-proxy`）接入 KeelBase——AI 在治理约束下读取外部客户/订单（R1 自动）、写回跟进任务/改价（R3 需人工确认），全程审计可撤销。
> 面向「中国企业 AI 增强层」路线的旗舰展示（roadmap §22.7 / §22.11 EB-1）。

## 一句话

> **让十年前的业务系统拥有 AI 能力，而无需推翻重来——AI 能读、能写、能审计、能撤销，全部在治理边界内。**

## 前置

- Node.js ≥ 22（仅生成 proxy 配置，无需后端）
- 可选：后端运行（`npm run start:dev`）+ 管理台，看完整闭环

## 快速开始

```bash
# 一键生成外部 CRM 的 B 路径 Proxy 工具（读=R1 写=R3）+ 展示治理分级
./scripts/demo-external-crm.sh

# 或先把配置写入后端 Settings（需后端运行，重启后工具生效）
./scripts/demo-external-crm.sh --apply
```

## 生成的工具

| 工具 | 外部系统操作 | 风险级 | 治理 |
|---|---|---|---|
| `list_customers` | GET /customers | R1 | 自动执行（读）|
| `get_customer` | GET /customers/{id} | R1 | 自动执行（读）|
| `list_customer_orders` | GET /customers/{id}/orders | R1 | 自动执行（读）|
| `create_followup_task` | POST /customers/{id}/followups | **R3** | **需人工确认**（写）|
| `update_order_amount` | PATCH /customers/{id}/orders/{orderId} | **R3** | **需人工确认**（写）|

> 写操作经 `x-keelbase-risk-level: R3` 标注——企业最关心的「AI 改价/建单」必须人工确认，不静默执行。

## 业务闭环（用户视角）

```
你：「哪些客户值得跟进？」

AI：
  1. 读外部客户（list_customers，R1 自动）
  2. 读客户订单（list_customer_orders，R1 自动）——逾期/金额分析
  3. 风险分析 → 建议创建跟进任务（create_followup_task）
  4. 请求你确认（R3 写门控）——不确认不执行
  5. 确认 → 写回外部 CRM（proxy_call 副作用登记）
  6. 审计哈希链落账 + 可撤销（B 路径 Java 补偿 / revokePath）
```

## 治理展示（关键差异）

- **不静默写**：外部系统写操作（建跟进/改价）必须人工确认（R3）
- **副作用可审计**：proxy_call 副作用登记，管理台 AI 行为时间线可见（EB-2「外部系统（B 路径）」标识）
- **可撤销**：撤销走 B 路径 Java 补偿端点（revokePath），或诚实语义
- **全链审计**：决策轨迹 + 权限依据（Why）+ 审计哈希链（防篡改）

## 这与「自己再造一个 CRM」的区别

| | 传统 CRM 平替 | KeelBase Bridge |
|---|---|---|
| 系统 | 替换/重建 | **不替换**，连接 |
| 数据 | 迁移 | 保持原位 |
| AI 写操作 | 未治理 | R3 人工确认 + 副作用 + 可撤销 |
| 审计 | 无/弱 | 决策轨迹 + 哈希链 |

## 相关

- [ai-bridge.md](ai-bridge.md) — AI Bridge（Java 存量接入，B 路径）
- [aiization-demo.md](aiization-demo.md) — 存量系统 AI 化（SQL/OpenAPI → Protocol → 模块）
- [framework-adapter.md](framework-adapter.md) — Agent Framework 接入治理（AR-2）
- [flagship-applications.md](../../docs/flagship-applications.md) — AI CRM 旗舰规格
