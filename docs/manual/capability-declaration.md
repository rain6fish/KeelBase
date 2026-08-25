# 轻量能力声明（EB-3 Capability Declaration）

> **Enterprise Capability Bridge** 的低门槛接入方式：外部系统（CRM/ERP/OA）用一份轻量 YAML 声明「这个业务系统能做什么」，KeelBase 据此生成 B 路径 Proxy 工具（AI 可调用 + 治理分级）——比写完整 OpenAPI 更简单，聚焦业务能力而非 API 结构。
> roadmap §22.11 EB-3：**轻量声明式，非元数据驱动映射大平台**（守住边界，不做 iPaaS / ETL / 数据同步）。

## 一句话

> **一份能力清单，让既有业务系统拥有可治理的 AI 能力。**

## 声明格式

```yaml
system:
  name: 外部 CRM
  baseUrl: http://legacy-crm:8080/api   # 外部系统地址
  audience: legacy-crm                  # 委托 JWT audience（AI Bridge）

capabilities:
  - id: list_customers                  # 工具名（snake_case，AI 调用）
    label: 客户列表                     # 人类可读名
    description: 按关键字查询客户       # 给 LLM 的能力描述
    action: read                        # read → R1（自动）| write → R3（需人工确认）
    # risk: R3                          # 显式覆盖风险级（可选）
    http:
      method: GET
      path: /customers
      query: [keyword]                  # query 参数（可选）
      # pathParams: [id]                # 路径参数（可选）
      # body: [content, dueDate]        # body 字段（写操作，可选）
```

- **action**: `read` → 风险级 R1（AI 自动执行）；`write` → R3（需人工确认，不静默写）
- **risk**: 显式覆盖（如高风险写操作可标 R4 双人审批 / R5 阻断）
- **pathParams / query / body**: 参数列表（YAML flow 数组或逗号分隔字符串均可）

## 用法

```bash
# 生成 B 路径 Proxy 工具配置 JSON（与 openapi-proxy 同构，供运行时注册）
node scripts/keelbase-capability.mjs specs/external-crm.capability.yaml

# 人类可读工具清单 + 治理分级
node scripts/keelbase-capability.mjs specs/external-crm.capability.yaml --list
```

应用到运行时：把输出的 JSON 写入 `PUT /settings/ai_proxy_tools`（或管理台「设置」粘贴），重启后工具生效（ProxyToolRegistryService 动态注册）。

## 示例：外部 CRM

`specs/external-crm.capability.yaml`：

| 工具 | 能力 | 风险级 | 治理 |
|---|---|---|---|
| `list_customers` | 客户列表 | R1 | 自动（读）|
| `get_customer` | 客户详情 | R1 | 自动（读）|
| `list_customer_orders` | 客户订单 | R1 | 自动（读）|
| `create_followup_task` | 创建跟进任务 | **R3** | **需人工确认**（写）|
| `update_order_amount` | 修改订单金额 | **R3** | **需人工确认**（写）|

## 与 OpenAPI 接入的取舍

| | OpenAPI（AI Bridge）| Capability 声明（EB-3）|
|---|---|---|
| 描述粒度 | 完整 API 结构 | 业务能力清单 |
| 门槛 | 需写 OpenAPI | 一份 YAML |
| 参数 | 完整 schema | 参数名列表 |
| 适用 | 已有 OpenAPI / 规范接口 | 快速声明 / 接口不规范的存量系统 |

两者都生成同构 Proxy 工具配置，运行时同一套治理（Identity / Risk / Confirmation / Audit / Revoke）。

## 相关

- [external-crm-demo.md](external-crm-demo.md) — EB-1 外部 CRM 接入演示
- [ai-bridge.md](ai-bridge.md) — AI Bridge（Java 存量接入，B 路径）
- [framework-adapter.md](framework-adapter.md) — Agent Framework 接入治理（AR-2）
