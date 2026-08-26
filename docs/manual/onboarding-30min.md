# 30 分钟：Build an AI CRM（对外 onboarding）

> 目标：陌生开发者 **30 分钟内**生成一个「AI 能安全操作」的客户管理模块（AI CRM）。
> 复制粘贴下面的命令即可，每步给出预期输出，**不需要先读 20 分钟文档**。
> 内部技术流程见 [30min-acceptance.md](30min-acceptance.md)；时间盒挑战见 [dev-challenge.md](dev-challenge.md)。

## 你会得到什么

`keelbase init --spec specs/customer.json` 一键生成 **customers 客户管理**模块（后端 + AI 工具 + 4 端页面）：

- 后端 CRUD（entity / dto / service / controller / module）+ CASL 本人所有权 + 全局审计
- **AI 工具自动附带**：`query_customers`（读）+ `create_customers`（写，需人工确认）
- 前端页自动接线：Flutter / Web 工作台 / Taro + 路由 / 导航 / i18n
- 生成物是**普通源代码**，可继续修改

## 0. 准备（约 5 分钟）

```bash
git clone https://github.com/rain6fish/KeelBase.git && cd KeelBase
cd Server-NestJS && npm install
```

> 只装后端即可完成本次 Build 闭环；要看界面再装 Web-Admin-Vue（`cd Web-Admin-Vue && npm install`）。

## 1. 生成 AI CRM 模块（约 1 分钟）

```bash
node scripts/keelbase-init.mjs --spec specs/customer.json
```

预期输出：`生成业务模块 customers` + 接线清单（app.module / ai.module（query+create 工具）/ modules-manifest / navigate-page ...）。

## 2. 编译 + 建库 + 迁移（约 3 分钟）

```bash
cd Server-NestJS && npm run build
npm run start:dev     # 首次启动建 SQLite 库 + 种演示账号（alex/123456、admin/Admin@1234），就绪后 Ctrl+C
npm run migration:generate -- src/migrations/AddCustomers   # 增量迁移（须先起过一次后端建库，见常见失败点）
npm run migration:run
```

## 3. 测试（约 1 分钟）

```bash
npm test -- customers
```

预期输出：**20 passed**（service 5 + controller 6 + query/create 工具 9）。

## 4. 起后端 + 问 AI（约 10 分钟，可选 LLM 环境）

```bash
npm run start:dev    # http://localhost:3000，Swagger /api/docs
```

工作台登录 `alex / 123456`，AI 对话输入：

- 「**查一下我的客户**」→ AI 调用 `query_customers`（蓝色「读」工具卡）
- 「**创建一条客户：张三，lead**」→ AI 调用 `create_customers`（橙色「写」工具卡）→ 弹出**确认框** → 确认 → 落库 →「已确认 · 可撤销」

> 无 LLM 环境时跳过本步：确定性闭环（生成 → 编译 → 测试 → 工具注册）已证明模块可用。

## 5. 验收（你完成了）

- ✅ `query_customers` / `create_customers` 已注册进 AI 工具（`grep CreateCustomersTool src/ai/ai.module.ts`）
- ✅ 越权：另一账号访问他人客户数据 → 403
- ✅ 写操作入操作审计 + AI 调用入 AI 审计（哈希链可验证，`GET /audit/operations/verify`）
- ✅ 生成物是普通源代码，可继续修改

## 常见失败点

| 现象 | 处理 |
|---|---|
| `目录已存在` | 模块名冲突，换英文名或 `--force` 覆盖 |
| 迁移生成出全量 dump | 新鲜 clone 无库——**先 `npm run start:dev` 起一次后端建库**，再 generate 得到增量迁移 |
| `npm test -- customers` 只跑 16/20 | 模块未生成完整，重跑第 1 步 |
| enum 字段报错 | `enum` 数组给 2-10 个小写英文选项 |

## 相关

- 一键起完整演示（含 AI CRM Golden Flow）：[demo.sh](../../deploy/demo.sh)（[demo-deploy.md](demo-deploy.md)）
- 时间盒挑战：[dev-challenge.md](dev-challenge.md) · 内部技术流程：[30min-acceptance.md](30min-acceptance.md)
- 协议示例：`specs/customer.json` / `project.json` / `approval-request.json` / `supplier.json`
