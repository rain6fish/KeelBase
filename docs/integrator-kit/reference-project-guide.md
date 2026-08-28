# Reference Project 实施手册：传统 Java CRM → AI CRM

> 分步指南：集成商把「一个存量业务系统」改造成「Business-safe AI 业务助手」。
> Step-by-step: turn an existing system into a business-safe AI assistant.
>
> 场景：传统 Java CRM（有 REST API / 数据库 / 业务能力），目标 = AI 能读、能分析、能写（确认后）、全程可审计可撤销。

## 总览 / Overview

```
1 盘点 → 2 导入 → 3 生成工具 → 4 治理分级 → 5 接入助手 → 6 验证 → 7 部署 → 8 上线核对
```

| 步 | 动作 | 产物 | 验收 |
|---|---|---|---|
| 1 | 盘点存量系统 | 系统能力清单 | 明确读/写/高风险操作 |
| 2 | 导入（OpenAPI/SQL/Capability） | Protocol 描述 | 导入成功 + 诊断报告无关键跳过 |
| 3 | 生成 Proxy 工具 | B 路径工具 + 委托身份 | 工具清单可见（method/path/riskLevel） |
| 4 | 治理分级 | 读 R1 自动 / 写 R3 确认 / 高险 R4-R5 | 写工具确认门控生效 |
| 5 | 接入 AI 助手 | Copilot 面板 + 预置问题 | AI 能分析业务数据 |
| 6 | 验证治理 | 确认/审计/撤销闭环 | 写需确认、审计可见、可撤销 |
| 7 | 部署 | 单容器/私有化 | 客户环境可运行 |
| 8 | 上线核对 | 安全核对清单 | 全部通过 |

## 分步 / Steps

### 1. 盘点存量系统 / Inventory

- 确认外部系统暴露的能力：REST API（OpenAPI/Swagger）、数据库 Schema、或业务能力
- 分类：**读**（查询/分析）/ **写**（创建/修改/删除）/ **高风险**（改价/删除/跨部门）
- 产物：能力清单 + 风险标注

### 2. 导入 / Import

```bash
# OpenAPI 导入（生成 Proxy 工具）
./scripts/demo-external-crm.sh            # 或 keelbase init --import-openapi-proxy

# 或轻量 Capability 声明（比 OpenAPI 更轻）
node scripts/keelbase-capability.mjs --list   # 预览将生成的工具
```
- 检查 `skipped` 诊断报告：关系/复杂字段应保持手写（协议红线）
- 产物：外部系统 → KeelBase 协议描述

### 3. 生成 Proxy 工具 / Generate Proxy Tools

- 每个外部端点 → 一个 AI 工具（method/path/参数）
- 写工具自动 `riskLevel`（读=R1 / 写=R3），可显式覆盖
- 产物：工具注册到 ToolRegistry（`ai_proxy_tools` 配置）

### 4. 治理分级 / Governance Tiers

- **读工具**（R1）：自动执行（仅调用者数据范围）
- **写工具**（R3）：人工确认——不确认不执行
- **高影响**（R4 双人审批 / R5 阻断）：`riskLevel` 覆盖
- 配置：管理台「策略中心」（启用/确认/角色白名单/审计粒度）
- 产物：写操作确认门控生效

### 5. 接入 AI 助手 / Connect the AI Assistant

- 用 AI CRM Copilot 面板模式（[flagship-applications.md](../../flagship-applications.md)）：
  预置问题（「哪些客户值得跟进？」）+ 多轮对话 + 本人数据作用域
- AI 能调用外部工具：读客户 → 分析风险 → 建议 → 确认 → 写回
- 产物：业务 AI 助手可用

### 6. 验证治理 / Verify Governance

- [ ] 读操作自动执行（无确认）
- [ ] 写操作触发确认，不确认不执行
- [ ] 管理台 AI 审计可见每步（含 agent_id 归责 + username）
- [ ] AI 行为回放时间线（Human→Agent→System）
- [ ] 撤销：内部副作用软删；外部写走补偿端点（[java-compensation-example.md](java-compensation-example.md)）

### 7. 部署 / Deploy

- 单容器一键部署（[one-click-deploy.md](../manual/one-click-deploy.md)）
- 内网/私有化（[offline-deploy.md](../manual/offline-deploy.md)）
- 蓝绿更新（[blue-green-deploy.md](../manual/blue-green-deploy.md)）

### 8. 上线核对 / Pre-launch Check

- [ ] `DELEGATION_SECRET` 独立配置 + 与 Java 系统共享
- [ ] 写工具确认门控 + R4/R5 生效（含 self-approve 拒绝）
- [ ] 外部 MCP url 过 SSRF 校验
- [ ] 审计哈希链 verify 全绿
- [ ] 完整安全矩阵（[security-verification-matrix.md](../manual/security-verification-matrix.md)）
- [ ] 管理台治理总览一页看五中心态势

## 完成定义 / Definition of Done

> 一个陌生集成商拿到本手册，能把一个存量系统在合理时间内改造成可交付的「Business-safe AI 业务助手」——AI 能读、能写（确认）、可审计、可撤销、可私有化部署。
