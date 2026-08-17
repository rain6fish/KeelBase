# 零基础从零到部署教程（DX-2）

> 本文把 KeelBase 从「完全没跑过」走到「部署上线」，按一条完整路径六步走，每步都有验证：
> **跑起来 → 看懂它 → 改成你的 → 生成新模块 → 部署上线 → 日常运维**。
> 适合第一次接触基座的人。想查具体问题，看 [FAQ](faq.md) 或各手册索引。
> 英文版教程（tutorial-en.md）后续跟进；当前英文用户可先看 [Quick Start (EN)](quickstart-en.md)。

## 第一步：跑起来（约 5 分钟）— RUN

**唯一前提：装 Docker。** KeelBase 提供已发布的单容器镜像，一条命令起全栈（后端 + 主 App + 管理台 + 演示账号）：

```bash
docker run -d --name keelbase -p 3000:3000 ghcr.io/rain6fish/keelbase:latest
```

**验证**（浏览器打开）：

| 地址 | 看到什么 |
|------|---------|
| http://localhost:3000/api/v1/health | `{"status":"ok"}` |
| http://localhost:3000 | 主 App（Flutter） |
| http://localhost:3000/admin | 管理台（Vue3） |

**登录**（首次启动自动创建）：

| 账号 | 密码 | 用途 |
|------|------|------|
| `alex` | `123456` | 主 App 普通用户 |
| `admin` | `Admin@1234` | 管理台管理员 |

> 看日志 `docker logs -f keelbase`；停止并删除 `docker stop keelbase && docker rm keelbase`（数据留在命名卷 `keelbase_data`）。
> 想改代码时用本地开发模式：`./scripts/dev.sh experience`（起后端 + 管理台，自动开浏览器）。详见 [快速上手](quickstart.md)。

## 第二步：看懂它（约 3 分钟）— UNDERSTAND

跑起来后，用 4 个动作快速理解「AI 不只是聊天，而是在权限和审计边界内干活」：

1. **用 AI 对话探索数据**：主 App 底部「AI」页输入「我这个月有哪些事件安排？」——AI 会调用查询工具返回你的真实数据（不是闲聊）。
2. **看能力清单**：访问 `/app/capabilities`（或管理台「系统信息」）——当前 preset（full / small / lite）启用了哪些功能，前端导航与之一致。
3. **看审计**：管理台「AI 审计」「操作审计」——刚才那次 AI 工具调用已有记录（谁、什么工具、结果）；写操作（如创建事件）还要求人工确认。
4. **数据模型速览**：核心实体 `User / Event / Todo / Notification`——所有业务围绕「本人数据」隔离（CASL 行级权限）。

> 看懂这一层就是看懂 KeelBase 的差异化：**业务安全的 Agent harness**——AI 会干活、只动你的数据、每一步可审计。

## 第三步：改成你自己的（配置）— MODIFY

先 `cd Server-NestJS && cp .env.example .env`，然后按需改：

### 3.1 安全密钥（必改）

| 变量 | 说明 |
|------|------|
| `JWT_SECRET` / `JWT_REFRESH_SECRET` | JWT 签名密钥，最少 32 字符，`openssl rand -hex 32` 生成 |
| `ENCRYPTION_KEY` | 敏感数据（手机号/providerId）静态加密密钥，32 字节 hex |

> 生产环境 deploy.sh 会自动随机生成，不用手填；本地开发 `.env.example` 已带默认值可直接跑。

### 3.2 数据库

- **开发**：`DB_TYPE=sqlite`（默认，零配置，数据在 `Server-NestJS/data/`）
- **生产**：`DB_TYPE=postgres` + `DB_HOST/PORT/USER/PASSWORD`（迁移自动执行，见 [运维手册](operations.md) §迁移）

### 3.3 AI 能力（可选，不配则 AI 功能降级）

| 变量 | 说明 |
|------|------|
| `AI_PROVIDER` | `deepseek` / `qwen` / `openai`（或 `ollama` 本地私有化） |
| `DEEPSEEK_API_KEY` | 按 `AI_PROVIDER` 配置对应模型 Key |
| `OLLAMA_BASE_URL` | 私有化部署时自动注册 ollama provider（数据不出域） |

### 3.4 功能开关与预设

