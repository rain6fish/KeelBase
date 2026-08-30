# KeelBase Integrator Kit（集成商套件）

> 面向软件公司 / 集成商：用 KeelBase 把**存量业务系统**改造成 **AI 业务助手**（Business-safe AI）。
> For software vendors / integrators: turn existing business systems into business-safe AI assistants with KeelBase.
>
> 定位（roadmap §22.7 中国路线首要交付）：KeelBase = 平台 + 技术 + 生态；集成商 = 解决方案 + 实施。本 Kit 是把已有能力收束为**可交付样板**——非新引擎，非自己找客户实施。

## 一、能力清单 / Capability Matrix

| 组件 | 状态 | 入口 |
|---|---|---|
| **AI Bridge**（存量系统 OpenAPI → AI 工具，读 R1/写 R3 + 委托身份 + revokePath 撤销） | ✅ 已具备 | [ai-bridge.md](manual/ai-bridge.md) |
| **Java Starter**（Spring Boot 接入：委托验签过滤器 + `@KeelbaseTool` 导出 + 补偿脚手架） | ✅ 核心可用（`KeelBase-java-starter` 已发布双远程，真实 KeelBase 联调全通：确认门控→流式批准→写回→审计→撤销补偿） | [GitHub: KeelBase-java-starter](https://github.com/rain6fish/KeelBase-java-starter) + [java-compensation-example.md](integrator-kit/java-compensation-example.md) |
| **OpenAPI Import**（`keelbase init --import-openapi`） | ✅ | [development.md](manual/development.md) |
| **SQL Import**（`keelbase init --import-schema`） | ✅ | [development.md](manual/development.md) |
| **MCP Gateway**（外部 MCP 出入 + 风险分级 + SSRF 防护） | ✅ | [framework-adapter.md](manual/framework-adapter.md) |
| **轻量 Capability 声明**（`capability.yaml` → 同构工具，比 OpenAPI 更轻） | ✅ | [capability-declaration.md](manual/capability-declaration.md) |
| **Governance & Deployment Guide**（接入即治理 + 部署交付） | ✅ 已整合 | [governance-deployment-guide.md](integrator-kit/governance-deployment-guide.md)（索引各部署/安全文档） |
| **AI Assistant Template**（业务 AI 助手面板模板） | ✅（CRM/PM Copilot 已落地） | [flagship-applications.md](../flagship-applications.md) |
| **Reference Project：传统 Java CRM → AI CRM** | ✅ 实施手册 + **真实 Java CRM 样板已提供**（`keelbase-java-crm-example`：5 工具读 R1/写 R3 + 补偿，域与 external-crm-demo 对齐，`verify-crm-e2e.mjs` 联调） | [reference-project-guide.md](integrator-kit/reference-project-guide.md) + [external-crm-demo.md](manual/external-crm-demo.md) + [reference-project-crm.md](https://github.com/rain6fish/KeelBase-java-starter/blob/main/docs/reference-project-crm.md) |

## 二、Reference Project：传统 Java CRM → AI CRM（核心样板）

**一句话**：让十年老 Java CRM 拥有 AI 能力，不替换——AI 能读、能写、能审计、能撤销，全在治理边界内。

```
传统 Java CRM（OpenAPI / SQL / capability.yaml）
        ↓  AI Bridge（keelbase init --import-openapi-proxy / capability 声明）
        ↓  KeelBase Governance（读 R1 自动 · 写 R3 确认 · 审计哈希链 · 撤销）
        ↓  AI CRM 助手（Copilot 面板：分析风险 → 建议 → 确认 → 写回 → 审计）
```

**已具备的演示路径**（[external-crm-demo.md](manual/external-crm-demo.md)）：
1. 外部 CRM OpenAPI 描述（`specs/external-crm.openapi.json`，读 R1/写 R3）
2. 一键生成 B 路径 Proxy 工具（`scripts/demo-external-crm.sh`）
3. 业务闭环：用户问「哪些客户值得跟进」→ AI 读外部客户/订单 → 风险分析 → 建跟进任务（R3 确认）→ 写回 → 审计哈希链 → 撤销

**升级为完整样板的剩余**（P1）：
- ~~Java 端真实补偿端点~~ → ✅ `KeelBase-java-starter` 的 `KeelBaseCompensationSupport` 已提供（幂等 + 审计）
- ~~真实 Java 存量系统端到端实测~~ → ✅ 联调已全通（见 `KeelBase-java-starter` 的 `scripts/verify-java-starter-e2e.mjs`）
- ~~集成商分步实施手册~~ → ✅ `reference-project-guide.md`（8 步）
- ~~真实 Java CRM 实现~~ → ✅ `keelbase-java-crm-example`（5 工具读 R1/写 R3 + 补偿 + `verify-crm-e2e.mjs`，域与 external-crm-demo 对齐）

## 三、快速开始（集成商视角） / Quick Start for Integrators

```bash
# 1. 生成外部系统的 AI 工具（读=自动 / 写=需确认）
./scripts/demo-external-crm.sh

# 或轻量方式：capability.yaml 声明
node scripts/keelbase-capability.mjs --apply

# 2. 接入后，AI 在治理边界内操作外部系统
#    - 读：list_customers / get_customer / list_customer_orders（R1 自动）
#    - 写：create_followup_task / update_order_amount（R3 需人工确认）
# 3. 审计：管理台 AI 审计 / 行为回放 / 治理详情；副作用可撤销
```

## 四、商业定位（为什么给集成商） / Why Integrators

- **不做实施**：KeelBase 不自己找客户实施，避免滑向外包公司
- **集成商用 KeelBase 构建方案**：平台 + 技术 + 生态；集成商 = 解决方案 + 实施
- **中国切入点**：「连接存量系统 → 业务 AI 助手」样板（复用 AIization / AI Bridge / MCP，与 AI CRM 样板并列）

## 五、后续 / Next

- Java Adapter 补偿端点实现（Java 端真实补偿 + 实测）
- Governance / Deployment Guide 整合为集成商手册
- Reference Project 升级（分步实施手册）
