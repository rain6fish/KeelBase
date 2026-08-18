# Existing System AIization 演示（P0-12 商业价值样板）

> 目标：演示 KeelBase 不只适合「从零创建」，也能成为**已有系统的 AI 化入口**——企业不用重写老系统，把已有 DB Schema / OpenAPI 喂进来，即可让老数据获得「AI 能安全调用」的能力。
> 演示素材：`specs/examples/legacy-crm.sql`（模拟一个运行多年的老客户管理系统）。
> 核心链路：`已有 Schema → keelbase import → Protocol → 生成模块 → AI 工具 → 治理 → Agent`。

---

## 一句话价值

> **老系统 + 一份建表 SQL = 新 AI 能力。** 不用重写业务，KeelBase 把既有数据模型变成「Runtime Agent 能安全操作」的应用。

## 演示步骤（约 10 分钟）

### 1. 准备「已有系统 schema」

企业提供老系统的一份建表 SQL（或 OpenAPI）：

```bash
# specs/examples/legacy-crm.sql —— 含 CHECK 枚举 / VARCHAR / DATE / DECIMAL
CREATE TABLE legacy_customers (
  customer_name VARCHAR(120) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'lead'
    CHECK (status IN ('lead', 'active', 'churn_risk', 'inactive')),
  risk_level VARCHAR(10) NOT NULL DEFAULT 'low'
    CHECK (risk_level IN ('low', 'medium', 'high')),
  ...
);
```

### 2. 导入 → 提取 Protocol

```bash
node scripts/keelbase-init.mjs --import-schema specs/examples/legacy-crm.sql --out specs/legacy-customer.json
```

**预期输出**（已实测验证）：

```json
{
  "module": "legacy_customers",
  "fields": [
    { "name": "customer_name", "type": "string" },
    { "name": "status", "type": "enum", "enum": ["lead", "active", "churn_risk", "inactive"] },
    { "name": "risk_level", "type": "enum", "enum": ["low", "medium", "high"] },
    { "name": "annual_value", "type": "int" }
  ]
}
```

- `CHECK (status IN (...))` → **enum**（自动识别）
- `VARCHAR(120)` → string；`DECIMAL` → int
- `id / created_at / updated_at` → 跳过（基座自带）

> OpenAPI 同理：`node scripts/keelbase-init.mjs --import-openapi swagger.json --out specs/xxx.json`

### 3. 协议 → 生成业务模块

```bash
node scripts/keelbase-init.mjs --spec specs/legacy-customer.json --label 老客户
```

生成普通源代码（后端 CRUD + Flutter + 管理台 + Taro + 7 处接线 + **自动附 AI 工具** `query_legacy_customers`（读）+ `create_legacy_customer`（写需确认））。

### 4. 补迁移 + 验证

```bash
cd Server-NestJS && npm run migration:generate -- src/migrations/AddLegacyCustomers
npm test -- legacy-customers.service
```

### 5. Runtime Agent 安全调用老数据

用户问 AI「帮我查一下 inactive 的老客户」→ Agent 调 `query_legacy_customers`（读，CASL 本人数据）→ 确认 → 审计落哈希链 → 副作用可撤销。**老数据立刻拥有新 AI 能力，且不越权。**

---

## 为什么这是「商业价值样板」

| 传统路径 | KeelBase 路径 |
|---|---|
| 重写老系统（迁移成本高、风险大） | 保留老库，Schema 反推 Protocol → 生成模块 |
| 老系统无 AI 能力 | 老数据立即被 Runtime Agent 安全操作（确认/审计/撤销）|
| 一个系统一套技术栈 | Protocol 生成物是普通源代码，可继续修改，不被锁死 |

## 相关

- P0-12 多输入通道：[module-protocol.md](../module-protocol.md) §4.1
- 生成器：[30min-acceptance.md](30min-acceptance.md)
- 私有 AI：[private-ai-verification.md](private-ai-verification.md)