```bash
# 默认 full（全开）；small 关外部集成（push/sms/oauth）；lite 再关搜索与生成模块
APP_PRESET=full        # full | small | lite
FEATURE_ORG_ENABLED=false   # 显式开关优先于预设（对应 FEATURE_<KEY>_ENABLED）
```

关闭的功能相关接口返回 404，前端导航按 `/app/capabilities` 自动隐藏。

### 3.5 建管理员与种子数据

```bash
cd Server-NestJS
npm run create:admin   # 交互式创建管理员（幂等，重复执行提示已存在）
npm run seed:demo      # 空库补种子数据（事件/待办/积分等演示数据）
```

### 3.6 改成自己的品牌

用生成器指定 `--brand` 替换项目名：

```bash
node scripts/keelbase-init.mjs --brand 你的项目名
```

> logo / 主色 / 域名的一处联动配置见 roadmap EASY-3（进行中），当前 `--brand` 已支持项目名替换。

## 第四步：生成一个新业务模块（约 10 分钟）— GENERATE

用生成器对话式生成一个「图书」模块（自动接线 7 处：app.module / modules-manifest / feature-flags / main.dart / app_router / i18n / navigate-page.tool，含 Web-Admin）：

```bash
# 在仓库根目录
node scripts/keelbase-init.mjs --module books --label 图书 --fields title:string,author:string
```

**生成后必做**（不能只跑 CLI 就完）：

1. **验证编译**：`cd Server-NestJS && npm run build`
2. **跑生成模块单测**：`npm test -- books.service`
3. **生成迁移**（生产 postgres 需要，TypeORM 索引是 hash 名禁止手写）：`npm run migration:generate -- src/migrations/AddBooks`
4. **前端验证**：`cd Front-Flutter && flutter analyze`
5. **确认 AI 导航**：`src/ai/tools/navigate-page.tool.ts` 的 `PAGE_ROUTES` 已含新页

**验证**：登录后 Explore/导航出现「图书」模块，AI 对话能跳转到它。

> 复杂 / 非标准模块：按 [AGENTS.md](../../AGENTS.md)「AI 必做清单」手工加（7 处接线 + 测试 + 迁移），或让 AI 按约定生成。生成器是**代码生成器不是低代码平台**——产出真实可读、可改、AI 可继续扩展的代码。

## 第五步：私有化部署（云服务器）— DEPLOY

部署脚本会：装 Docker → 起 Compose（PostgreSQL + Redis + 后端 + Nginx）→ 配 HTTPS → 自动生成随机密钥 → 建管理员。

```bash
# 1. 上传项目到云服务器（或 clone），进入目录
# 2. 跑部署脚本
./deploy/deploy.sh
```

**验证**：浏览器打开 `https://你的域名`（主 App）+ `https://你的域名/admin`（管理台），用部署脚本提示的管理员账号登录。

> 生产 HTTPS 需要先准备证书：`mkdir certs && cp 你的证书 certs/server.crt && cp 你的私钥 certs/server.key`。详见 [一键部署](one-click-deploy.md)。
> 快速试部署可不装 Docker 环境，用已发布镜像：`docker run -d -p 80:3000 ghcr.io/rain6fish/keelbase:latest`（生产建议 `-e` 覆盖 JWT/加密密钥）。
> 内网 / 离线环境：`deploy-offline.sh`（预置镜像、默认降级外部依赖），详见 [离线部署](offline-deploy.md)。

## 第六步：日常运维（简要）— OPERATE

| 想干什么 | 命令 / 文档 |
|---------|------------|
| 备份 / 恢复数据库 | `npm run backup` / `npm run restore -- <file>`（见 [运维手册](operations.md)） |
| 健康检查 | `npm run healthcheck`（含本地资源与备份检查） |
| 看运行状态 | 管理台「监控中心」「运维」页；Grafana/Prometheus 见可观测性栈 |
| 发版 / 迁移 | `npm run migration:generate` / `npm run migration:run`（见 [开发手册](development.md)） |

## 常见问题

- 起不来 / 端口占用 / 登录失败 / AI 不回复 → 看 [FAQ](faq.md)（环境 / 启动 / 账号 / AI / 部署分主题）。
- 想加新业务模块 → [开发手册](development.md) + `node scripts/keelbase-init.mjs`（对话式生成，含安全接线）。

---

**教程索引**：回到 [Manuals / 手册索引](README.md)。
