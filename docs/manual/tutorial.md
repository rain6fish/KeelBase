# 零基础从零到部署教程（DX-2）

> 本文把 KeelBase 从「完全没跑过」走到「部署上线」，四步走，每步都有验证。
> 适合第一次接触基座的人。想查具体问题，看 [FAQ](faq.md) 或各手册索引。
> 英文版教程（tutorial-en.md）后续跟进；当前英文用户可先看 [Quick Start (EN)](quickstart-en.md)。

## 第一步：跑起来（约 5 分钟）

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

## 第二步：改成你自己的（配置）

先 `cd Server-NestJS && cp .env.example .env`，然后按需改：

### 2.1 安全密钥（必改）

| 变量 | 说明 |
|------|------|
| `JWT_SECRET` / `JWT_REFRESH_SECRET` | JWT 签名密钥，最少 32 字符，`openssl rand -hex 32` 生成 |
| `ENCRYPTION_KEY` | 敏感数据（手机号/providerId）静态加密密钥，32 字节 hex |

> 生产环境 deploy.sh 会自动随机生成，不用手填；本地开发 `.env.example` 已带默认值可直接跑。

### 2.2 数据库

- **开发**：`DB_TYPE=sqlite`（默认，零配置，数据在 `Server-NestJS/data/`）
- **生产**：`DB_TYPE=postgres` + `DB_HOST/PORT/USER/PASSWORD`（迁移自动执行，见 [运维手册](operations.md) §迁移）

### 2.3 AI 能力（可选，不配则 AI 功能降级）

| 变量 | 说明 |
|------|------|
| `AI_PROVIDER` | `deepseek` / `qwen` / `openai`（或 `ollama` 本地私有化） |
| `DEEPSEEK_API_KEY` | 按 `AI_PROVIDER` 配置对应模型 Key |
| `OLLAMA_BASE_URL` | 私有化部署时自动注册 ollama provider（数据不出域） |

### 2.4 功能开关与预设

```bash
# 默认 full（全开）；small 关外部集成（push/sms/oauth）；lite 再关搜索与生成模块
APP_PRESET=full        # full | small | lite
FEATURE_ORG_ENABLED=false   # 显式开关优先于预设（对应 FEATURE_<KEY>_ENABLED）
```

关闭的功能相关接口返回 404，前端导航按 `/app/capabilities` 自动隐藏。

### 2.5 建管理员与种子数据

```bash
cd Server-NestJS
npm run create:admin   # 交互式创建管理员（幂等，重复执行提示已存在）
npm run seed:demo      # 空库补种子数据（事件/待办/积分等演示数据）
```

### 2.6 改成自己的品牌

用 [keelbase init](https://www.npmjs.com/package/keelbase) 生成器并指定 `--brand` 替换项目名：

```bash
npx keelbase init --brand 你的项目名
```

> logo / 主色 / 域名的一处联动配置见 roadmap EASY-3（进行中），当前 `--brand` 已支持项目名替换。

## 第三步：私有化部署（云服务器）

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

## 第四步：日常运维（简要）

| 想干什么 | 命令 / 文档 |
|---------|------------|
| 备份 / 恢复数据库 | `npm run backup` / `npm run restore -- <file>`（见 [运维手册](operations.md)） |
| 健康检查 | `npm run healthcheck`（含本地资源与备份检查） |
| 看运行状态 | 管理台「监控中心」「运维」页；Grafana/Prometheus 见可观测性栈 |
| 发版 / 迁移 | `npm run migration:generate` / `npm run migration:run`（见 [开发手册](development.md)） |

## 常见问题

- 起不来 / 端口占用 / 登录失败 / AI 不回复 → 看 [FAQ](faq.md)（环境 / 启动 / 账号 / AI / 部署分主题）。
- 想加新业务模块 → [开发手册](development.md) + `npx keelbase init`（对话式生成，含安全接线）。

---

**教程索引**：回到 [Manuals / 手册索引](README.md)。
