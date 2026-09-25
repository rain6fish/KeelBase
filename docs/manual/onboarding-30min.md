# 30 分钟：Build an AI Business Module（对外 onboarding）

> 目标：陌生开发者 **30 分钟内**生成一个「AI 能安全操作」的业务模块（发票 invoices）。
> 复制粘贴下面的命令即可，每步给出预期输出，**不需要先读 20 分钟文档**。
> 内部技术流程见 [30min-acceptance.md](30min-acceptance.md)；时间盒挑战见 [dev-challenge.md](dev-challenge.md)。

## 你会得到什么

`keelbase init --spec specs/invoices.json` 一键生成 **invoices 发票**模块（后端 + AI 工具 + 4 端页面）：

- 后端 CRUD（entity / dto / service / controller / module）+ CASL 本人所有权 + 全局审计
- **AI 工具自动附带（治理缺省）**：`query_invoices`（读，**R1 自动放行**，按 userId 过滤本人数据）+ `create_invoice`（写，**R3 需人工确认** + 需已验证邮箱）——直接操作**生成模块自己的数据表**，权限 / 确认 / 审计 / 撤销**无需手写**
- 前端页自动接线：Flutter / Web 工作台 / Taro + 路由 / 导航 / i18n
- 生成物是**普通源代码**，可继续修改

> 为什么不选 `customers`？—— `customers` 与内置 AI CRM 旗舰撞名（其 `query_customers` 工具已存在），生成时会跳过、复用旗舰工具，演示会读错数据。**选一个不与任何已有模块撞名的名字**（如 invoices / products / orders）。

## 0. 准备（约 5 分钟）

```bash
git clone --recurse-submodules https://github.com/rain6fish/KeelBase.git && cd KeelBase
cd Server-NestJS && npm install
cp .env.example .env    # 仓库不提交 .env（含密钥），从模板复制生成开发配置
```

> **`--recurse-submodules` 不是可选项。** `Server-NestJS/specs/protocol` 是一个 submodule（契约仓），
> 有 38 个测试套件从它读 schema 与向量语料。**漏掉这个参数 → 目录为空 → 这 38 个套件全部报"文件找不到"**，
> 看起来像项目本身是坏的。已经 clone 过的话补一句即可：`git submodule update --init --recursive`。
>
> 只装后端即可完成本次 Build 闭环；要看界面再装 Web-Admin-Vue（`cd Web-Admin-Vue && npm install`）。
> **缺少 `.env` 时 `npm run start:dev` 会因缺少 JWT_SECRET / ENCRYPTION_KEY 校验失败**，务必先复制模板。

## 1. 生成 AI 业务模块（约 1 分钟）

```bash
cd ..   # 回到仓库根（第 0 步进入了 Server-NestJS；scripts/ 在仓库根）
node scripts/keelbase-init.mjs --spec specs/invoices.json
```

预期输出：`生成业务模块 invoices` + 接线清单（app.module / ai.module（query+create 工具）/ modules-manifest / navigate-page ...）。

## 2. 编译 + 建库（约 3 分钟）

```bash
cd Server-NestJS && npm run build
npm run start:dev     # 首次启动建 SQLite 库（synchronize 自动建表）+ 种演示账号（alex/Alex@2026$Demo、admin/Admin@2026$KeelBase），就绪后 Ctrl+C
```

> 开发模式用 `synchronize` 自动建表（含刚生成的 `invoices`），**无需手写迁移**。生产部署（`synchronize:false` + `migrationsRun`）才走迁移流程。

## 3. 测试（约 1 分钟）

```bash
npm test -- invoices
```

预期输出：**22 passed**（invoices.service + invoices.controller + query-invoices/create-invoices 工具，均为生成模块自身）。

## 4. 起后端 + 问 AI（约 10 分钟，可选 LLM 环境）

```bash
npm run start:dev    # http://localhost:3000，Swagger /api/docs
```

工作台登录 `alex / Alex@2026$Demo`，AI 对话输入：

- 「**查一下我的发票**」→ AI 调用 `query_invoices`（蓝色「读」工具卡）
- 「**创建一条发票：INV-001，8000，已开具**」→ AI 调用 `create_invoice`（橙色「写」工具卡）→ 弹出**确认框** → 确认 → 落库 →「已确认 · 可撤销」

> **没配 LLM key 时**运行时会落到确定性演示模式——生成模块的写操作要用**显式 `参数=值`**（字段名取协议里的 camelCase）才会命中，例如「创建发票 invoiceNo=INV-002」；旗舰 CRM 黄金链路则无需任何 key 即可跑通。
>
> 无 LLM 环境也可直接跳过本步：确定性闭环（生成 → 编译 → 测试 → 工具注册）已证明模块可用。

## 5. 验收（你完成了）

- ✅ `query_invoices` / `create_invoice` 已注册进 AI 工具（`grep CreateInvoiceTool src/ai/ai.module.ts`）
- ✅ 所有权：列表接口只返回本人数据（另一账号看到的是空列表，而非他人发票）。生成模块**没有 `GET /:id`**，故用列表接口验证；未验证邮箱的账号执行写操作会**先**被 `EMAIL_NOT_VERIFIED` 拒绝
- ✅ AI 工具写 → AI 审计 + 副作用记录（含确认决策）；REST 人类写 → 操作审计（均哈希链可验证，`GET /audit/operations/verify` 验操作审计链）
- ✅ 生成物是普通源代码，可继续修改

## 常见失败点

| 现象 | 处理 |
|---|---|
| `目录已存在` | 模块名冲突（可能与已有/旗舰模块撞名），换英文名 |
| `目标文件已被占用` | 模块名与既有工具撞名（如 `customers`），换一个模块名 |
| `start:dev` 报「Config validation error: JWT_SECRET is required」 | 未复制 `.env`——执行 `cp .env.example .env` 后重启 |
| 设了 `NODE_ENV=development` 后同样报缺 `JWT_SECRET` | 本项目只随仓 `.env`（**无 `.env.development`**）——设 `NODE_ENV=development` 会去读不存在的 `.env.development` 致校验失败。**不设 NODE_ENV** 即用默认 `.env`；确需切环境先建对应 `.env.<env>` |
| `npm test -- invoices` 不足 22 passed | 模块未生成完整，重跑第 1 步 |
| 端口 3000 已被占用 | 有别的服务占着——用 `PORT=3010 npm run start:dev` 换端口起 |
| 注册接口报 `nickname should not be empty` | 注册需带 `nickname`（与 username / password / email 一并给） |
| enum 字段报错 | `enum` 数组给 2-10 个小写英文选项 |

## 相关

- 一键起完整演示（含 AI CRM Golden Flow）：[demo.sh](../../deploy/demo.sh)（[demo-deploy.md](demo-deploy.md)）
- 时间盒挑战：[dev-challenge.md](dev-challenge.md) · 内部技术流程：[30min-acceptance.md](30min-acceptance.md)
- 协议示例：`specs/invoices.json` / `project.json` / `approval-request.json` / `supplier.json`
